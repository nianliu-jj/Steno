<script setup lang="ts">
defineProps<{ kind: 'folder' | 'group' | 'document' | 'text' }>();
</script>

<template>
  <span class="entry-type-badge" :data-kind="kind">
    {{
      kind === 'folder'
        ? '文件夹'
        : kind === 'group'
          ? '分组'
          : kind === 'document'
            ? '文档'
            : '文本'
    }}
  </span>
</template>

<style scoped>
.entry-type-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 42px;
  height: 20px;
  padding: 0 7px;
  border: 1px solid color-mix(in oklch, var(--app-accent) 36%, var(--app-border));
  border-radius: 6px;
  background: var(--app-accent-soft);
  color: var(--app-accent);
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
}
</style>
