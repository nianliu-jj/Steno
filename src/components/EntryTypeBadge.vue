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
  height: 22px;
  padding: 0 8px;
  border-radius: 999px;
  background: rgba(168, 95, 50, 0.12);
  color: #8a5a38;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
}
</style>
