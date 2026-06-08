/**
 * @file Pinia 状态管理 - todos
 *
 * 覆盖 todos 的主要行为、边界条件和跨模块契约，帮助重构时快速定位预期。
 * 注释重点标明数据入口、状态边界、事件通道和协作风险点，便于逐行阅读时快速判断代码意图。
 */

// @vitest-environment jsdom

import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  CreateTodoRequest,
  Todo,
  TodoActivityPoint,
  TodoChangePayload,
  TodoDailyTrendRequest,
  TodoStatsRange,
  TodoTrendPoint,
  UpdateTodoRequest
} from '@/types/steno';
import { useTodosStore } from './todos';

// ---- IPC mocks ----

const listTodos = vi.fn<() => Promise<Todo[]>>();
// 局部常量 getTodayTodos：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const getTodayTodos = vi.fn<(includeCompleted?: boolean) => Promise<Todo[]>>();
// 局部常量 createTodoIpc：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const createTodoIpc = vi.fn<(input: CreateTodoRequest) => Promise<Todo>>();
// 局部常量 updateTodoIpc：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const updateTodoIpc = vi.fn<(input: UpdateTodoRequest) => Promise<Todo>>();
// 局部常量 completeTodoIpc：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const completeTodoIpc = vi.fn<(id: string) => Promise<Todo>>();
// 局部常量 deleteTodoIpc：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const deleteTodoIpc = vi.fn<(id: string) => Promise<void>>();
// 局部常量 getTodoActivityIpc：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const getTodoActivityIpc = vi.fn<(input: TodoStatsRange) => Promise<TodoActivityPoint[]>>();
// 局部常量 getTodoDailyTrendIpc：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const getTodoDailyTrendIpc = vi.fn<(input: TodoDailyTrendRequest) => Promise<TodoTrendPoint[]>>();
// 局部常量 resetTodoStatsIpc：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const resetTodoStatsIpc = vi.fn<() => Promise<number>>();

// 局部常量 todoChangedListeners：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const todoChangedListeners = new Set<(payload: TodoChangePayload) => void>();
// 局部常量 todoPanelToggleListeners：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const todoPanelToggleListeners = new Set<(payload: boolean) => void>();

vi.mock('@/composables/useDb', () => ({
  useDb: () => ({
    listTodos,
    getTodayTodos,
    createTodo: createTodoIpc,
    updateTodo: updateTodoIpc,
    completeTodo: completeTodoIpc,
    deleteTodo: deleteTodoIpc,
    getTodoActivity: getTodoActivityIpc,
    getTodoDailyTrend: getTodoDailyTrendIpc,
    resetTodoStats: resetTodoStatsIpc
  })
}));

vi.mock('@/composables/useAppEvents', () => ({
  useAppEvents: () => ({
    listenTodoChanged: vi.fn(async (handler: (payload: TodoChangePayload) => void) => {
      todoChangedListeners.add(handler);
      return () => todoChangedListeners.delete(handler);
    }),
    listenTodoPanelToggle: vi.fn(async (handler: (payload: boolean) => void) => {
      todoPanelToggleListeners.add(handler);
      return () => todoPanelToggleListeners.delete(handler);
    })
  })
}));

// ---- fixtures ----

function nowIso(): string {
  return new Date().toISOString();
}

// 函数 yesterdayIso：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
function yesterdayIso(): string {
  // 局部常量 d：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString();
}

// 函数 makeTodo：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
function makeTodo(overrides: Partial<Todo> = {}): Todo {
  return {
    id: 't1',
    content: '示例任务',
    status: 'todo',
    createdAt: nowIso(),
    updatedAt: nowIso(),
    completedAt: null,
    dueDate: null,
    reminderTime: null,
    reminderFired: false,
    startedAt: null,
    listId: 'default',
    ...overrides
  };
}

// 测试用例：验证「todos store」场景，锁定 todos 的用户可见行为。
describe('todos store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    todoChangedListeners.clear();
    todoPanelToggleListeners.clear();
    listTodos.mockReset();
    getTodayTodos.mockReset();
    createTodoIpc.mockReset();
    updateTodoIpc.mockReset();
    completeTodoIpc.mockReset();
    deleteTodoIpc.mockReset();
    getTodoActivityIpc.mockReset();
    getTodoDailyTrendIpc.mockReset();
    resetTodoStatsIpc.mockReset();
  });

  // 测试用例：验证「loads todos from the db adapter」场景，锁定 todos 的用户可见行为。
  it('loads todos from the db adapter', async () => {
    // 局部常量 a：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const a = makeTodo({ id: 'a', content: 'A' });
    // 局部常量 b：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const b = makeTodo({ id: 'b', content: 'B' });
    listTodos.mockResolvedValue([a, b]);

    // 局部常量 store：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const store = useTodosStore();
    await store.load();

    expect(listTodos).toHaveBeenCalledOnce();
    expect(store.entries).toEqual([a, b]);
    expect(store.loading).toBe(false);
    expect(store.error).toBeNull();
  });

  // 测试用例：验证「captures error string when load fails」场景，锁定 todos 的用户可见行为。
  it('captures error string when load fails', async () => {
    listTodos.mockRejectedValue(new Error('boom'));

    // 局部常量 store：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const store = useTodosStore();
    await store.load();

    expect(store.entries).toEqual([]);
    expect(store.error).toContain('boom');
  });

  // 测试用例：验证「optimistically upserts after create / update / complete and removes on delete」场景，锁定 todos 的用户可见行为。
  it('optimistically upserts after create / update / complete and removes on delete', async () => {
    // 局部常量 created：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const created = makeTodo({ id: 'a', content: '新建' });
    // 局部常量 updated：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const updated = makeTodo({ id: 'a', content: '改后', updatedAt: nowIso() });
    // 局部常量 completed：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const completed = makeTodo({
      id: 'a',
      content: '改后',
      status: 'done',
      completedAt: nowIso()
    });
    createTodoIpc.mockResolvedValue(created);
    updateTodoIpc.mockResolvedValue(updated);
    completeTodoIpc.mockResolvedValue(completed);
    deleteTodoIpc.mockResolvedValue();

    // 局部常量 store：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const store = useTodosStore();

    await store.createTodo({ content: '新建' });
    expect(store.entries).toEqual([created]);

    await store.updateTodo({ id: 'a', content: '改后' });
    expect(store.entries[0].content).toBe('改后');

    await store.completeTodo('a');
    expect(store.entries[0].status).toBe('done');

    await store.deleteTodo('a');
    expect(store.entries).toEqual([]);
  });

  // 测试用例：验证「today getter includes new-without-dueDate and excludes done / yesterday」场景，锁定 todos 的用户可见行为。
  it('today getter includes new-without-dueDate and excludes done / yesterday', async () => {
    // 局部常量 todayNoDue：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const todayNoDue = makeTodo({
      id: 'today-1',
      content: '今天创建无截止',
      createdAt: nowIso()
    });
    // 局部常量 todayDue：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const todayDue = makeTodo({
      id: 'today-2',
      content: '今天截止',
      dueDate: nowIso(),
      createdAt: yesterdayIso()
    });
    // 局部常量 yesterday：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const yesterday = makeTodo({
      id: 'old',
      content: '昨天',
      createdAt: yesterdayIso()
    });
    // 局部常量 completedToday：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const completedToday = makeTodo({
      id: 'done',
      content: '今天已完',
      status: 'done',
      completedAt: nowIso()
    });
    listTodos.mockResolvedValue([todayNoDue, todayDue, yesterday, completedToday]);

    // 局部常量 store：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const store = useTodosStore();
    await store.load();

    // 局部常量 ids：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const ids = store.todayEntries.map(t => t.id);
    expect(ids).toEqual(expect.arrayContaining(['today-1', 'today-2']));
    expect(ids).not.toContain('old');
    expect(ids).not.toContain('done');
  });

  // 测试用例：验证「categoryCounts derives all category sizes from entries」场景，锁定 todos 的用户可见行为。
  it('categoryCounts derives all category sizes from entries', async () => {
    listTodos.mockResolvedValue([
      makeTodo({ id: '1', status: 'todo', createdAt: nowIso() }),
      makeTodo({ id: '2', status: 'doing', dueDate: nowIso() }),
      makeTodo({ id: '3', status: 'paused' }),
      makeTodo({ id: '4', status: 'done', completedAt: nowIso() }),
      makeTodo({ id: '5', status: 'todo', listId: 'work' })
    ]);

    // 局部常量 store：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const store = useTodosStore();
    await store.load();

    expect(store.categoryCounts.all).toBe(5);
    expect(store.categoryCounts.done).toBe(1);
    expect(store.categoryCounts.doing).toBe(1);
    expect(store.categoryCounts.paused).toBe(1);
    expect(store.categoryCounts.planned).toBeGreaterThanOrEqual(1);
    // inbox = listId 'default' 的未完成项；id=1 / id=3 (paused) 都是 default
    expect(store.categoryCounts.inbox).toBeGreaterThanOrEqual(1);
  });

  // 测试用例：验证「byCategory returns the same array as the matching getter」场景，锁定 todos 的用户可见行为。
  it('byCategory returns the same array as the matching getter', async () => {
    listTodos.mockResolvedValue([
      makeTodo({ id: '1', status: 'doing' }),
      makeTodo({ id: '2', status: 'done', completedAt: nowIso() })
    ]);
    // 局部常量 store：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const store = useTodosStore();
    await store.load();

    expect(store.byCategory('doing').map(t => t.id)).toEqual(['1']);
    expect(store.byCategory('done').map(t => t.id)).toEqual(['2']);
    expect(store.byCategory('all')).toHaveLength(2);
  });

  // 测试用例：验证「applyRemoteChange handles all four kinds correctly」场景，锁定 todos 的用户可见行为。
  it('applyRemoteChange handles all four kinds correctly', async () => {
    // 局部常量 store：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const store = useTodosStore();

    // created
    const created = makeTodo({ id: 'r1', content: '远程新建' });
    store.applyRemoteChange({ kind: 'created', id: 'r1', todo: created });
    expect(store.entries).toEqual([created]);

    // updated
    const updated = { ...created, content: '远程改' };
    store.applyRemoteChange({ kind: 'updated', id: 'r1', todo: updated });
    expect(store.entries[0].content).toBe('远程改');

    // completed
    const completed = { ...updated, status: 'done' as const, completedAt: nowIso() };
    store.applyRemoteChange({ kind: 'completed', id: 'r1', todo: completed });
    expect(store.entries[0].status).toBe('done');

    // deleted
    store.applyRemoteChange({ kind: 'deleted', id: 'r1', todo: null });
    expect(store.entries).toEqual([]);
  });

  // 测试用例：验证「exposes stats query and reset actions through the db adapter」场景，锁定 todos 的用户可见行为。
  it('exposes stats query and reset actions through the db adapter', async () => {
    // 局部常量 activity：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const activity = [{ date: '2026-05-20', count: 4 }];
    // 局部常量 trend：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const trend = [{ date: '2026-05-20', created: 2, started: 1, completed: 1 }];
    getTodoActivityIpc.mockResolvedValue(activity);
    getTodoDailyTrendIpc.mockResolvedValue(trend);
    resetTodoStatsIpc.mockResolvedValue(3);

    // 局部常量 store：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const store = useTodosStore();
    await expect(store.getActivity({ start: '2026-05-01', end: '2026-05-31' })).resolves.toEqual(activity);
    await expect(
      store.getDailyTrend({
        start: '2026-05-01',
        end: '2026-05-31',
        statusFilter: 'doing'
      })
    ).resolves.toEqual(trend);
    await expect(store.resetStats()).resolves.toBe(3);

    expect(getTodoActivityIpc).toHaveBeenCalledWith({ start: '2026-05-01', end: '2026-05-31' });
    expect(getTodoDailyTrendIpc).toHaveBeenCalledWith({
      start: '2026-05-01',
      end: '2026-05-31',
      statusFilter: 'doing'
    });
    expect(resetTodoStatsIpc).toHaveBeenCalledOnce();
  });

  // 测试用例：验证「reloads all todos when a reset event is received」场景，锁定 todos 的用户可见行为。
  it('reloads all todos when a reset event is received', async () => {
    // 局部常量 afterReset：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const afterReset = [makeTodo({ id: 'active', content: '保留的活动任务' })];
    listTodos.mockResolvedValue(afterReset);

    // 局部常量 store：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const store = useTodosStore();
    store.applyRemoteChange({ kind: 'reset', id: '', todo: null });
    await Promise.resolve();

    expect(listTodos).toHaveBeenCalledOnce();
    expect(store.entries).toEqual(afterReset);
  });

  // 测试用例：验证「startEventListeners wires applyRemoteChange to the global event bus」场景，锁定 todos 的用户可见行为。
  it('startEventListeners wires applyRemoteChange to the global event bus', async () => {
    // 局部常量 store：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const store = useTodosStore();
    await store.startEventListeners();

    // 局部常量 created：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const created = makeTodo({ id: 'evt-1', content: '通过事件' });
    todoChangedListeners.forEach(handler => handler({ kind: 'created', id: 'evt-1', todo: created }));
    expect(store.entries[0].id).toBe('evt-1');

    store.stopEventListeners();
    expect(todoChangedListeners.size).toBe(0);
  });

  // 测试用例：验证「setSelectedCategory updates visibleEntries」场景，锁定 todos 的用户可见行为。
  it('setSelectedCategory updates visibleEntries', async () => {
    listTodos.mockResolvedValue([makeTodo({ id: '1', status: 'doing' }), makeTodo({ id: '2', status: 'paused' })]);
    // 局部常量 store：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const store = useTodosStore();
    await store.load();

    store.setSelectedCategory('doing');
    expect(store.visibleEntries.map(t => t.id)).toEqual(['1']);

    store.setSelectedCategory('paused');
    expect(store.visibleEntries.map(t => t.id)).toEqual(['2']);
  });
});
