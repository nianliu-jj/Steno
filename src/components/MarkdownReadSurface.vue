<script setup lang="ts">
/**
 * @component MarkdownReadSurface
 * @description 只读 Markdown 渲染面板 — 用于 NoteEditorView 的"只读模式"。
 *              将 Markdown 原文渲染为 HTML（markdown-it 管线）并注入标题锚点（id），
 *              配合 DocumentOutlineTree 的大纲点击跳转；mounted 后异步渲染 mermaid 图。
 *
 * **与 MarkdownEditor 的关系**：
 * - MarkdownEditor = 可编辑的 CodeMirror 6 编辑器（WYSIWYG）
 * - MarkdownReadSurface = 纯渲染输出（只读，通过 `v-html` 渲染）
 * - NoteEditorView 通过 `viewMode` 在两者之间切换
 *
 * **XSS 注意**：`v-html` 直接注入 HTML。当前管线已接入 markdown-it（HTML 关闭），
 * 完整 DOMPurify 过滤在 Phase 6 接入。
 *
 * @props
 * - `title: string` — 文档标题
 * - `content: string` — Markdown 原文
 */

import { useDark } from '@vueuse/core';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';

import { useDb } from '@/composables/useDb';
import { useMarkdown } from '@/composables/useMarkdown';
import { useMarkdownOutline } from '@/composables/useMarkdownOutline';
import { renderMermaidPlaceholders, resetMermaidRendering } from '@/utils/markdown/mermaid';
import { resolveStenoAssetUrls, setStenoAssetDataDir } from '@/utils/stenoAssets';

const props = defineProps<{
  /** 文档标题（显示在顶部 `<h1>`）。 */
  title: string;
  /** Markdown 原文。 */
  content: string;
}>();

const { renderHtml } = useMarkdown();
const { decorateHeadingAnchors, listHeadings } = useMarkdownOutline();
const db = useDb();
const dataDir = ref<string | null>(null);
const bodyRef = ref<HTMLElement | null>(null);
const isDark = useDark();

/** 显示用标题 — 空标题显示"无标题"。 */
const displayTitle = computed(() => props.title.trim() || '无标题');

/**
 * 渲染后的 HTML — 两步处理：
 * 1. `renderHtml(content)` → markdown-it 渲染（含 GFM、KaTeX、shiki、mermaid 占位）
 * 2. `decorateHeadingAnchors(html, headings)` → 注入 `id="heading-N"` 到 `<h1>`–`<h6>`
 *
 * 第二步保证大纲点击后 `document.getElementById(id)` 能定位到对应标题。
 */
const renderedHtml = computed(() =>
  decorateHeadingAnchors(
    renderHtml(resolveStenoAssetUrls(props.content, dataDir.value)),
    listHeadings(props.content),
  ),
);

async function refreshMermaid() {
  if (!bodyRef.value) return;
  await nextTick();
  await renderMermaidPlaceholders(bodyRef.value);
}

onMounted(async () => {
  try {
    const paths = await db.getDataPaths();
    dataDir.value = paths.dataDir;
    setStenoAssetDataDir(paths.dataDir);
  } catch (error) {
    console.error('[markdown-read-surface] failed to load data paths:', error);
  }
  await refreshMermaid();
});

// 内容变化后异步渲染 mermaid（v-html 更新是同步的，nextTick 等待 DOM 落盘）
watch(renderedHtml, () => {
  void refreshMermaid();
});

// 主题切换：重置已渲染节点为占位态，再用新主题重新渲染
watch(isDark, () => {
  if (!bodyRef.value) return;
  resetMermaidRendering(bodyRef.value);
  void refreshMermaid();
});

onBeforeUnmount(() => {
  bodyRef.value = null;
});
</script>

<template>
  <article class="markdown-read-surface" data-testid="markdown-read-surface">
    <header class="markdown-read-surface__header">
      <h1 class="markdown-read-surface__title">{{ displayTitle }}</h1>
    </header>
    <!-- eslint-disable vue/no-v-html -->
    <div
      ref="bodyRef"
      class="markdown-read-surface__body markdown-body"
      v-html="renderedHtml"
    />
    <!-- eslint-enable vue/no-v-html -->
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
