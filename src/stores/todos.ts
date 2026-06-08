/**
 * @file Pinia 状态管理 - todos
 *
 * 组织 todos 的核心逻辑、类型和协作边界，供 Pinia 状态管理 模块复用。
 * 注释重点标明数据入口、状态边界、事件通道和协作风险点，便于逐行阅读时快速判断代码意图。
 */

import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

import { useAppEvents } from '@/composables/useAppEvents';
import { useDb } from '@/composables/useDb';
import type {
  CreateTodoRequest,
  Todo,
  TodoActivityPoint,
  TodoCategory,
  TodoChangePayload,
  TodoDailyTrendRequest,
  TodoStatsRange,
  TodoTrendPoint,
  TodoStatus,
  UpdateTodoRequest
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
  // 局部常量 db：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const db = useDb();
  // 局部常量 events：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const events = useAppEvents();

  // 局部常量 entries：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const entries = ref<Todo[]>([]);
  // 局部常量 loading：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const loading = ref(false);
  // 局部常量 error：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const error = ref<string | null>(null);
  // 局部常量 selectedCategory：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const selectedCategory = ref<TodoCategory>('today');

  // 局部常量 listenersStarted：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const listenersStarted = ref(false);
  const unlisteners: Array<() => void> = [];

  // ---------- getters ----------

  /** 判断给定 ISO 时间戳是否落在"今天本地日"。 */
  function isToday(iso: string | null): boolean {
    if (!iso) return false;
    // 局部常量 date：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return false;
    // 局部常量 now：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const now = new Date();
    return (
      date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate()
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
    })
  );

  // 局部常量 plannedEntries：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const plannedEntries = computed<Todo[]>(() =>
    entries.value.filter(item => item.status !== 'done' && Boolean(item.dueDate))
  );

  // 局部常量 doingEntries：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const doingEntries = computed<Todo[]>(() => entries.value.filter(item => item.status === 'doing'));

  // 局部常量 pausedEntries：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const pausedEntries = computed<Todo[]>(() => entries.value.filter(item => item.status === 'paused'));

  // 局部常量 doneEntries：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const doneEntries = computed<Todo[]>(() => entries.value.filter(item => item.status === 'done'));

  /** 收件箱 = listId='default' 的未完成项（用户未指定清单的"默认箱"）。 */
  const inboxEntries = computed<Todo[]>(() =>
    entries.value.filter(item => item.status !== 'done' && item.listId === 'default')
  );

  // 局部常量 categoryCounts：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const categoryCounts = computed(() => ({
    today: todayEntries.value.length,
    planned: plannedEntries.value.length,
    doing: doingEntries.value.length,
    paused: pausedEntries.value.length,
    done: doneEntries.value.length,
    all: entries.value.length,
    inbox: inboxEntries.value.length
  }));

  // 函数 byCategory：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
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

  // 局部常量 visibleEntries：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const visibleEntries = computed<Todo[]>(() => byCategory(selectedCategory.value));

  // ---------- helpers ----------

  function upsertLocal(todo: Todo) {
    // 局部常量 idx：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const idx = entries.value.findIndex(item => item.id === todo.id);
    if (idx === -1) {
      entries.value = [todo, ...entries.value];
    } else {
      // 局部常量 next：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
      const next = [...entries.value];
      next[idx] = todo;
      entries.value = next;
    }
  }

  // 函数 removeLocal：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
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

  // 函数 loadToday：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
  async function loadToday(includeCompleted = false): Promise<Todo[]> {
    try {
      // 局部常量 list：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
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

  // 函数 createTodo：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
  async function createTodo(input: CreateTodoRequest): Promise<Todo> {
    // 局部常量 todo：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const todo = await db.createTodo(input);
    upsertLocal(todo);
    return todo;
  }

  // 函数 updateTodo：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
  async function updateTodo(input: UpdateTodoRequest): Promise<Todo> {
    // 局部常量 todo：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const todo = await db.updateTodo(input);
    upsertLocal(todo);
    return todo;
  }

  // 函数 setStatus：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
  async function setStatus(id: string, status: TodoStatus): Promise<Todo> {
    return await updateTodo({ id, status });
  }

  // 函数 completeTodo：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
  async function completeTodo(id: string): Promise<Todo> {
    // 局部常量 todo：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const todo = await db.completeTodo(id);
    upsertLocal(todo);
    return todo;
  }

  // 函数 deleteTodo：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
  async function deleteTodo(id: string): Promise<void> {
    await db.deleteTodo(id);
    removeLocal(id);
  }

  // 函数 getActivity：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
  function getActivity(input: TodoStatsRange): Promise<TodoActivityPoint[]> {
    return db.getTodoActivity(input);
  }

  // 函数 getDailyTrend：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
  function getDailyTrend(input: TodoDailyTrendRequest): Promise<TodoTrendPoint[]> {
    return db.getTodoDailyTrend(input);
  }

  // 函数 resetStats：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
  function resetStats(): Promise<number> {
    return db.resetTodoStats();
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
      case 'reset':
        void load();
        break;
    }
  }

  // 函数 setSelectedCategory：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
  function setSelectedCategory(category: TodoCategory) {
    selectedCategory.value = category;
  }

  // ---------- event listeners ----------

  async function startEventListeners() {
    if (listenersStarted.value) return;
    listenersStarted.value = true;
    try {
      // 局部常量 unlisten：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
      const unlisten = await events.listenTodoChanged(payload => {
        applyRemoteChange(payload);
      });
      unlisteners.push(unlisten);
    } catch (e) {
      listenersStarted.value = false;
      error.value = String(e);
    }
  }

  // 函数 stopEventListeners：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
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
    getActivity,
    getDailyTrend,
    resetStats,
    applyRemoteChange,
    setSelectedCategory,
    startEventListeners,
    stopEventListeners
  };
});
