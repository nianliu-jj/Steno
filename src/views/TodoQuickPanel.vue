<script setup lang="ts">
/**
 * 待办浮窗（todo-panel）— 全局快捷键唤起的"今日"快速面板。
 *
 * 设计要点：
 * - 仅显示"今天"维度（未完成 + 今日已完成可切换显示）
 * - 顶部拖拽区（`data-tauri-drag-region`）+ "今天 N" 计数 + 关闭按钮
 * - 输入区：Enter 提交（最多 500 字符），Shift+Enter 暂不支持换行
 * - 列表区：勾选 → 完成；hover 显示删除按钮
 * - 空态：圆形 ✓ + "太棒了！所有任务都已完成"
 * - 切到 todo-panel 显示时自动 focus 输入框（由后端 toggle 事件触发）
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { NIcon, NScrollbar, useMessage } from 'naive-ui';
import { isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';

import { useAppEvents } from '@/composables/useAppEvents';
import { useDb } from '@/composables/useDb';
import { useClipboardStore } from '@/stores/clipboard';
import { useTodosStore } from '@/stores/todos';
import type { ClipboardEntry, Todo } from '@/types/steno';

const TODO_CONTENT_LIMIT = 500;

const todos = useTodosStore();
const clipboard = useClipboardStore();
const db = useDb();
const events = useAppEvents();
const message = useMessage();

const inputRef = ref<HTMLInputElement | null>(null);
const draft = ref('');
const includeCompleted = ref(true);
const submitting = ref(false);
const activeTab = ref<'todos' | 'clipboard'>('todos');
const isPinned = ref(false);

const today = new Date();
const todayLabel = computed(() => {
  const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
  return `${today.getMonth() + 1}月${today.getDate()}日 · 星期${weekdays[today.getDay()]}`;
});

/** 浮窗内"今天"数据源：取 store 的派生 + 可选含已完成。 */
const visibleEntries = computed<Todo[]>(() => {
  const todayList = todos.todayEntries;
  if (!includeCompleted.value) return todayList;
  // 包含当天已完成：从全量缓存里筛"今天完成"的（store 缓存里已有）。
  const completedToday = todos.entries.filter(item => {
    if (item.status !== 'done' || !item.completedAt) return false;
    const ts = new Date(item.completedAt);
    return (
      ts.getFullYear() === today.getFullYear() &&
      ts.getMonth() === today.getMonth() &&
      ts.getDate() === today.getDate()
    );
  });
  return [...todayList, ...completedToday];
});

const pendingCount = computed(
  () => visibleEntries.value.filter(item => item.status !== 'done').length,
);

const isEmpty = computed(() => pendingCount.value === 0);
const remaining = computed(() => TODO_CONTENT_LIMIT - draft.value.trim().length);
const clipboardEntries = computed(() => clipboard.entries.slice(0, 30));

let unlistenToggle: (() => void) | null = null;
let unlistenFocus: (() => void) | null = null;

/** 关窗前把当前位置写到 settings.todoQuickPanelLastPos，供 `position='last'` 策略复用。 */
async function persistLastPosition() {
  if (!isTauri()) return;
  try {
    const win = getCurrentWindow();
    const pos = await win.outerPosition();
    await db.setSetting('todoQuickPanelLastPos', `${pos.x},${pos.y}`);
  } catch {
    // 拿不到位置（窗口已销毁等）就静默跳过，不影响业务。
  }
}

onMounted(async () => {
  await todos.load();
  await todos.loadToday(true);
  await clipboard.load();
  // 浮窗自身保险地确保事件订阅启动（App.vue 也会做一次，幂等）。
  await todos.startEventListeners();
  await clipboard.startEventListeners();
  unlistenToggle = await events.listenTodoPanelToggle(visible => {
    if (visible) {
      void nextTick(() => inputRef.value?.focus());
    } else {
      // 隐藏前异步落盘最后位置。
      void persistLastPosition();
    }
  });
  try {
    const win = getCurrentWindow();
    await win.setAlwaysOnTop(false);
    unlistenFocus = await win.onFocusChanged(({ payload }) => {
      if (!payload && !isPinned.value) {
        void closePanel();
      }
    });
  } catch {
    // 测试/浏览器预览环境可能没有完整窗口 API，浮窗业务不因此中断。
  }
  // 首次挂载也聚焦输入框（窗口启动时显示场景）。
  void nextTick(() => inputRef.value?.focus());
});

onBeforeUnmount(() => {
  unlistenToggle?.();
  unlistenToggle = null;
  unlistenFocus?.();
  unlistenFocus = null;
  clipboard.stopEventListeners();
  void persistLastPosition();
});

async function submitDraft() {
  const content = draft.value.trim();
  if (!content) return;
  if (content.length > TODO_CONTENT_LIMIT) {
    message.warning(`内容超过 ${TODO_CONTENT_LIMIT} 字符`);
    return;
  }
  submitting.value = true;
  try {
    await todos.createTodo({ content });
    draft.value = '';
    void nextTick(() => inputRef.value?.focus());
  } catch (e) {
    message.error(`添加失败：${String(e)}`);
  } finally {
    submitting.value = false;
  }
}

async function toggleDone(item: Todo) {
  try {
    if (item.status === 'done') {
      await todos.updateTodo({ id: item.id, status: 'todo' });
    } else {
      await todos.completeTodo(item.id);
    }
  } catch (e) {
    message.error(`操作失败：${String(e)}`);
  }
}

async function removeItem(id: string) {
  try {
    await todos.deleteTodo(id);
  } catch (e) {
    message.error(`删除失败：${String(e)}`);
  }
}

async function closePanel() {
  try {
    await db.hideTodoPanel();
  } catch (e) {
    message.error(`关闭失败：${String(e)}`);
  }
}

async function togglePinned() {
  const next = !isPinned.value;
  try {
    await getCurrentWindow().setAlwaysOnTop(next);
    isPinned.value = next;
  } catch (e) {
    message.error(`置顶失败：${String(e)}`);
  }
}

function clipboardTypeLabel(entry: ClipboardEntry) {
  switch (entry.contentType) {
    case 'url':
      return '链接';
    case 'code':
      return '代码';
    case 'image':
      return '图片';
    case 'file':
      return '文件';
    case 'rich_text':
      return '富文本';
    case 'text':
      return '文本';
  }
}

function clipboardPreview(entry: ClipboardEntry) {
  return entry.content || entry.preview;
}

async function pasteClipboardEntry(entry: ClipboardEntry) {
  try {
    if (!isPinned.value) {
      await db.hideTodoPanel();
    }
    await clipboard.pasteEntry(entry.id);
  } catch (e) {
    message.error(`粘贴失败：${String(e)}`);
  }
}
</script>

<template>
  <div class="todo-panel-root">
    <!-- 顶部拖拽 + 日期 + 计数 + 关闭 -->
    <header class="todo-panel-header" data-tauri-drag-region>
      <div class="todo-panel-title" data-tauri-drag-region>
        <NIcon size="18" data-tauri-drag-region>
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M19 4h-1V2h-2v2H8V2H6v2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm0 16H5V10h14v10z"
            />
          </svg>
        </NIcon>
        <div class="todo-panel-date" data-tauri-drag-region>
          <span class="date-line">今天 · {{ todayLabel }}</span>
          <span class="count-line">共 {{ pendingCount }} 个任务</span>
        </div>
      </div>

      <div class="todo-panel-actions">
        <button
          type="button"
          class="todo-panel-icon-button"
          :class="{ 'todo-panel-icon-button--active': isPinned }"
          :title="isPinned ? '取消置顶' : '置顶浮窗'"
          :aria-label="isPinned ? '取消置顶' : '置顶浮窗'"
          data-testid="todo-panel-pin"
          @click="togglePinned"
        >
          <NIcon size="15">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M14 3 21 10l-3 1-4 4 1 4-2 2-5-5-4 4-1-1 4-4-5-5 2-2 4 1 4-4 1-3z" />
            </svg>
          </NIcon>
        </button>
        <button
          type="button"
          class="todo-panel-icon-button"
          title="关闭浮窗"
          data-testid="todo-panel-close"
          @click="closePanel"
        >
          <NIcon size="16">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path
                d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
              />
            </svg>
          </NIcon>
        </button>
      </div>
    </header>

    <nav class="todo-panel-tabs" aria-label="待办浮窗内容">
      <button
        type="button"
        class="todo-panel-tab"
        :class="{ 'todo-panel-tab--active': activeTab === 'todos' }"
        data-testid="todo-panel-tab-todos"
        @click="activeTab = 'todos'"
      >
        待办
      </button>
      <button
        type="button"
        class="todo-panel-tab"
        :class="{ 'todo-panel-tab--active': activeTab === 'clipboard' }"
        data-testid="todo-panel-tab-clipboard"
        @click="activeTab = 'clipboard'"
      >
        粘贴板
      </button>
    </nav>

    <!-- 输入区 -->
    <div v-if="activeTab === 'todos'" class="todo-panel-input-row">
      <input
        ref="inputRef"
        v-model="draft"
        type="text"
        :placeholder="`添加新任务${remaining < 50 ? `（剩余 ${remaining} 字符）` : '...'}`"
        :maxlength="TODO_CONTENT_LIMIT"
        :disabled="submitting"
        class="todo-panel-input"
        data-testid="todo-panel-input"
        @keydown.enter.prevent="submitDraft"
      />
      <button
        type="button"
        class="todo-panel-submit"
        :disabled="!draft.trim() || submitting"
        data-testid="todo-panel-submit"
        @click="submitDraft"
      >
        <NIcon size="14">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
          </svg>
        </NIcon>
      </button>
    </div>

    <!-- 列表 / 空态 -->
    <div v-if="activeTab === 'todos'" class="todo-panel-body">
      <NScrollbar v-if="!isEmpty" class="todo-panel-scroll">
        <ul class="todo-panel-list" data-testid="todo-panel-list">
          <li
            v-for="item in visibleEntries"
            :key="item.id"
            class="todo-panel-item"
            :class="{ done: item.status === 'done' }"
            :data-testid="`todo-item-${item.id}`"
          >
            <label class="todo-panel-checkbox">
              <input
                type="checkbox"
                :checked="item.status === 'done'"
                :data-testid="`todo-toggle-${item.id}`"
                @change="toggleDone(item)"
              />
              <span class="checkbox-indicator">
                <NIcon v-if="item.status === 'done'" size="12">
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                  </svg>
                </NIcon>
              </span>
            </label>
            <span class="todo-panel-text">{{ item.content }}</span>
            <button
              type="button"
              class="todo-panel-delete"
              title="删除"
              :data-testid="`todo-delete-${item.id}`"
              @click="removeItem(item.id)"
            >
              <NIcon size="14">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path
                    d="M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"
                  />
                </svg>
              </NIcon>
            </button>
          </li>
        </ul>
      </NScrollbar>

      <div v-else class="todo-panel-empty" data-testid="todo-panel-empty">
        <div class="empty-check">
          <NIcon size="32">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
            </svg>
          </NIcon>
        </div>
        <p class="empty-title">太棒了！</p>
        <p class="empty-subtitle">所有任务都已完成</p>
      </div>
    </div>

    <div v-else class="todo-panel-body todo-panel-body--clipboard">
      <NScrollbar v-if="clipboardEntries.length > 0" class="todo-panel-scroll">
        <ul class="todo-panel-clipboard-list" data-testid="todo-panel-clipboard-list">
          <li
            v-for="entry in clipboardEntries"
            :key="entry.id"
            class="todo-panel-clipboard-item"
          >
            <span class="todo-panel-clipboard-type">{{ clipboardTypeLabel(entry) }}</span>
            <button
              type="button"
              class="todo-panel-clipboard-content"
              :data-testid="`todo-panel-clipboard-content-${entry.id}`"
              :title="clipboardPreview(entry)"
              @dblclick="pasteClipboardEntry(entry)"
            >
              {{ clipboardPreview(entry) }}
            </button>
          </li>
        </ul>
      </NScrollbar>

      <div v-else class="todo-panel-empty" data-testid="todo-panel-clipboard-empty">
        <div class="empty-check">
          <NIcon size="30">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 3H5a2 2 0 0 0-2 2v14h2V5h14V3zm-3 4H9a2 2 0 0 0-2 2v12h9a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z" />
            </svg>
          </NIcon>
        </div>
        <p class="empty-title">暂无粘贴板记录</p>
        <p class="empty-subtitle">复制内容后会显示在这里</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.todo-panel-root {
  width: 100vw;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: rgba(20, 20, 24, 0.92);
  color: rgba(251, 250, 248, 0.92);
  border-radius: 18px;
  background-clip: padding-box;
  clip-path: inset(0 round 18px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.32);
  overflow: hidden;
  font-family: inherit;
  isolation: isolate;
}

.todo-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px 8px;
  -webkit-app-region: drag;
  cursor: default;
}

.todo-panel-title {
  display: flex;
  align-items: center;
  gap: 10px;
  color: rgba(251, 250, 248, 0.92);
}

.todo-panel-date {
  display: flex;
  flex-direction: column;
  line-height: 1.2;
}

.date-line {
  font-size: 14px;
  font-weight: 600;
}

.count-line {
  font-size: 11px;
  color: rgba(251, 250, 248, 0.5);
}

.todo-panel-actions {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  -webkit-app-region: no-drag;
}

.todo-panel-icon-button {
  width: 28px;
  height: 28px;
  background: transparent;
  border: none;
  color: rgba(251, 250, 248, 0.6);
  cursor: pointer;
  border-radius: 6px;
  display: inline-grid;
  place-items: center;
  -webkit-app-region: no-drag;
  transition: background 120ms, color 120ms;
}

.todo-panel-icon-button:hover,
.todo-panel-icon-button--active {
  background: rgba(251, 250, 248, 0.08);
  color: rgba(251, 250, 248, 0.95);
}

.todo-panel-icon-button--active {
  background: rgba(232, 173, 122, 0.18);
  color: rgba(232, 173, 122, 1);
}

.todo-panel-tabs {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 4px;
  padding: 0 14px 10px;
}

.todo-panel-tab {
  height: 30px;
  border: 1px solid rgba(251, 250, 248, 0.08);
  border-radius: 8px;
  background: rgba(251, 250, 248, 0.04);
  color: rgba(251, 250, 248, 0.56);
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  transition: background 120ms, border-color 120ms, color 120ms;
}

.todo-panel-tab:hover,
.todo-panel-tab--active {
  border-color: rgba(232, 173, 122, 0.38);
  background: rgba(232, 173, 122, 0.14);
  color: rgba(251, 250, 248, 0.94);
}

.todo-panel-input-row {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 0 14px 10px;
}

.todo-panel-input {
  flex: 1;
  background: rgba(251, 250, 248, 0.06);
  border: 1px solid rgba(251, 250, 248, 0.08);
  color: rgba(251, 250, 248, 0.92);
  padding: 8px 10px;
  border-radius: 8px;
  font-size: 13px;
  outline: none;
  transition: border 120ms, background 120ms;
}

.todo-panel-input:focus {
  border-color: rgba(232, 173, 122, 0.5);
  background: rgba(251, 250, 248, 0.09);
}

.todo-panel-input::placeholder {
  color: rgba(251, 250, 248, 0.35);
}

.todo-panel-submit {
  background: rgba(232, 173, 122, 0.85);
  color: #1a1a1f;
  border: none;
  padding: 8px;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 120ms;
}

.todo-panel-submit:disabled {
  background: rgba(232, 173, 122, 0.25);
  color: rgba(26, 26, 31, 0.4);
  cursor: not-allowed;
}

.todo-panel-submit:hover:not(:disabled) {
  background: rgba(232, 173, 122, 1);
}

.todo-panel-body {
  flex: 1;
  min-height: 0;
  padding: 0 6px 12px;
}

.todo-panel-body--clipboard {
  padding-top: 0;
}

.todo-panel-scroll {
  height: 100%;
}

.todo-panel-list {
  list-style: none;
  margin: 0;
  padding: 0 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.todo-panel-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 8px;
  transition: background 120ms;
}

.todo-panel-item:hover {
  background: rgba(251, 250, 248, 0.04);
}

.todo-panel-item.done .todo-panel-text {
  color: rgba(251, 250, 248, 0.35);
  text-decoration: line-through;
}

.todo-panel-checkbox {
  position: relative;
  width: 18px;
  height: 18px;
  cursor: pointer;
  flex-shrink: 0;
}

.todo-panel-checkbox input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}

.checkbox-indicator {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border: 1.5px solid rgba(251, 250, 248, 0.4);
  border-radius: 50%;
  color: transparent;
  transition: background 120ms, border-color 120ms, color 120ms;
}

.todo-panel-item.done .checkbox-indicator {
  background: rgba(232, 173, 122, 0.85);
  border-color: rgba(232, 173, 122, 0.85);
  color: #1a1a1f;
}

.todo-panel-text {
  flex: 1;
  font-size: 13px;
  color: rgba(251, 250, 248, 0.85);
  word-break: break-word;
}

.todo-panel-clipboard-list {
  list-style: none;
  margin: 0;
  padding: 0 8px;
  display: grid;
  gap: 6px;
}

.todo-panel-clipboard-item {
  min-width: 0;
  display: grid;
  grid-template-columns: 46px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  background: rgba(251, 250, 248, 0.04);
}

.todo-panel-clipboard-type {
  color: rgba(232, 173, 122, 0.92);
  font-size: 11px;
  font-weight: 650;
}

.todo-panel-clipboard-content {
  min-width: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: rgba(251, 250, 248, 0.86);
  cursor: text;
  font: 12.5px/1.45 ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", Menlo, monospace;
  overflow: hidden;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.todo-panel-clipboard-content:focus-visible {
  outline: 2px solid rgba(232, 173, 122, 0.5);
  outline-offset: 3px;
}

.todo-panel-delete {
  background: transparent;
  border: none;
  color: rgba(251, 250, 248, 0.4);
  cursor: pointer;
  padding: 4px;
  border-radius: 6px;
  display: inline-flex;
  opacity: 0;
  transition: opacity 120ms, background 120ms, color 120ms;
}

.todo-panel-item:hover .todo-panel-delete {
  opacity: 1;
}

.todo-panel-delete:hover {
  background: rgba(255, 100, 100, 0.18);
  color: rgba(255, 140, 140, 0.95);
}

.todo-panel-empty {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px;
  color: rgba(251, 250, 248, 0.5);
}

.empty-check {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: rgba(251, 250, 248, 0.08);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 14px;
  color: rgba(251, 250, 248, 0.55);
}

.empty-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: rgba(251, 250, 248, 0.85);
}

.empty-subtitle {
  margin: 4px 0 0;
  font-size: 12px;
  color: rgba(251, 250, 248, 0.5);
}
</style>
