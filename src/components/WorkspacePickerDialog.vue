<script setup lang="ts">
import type { Workspace } from '@/types/steno';

defineProps<{
  visible: boolean;
  workspaces: Workspace[];
  loading?: boolean;
  busy?: boolean;
  title?: string;
  description?: string;
}>();

const emit = defineEmits<{
  close: [];
  select: [workspace: Workspace];
  create: [];
}>();
</script>

<template>
  <div
    v-if="visible"
    class="workspace-picker-backdrop"
    data-testid="workspace-picker-dialog"
    @click.self="emit('close')"
  >
    <section class="workspace-picker-card" role="dialog" aria-modal="true" aria-labelledby="workspace-picker-title">
      <header class="workspace-picker-header">
        <div>
          <h2 id="workspace-picker-title">{{ title || '选择工作区' }}</h2>
          <p>{{ description || '选择一个已有工作区，或从本地文件夹新建工作区。' }}</p>
        </div>
        <button
          type="button"
          class="workspace-picker-close"
          aria-label="关闭工作区选择"
          @click="emit('close')"
        >
          ×
        </button>
      </header>

      <div class="workspace-picker-body">
        <div v-if="loading" class="workspace-picker-empty">
          正在读取工作区…
        </div>

        <div v-else-if="workspaces.length === 0" class="workspace-picker-empty">
          还没有可用工作区，请先从文件夹创建一个。
        </div>

        <div v-else class="workspace-picker-list">
          <button
            v-for="workspace in workspaces"
            :key="workspace.id"
            type="button"
            class="workspace-picker-item"
            :data-testid="`workspace-option-${workspace.id}`"
            @click="emit('select', workspace)"
          >
            <strong>{{ workspace.name }}</strong>
            <span>{{ workspace.rootPath }}</span>
          </button>
        </div>
      </div>

      <footer class="workspace-picker-footer">
        <button
          type="button"
          class="workspace-picker-create"
          data-testid="workspace-picker-create"
          :disabled="busy"
          @click="emit('create')"
        >
          {{ busy ? '处理中…' : '从文件夹新建工作区' }}
        </button>
      </footer>
    </section>
  </div>
</template>

<style scoped>
.workspace-picker-backdrop {
  position: fixed;
  inset: 0;
  z-index: 40;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(38, 31, 25, 0.22);
}

.workspace-picker-card {
  width: min(560px, 100%);
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 20px;
  border: 1px solid rgba(128, 96, 68, 0.16);
  border-radius: 18px;
  background: #fffaf4;
  box-shadow: 0 24px 54px rgba(38, 31, 25, 0.16);
}

.workspace-picker-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.workspace-picker-header h2 {
  margin: 0 0 6px;
  color: #2d241d;
  font-size: 20px;
}

.workspace-picker-header p {
  margin: 0;
  color: rgba(45, 36, 29, 0.68);
  font-size: 13px;
  line-height: 1.6;
}

.workspace-picker-close {
  width: 32px;
  height: 32px;
  border: 0;
  border-radius: 999px;
  background: rgba(155, 110, 69, 0.1);
  color: #8a5a38;
  font-size: 18px;
  cursor: pointer;
}

.workspace-picker-body {
  min-height: 120px;
}

.workspace-picker-empty {
  display: grid;
  place-items: center;
  min-height: 120px;
  border: 1px dashed rgba(128, 96, 68, 0.2);
  border-radius: 14px;
  color: rgba(45, 36, 29, 0.64);
  font-size: 13px;
}

.workspace-picker-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.workspace-picker-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 14px 16px;
  border: 1px solid rgba(128, 96, 68, 0.14);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.76);
  color: #2d241d;
  text-align: left;
  cursor: pointer;
}

.workspace-picker-item strong {
  font-size: 15px;
}

.workspace-picker-item span {
  color: rgba(45, 36, 29, 0.58);
  font-size: 12px;
  line-height: 1.5;
}

.workspace-picker-item:hover {
  border-color: rgba(155, 110, 69, 0.32);
  background: rgba(255, 250, 244, 0.94);
}

.workspace-picker-footer {
  display: flex;
  justify-content: flex-end;
}

.workspace-picker-create {
  min-width: 168px;
  height: 38px;
  padding: 0 16px;
  border: 0;
  border-radius: 999px;
  background: #9b6e45;
  color: #fff;
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.workspace-picker-create:disabled {
  cursor: wait;
  opacity: 0.72;
}
</style>
