<script setup lang="ts">
// PR2.A 仅占位骨架：标题 + textarea。
// PR2.D 接入草稿恢复后会把 textarea 双向绑定到 Rust 端的内存草稿。
import { ref } from 'vue';

const draft = ref('');
</script>

<template>
  <div class="quicknote-root">
    <header class="quicknote-header" data-tauri-drag-region>
      Steno · 速记
    </header>
    <textarea
      v-model="draft"
      class="quicknote-textarea"
      placeholder="此刻在想什么？(占位 — PR2.D 起接入草稿恢复)"
      autofocus
    />
  </div>
</template>

<style scoped>
.quicknote-root {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100vw;
  background: #1f1f24;
  color: #e8e8ea;
  border-radius: 8px;
  overflow: hidden;
  font-family: -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
}

.quicknote-header {
  padding: 6px 12px;
  font-size: 12px;
  color: #888;
  background: #17171b;
  -webkit-user-select: none;
  user-select: none;
  cursor: grab;
}

.quicknote-textarea {
  flex: 1;
  padding: 12px;
  background: transparent;
  color: inherit;
  border: none;
  outline: none;
  resize: none;
  font-size: 14px;
  line-height: 1.55;
}
</style>
