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
          <span
            class="outline-tree__badge"
            :data-testid="`outline-node-level-${node.id}`"
            :aria-label="`H${node.level}`"
          >H{{ node.level }}</span>
          <span class="outline-tree__text">{{ node.text }}</span>
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
  display: flex;
  align-items: center;
  gap: 6px;
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

.outline-tree__badge {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  height: 16px;
  padding: 0 4px;
  border-radius: 4px;
  background: rgba(132, 82, 47, 0.1);
  color: #9a8d80;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.02em;
  line-height: 1;
}

.outline-tree__text {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
