<script setup lang="ts">
import { computed, ref, watch } from 'vue';

import type { LibraryEntry } from '@/types/steno';

const props = defineProps<{ entries: LibraryEntry[]; defaultExpanded?: boolean }>();
const emit = defineEmits<{
  select: [entry: LibraryEntry];
}>();

const expanded = ref<Set<string>>(new Set());

const isBranch = (entry: LibraryEntry) => entry.kind === 'folder' || entry.kind === 'group';

const childrenByParent = computed(() => {
  const map = new Map<string | null, LibraryEntry[]>();
  for (const entry of props.entries) {
    const parentId = entry.parentId ?? null;
    map.set(parentId, [...(map.get(parentId) ?? []), entry]);
  }
  return map;
});

watch(
  () => props.entries,
  () => {
    if (!props.defaultExpanded) {
      return;
    }
    const next = new Set<string>();
    for (const entry of props.entries) {
      if (isBranch(entry)) {
        next.add(entry.id);
      }
    }
    expanded.value = next;
  },
  { immediate: true },
);

const sortEntries = (entries: LibraryEntry[]) =>
  [...entries].sort((left, right) => {
    if (isBranch(left) !== isBranch(right)) {
      return isBranch(left) ? -1 : 1;
    }
    return left.title.localeCompare(right.title, 'zh-Hans-CN');
  });

const visibleNodes = computed(() => {
  const output: Array<{ entry: LibraryEntry; depth: number; hasChildren: boolean; open: boolean }> = [];
  const visited = new Set<string>();

  const visit = (parentId: string | null, depth: number) => {
    for (const entry of sortEntries(childrenByParent.value.get(parentId) ?? [])) {
      if (visited.has(entry.id)) {
        continue;
      }
      visited.add(entry.id);
      const children = childrenByParent.value.get(entry.id) ?? [];
      const hasChildren = isBranch(entry) && children.length > 0;
      const open = hasChildren && expanded.value.has(entry.id);
      output.push({ entry, depth, hasChildren, open });
      if (open) {
        visit(entry.id, depth + 1);
      }
    }
  };

  visit(null, 0);

  for (const entry of sortEntries(props.entries.filter(item => !visited.has(item.id)))) {
    output.push({ entry, depth: 0, hasChildren: false, open: false });
  }

  return output;
});

function toggleNode(entry: LibraryEntry) {
  const next = new Set(expanded.value);
  if (next.has(entry.id)) {
    next.delete(entry.id);
  } else {
    next.add(entry.id);
  }
  expanded.value = next;
}

function onRowClick(entry: LibraryEntry, hasChildren: boolean) {
  if (hasChildren) {
    toggleNode(entry);
    return;
  }
  emit('select', entry);
}
</script>

<template>
  <div class="workspace-tree-panel">
    <button
      v-for="{ entry, depth, hasChildren, open } in visibleNodes"
      :key="entry.id"
      class="workspace-tree-item"
      type="button"
      :data-testid="`workspace-tree-entry-${entry.id}`"
      :style="{ paddingInlineStart: `${8 + depth * 16}px` }"
      @click="onRowClick(entry, hasChildren)"
    >
      <span
        class="workspace-tree-caret"
        :class="{ 'workspace-tree-caret--open': open, 'workspace-tree-caret--hidden': !hasChildren }"
        aria-hidden="true"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4">
          <path d="M9 6l6 6-6 6" />
        </svg>
      </span>
      <span class="workspace-tree-icon" aria-hidden="true">
        <svg
          v-if="entry.kind === 'folder' || entry.kind === 'group'"
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
    </button>
  </div>
</template>

<style scoped>
.workspace-tree-panel {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-height: 0;
  padding: 6px;
}

.workspace-tree-item {
  min-height: 28px;
  display: flex;
  align-items: center;
  gap: 6px;
  padding-inline-end: 8px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: var(--app-fg);
  font: inherit;
  font-size: 12.5px;
  text-align: left;
  cursor: pointer;
  transition:
    background 0.12s ease,
    color 0.12s ease;
}

.workspace-tree-item:hover {
  background: var(--app-accent-soft);
  color: var(--app-accent);
}

.workspace-tree-caret {
  width: 14px;
  height: 14px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  color: var(--app-faint);
  transition: transform 0.15s ease;
}

.workspace-tree-caret svg {
  width: 12px;
  height: 12px;
}

.workspace-tree-caret--open {
  transform: rotate(90deg);
  color: var(--app-muted);
}

.workspace-tree-caret--hidden {
  visibility: hidden;
}

.workspace-tree-title {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workspace-tree-icon {
  width: 14px;
  height: 14px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  color: color-mix(in oklch, var(--app-muted) 80%, var(--app-accent));
}

.workspace-tree-icon svg {
  width: 14px;
  height: 14px;
}
</style>
