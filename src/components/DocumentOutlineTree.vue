<script setup lang="ts">
import type { OutlineNode } from '@/composables/useMarkdownOutline';

defineOptions({
  name: 'DocumentOutlineTree',
});

defineProps<{
  nodes: OutlineNode[];
  depth?: number;
}>();

const emit = defineEmits<{
  select: [node: OutlineNode];
}>();

function onSelect(node: OutlineNode) {
  emit('select', node);
}
</script>

<template>
  <div class="outline-tree">
    <p
      v-if="nodes.length === 0"
      class="outline-tree__empty"
      data-testid="outline-empty"
    >
      暂无大纲
    </p>
    <ul v-else class="outline-tree__list">
      <li v-for="node in nodes" :key="node.id" class="outline-tree__item">
        <button
          class="outline-tree__button"
          type="button"
          :data-testid="`outline-node-${node.id}`"
          @click="onSelect(node)"
        >
          {{ node.text }}
        </button>
        <DocumentOutlineTree
          v-if="node.children.length > 0"
          :nodes="node.children"
          :depth="(depth ?? 0) + 1"
          @select="onSelect"
        />
      </li>
    </ul>
  </div>
</template>

<style scoped>
.outline-tree {
  min-width: 0;
}

.outline-tree__empty {
  margin: 0;
  color: #8a8178;
  font-size: 12px;
  line-height: 1.5;
}

.outline-tree__list {
  list-style: none;
  margin: 0;
  padding: 0 0 0 12px;
}

.outline-tree__item + .outline-tree__item {
  margin-top: 6px;
}

.outline-tree__button {
  width: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  color: #4e463f;
  font: inherit;
  font-size: 13px;
  line-height: 1.45;
  text-align: left;
  cursor: pointer;
}

.outline-tree__button:hover {
  color: #2a2a2a;
}
</style>
