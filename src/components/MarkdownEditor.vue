<script setup lang="ts">
// 通用 Markdown 编辑器：textarea + 工具栏 + 可选预览。
// 在 FloatingEditor / StickyNote / Zen / Canvas 卡片都会复用。
//
// 设计取舍：
// - 工具栏只做最常用的"包裹/插入文本"操作；复杂语法用户直接打 markdown 即可。
// - 预览用 marked 直接 render 进 v-html；MVP 阶段所有内容都是用户自己本地写的，
//   不接入 sanitizer，等 plan Task 8/9 收尾时再决定是否加 DOMPurify。
// - 不在此组件里做自动保存：上层（FloatingEditor 等）用 useAutosave 监听
//   v-model 变化即可，保持组件单一职责。
import { computed, ref, useTemplateRef, watch } from 'vue';

import { useMarkdown } from '@/composables/useMarkdown';

interface Props {
  modelValue: string;
  preview?: boolean;
  autofocus?: boolean;
  placeholder?: string;
}

const props = withDefaults(defineProps<Props>(), {
  preview: false,
  autofocus: false,
  placeholder: '此刻在想什么？支持 Markdown',
});

const emit = defineEmits<{
  'update:modelValue': [value: string];
  focus: [];
  blur: [];
}>();

const textarea = useTemplateRef<HTMLTextAreaElement>('textarea');
const local = ref(props.modelValue);
const { renderHtml } = useMarkdown();

watch(() => props.modelValue, v => {
  if (v !== local.value) {
    local.value = v;
  }
});

watch(local, v => emit('update:modelValue', v));

function focus() {
  textarea.value?.focus();
}

defineExpose({ focus });

// autofocus 由父组件控制；onMounted 时 ref 已就位。
if (props.autofocus) {
  queueMicrotask(focus);
}

// ----- 工具栏：包裹 / 行首插入 ----------------------------------------

function applyWrap(left: string, right: string = left) {
  const el = textarea.value;
  if (!el) return;
  const { selectionStart: a, selectionEnd: b, value } = el;
  const before = value.slice(0, a);
  const sel = value.slice(a, b);
  const after = value.slice(b);
  local.value = `${before}${left}${sel}${right}${after}`;
  // 选区放到包裹内容内部，方便继续输入
  queueMicrotask(() => {
    el.focus();
    const start = a + left.length;
    const end = start + sel.length;
    el.setSelectionRange(start, end);
  });
}

function applyLinePrefix(prefix: string) {
  const el = textarea.value;
  if (!el) return;
  const { selectionStart: a, value } = el;
  // 把光标所在行行首插入 prefix
  const lineStart = value.lastIndexOf('\n', a - 1) + 1;
  local.value = `${value.slice(0, lineStart)}${prefix}${value.slice(lineStart)}`;
  queueMicrotask(() => {
    el.focus();
    const next = a + prefix.length;
    el.setSelectionRange(next, next);
  });
}

const previewHtml = computed(() => renderHtml(local.value));
</script>

<template>
  <div class="md-editor" :class="{ 'md-editor--preview': preview }">
    <div class="md-editor__toolbar">
      <button type="button" title="加粗 (**text**)" @click="applyWrap('**')">B</button>
      <button type="button" title="斜体 (*text*)" @click="applyWrap('*')">I</button>
      <button type="button" title="行内代码 (`text`)" @click="applyWrap('`')">{ }</button>
      <span class="md-editor__sep" />
      <button type="button" title="标题 (# )" @click="applyLinePrefix('# ')">H1</button>
      <button type="button" title="列表 (- )" @click="applyLinePrefix('- ')">•</button>
      <button type="button" title="引用 (&gt; )" @click="applyLinePrefix('> ')">&ldquo;</button>
    </div>
    <div class="md-editor__body">
      <textarea
        ref="textarea"
        v-model="local"
        class="md-editor__textarea"
        :placeholder="placeholder"
        spellcheck="false"
        @focus="emit('focus')"
        @blur="emit('blur')"
      />
      <!-- v-html 安全说明：见文件顶部"设计取舍"。MVP 阶段不接入 sanitizer。 -->
      <!-- eslint-disable-next-line vue/no-v-html -->
      <div
        v-if="preview"
        class="md-editor__preview prose"
        v-html="previewHtml"
      />
    </div>
  </div>
</template>

<style scoped>
.md-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}
.md-editor__toolbar {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 4px 6px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(255, 255, 255, 0.02);
}
.md-editor__toolbar button {
  height: 22px;
  min-width: 26px;
  padding: 0 6px;
  font-size: 11px;
  font-family: ui-monospace, "Consolas", monospace;
  color: #b3b3bb;
  background: transparent;
  border: none;
  border-radius: 3px;
  cursor: pointer;
  transition: background 0.12s;
}
.md-editor__toolbar button:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #e8e8ea;
}
.md-editor__sep {
  width: 1px;
  height: 14px;
  margin: 0 4px;
  background: rgba(255, 255, 255, 0.08);
}
.md-editor__body {
  flex: 1;
  display: flex;
  min-height: 0;
}
.md-editor__textarea {
  flex: 1;
  padding: 12px 14px;
  font-size: 14px;
  line-height: 1.55;
  color: inherit;
  background: transparent;
  border: none;
  outline: none;
  resize: none;
  font-family: ui-monospace, "JetBrains Mono", "Cascadia Code", "Consolas", monospace;
}
.md-editor__preview {
  flex: 1;
  padding: 12px 14px;
  border-left: 1px solid rgba(255, 255, 255, 0.06);
  overflow: auto;
  font-size: 13px;
  line-height: 1.6;
}
.md-editor__preview :deep(h1) { font-size: 18px; margin: 0 0 8px; }
.md-editor__preview :deep(h2) { font-size: 16px; margin: 12px 0 6px; }
.md-editor__preview :deep(h3) { font-size: 14px; margin: 10px 0 4px; }
.md-editor__preview :deep(p) { margin: 4px 0; }
.md-editor__preview :deep(code) {
  background: rgba(255, 255, 255, 0.08);
  padding: 1px 4px;
  border-radius: 3px;
  font-size: 12px;
}
.md-editor__preview :deep(pre) {
  background: rgba(0, 0, 0, 0.25);
  padding: 8px;
  border-radius: 4px;
  overflow: auto;
}
.md-editor__preview :deep(blockquote) {
  margin: 6px 0;
  padding-left: 10px;
  border-left: 2px solid rgba(255, 255, 255, 0.18);
  color: #9a9aa3;
}
</style>
