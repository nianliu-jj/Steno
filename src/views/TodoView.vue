<script setup lang="ts">
/**
 * 主窗口待办视图。
 *
 * 布局：
 * - 左侧（180px）：分类侧栏（今天/计划中/进行中/已暂停/已完成/收件箱/全部），每项展示计数徽章
 * - 顶部：与浮窗一致的添加输入框 + 搜索框
 * - 中部：任务列表
 *   * 勾选：todo ↔ done
 *   * 双击文本进入行内编辑（Enter 保存 / Esc 取消 / blur 保存）
 *   * 状态徽章下拉切换 todo/doing/paused/done
 *   * 日期选择 due_date（NDatePicker，可清空）
 *   * 删除按钮
 *
 * 选中分类持久化到 localStorage，挂载时恢复。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { ComponentPublicInstance } from 'vue';
import { NDatePicker, NDropdown, NScrollbar, useMessage } from 'naive-ui';
import type { DropdownOption } from 'naive-ui';

import { useTodosStore } from '@/stores/todos';
import type { Todo, TodoCategory, TodoStatus } from '@/types/steno';

const TODO_CONTENT_LIMIT = 500;
const STORAGE_KEY = 'steno.todo.selectedCategory';
const VALID_CATEGORIES: ReadonlySet<TodoCategory> = new Set<TodoCategory>([
  'today',
  'planned',
  'doing',
  'paused',
  'done',
  'inbox',
  'all',
]);

const todos = useTodosStore();
const message = useMessage();

const categories: ReadonlyArray<{ key: TodoCategory; label: string }> = [
  { key: 'today', label: '今天' },
  { key: 'planned', label: '计划中' },
  { key: 'doing', label: '进行中' },
  { key: 'paused', label: '已暂停' },
  { key: 'done', label: '已完成' },
  { key: 'inbox', label: '收件箱' },
  { key: 'all', label: '全部' },
];

const statusOptions: ReadonlyArray<{ key: TodoStatus; label: string }> = [
  { key: 'todo', label: '待办' },
  { key: 'doing', label: '进行中' },
  { key: 'paused', label: '已暂停' },
  { key: 'done', label: '已完成' },
];

const draft = ref('');
const submitting = ref(false);
const search = ref('');
const editingId = ref<string | null>(null);
const editingContent = ref('');
const editInputRef = ref<HTMLInputElement | null>(null);

/** v-for + v-if 中的模板 ref 会被收集成数组，这里用函数式 ref 取最新挂载实例。 */
function bindEditInputRef(el: Element | ComponentPublicInstance | null) {
  editInputRef.value = (el as HTMLInputElement | null) ?? null;
}

const filteredEntries = computed<Todo[]>(() => {
  const base = todos.byCategory(todos.selectedCategory);
  const kw = search.value.trim().toLowerCase();
  if (!kw) return base;
  return base.filter(item => item.content.toLowerCase().includes(kw));
});

const isEmpty = computed(() => filteredEntries.value.length === 0);

const currentCategoryLabel = computed(
  () =>
    categories.find(item => item.key === todos.selectedCategory)?.label ?? '全部',
);

function selectCategory(key: TodoCategory) {
  todos.setSelectedCategory(key);
}

function statusLabel(status: TodoStatus): string {
  return statusOptions.find(item => item.key === status)?.label ?? status;
}

function buildStatusOptions(item: Todo): DropdownOption[] {
  return statusOptions.map(opt => ({
    key: opt.key,
    label: opt.label,
    disabled: opt.key === item.status,
  }));
}

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
  } catch (e) {
    message.error(`添加失败：${String(e)}`);
  } finally {
    submitting.value = false;
  }
}

async function toggleDone(item: Todo) {
  try {
    if (item.status === 'done') {
      await todos.setStatus(item.id, 'todo');
    } else {
      await todos.completeTodo(item.id);
    }
  } catch (e) {
    message.error(`操作失败：${String(e)}`);
  }
}

async function changeStatus(item: Todo, next: TodoStatus) {
  if (item.status === next) return;
  try {
    await todos.setStatus(item.id, next);
  } catch (e) {
    message.error(`操作失败：${String(e)}`);
  }
}

async function changeDueDate(item: Todo, ts: number | null) {
  try {
    const dueDate = ts ? new Date(ts).toISOString() : null;
    await todos.updateTodo({ id: item.id, dueDate });
  } catch (e) {
    message.error(`修改日期失败：${String(e)}`);
  }
}

async function removeItem(id: string) {
  try {
    await todos.deleteTodo(id);
  } catch (e) {
    message.error(`删除失败：${String(e)}`);
  }
}

function startEdit(item: Todo) {
  editingId.value = item.id;
  editingContent.value = item.content;
  void nextTick(() => {
    editInputRef.value?.focus();
    editInputRef.value?.select();
  });
}

function cancelEdit() {
  editingId.value = null;
  editingContent.value = '';
}

async function commitEdit() {
  const id = editingId.value;
  if (!id) return;
  const next = editingContent.value.trim();
  const target = todos.entries.find(item => item.id === id);
  // 关闭编辑态先于异步：避免 await 期间 UI 锁死。
  editingId.value = null;
  editingContent.value = '';
  if (!target || next === target.content) return;
  if (!next) {
    message.warning('内容不能为空');
    return;
  }
  if (next.length > TODO_CONTENT_LIMIT) {
    message.warning(`内容超过 ${TODO_CONTENT_LIMIT} 字符`);
    return;
  }
  try {
    await todos.updateTodo({ id, content: next });
  } catch (e) {
    message.error(`保存失败：${String(e)}`);
  }
}

function dueDateValue(item: Todo): number | null {
  if (!item.dueDate) return null;
  const ts = new Date(item.dueDate).getTime();
  return Number.isNaN(ts) ? null : ts;
}

onMounted(async () => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && VALID_CATEGORIES.has(saved as TodoCategory)) {
      todos.setSelectedCategory(saved as TodoCategory);
    }
  } catch {
    // localStorage 不可用（隐私模式等），静默忽略。
  }
  await todos.load();
  await todos.startEventListeners();
});

onBeforeUnmount(() => {
  // store 监听器走 stopEventListeners 在 App.vue 全局卸载时统一清理；此处不动。
});

watch(
  () => todos.selectedCategory,
  v => {
    try {
      localStorage.setItem(STORAGE_KEY, v);
    } catch {
      // 静默
    }
  },
);
</script>

<template>
  <div class="todo-view-root" data-testid="todo-view">
    <!-- 左侧分类侧栏 -->
    <aside class="todo-view-sidebar" data-testid="todo-view-sidebar">
      <h2 class="sidebar-title">待办</h2>
      <ul class="category-list">
        <li
          v-for="cat in categories"
          :key="cat.key"
          class="category-item"
          :class="{ active: todos.selectedCategory === cat.key }"
          :data-testid="`category-${cat.key}`"
          @click="selectCategory(cat.key)"
        >
          <span class="category-label">{{ cat.label }}</span>
          <span class="category-count" :data-testid="`count-${cat.key}`">
            {{ todos.categoryCounts[cat.key] }}
          </span>
        </li>
      </ul>
    </aside>

    <!-- 右侧主区 -->
    <section class="todo-view-main">
      <header class="todo-view-toolbar">
        <h3 class="toolbar-title">{{ currentCategoryLabel }}</h3>
        <input
          v-model="search"
          type="search"
          placeholder="搜索任务..."
          class="todo-view-search"
          data-testid="todo-view-search"
        />
      </header>

      <div class="todo-view-add">
        <input
          v-model="draft"
          type="text"
          :maxlength="TODO_CONTENT_LIMIT"
          :disabled="submitting"
          placeholder="添加新任务..."
          class="todo-view-input"
          data-testid="todo-view-input"
          @keydown.enter.prevent="submitDraft"
        />
        <button
          type="button"
          class="todo-view-submit"
          :disabled="!draft.trim() || submitting"
          data-testid="todo-view-submit"
          @click="submitDraft"
        >
          添加
        </button>
      </div>

      <div class="todo-view-body">
        <NScrollbar v-if="!isEmpty">
          <ul class="todo-view-list" data-testid="todo-view-list">
            <li
              v-for="item in filteredEntries"
              :key="item.id"
              class="todo-row"
              :class="{ done: item.status === 'done' }"
              :data-testid="`todo-row-${item.id}`"
            >
              <label class="todo-row-checkbox">
                <input
                  type="checkbox"
                  :checked="item.status === 'done'"
                  :data-testid="`todo-row-toggle-${item.id}`"
                  @change="toggleDone(item)"
                />
                <span class="checkbox-indicator"></span>
              </label>

              <div class="todo-row-text" :data-testid="`todo-row-text-${item.id}`">
                <input
                  v-if="editingId === item.id"
                  :ref="bindEditInputRef"
                  v-model="editingContent"
                  type="text"
                  class="todo-row-edit-input"
                  :maxlength="TODO_CONTENT_LIMIT"
                  :data-testid="`todo-row-edit-${item.id}`"
                  @keydown.enter.prevent="commitEdit"
                  @keydown.escape.prevent="cancelEdit"
                  @blur="commitEdit"
                />
                <span
                  v-else
                  class="todo-row-content"
                  @dblclick="startEdit(item)"
                >
                  {{ item.content }}
                </span>
              </div>

              <NDropdown
                trigger="click"
                :options="buildStatusOptions(item)"
                @select="(key: TodoStatus) => changeStatus(item, key)"
              >
                <button
                  type="button"
                  class="todo-row-status"
                  :class="`status-${item.status}`"
                  :data-testid="`todo-row-status-${item.id}`"
                >
                  {{ statusLabel(item.status) }}
                </button>
              </NDropdown>

              <NDatePicker
                :value="dueDateValue(item)"
                type="date"
                size="small"
                clearable
                placeholder="日期"
                class="todo-row-date"
                :data-testid="`todo-row-date-${item.id}`"
                @update:value="ts => changeDueDate(item, ts)"
              />

              <button
                type="button"
                class="todo-row-delete"
                title="删除"
                :data-testid="`todo-row-delete-${item.id}`"
                @click="removeItem(item.id)"
              >
                ×
              </button>
            </li>
          </ul>
        </NScrollbar>

        <div v-else class="todo-view-empty" data-testid="todo-view-empty">
          <p class="empty-title">暂无任务</p>
          <p class="empty-subtitle">
            {{
              search.trim()
                ? '没有匹配的任务，换个关键词试试'
                : '在上方输入框添加第一个任务吧'
            }}
          </p>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.todo-view-root {
  display: flex;
  width: 100%;
  height: 100%;
  color: rgba(40, 36, 32, 0.92);
  background: rgba(251, 250, 248, 0.65);
}

.todo-view-sidebar {
  width: 180px;
  flex-shrink: 0;
  border-right: 1px solid rgba(40, 36, 32, 0.08);
  padding: 18px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: rgba(251, 250, 248, 0.85);
}

.sidebar-title {
  margin: 0 8px 4px;
  font-size: 16px;
  font-weight: 600;
  color: rgba(40, 36, 32, 0.85);
}

.category-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.category-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 7px 10px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
  color: rgba(40, 36, 32, 0.78);
  transition: background 120ms;
}

.category-item:hover {
  background: rgba(40, 36, 32, 0.05);
}

.category-item.active {
  background: rgba(168, 95, 50, 0.12);
  color: rgba(168, 95, 50, 1);
  font-weight: 600;
}

.category-count {
  font-size: 12px;
  font-weight: 500;
  color: rgba(40, 36, 32, 0.5);
  min-width: 18px;
  text-align: right;
}

.category-item.active .category-count {
  color: rgba(168, 95, 50, 0.85);
}

.todo-view-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  padding: 18px 22px;
}

.todo-view-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.toolbar-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}

.todo-view-search {
  width: 220px;
  padding: 6px 10px;
  border-radius: 8px;
  border: 1px solid rgba(40, 36, 32, 0.12);
  background: rgba(251, 250, 248, 0.9);
  font-size: 13px;
  outline: none;
  transition: border 120ms;
}

.todo-view-search:focus {
  border-color: rgba(168, 95, 50, 0.5);
}

.todo-view-add {
  display: flex;
  gap: 10px;
  margin-bottom: 12px;
}

.todo-view-input {
  flex: 1;
  padding: 9px 12px;
  font-size: 13px;
  border-radius: 8px;
  border: 1px solid rgba(40, 36, 32, 0.12);
  background: rgba(251, 250, 248, 0.95);
  outline: none;
  transition: border 120ms;
}

.todo-view-input:focus {
  border-color: rgba(168, 95, 50, 0.5);
}

.todo-view-submit {
  padding: 0 16px;
  border-radius: 8px;
  border: none;
  background: rgba(168, 95, 50, 0.9);
  color: #fffaf3;
  cursor: pointer;
  font-size: 13px;
  transition: background 120ms;
}

.todo-view-submit:disabled {
  background: rgba(168, 95, 50, 0.35);
  cursor: not-allowed;
}

.todo-view-submit:hover:not(:disabled) {
  background: rgba(168, 95, 50, 1);
}

.todo-view-body {
  flex: 1;
  min-height: 0;
  margin-top: 4px;
}

.todo-view-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.todo-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  border-radius: 8px;
  transition: background 120ms;
}

.todo-row:hover {
  background: rgba(40, 36, 32, 0.04);
}

.todo-row.done .todo-row-content {
  color: rgba(40, 36, 32, 0.4);
  text-decoration: line-through;
}

.todo-row-checkbox {
  position: relative;
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  cursor: pointer;
}

.todo-row-checkbox input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}

.checkbox-indicator {
  display: inline-block;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 1.5px solid rgba(40, 36, 32, 0.4);
  transition: background 120ms, border-color 120ms;
}

.todo-row.done .checkbox-indicator {
  background: rgba(168, 95, 50, 0.9);
  border-color: rgba(168, 95, 50, 0.9);
}

.todo-row-text {
  flex: 1;
  min-width: 0;
}

.todo-row-content {
  display: inline-block;
  font-size: 14px;
  cursor: text;
  user-select: text;
  word-break: break-word;
}

.todo-row-edit-input {
  width: 100%;
  padding: 4px 6px;
  border: 1px solid rgba(168, 95, 50, 0.5);
  border-radius: 6px;
  background: rgba(251, 250, 248, 1);
  font-size: 14px;
  outline: none;
}

.todo-row-status {
  border: none;
  background: rgba(40, 36, 32, 0.08);
  color: rgba(40, 36, 32, 0.78);
  font-size: 12px;
  padding: 3px 10px;
  border-radius: 999px;
  cursor: pointer;
  flex-shrink: 0;
  transition: background 120ms;
}

.todo-row-status:hover {
  background: rgba(40, 36, 32, 0.14);
}

.todo-row-status.status-doing {
  background: rgba(96, 140, 200, 0.18);
  color: rgba(56, 100, 160, 1);
}

.todo-row-status.status-paused {
  background: rgba(200, 160, 60, 0.18);
  color: rgba(150, 110, 30, 1);
}

.todo-row-status.status-done {
  background: rgba(120, 168, 96, 0.18);
  color: rgba(75, 120, 50, 1);
}

.todo-row-date {
  width: 130px;
  flex-shrink: 0;
}

.todo-row-delete {
  background: transparent;
  border: none;
  color: rgba(40, 36, 32, 0.4);
  font-size: 18px;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  cursor: pointer;
  opacity: 0;
  transition: opacity 120ms, background 120ms, color 120ms;
}

.todo-row:hover .todo-row-delete {
  opacity: 1;
}

.todo-row-delete:hover {
  background: rgba(220, 80, 80, 0.14);
  color: rgba(200, 60, 60, 1);
}

.todo-view-empty {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px;
  color: rgba(40, 36, 32, 0.55);
}

.empty-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: rgba(40, 36, 32, 0.7);
}

.empty-subtitle {
  margin: 6px 0 0;
  font-size: 13px;
  color: rgba(40, 36, 32, 0.5);
}
</style>
