import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

import { useAppEvents } from '@/composables/useAppEvents';
import { useDb } from '@/composables/useDb';
import type {
  CreateTodoRequest,
  Todo,
  TodoCategory,
  TodoChangePayload,
  TodoStatus,
  UpdateTodoRequest,
} from '@/types/steno';

/**
 * 待办事项 Pinia store — 主窗口 TodoView 与浮窗 TodoQuickPanel 共享同一实例。
 *
 * ## 数据流
 * 1. `load()` 拉全量待办；UI 切到待办视图时调用。
 * 2. 写操作（create/update/complete/delete）走 IPC，并在本地乐观更新；
 *    后端写入后会通过 `steno:todo-changed` 事件广播，`applyRemoteChange` 再
 *    把权威 payload 合并进缓存，覆盖乐观更新中的临时态。
 * 3. 跨窗口同步由 `startEventListeners()` 注册一次性监听器。
 *
 * ## 分类计数（categoryCounts）
 * 与设计稿一致：今天 / 计划中 / 进行中 / 已暂停 / 已完成 / 全部 / 收件箱。
 * 全部用 getter 派生，写入操作无需手动维护计数。
 */
export const useTodosStore = defineStore('todos', () => {
  const db = useDb();
  const events = useAppEvents();

  const entries = ref<Todo[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const selectedCategory = ref<TodoCategory>('today');

  const listenersStarted = ref(false);
  const unlisteners: Array<() => void> = [];

  // ---------- getters ----------

  /** 判断给定 ISO 时间戳是否落在"今天本地日"。 */
  function isToday(iso: string | null): boolean {
    if (!iso) return false;
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return false;
    const now = new Date();
    return (
      date.getFullYear() === now.getFullYear() &&
      date.getMonth() === now.getMonth() &&
      date.getDate() === now.getDate()
    );
  }

  /**
   * 今日维度 — 与后端 `list_today_todos` 的语义对齐：
   * - 未完成 + (dueDate 在今天 OR (dueDate 为空 且 createdAt 在今天))
   */
  const todayEntries = computed<Todo[]>(() =>
    entries.value.filter(item => {
      if (item.status === 'done') return false;
      if (item.dueDate) return isToday(item.dueDate);
      return isToday(item.createdAt);
    }),
  );

  const plannedEntries = computed<Todo[]>(() =>
    entries.value.filter(item => item.status !== 'done' && Boolean(item.dueDate)),
  );

  const doingEntries = computed<Todo[]>(() =>
    entries.value.filter(item => item.status === 'doing'),
  );

  const pausedEntries = computed<Todo[]>(() =>
    entries.value.filter(item => item.status === 'paused'),
  );

  const doneEntries = computed<Todo[]>(() =>
    entries.value.filter(item => item.status === 'done'),
  );

  /** 收件箱 = listId='default' 的未完成项（用户未指定清单的"默认箱"）。 */
  const inboxEntries = computed<Todo[]>(() =>
    entries.value.filter(item => item.status !== 'done' && item.listId === 'default'),
  );

  const categoryCounts = computed(() => ({
    today: todayEntries.value.length,
    planned: plannedEntries.value.length,
    doing: doingEntries.value.length,
    paused: pausedEntries.value.length,
    done: doneEntries.value.length,
    all: entries.value.length,
    inbox: inboxEntries.value.length,
  }));

  function byCategory(category: TodoCategory): Todo[] {
    switch (category) {
      case 'today':
        return todayEntries.value;
      case 'planned':
        return plannedEntries.value;
      case 'doing':
        return doingEntries.value;
      case 'paused':
        return pausedEntries.value;
      case 'done':
        return doneEntries.value;
      case 'inbox':
        return inboxEntries.value;
      case 'all':
      default:
        return entries.value;
    }
  }

  const visibleEntries = computed<Todo[]>(() => byCategory(selectedCategory.value));

  // ---------- helpers ----------

  function upsertLocal(todo: Todo) {
    const idx = entries.value.findIndex(item => item.id === todo.id);
    if (idx === -1) {
      entries.value = [todo, ...entries.value];
    } else {
      const next = [...entries.value];
      next[idx] = todo;
      entries.value = next;
    }
  }

  function removeLocal(id: string) {
    entries.value = entries.value.filter(item => item.id !== id);
  }

  // ---------- actions ----------

  async function load() {
    loading.value = true;
    error.value = null;
    try {
      entries.value = await db.listTodos();
    } catch (e) {
      error.value = String(e);
      entries.value = [];
    } finally {
      loading.value = false;
    }
  }

  async function loadToday(includeCompleted = false): Promise<Todo[]> {
    try {
      const list = await db.getTodayTodos(includeCompleted);
      // 也合并到全量缓存，便于跨分类切换不重复拉取。
      for (const item of list) {
        upsertLocal(item);
      }
      return list;
    } catch (e) {
      error.value = String(e);
      return [];
    }
  }

  async function createTodo(input: CreateTodoRequest): Promise<Todo> {
    const todo = await db.createTodo(input);
    upsertLocal(todo);
    return todo;
  }

  async function updateTodo(input: UpdateTodoRequest): Promise<Todo> {
    const todo = await db.updateTodo(input);
    upsertLocal(todo);
    return todo;
  }

  async function setStatus(id: string, status: TodoStatus): Promise<Todo> {
    return await updateTodo({ id, status });
  }

  async function completeTodo(id: string): Promise<Todo> {
    const todo = await db.completeTodo(id);
    upsertLocal(todo);
    return todo;
  }

  async function deleteTodo(id: string): Promise<void> {
    await db.deleteTodo(id);
    removeLocal(id);
  }

  /**
   * 处理后端 `steno:todo-changed` 事件 — 按 kind 局部更新缓存。
   *
   * 同窗口的本地写操作也会触发本事件（因为 emit 是全窗口广播），所以
   * `upsertLocal` 必须幂等。
   */
  function applyRemoteChange(payload: TodoChangePayload) {
    switch (payload.kind) {
      case 'created':
      case 'updated':
      case 'completed':
        if (payload.todo) upsertLocal(payload.todo);
        break;
      case 'deleted':
        removeLocal(payload.id);
        break;
    }
  }

  function setSelectedCategory(category: TodoCategory) {
    selectedCategory.value = category;
  }

  // ---------- event listeners ----------

  async function startEventListeners() {
    if (listenersStarted.value) return;
    listenersStarted.value = true;
    try {
      const unlisten = await events.listenTodoChanged(payload => {
        applyRemoteChange(payload);
      });
      unlisteners.push(unlisten);
    } catch (e) {
      listenersStarted.value = false;
      error.value = String(e);
    }
  }

  function stopEventListeners() {
    while (unlisteners.length) {
      unlisteners.pop()?.();
    }
    listenersStarted.value = false;
  }

  return {
    entries,
    loading,
    error,
    selectedCategory,
    todayEntries,
    plannedEntries,
    doingEntries,
    pausedEntries,
    doneEntries,
    inboxEntries,
    categoryCounts,
    visibleEntries,
    byCategory,
    load,
    loadToday,
    createTodo,
    updateTodo,
    setStatus,
    completeTodo,
    deleteTodo,
    applyRemoteChange,
    setSelectedCategory,
    startEventListeners,
    stopEventListeners,
  };
});
