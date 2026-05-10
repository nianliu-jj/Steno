<script setup lang="ts">
// PR2.D：textarea 双向绑定 Rust 端进程内草稿。
// - mounted 时拉取最近一次草稿
// - 输入时 200ms debounce 保存，避免高频 IPC
// - 草稿仅存内存（Mutex<String>），退出即失，PR3 接入本地存储后替换。
import { onMounted, ref, watch } from 'vue';
import { invoke } from '@tauri-apps/api/core';

const draft = ref('');

onMounted(async () => {
  draft.value = await invoke<string>('load_quicknote_draft');
});

let saveTimer: ReturnType<typeof setTimeout> | undefined;
watch(draft, text => {
  if (saveTimer) {
    clearTimeout(saveTimer);
  }
  saveTimer = setTimeout(() => {
    invoke('save_quicknote_draft', { text });
  }, 200);
});
</script>

<template>
  <div class="quicknote-root">
    <header class="quicknote-header" data-tauri-drag-region>
      Steno · 速记
    </header>
    <textarea
      v-model="draft"
      class="quicknote-textarea"
      placeholder="此刻在想什么？(草稿会保留到退出 Steno 前)"
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
