<script setup lang="ts">
/**
 * @component MarkdownReadSurface
 * @description 只读 Markdown 渲染面板 — 用于 NoteEditorView 的"只读模式"。
 *              与 `MarkdownEditor` 共用同一套 ProseMirror 内核（schema / parser /
 *              nodeviews），以 `editable: false` 渲染，保证只读态与编辑态视觉 100%
 *              一致；代码块高亮、KaTeX、Mermaid、图片相对路径解析、复制按钮均由各
 *              NodeView 自动接管，无需本组件再单独处理。
 *
 * **大纲跳转**：启用 `headingAnchors`，给每个 heading 注入 `id="heading-{源行号}"`，
 * 与 `useMarkdownOutline` 的 id 约定一致，使 `document.getElementById(node.id)` 能
 * 精确定位。
 *
 * @props
 * - `title: string` — 文档标题（显示在顶部 `<h1>`）
 * - `content: string` — Markdown 原文
 */

import { computed, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue';

import { createEditorBridge, type EditorBridge } from './markdown-editor/prosemirror/view';

import { useDb } from '@/composables/useDb';
import { setStenoAssetDataDir } from '@/utils/stenoAssets';

const props = defineProps<{
  /** 文档标题（显示在顶部 `<h1>`）。 */
  title: string;
  /** Markdown 原文。 */
  content: string;
}>();

const db = useDb();
const containerRef = useTemplateRef<HTMLDivElement>('container');
const bridge = ref<EditorBridge | null>(null);

/** 显示用标题 — 空标题显示"无标题"。 */
const displayTitle = computed(() => props.title.trim() || '无标题');

onMounted(async () => {
  if (typeof db.getDataPaths === 'function') {
    try {
      const paths = await db.getDataPaths();
      setStenoAssetDataDir(paths.dataDir);
    } catch (error) {
      console.error('[markdown-read-surface] failed to load data paths:', error);
    }
  }

  if (!containerRef.value) return;
  bridge.value = createEditorBridge({
    mount: containerRef.value,
    initialValue: props.content,
    editable: false,
    headingAnchors: true,
  });
});

onBeforeUnmount(() => {
  bridge.value?.destroy();
  bridge.value = null;
});

/** 内容变化 → 回写只读视图。 */
watch(
  () => props.content,
  next => {
    bridge.value?.setContent(next);
  },
);

/** 滚动到指定标题锚点（NoteEditorView 大纲点击委托用）。 */
function scrollToHeading(id: string) {
  bridge.value?.scrollToHeading(id);
}

defineExpose({ scrollToHeading });
</script>

<template>
  <article class="markdown-read-surface" data-testid="markdown-read-surface">
    <header class="markdown-read-surface__header">
      <h1 class="markdown-read-surface__title">{{ displayTitle }}</h1>
    </header>
    <div ref="container" class="markdown-read-surface__body markdown-body" />
  </article>
</template>

<style scoped>
.markdown-read-surface {
  display: flex;
  flex-direction: column;
  min-height: 0;
  color: var(--app-fg);
}

.markdown-read-surface__header {
  padding: 20px 22px 10px;
}

.markdown-read-surface__title {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  line-height: 1.35;
}

.markdown-read-surface__body {
  flex: 1;
  padding: 0 22px 22px;
  overflow: auto;
  line-height: 1.65;
}

.markdown-read-surface__body :deep(.ProseMirror) {
  outline: none;
}

/* 只读态隐藏光标，避免显示编辑闪烁条 */
.markdown-read-surface__body :deep(.ProseMirror) {
  caret-color: transparent;
}

.markdown-read-surface__body :deep(h1),
.markdown-read-surface__body :deep(h2),
.markdown-read-surface__body :deep(h3),
.markdown-read-surface__body :deep(h4),
.markdown-read-surface__body :deep(h5),
.markdown-read-surface__body :deep(h6) {
  scroll-margin-top: 24px;
}

.markdown-read-surface__body :deep(img) {
  display: block;
  max-width: 100%;
  height: auto;
  margin: 12px 0;
  border-radius: 6px;
}
</style>
