<script setup lang="ts">
import { computed } from 'vue';

import { useMarkdown } from '@/composables/useMarkdown';
import { useMarkdownOutline } from '@/composables/useMarkdownOutline';

const props = defineProps<{
  title: string;
  content: string;
}>();

const { renderHtml } = useMarkdown();
const { decorateHeadingAnchors, listHeadings } = useMarkdownOutline();

const displayTitle = computed(() => props.title.trim() || '无标题');
const renderedHtml = computed(() =>
  decorateHeadingAnchors(renderHtml(props.content), listHeadings(props.content)),
);
</script>

<template>
  <article class="markdown-read-surface" data-testid="markdown-read-surface">
    <header class="markdown-read-surface__header">
      <h1 class="markdown-read-surface__title">{{ displayTitle }}</h1>
    </header>
    <!-- eslint-disable vue/no-v-html -->
    <div class="markdown-read-surface__body prose" v-html="renderedHtml" />
    <!-- eslint-enable vue/no-v-html -->
  </article>
</template>

<style scoped>
.markdown-read-surface {
  display: flex;
  flex-direction: column;
  min-height: 0;
  color: #2a2a2a;
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
</style>
