// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CreateTodoRequest, Todo, UpdateTodoRequest } from '@/types/steno';
import { useTodosStore } from '@/stores/todos';
import TodoQuickPanel from './TodoQuickPanel.vue';

// ---- mocks ----

const listTodos = vi.fn<() => Promise<Todo[]>>();
const getTodayTodos = vi.fn<(includeCompleted?: boolean) => Promise<Todo[]>>();
const createTodoIpc = vi.fn<(input: CreateTodoRequest) => Promise<Todo>>();
const updateTodoIpc = vi.fn<(input: UpdateTodoRequest) => Promise<Todo>>();
const completeTodoIpc = vi.fn<(id: string) => Promise<Todo>>();
const deleteTodoIpc = vi.fn<(id: string) => Promise<void>>();
const hideTodoPanel = vi.fn<() => Promise<void>>();
const setSetting = vi.fn<(key: string, value: string) => Promise<void>>();

vi.mock('@/composables/useDb', () => ({
  useDb: () => ({
    listTodos,
    getTodayTodos,
    createTodo: createTodoIpc,
    updateTodo: updateTodoIpc,
    completeTodo: completeTodoIpc,
    deleteTodo: deleteTodoIpc,
    hideTodoPanel,
    setSetting,
  }),
}));

vi.mock('@/composables/useAppEvents', () => ({
  useAppEvents: () => ({
    listenTodoChanged: vi.fn(async () => () => {}),
    listenTodoPanelToggle: vi.fn(async () => () => {}),
  }),
}));

vi.mock('@tauri-apps/api/core', () => ({
  isTauri: () => false,
}));

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    outerPosition: async () => ({ x: 0, y: 0 }),
  }),
}));

vi.mock('naive-ui', async () => {
  const actual = await vi.importActual<typeof import('naive-ui')>('naive-ui');
  return {
    ...actual,
    useMessage: () => ({
      warning: vi.fn(),
      error: vi.fn(),
      success: vi.fn(),
      info: vi.fn(),
    }),
  };
});

// ---- fixtures ----

function nowIso(): string {
  return new Date().toISOString();
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

describe('TodoQuickPanel', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    listTodos.mockReset().mockResolvedValue([]);
    getTodayTodos.mockReset().mockResolvedValue([]);
    createTodoIpc.mockReset();
    updateTodoIpc.mockReset();
    completeTodoIpc.mockReset();
    deleteTodoIpc.mockReset();
    hideTodoPanel.mockReset().mockResolvedValue();
    setSetting.mockReset().mockResolvedValue();
  });

  it('renders empty state when no todos', async () => {
    const wrapper = mount(TodoQuickPanel);
    await flushPromises();

    expect(wrapper.find('[data-testid="todo-panel-empty"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('太棒了');
    expect(wrapper.text()).toContain('所有任务都已完成');
  });

  it('submits draft and clears input on Enter', async () => {
    const created = makeTodo({ id: 'new', content: '新建任务' });
    createTodoIpc.mockResolvedValue(created);

    const wrapper = mount(TodoQuickPanel);
    await flushPromises();

    const input = wrapper.find<HTMLInputElement>('[data-testid="todo-panel-input"]');
    await input.setValue('新建任务');
    await input.trigger('keydown', { key: 'Enter' });
    await flushPromises();

    expect(createTodoIpc).toHaveBeenCalledWith({ content: '新建任务' });
    expect(input.element.value).toBe('');
  });

  it('does not submit when draft is blank or whitespace', async () => {
    const wrapper = mount(TodoQuickPanel);
    await flushPromises();

    const input = wrapper.find<HTMLInputElement>('[data-testid="todo-panel-input"]');
    await input.setValue('   ');
    await input.trigger('keydown', { key: 'Enter' });
    await flushPromises();

    expect(createTodoIpc).not.toHaveBeenCalled();
  });

  it('lists todays todos and shows pending count in the header', async () => {
    const t1 = makeTodo({ id: '1', content: '任务一' });
    const t2 = makeTodo({ id: '2', content: '任务二' });
    listTodos.mockResolvedValue([t1, t2]);
    getTodayTodos.mockResolvedValue([t1, t2]);

    const wrapper = mount(TodoQuickPanel);
    await flushPromises();

    expect(wrapper.find('[data-testid="todo-panel-list"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('任务一');
    expect(wrapper.text()).toContain('任务二');
    expect(wrapper.text()).toContain('共 2 个任务');
  });

  it('toggles a todo to done via checkbox', async () => {
    const todo = makeTodo({ id: 'a', content: '勾选项' });
    const done = makeTodo({
      id: 'a',
      content: '勾选项',
      status: 'done',
      completedAt: nowIso(),
    });
    listTodos.mockResolvedValue([todo]);
    getTodayTodos.mockResolvedValue([todo]);
    completeTodoIpc.mockResolvedValue(done);

    const wrapper = mount(TodoQuickPanel);
    await flushPromises();

    const checkbox = wrapper.find('[data-testid="todo-toggle-a"]');
    await checkbox.trigger('change');
    await flushPromises();

    expect(completeTodoIpc).toHaveBeenCalledWith('a');
  });

  it('deletes a todo when delete button is clicked', async () => {
    const todo = makeTodo({ id: 'd', content: '要删' });
    listTodos.mockResolvedValue([todo]);
    getTodayTodos.mockResolvedValue([todo]);
    deleteTodoIpc.mockResolvedValue();

    const wrapper = mount(TodoQuickPanel);
    await flushPromises();

    const btn = wrapper.find('[data-testid="todo-delete-d"]');
    await btn.trigger('click');
    await flushPromises();

    expect(deleteTodoIpc).toHaveBeenCalledWith('d');
  });

  it('invokes hideTodoPanel when close button clicked', async () => {
    const wrapper = mount(TodoQuickPanel);
    await flushPromises();

    await wrapper.find('[data-testid="todo-panel-close"]').trigger('click');
    await flushPromises();

    expect(hideTodoPanel).toHaveBeenCalledOnce();
  });

  it('pending count reflects the todos store today getter', async () => {
    const wrapper = mount(TodoQuickPanel);
    await flushPromises();

    // 通过 applyRemoteChange 模拟跨窗口新增
    const store = useTodosStore();
    store.applyRemoteChange({
      kind: 'created',
      id: 'remote',
      todo: makeTodo({ id: 'remote', content: '远程新增' }),
    });
    await flushPromises();

    expect(wrapper.text()).toContain('远程新增');
    expect(wrapper.text()).toContain('共 1 个任务');
  });
});
