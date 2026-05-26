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
  UpdateTodoRequest,
} from '@/types/steno';
import { useTodosStore } from './todos';

// ---- IPC mocks ----

const listTodos = vi.fn<() => Promise<Todo[]>>();
const getTodayTodos = vi.fn<(includeCompleted?: boolean) => Promise<Todo[]>>();
const createTodoIpc = vi.fn<(input: CreateTodoRequest) => Promise<Todo>>();
const updateTodoIpc = vi.fn<(input: UpdateTodoRequest) => Promise<Todo>>();
const completeTodoIpc = vi.fn<(id: string) => Promise<Todo>>();
const deleteTodoIpc = vi.fn<(id: string) => Promise<void>>();
const getTodoActivityIpc = vi.fn<(input: TodoStatsRange) => Promise<TodoActivityPoint[]>>();
const getTodoDailyTrendIpc = vi.fn<(input: TodoDailyTrendRequest) => Promise<TodoTrendPoint[]>>();
const resetTodoStatsIpc = vi.fn<() => Promise<number>>();

const todoChangedListeners = new Set<(payload: TodoChangePayload) => void>();
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
    resetTodoStats: resetTodoStatsIpc,
  }),
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
    }),
  }),
}));

// ---- fixtures ----

function nowIso(): string {
  return new Date().toISOString();
}

function yesterdayIso(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString();
}

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
    ...overrides,
  };
}

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

  it('loads todos from the db adapter', async () => {
    const a = makeTodo({ id: 'a', content: 'A' });
    const b = makeTodo({ id: 'b', content: 'B' });
    listTodos.mockResolvedValue([a, b]);

    const store = useTodosStore();
    await store.load();

    expect(listTodos).toHaveBeenCalledOnce();
    expect(store.entries).toEqual([a, b]);
    expect(store.loading).toBe(false);
    expect(store.error).toBeNull();
  });

  it('captures error string when load fails', async () => {
    listTodos.mockRejectedValue(new Error('boom'));

    const store = useTodosStore();
    await store.load();

    expect(store.entries).toEqual([]);
    expect(store.error).toContain('boom');
  });

  it('optimistically upserts after create / update / complete and removes on delete', async () => {
    const created = makeTodo({ id: 'a', content: '新建' });
    const updated = makeTodo({ id: 'a', content: '改后', updatedAt: nowIso() });
    const completed = makeTodo({
      id: 'a',
      content: '改后',
      status: 'done',
      completedAt: nowIso(),
    });
    createTodoIpc.mockResolvedValue(created);
    updateTodoIpc.mockResolvedValue(updated);
    completeTodoIpc.mockResolvedValue(completed);
    deleteTodoIpc.mockResolvedValue();

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

  it('today getter includes new-without-dueDate and excludes done / yesterday', async () => {
    const todayNoDue = makeTodo({
      id: 'today-1',
      content: '今天创建无截止',
      createdAt: nowIso(),
    });
    const todayDue = makeTodo({
      id: 'today-2',
      content: '今天截止',
      dueDate: nowIso(),
      createdAt: yesterdayIso(),
    });
    const yesterday = makeTodo({
      id: 'old',
      content: '昨天',
      createdAt: yesterdayIso(),
    });
    const completedToday = makeTodo({
      id: 'done',
      content: '今天已完',
      status: 'done',
      completedAt: nowIso(),
    });
    listTodos.mockResolvedValue([todayNoDue, todayDue, yesterday, completedToday]);

    const store = useTodosStore();
    await store.load();

    const ids = store.todayEntries.map(t => t.id);
    expect(ids).toEqual(expect.arrayContaining(['today-1', 'today-2']));
    expect(ids).not.toContain('old');
    expect(ids).not.toContain('done');
  });

  it('categoryCounts derives all category sizes from entries', async () => {
    listTodos.mockResolvedValue([
      makeTodo({ id: '1', status: 'todo', createdAt: nowIso() }),
      makeTodo({ id: '2', status: 'doing', dueDate: nowIso() }),
      makeTodo({ id: '3', status: 'paused' }),
      makeTodo({ id: '4', status: 'done', completedAt: nowIso() }),
      makeTodo({ id: '5', status: 'todo', listId: 'work' }),
    ]);

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

  it('byCategory returns the same array as the matching getter', async () => {
    listTodos.mockResolvedValue([
      makeTodo({ id: '1', status: 'doing' }),
      makeTodo({ id: '2', status: 'done', completedAt: nowIso() }),
    ]);
    const store = useTodosStore();
    await store.load();

    expect(store.byCategory('doing').map(t => t.id)).toEqual(['1']);
    expect(store.byCategory('done').map(t => t.id)).toEqual(['2']);
    expect(store.byCategory('all')).toHaveLength(2);
  });

  it('applyRemoteChange handles all four kinds correctly', async () => {
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

  it('exposes stats query and reset actions through the db adapter', async () => {
    const activity = [{ date: '2026-05-20', count: 4 }];
    const trend = [{ date: '2026-05-20', created: 2, started: 1, completed: 1 }];
    getTodoActivityIpc.mockResolvedValue(activity);
    getTodoDailyTrendIpc.mockResolvedValue(trend);
    resetTodoStatsIpc.mockResolvedValue(3);

    const store = useTodosStore();
    await expect(store.getActivity({ start: '2026-05-01', end: '2026-05-31' })).resolves.toEqual(activity);
    await expect(
      store.getDailyTrend({
        start: '2026-05-01',
        end: '2026-05-31',
        statusFilter: 'doing',
      }),
    ).resolves.toEqual(trend);
    await expect(store.resetStats()).resolves.toBe(3);

    expect(getTodoActivityIpc).toHaveBeenCalledWith({ start: '2026-05-01', end: '2026-05-31' });
    expect(getTodoDailyTrendIpc).toHaveBeenCalledWith({
      start: '2026-05-01',
      end: '2026-05-31',
      statusFilter: 'doing',
    });
    expect(resetTodoStatsIpc).toHaveBeenCalledOnce();
  });

  it('reloads all todos when a reset event is received', async () => {
    const afterReset = [makeTodo({ id: 'active', content: '保留的活动任务' })];
    listTodos.mockResolvedValue(afterReset);

    const store = useTodosStore();
    store.applyRemoteChange({ kind: 'reset', id: '', todo: null });
    await Promise.resolve();

    expect(listTodos).toHaveBeenCalledOnce();
    expect(store.entries).toEqual(afterReset);
  });

  it('startEventListeners wires applyRemoteChange to the global event bus', async () => {
    const store = useTodosStore();
    await store.startEventListeners();

    const created = makeTodo({ id: 'evt-1', content: '通过事件' });
    todoChangedListeners.forEach(handler =>
      handler({ kind: 'created', id: 'evt-1', todo: created }),
    );
    expect(store.entries[0].id).toBe('evt-1');

    store.stopEventListeners();
    expect(todoChangedListeners.size).toBe(0);
  });

  it('setSelectedCategory updates visibleEntries', async () => {
    listTodos.mockResolvedValue([
      makeTodo({ id: '1', status: 'doing' }),
      makeTodo({ id: '2', status: 'paused' }),
    ]);
    const store = useTodosStore();
    await store.load();

    store.setSelectedCategory('doing');
    expect(store.visibleEntries.map(t => t.id)).toEqual(['1']);

    store.setSelectedCategory('paused');
    expect(store.visibleEntries.map(t => t.id)).toEqual(['2']);
  });
});
