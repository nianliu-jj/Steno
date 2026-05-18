<script setup lang="ts">
import { computed } from 'vue';

import type { LibraryEntry } from '@/types/steno';

const props = defineProps<{ entries: LibraryEntry[] }>();
const emit = defineEmits<{
  select: [entry: LibraryEntry];
}>();

const treeEntries = computed(() => {
  const entryMap = new Map(props.entries.map(entry => [entry.id, entry]));

  return props.entries.map((entry) => {
    let depth = 0;
    let currentParentId = entry.parentId ?? null;

    while (currentParentId) {
      const parent = entryMap.get(currentParentId);
      if (!parent) {
        break;
      }
      depth += 1;
      currentParentId = parent.parentId ?? null;
    }

    return {
      entry,
      depth,
    };
  });
});
</script>

<template>
  <aside class="workspace-tree-panel">
    <button
      v-for="{ entry, depth } in treeEntries"
      :key="entry.id"
      class="workspace-tree-item"
      type="button"
      :data-testid="`workspace-tree-entry-${entry.id}`"
      :style="{ paddingInlineStart: `${12 + depth * 18}px` }"
      @click="emit('select', entry)"
    >
      <span class="workspace-tree-title">{{ entry.title }}</span>
      <span class="workspace-tree-kind">
        {{ entry.kind === 'folder' ? '目录' : '文档' }}
      </span>
    </button>
  </aside>
</template>

<style scoped>
.workspace-tree-panel {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-height: 100%;
  padding: 8px;
  border: 1px solid var(--app-border);
  border-radius: 8px;
  background: var(--app-surface);
  color: var(--app-fg);
}

.workspace-tree-item {
  min-height: 30px;
  display: flex;
  align-items: center;
  gap: 8px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: var(--app-muted);
  font: inherit;
  font-size: 12.5px;
  text-align: left;
  cursor: pointer;
  transition:
    background 0.12s ease,
    border-color 0.12s ease,
    color 0.12s ease;
}

.workspace-tree-item:hover {
  border-color: var(--app-border);
  background: var(--app-surface-2);
  color: var(--app-fg);
}

.workspace-tree-title {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workspace-tree-kind {
  flex-shrink: 0;
  color: var(--app-faint);
  font-size: 11px;
}
</style>
