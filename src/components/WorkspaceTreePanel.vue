<script setup lang="ts">
import type { LibraryEntry } from '@/types/steno';

defineProps<{ entries: LibraryEntry[] }>();
</script>

<template>
  <aside class="workspace-tree-panel">
    <button
      v-for="entry in entries"
      :key="entry.id"
      class="workspace-tree-item"
      type="button"
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
