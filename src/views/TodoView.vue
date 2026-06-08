<!--
  @file 前端视图 - Todo View

  承载 Todo View 的界面结构、响应式状态和用户交互，是 前端视图 模块的可视入口之一。
  注释重点标明模板结构、脚本状态、事件派发和样式隔离边界。
-->

<script setup lang="ts">
// 脚本区：组织 Todo View 的响应式状态、计算属性、事件处理和外部模块协作。
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
import { defineAsyncComponent, computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { ComponentPublicInstance } from 'vue';
import { NDatePicker, NDropdown, NScrollbar, useMessage } from 'naive-ui';
import type { DropdownOption } from 'naive-ui';

import { useSettingsStore } from '@/stores/settings';
import { useTodosStore } from '@/stores/todos';
import type { Todo, TodoCategory, TodoStatus } from '@/types/steno';
import { computeReminderTime } from '@/utils/reminders';

// 局部常量 StatsView：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const StatsView = defineAsyncComponent(() => import('@/views/StatsView.vue').then(module => module.default));

// 局部常量 TODO_CONTENT_LIMIT：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const TODO_CONTENT_LIMIT = 500;
// 局部常量 STORAGE_KEY：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const STORAGE_KEY = 'steno.todo.selectedCategory';
const VALID_CATEGORIES: ReadonlySet<TodoCategory> = new Set<TodoCategory>([
  'today',
  'planned',
  'doing',
  'paused',
  'done',
  'inbox',
  'all'
]);

// 局部常量 todos：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const todos = useTodosStore();
// 局部常量 settings：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const settings = useSettingsStore();
// 局部常量 message：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const message = useMessage();

const categories: ReadonlyArray<{ key: TodoCategory; label: string; icon: string }> = [
  { key: 'today', label: '今天', icon: 'M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 16.8l-6.2 4.5 2.4-7.4L2 9.4h7.6z' },
  {
    key: 'planned',
    label: '计划中',
    icon: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2'
  },
  { key: 'doing', label: '进行中', icon: 'M13 2L3 14h9l-1 8 10-12h-9l1-8z' },
  { key: 'paused', label: '已暂停', icon: 'M6 4h4v16H6zM14 4h4v16h-4z' },
  { key: 'done', label: '已完成', icon: 'M20 6L9 17l-5-5' },
  {
    key: 'inbox',
    label: '收件箱',
    icon: 'M22 12h-6l-2 3H10l-2-3H2M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z'
  },
  { key: 'all', label: '全部', icon: 'M3 6h18M3 12h18M3 18h18' }
];

const statusOptions: ReadonlyArray<{ key: TodoStatus; label: string }> = [
  { key: 'todo', label: '待办' },
  { key: 'doing', label: '进行中' },
  { key: 'paused', label: '已暂停' },
  { key: 'done', label: '已完成' }
];

// 局部常量 draft：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const draft = ref('');
// 局部常量 submitting：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const submitting = ref(false);
// 局部常量 search：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const search = ref('');
// 局部常量 editingId：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const editingId = ref<string | null>(null);
// 局部常量 editingContent：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const editingContent = ref('');
// 局部常量 editInputRef：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const editInputRef = ref<HTMLInputElement | null>(null);
// 局部常量 customReminderId：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const customReminderId = ref<string | null>(null);
// 局部常量 todoSidebarCollapsed：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const todoSidebarCollapsed = ref(false);
// 局部常量 showStats：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const showStats = ref(false);

/** v-for + v-if 中的模板 ref 会被收集成数组，这里用函数式 ref 取最新挂载实例。 */
function bindEditInputRef(el: Element | ComponentPublicInstance | null) {
  editInputRef.value = (el as HTMLInputElement | null) ?? null;
}

// 局部常量 filteredEntries：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const filteredEntries = computed<Todo[]>(() => {
  // 局部常量 base：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const base = todos.byCategory(todos.selectedCategory);
  // 局部常量 kw：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const kw = search.value.trim().toLowerCase();
  if (!kw) return base;
  return base.filter(item => item.content.toLowerCase().includes(kw));
});

// 局部常量 isEmpty：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const isEmpty = computed(() => filteredEntries.value.length === 0);

// 局部常量 currentCategoryLabel：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const currentCategoryLabel = computed(
  () => categories.find(item => item.key === todos.selectedCategory)?.label ?? '全部'
);

// 函数 selectCategory：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
function selectCategory(key: TodoCategory) {
  showStats.value = false;
  todos.setSelectedCategory(key);
}

// 函数 toggleTodoSidebar：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
function toggleTodoSidebar() {
  todoSidebarCollapsed.value = !todoSidebarCollapsed.value;
}

// 函数 openTodoStats：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
function openTodoStats() {
  showStats.value = !showStats.value;
}

// 函数 statusLabel：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
function statusLabel(status: TodoStatus): string {
  return statusOptions.find(item => item.key === status)?.label ?? status;
}

// 函数 buildStatusOptions：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
function buildStatusOptions(item: Todo): DropdownOption[] {
  return statusOptions.map(opt => ({
    key: opt.key,
    label: opt.label,
    disabled: opt.key === item.status
  }));
}

// 函数 buildReminderOptions：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
function buildReminderOptions(): DropdownOption[] {
  return [
    ...settings.state.reminderQuickOptions.map(option => ({
      key: `quick:${option.id}`,
      label: option.label
    })),
    { type: 'divider', key: 'reminder-divider' },
    { key: 'custom', label: '自定义' },
    { key: 'none', label: '无提醒' }
  ];
}

// 函数 submitDraft：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
async function submitDraft() {
  // 局部常量 content：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
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

// 函数 toggleDone：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
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

// 函数 changeStatus：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
async function changeStatus(item: Todo, next: TodoStatus) {
  if (item.status === next) return;
  try {
    await todos.setStatus(item.id, next);
  } catch (e) {
    message.error(`操作失败：${String(e)}`);
  }
}

// 函数 changeDueDate：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
async function changeDueDate(item: Todo, ts: number | null) {
  try {
    // 局部常量 dueDate：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const dueDate = ts ? new Date(ts).toISOString() : null;
    await todos.updateTodo({ id: item.id, dueDate });
  } catch (e) {
    message.error(`修改日期失败：${String(e)}`);
  }
}

// 函数 changeReminder：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
async function changeReminder(item: Todo, key: string) {
  try {
    if (key === 'none') {
      customReminderId.value = null;
      await todos.updateTodo({ id: item.id, reminderTime: null });
      return;
    }

    if (key === 'custom') {
      customReminderId.value = item.id;
      return;
    }

    // 局部常量 optionId：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const optionId = key.replace(/^quick:/, '');
    // 局部常量 selectedOption：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const selectedOption = settings.state.reminderQuickOptions.find(candidate => candidate.id === optionId);
    if (!selectedOption) return;
    customReminderId.value = null;
    await todos.updateTodo({
      id: item.id,
      reminderTime: computeReminderTime(selectedOption, new Date())
    });
  } catch (e) {
    message.error(`修改提醒失败：${String(e)}`);
  }
}

// 函数 changeCustomReminder：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
async function changeCustomReminder(item: Todo, ts: number | null) {
  try {
    // 局部常量 reminderTime：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const reminderTime = ts ? new Date(ts).toISOString() : null;
    await todos.updateTodo({ id: item.id, reminderTime });
    customReminderId.value = null;
  } catch (e) {
    message.error(`修改提醒失败：${String(e)}`);
  }
}

// 函数 removeItem：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
async function removeItem(id: string) {
  try {
    await todos.deleteTodo(id);
  } catch (e) {
    message.error(`删除失败：${String(e)}`);
  }
}

// 函数 startEdit：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
function startEdit(item: Todo) {
  editingId.value = item.id;
  editingContent.value = item.content;
  void nextTick(() => {
    editInputRef.value?.focus();
    editInputRef.value?.select();
  });
}

// 函数 cancelEdit：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
function cancelEdit() {
  editingId.value = null;
  editingContent.value = '';
}

// 函数 commitEdit：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
async function commitEdit() {
  // 局部常量 id：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const id = editingId.value;
  if (!id) return;
  // 局部常量 next：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const next = editingContent.value.trim();
  // 局部常量 target：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
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

// 函数 dueDateValue：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
function dueDateValue(item: Todo): number | null {
  if (!item.dueDate) return null;
  // 局部常量 ts：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const ts = new Date(item.dueDate).getTime();
  return Number.isNaN(ts) ? null : ts;
}

// 函数 reminderTimeValue：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
function reminderTimeValue(item: Todo): number | null {
  if (!item.reminderTime) return null;
  // 局部常量 ts：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const ts = new Date(item.reminderTime).getTime();
  return Number.isNaN(ts) ? null : ts;
}

// 函数 formatReminderTime：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
function formatReminderTime(iso: string): string {
  // 局部常量 date：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '提醒已设置';
  return `将于 ${date.toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })} 提醒`;
}

// 函数 isOverdueUnfiredReminder：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
function isOverdueUnfiredReminder(item: Todo): boolean {
  if (!item.reminderTime || item.reminderFired) return false;
  // 局部常量 ts：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const ts = new Date(item.reminderTime).getTime();
  return Number.isFinite(ts) && ts < Date.now();
}

onMounted(async () => {
  // 进入待办页面时自动折叠主侧边栏，为任务列表留出更多空间。
  settings.state.mainSidebarCollapsed = true;
  try {
    // 局部常量 saved：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
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
  }
);
</script>

<template>
  <!-- 模板区：描述 Todo View 的 DOM 层级、可交互区域和条件渲染边界。 -->
  <div class="todo-view-root" data-testid="todo-view">
    <!-- 左侧分类侧栏 -->
    <aside
      class="todo-view-sidebar"
      :class="{ 'todo-view-sidebar--collapsed': todoSidebarCollapsed }"
      data-testid="todo-view-sidebar"
    >
      <h2 class="sidebar-title">待办</h2>
      <ul class="category-list">
        <li
          v-for="cat in categories"
          :key="cat.key"
          class="category-item"
          :class="{ active: todos.selectedCategory === cat.key }"
          :data-testid="`category-${cat.key}`"
          :title="todoSidebarCollapsed ? cat.label : undefined"
          @click="selectCategory(cat.key)"
        >
          <svg
            v-if="todoSidebarCollapsed"
            class="category-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path :d="cat.icon" />
          </svg>
          <span class="category-label">{{ cat.label }}</span>
          <span class="category-count" :data-testid="`count-${cat.key}`">
            {{ todos.categoryCounts[cat.key] }}
          </span>
        </li>
      </ul>
      <div class="todo-sidebar-footer">
        <button
          type="button"
          class="todo-sidebar-icon-btn"
          data-testid="todo-sidebar-collapse"
          :aria-label="todoSidebarCollapsed ? '展开待办侧边栏' : '折叠待办侧边栏'"
          :title="todoSidebarCollapsed ? '展开侧边栏' : '折叠侧边栏'"
          @click="toggleTodoSidebar"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <path :d="todoSidebarCollapsed ? 'M9 6l6 6-6 6' : 'M15 6 9 12l6 6'" />
          </svg>
        </button>
        <button
          type="button"
          class="todo-sidebar-icon-btn"
          data-testid="todo-sidebar-stats"
          aria-label="打开任务统计"
          title="任务统计"
          @click="openTodoStats"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <path d="M4 19V5M4 19h16M8 16v-5M12 16V8M16 16v-9" />
          </svg>
        </button>
      </div>
    </aside>

    <!-- 右侧主区 -->
    <section class="todo-view-main">
      <!-- 统计面板（内嵌在主区中，不覆盖侧边栏） -->
      <template v-if="showStats">
        <div class="todo-stats-embed">
          <div class="todo-stats-header">
            <div class="todo-stats-header-left">
              <h3 class="toolbar-title">统计</h3>
              <span class="todo-stats-desc">查看待办完成活跃度与每日状态趋势</span>
            </div>
            <button
              type="button"
              class="todo-stats-back"
              data-testid="todo-stats-close"
              aria-label="返回"
              title="返回"
              @click="showStats = false"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="m15 6-6 6 6 6" />
              </svg>
            </button>
          </div>
          <StatsView />
        </div>
      </template>

      <!-- 任务列表 -->
      <template v-else>
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
                  <span v-else class="todo-row-content" :title="item.content" @dblclick="startEdit(item)">
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

                <NDropdown
                  trigger="click"
                  :options="buildReminderOptions()"
                  @select="(key: string) => changeReminder(item, key)"
                >
                  <button
                    type="button"
                    class="todo-row-reminder"
                    :class="{ 'todo-row-reminder--active': item.reminderTime }"
                    :data-testid="`todo-row-reminder-${item.id}`"
                  >
                    <span>
                      {{ item.reminderTime ? formatReminderTime(item.reminderTime) : '提醒' }}
                    </span>
                    <small v-if="isOverdueUnfiredReminder(item)">未提醒</small>
                  </button>
                </NDropdown>

                <NDatePicker
                  v-if="customReminderId === item.id"
                  :value="reminderTimeValue(item)"
                  type="datetime"
                  size="small"
                  clearable
                  placeholder="自定义提醒"
                  class="todo-row-reminder-custom"
                  :data-testid="`todo-row-reminder-custom-${item.id}`"
                  @update:value="ts => changeCustomReminder(item, ts)"
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
              {{ search.trim() ? '没有匹配的任务，换个关键词试试' : '在上方输入框添加第一个任务吧' }}
            </p>
          </div>
        </div>
      </template>
    </section>
  </div>
</template>

<style scoped>
/* 样式区：限定 Todo View 的布局、主题色和响应式细节。 */
.todo-view-root {
  display: flex;
  width: 100%;
  height: 100%;
  color: var(--app-fg);
  background: var(--app-bg);
}

.todo-view-sidebar {
  width: 180px;
  flex-shrink: 0;
  border-right: 1px solid var(--app-border);
  padding: 18px 12px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: var(--app-surface);
  transition:
    width 0.18s ease,
    padding 0.18s ease;
}

.todo-view-sidebar--collapsed {
  width: 64px;
  padding-inline: 10px;
}

.sidebar-title {
  margin: 0 8px 4px;
  font-size: 16px;
  font-weight: 600;
  color: var(--app-fg);
}

.todo-view-sidebar--collapsed .sidebar-title {
  text-align: center;
}

.category-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-height: 0;
}

.category-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 7px 10px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
  color: var(--app-muted);
  transition:
    background 120ms,
    color 120ms;
}

.todo-view-sidebar--collapsed .category-item {
  justify-content: center;
  padding-inline: 0;
}

.todo-view-sidebar--collapsed .category-label,
.todo-view-sidebar--collapsed .category-count {
  display: none;
}

.category-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.category-item:hover {
  background: var(--app-accent-soft);
  color: var(--app-fg);
}

.category-item.active {
  background: var(--app-accent-soft);
  color: var(--app-accent);
  font-weight: 600;
}

.category-count {
  font-size: 12px;
  font-weight: 500;
  color: var(--app-faint);
  min-width: 18px;
  text-align: right;
}

.category-item.active .category-count {
  color: var(--app-accent);
}

.todo-sidebar-footer {
  margin-top: auto;
  padding-top: 10px;
  border-top: 1px solid var(--app-border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.todo-view-sidebar--collapsed .todo-sidebar-footer {
  flex-direction: column;
}

.todo-sidebar-icon-btn {
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: var(--app-muted);
  cursor: pointer;
  transition:
    background 120ms,
    border-color 120ms,
    color 120ms;
}

.todo-sidebar-icon-btn:hover,
.todo-sidebar-icon-btn:focus-visible {
  border-color: var(--app-border);
  background: var(--app-surface-2);
  color: var(--app-fg);
  outline: none;
}

.todo-sidebar-icon-btn svg {
  width: 18px;
  height: 18px;
}

.todo-view-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  padding: 18px 22px;
  background: var(--app-bg);
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
  color: var(--app-fg);
}

.todo-view-search {
  width: 220px;
  padding: 6px 10px;
  border-radius: 8px;
  border: 1px solid var(--app-border);
  background: var(--app-surface);
  color: var(--app-fg);
  font-size: 13px;
  outline: none;
  transition:
    border 120ms,
    background 120ms;
}

.todo-view-search:focus {
  border-color: var(--app-accent);
  background: var(--app-surface-2);
}

.todo-view-search::placeholder {
  color: var(--app-faint);
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
  border: 1px solid var(--app-border);
  background: var(--app-surface);
  color: var(--app-fg);
  outline: none;
  transition:
    border 120ms,
    background 120ms;
}

.todo-view-input:focus {
  border-color: var(--app-accent);
  background: var(--app-surface-2);
}

.todo-view-input::placeholder {
  color: var(--app-faint);
}

.todo-view-submit {
  padding: 0 16px;
  border-radius: 8px;
  border: 1px solid var(--app-accent);
  background: var(--app-accent);
  color: var(--app-bg);
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
  transition: filter 120ms;
}

.todo-view-submit:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.todo-view-submit:hover:not(:disabled) {
  filter: brightness(1.08);
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
  background: var(--app-surface);
}

.todo-row.done .todo-row-content {
  color: var(--app-faint);
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
  border: 1.5px solid var(--app-faint);
  transition:
    background 120ms,
    border-color 120ms;
}

.todo-row.done .checkbox-indicator {
  background: var(--app-accent);
  border-color: var(--app-accent);
}

.todo-row-text {
  flex: 1;
  min-width: 0;
}

.todo-row-content {
  display: block;
  font-size: 14px;
  color: var(--app-fg);
  cursor: text;
  user-select: text;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.todo-row-edit-input {
  width: 100%;
  padding: 4px 6px;
  border: 1px solid var(--app-accent);
  border-radius: 6px;
  background: var(--app-surface-2);
  color: var(--app-fg);
  font-size: 14px;
  outline: none;
}

.todo-row-status {
  border: none;
  background: var(--app-surface);
  color: var(--app-muted);
  font-size: 12px;
  padding: 3px 10px;
  border-radius: 999px;
  cursor: pointer;
  flex-shrink: 0;
  transition:
    background 120ms,
    color 120ms;
}

.todo-row-status:hover {
  background: var(--app-surface-2);
  color: var(--app-fg);
}

.todo-row-status.status-doing {
  background: rgba(96, 140, 200, 0.18);
  color: rgb(108, 152, 210);
}

.todo-row-status.status-paused {
  background: rgba(200, 160, 60, 0.18);
  color: rgb(210, 175, 80);
}

.todo-row-status.status-done {
  background: rgba(120, 168, 96, 0.18);
  color: rgb(140, 190, 110);
}

.todo-row-date {
  width: 130px;
  flex-shrink: 0;
}

.todo-row-reminder {
  max-width: 168px;
  min-height: 28px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid var(--app-border);
  border-radius: 8px;
  padding: 4px 9px;
  background: var(--app-surface);
  color: var(--app-muted);
  cursor: pointer;
  font-size: 12px;
  line-height: 1.2;
  flex-shrink: 0;
  transition:
    background 120ms,
    border-color 120ms,
    color 120ms;
}

.todo-row-reminder:hover,
.todo-row-reminder--active {
  border-color: var(--app-accent);
  background: var(--app-accent-soft);
  color: var(--app-accent);
}

.todo-row-reminder span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.todo-row-reminder small {
  flex-shrink: 0;
  border-radius: 999px;
  padding: 1px 5px;
  background: rgba(220, 80, 80, 0.18);
  color: rgb(230, 110, 110);
  font-size: 10px;
}

.todo-row-reminder-custom {
  width: 188px;
  flex-shrink: 0;
}

.todo-row-delete {
  background: transparent;
  border: none;
  color: var(--app-faint);
  font-size: 18px;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  cursor: pointer;
  opacity: 0;
  transition:
    opacity 120ms,
    background 120ms,
    color 120ms;
}

.todo-row:hover .todo-row-delete {
  opacity: 1;
}

.todo-row-delete:hover {
  background: rgba(220, 80, 80, 0.18);
  color: rgb(230, 110, 110);
}

.todo-view-empty {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px;
  color: var(--app-muted);
}

.empty-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--app-fg);
}

.empty-subtitle {
  margin: 6px 0 0;
  font-size: 13px;
  color: var(--app-muted);
}

/* 统计面板嵌入样式 */
.todo-stats-embed {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: auto;
}

.todo-stats-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.todo-stats-header-left {
  display: flex;
  align-items: baseline;
  gap: 10px;
}

.todo-stats-desc {
  color: var(--app-muted);
  font-size: 12px;
}

.todo-stats-back {
  width: 32px;
  height: 32px;
  display: inline-grid;
  place-items: center;
  border: 1px solid var(--app-border);
  border-radius: 8px;
  background: var(--app-surface);
  color: var(--app-muted);
  cursor: pointer;
  transition:
    border-color 120ms,
    color 120ms;
}

.todo-stats-back:hover {
  border-color: var(--app-accent);
  color: var(--app-accent);
}

.todo-stats-back svg {
  width: 18px;
  height: 18px;
}
</style>
