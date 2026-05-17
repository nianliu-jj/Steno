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
      {{ entry.title }}
    </button>
  </aside>
</template>

<style scoped>
.workspace-tree-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border: 1px solid rgba(55, 46, 36, 0.12);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.5);
}

.workspace-tree-item {
  border: 0;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}
</style>
