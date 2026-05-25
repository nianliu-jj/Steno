<script setup lang="ts">
import { computed } from 'vue';

import type { LibraryEntry } from '@/types/steno';

const props = defineProps<{ entries: LibraryEntry[] }>();
const emit = defineEmits<{
  select: [entry: LibraryEntry];
}>();

const treeEntries = computed(() => {
  const childrenByParent = new Map<string | null, LibraryEntry[]>();
  for (const entry of props.entries) {
    const parentId = entry.parentId ?? null;
    childrenByParent.set(parentId, [...(childrenByParent.get(parentId) ?? []), entry]);
  }

  const sortEntries = (entries: LibraryEntry[]) =>
    [...entries].sort((left, right) => {
      if (left.kind !== right.kind) {
        return left.kind === 'folder' ? -1 : 1;
      }
      return left.title.localeCompare(right.title, 'zh-Hans-CN');
    });

  const output: Array<{ entry: LibraryEntry; depth: number }> = [];
  const visited = new Set<string>();

  const visit = (parentId: string | null, depth: number) => {
    for (const entry of sortEntries(childrenByParent.get(parentId) ?? [])) {
      if (visited.has(entry.id)) {
        continue;
      }
      visited.add(entry.id);
      output.push({ entry, depth });
      visit(entry.id, depth + 1);
    }
  };

  visit(null, 0);

  for (const entry of sortEntries(props.entries.filter(item => !visited.has(item.id)))) {
    output.push({ entry, depth: 0 });
  }

  return output;
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
      <span class="workspace-tree-icon" aria-hidden="true">
        <svg
          v-if="entry.kind === 'folder'"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M4 6h6l2 2h8v10H4z" />
          <path d="M4 10h16" />
        </svg>
        <svg
          v-else
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M6 4h9l3 3v13H6z" />
          <path d="M14 4v4h4" />
          <path d="M9 13h6" />
          <path d="M9 16h4" />
        </svg>
      </span>
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

.workspace-tree-icon {
  width: 15px;
  height: 15px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  color: color-mix(in oklch, var(--app-muted) 80%, var(--app-accent));
}

.workspace-tree-icon svg {
  width: 15px;
  height: 15px;
}

.workspace-tree-kind {
  flex-shrink: 0;
  color: var(--app-faint);
  font-size: 11px;
}
</style>
