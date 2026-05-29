<script setup lang="ts">
/**
 * @component MarkdownEditor
 * @description 通用 Markdown 编辑器 — 基于 ProseMirror 的 Typora 风格 WYSIWYG 内核。
 *
 * **WYSIWYG 模式**：编辑态本身就长得像渲染后的样子 —— 列表渲染 bullet、表格渲染
 * grid、HR 渲染分隔线、链接显示蓝色、blockquote 显示左竖线、内联 HTML（`<u>` /
 * `<mark>` 等）正确呈现；光标进入对应节点时显示 Markdown 源码标记符号（`**`、`>`、
 * `-` 等），离开后隐藏。由 `prosemirror/` 下的 schema/parser/serializer/nodeviews/
 * plugins 共同实现，详见 `view/create-editor.ts` 与 `view/editor-bridge.ts`。
 *
 * **设计取舍**：
 * - 不在此组件内做自动保存：上层（FloatingEditor / NoteEditorView）用 `useAutosave`
 *   监听 `v-model` 变化，保持组件单一职责
 * - 不渲染右侧预览面板：只读视图由 `MarkdownReadSurface` 单独负责
 * - 工具栏改为快捷键体系：常用绑定见 `prosemirror/plugins/keymap.ts`
 *
 * **双向绑定机制**：
 * 内核变更 → `onChange` 回调 → `emit('update:modelValue', text)`；外部 `v-model`
 * 变化 → `watch` 调 `bridge.setContent(next)`。`editor-bridge` 内部自带防死循环
 * （同值短路 + applyingExternal 标志），组件层无需再额外维护标志。
 *
 * @props
 * - `modelValue: string` — v-model 绑定的 Markdown 内容
 * - `autofocus?: boolean` — 是否在挂载后自动聚焦
 * - `placeholder?: string` — 占位文字
 *
 * @emits
 * - `update:modelValue(value: string)` — v-model 更新
 * - `focus` — 编辑器获得焦点
 * - `blur` — 编辑器失去焦点
 *
 * @exposed
 * - `focus()` — 程序化聚焦编辑器
 * - `scrollToLine(line: number)` — 滚动到指定行（大纲点击跳转用）
 */

import { onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue';

import { createEditorBridge, type EditorBridge } from './markdown-editor/prosemirror/view';

import { useDb } from '@/composables/useDb';
import { setStenoAssetDataDir } from '@/utils/stenoAssets';

interface Props {
  modelValue: string;
  autofocus?: boolean;
  placeholder?: string;
}

const props = withDefaults(defineProps<Props>(), {
  autofocus: false,
  placeholder: '此刻在想什么？支持 Markdown',
});

const emit = defineEmits<{
  'update:modelValue': [value: string];
  focus: [];
  blur: [];
}>();

const containerRef = useTemplateRef<HTMLDivElement>('container');
const bridge = ref<EditorBridge | null>(null);
const db = useDb();

onMounted(() => {
  if (!containerRef.value) return;

  // 解析数据目录，供图片相对路径渲染（Tauri 内会经 convertFileSrc）。
  if (typeof db.getDataPaths === 'function') {
    void db.getDataPaths()
      .then(paths => {
        setStenoAssetDataDir(paths.dataDir);
      })
      .catch(error => {
        console.error('[markdown-editor] failed to load data paths:', error);
      });
  }

  bridge.value = createEditorBridge({
    mount: containerRef.value,
    initialValue: props.modelValue,
    editable: true,
    placeholder: props.placeholder,
    autofocus: props.autofocus,
    onChange: next => emit('update:modelValue', next),
    onFocusChange: focused => {
      if (focused) emit('focus');
      else emit('blur');
    },
    onPasteImage: async dataUrl => {
      const saved = await db.savePastedImage(dataUrl);
      return saved.markdownUrl;
    },
  });
});

onBeforeUnmount(() => {
  bridge.value?.destroy();
  bridge.value = null;
});

/** 监听外部 `modelValue` 变化 → 回写编辑器内容（bridge 内部已防死循环）。 */
watch(
  () => props.modelValue,
  next => {
    bridge.value?.setContent(next);
  },
);

/** 程序化聚焦编辑器。 */
function focus() {
  bridge.value?.focus();
}

/**
 * 滚动编辑器到指定行（大纲点击跳转）。
 *
 * @param line - 1-indexed 行号；越界自动 clamp（由 bridge 内部处理）
 */
function scrollToLine(line: number) {
  bridge.value?.scrollToLine(line);
}

defineExpose({ focus, scrollToLine });
</script>

<template>
  <div ref="container" class="md-editor" data-testid="md-editor" />
</template>

<style scoped>
.md-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: auto;
  font-family: -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
}

.md-editor :deep(.ProseMirror) {
  flex: 1;
  min-height: 0;
  padding: 12px 16px;
  background: transparent;
  color: inherit;
  font-size: 14px;
  line-height: 1.65;
  outline: none;
  caret-color: currentColor;
}

/* 占位文字：ProseMirror 空文档时 placeholder 插件给根节点加 data-placeholder。 */
.md-editor :deep(.ProseMirror.steno-editor-empty::before) {
  content: attr(data-placeholder);
  color: rgba(127, 127, 127, 0.6);
  font-style: italic;
  pointer-events: none;
  position: absolute;
}

:global(.app-theme-root.dark) .md-editor :deep(.ProseMirror.steno-editor-empty::before) {
  color: rgba(180, 180, 184, 0.55);
}
</style>
