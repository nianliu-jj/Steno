// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils';
import { NDatePicker, NDropdown } from 'naive-ui';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CreateTodoRequest, Todo, UpdateTodoRequest } from '@/types/steno';
import { useTodosStore } from '@/stores/todos';
import TodoView from './TodoView.vue';

// ---- mocks ----

const listTodos = vi.fn<() => Promise<Todo[]>>();
const getTodayTodos = vi.fn<(includeCompleted?: boolean) => Promise<Todo[]>>();
const createTodoIpc = vi.fn<(input: CreateTodoRequest) => Promise<Todo>>();
const updateTodoIpc = vi.fn<(input: UpdateTodoRequest) => Promise<Todo>>();
const completeTodoIpc = vi.fn<(id: string) => Promise<Todo>>();
const deleteTodoIpc = vi.fn<(id: string) => Promise<void>>();

vi.mock('@/composables/useDb', () => ({
  useDb: () => ({
    listTodos,
    getTodayTodos,
    createTodo: createTodoIpc,
    updateTodo: updateTodoIpc,
    completeTodo: completeTodoIpc,
    deleteTodo: deleteTodoIpc,
  }),
}));

vi.mock('@/composables/useAppEvents', () => ({
  useAppEvents: () => ({
    listenTodoChanged: vi.fn(async () => () => {}),
    listenTodoPanelToggle: vi.fn(async () => () => {}),
  }),
}));

vi.mock('@/stores/settings', () => ({
  useSettingsStore: () => ({
    state: {
      reminderQuickOptions: [
        {
          id: 'after-30-minutes',
          label: '30 分钟后',
          type: 'relative',
          value: 30,
          unit: 'minute',
        },
      ],
    },
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

describe('TodoView', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    listTodos.mockReset().mockResolvedValue([]);
    getTodayTodos.mockReset().mockResolvedValue([]);
    createTodoIpc.mockReset();
    updateTodoIpc.mockReset();
    completeTodoIpc.mockReset();
    deleteTodoIpc.mockReset();
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
    vi.useRealTimers();
  });

  it('renders sidebar with seven categories and counts', async () => {
    const t = makeTodo({ id: 'a', content: '示例', listId: 'default' });
    listTodos.mockResolvedValue([t]);

    const wrapper = mount(TodoView);
    await flushPromises();

    expect(wrapper.find('[data-testid="category-today"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="category-planned"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="category-doing"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="category-paused"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="category-done"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="category-inbox"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="category-all"]').exists()).toBe(true);

    expect(wrapper.find('[data-testid="count-all"]').text()).toBe('1');
    expect(wrapper.find('[data-testid="count-inbox"]').text()).toBe('1');
  });

  it('switches category and persists selection to localStorage', async () => {
    const wrapper = mount(TodoView);
    await flushPromises();

    await wrapper.find('[data-testid="category-done"]').trigger('click');
    await flushPromises();

    const store = useTodosStore();
    expect(store.selectedCategory).toBe('done');
    expect(localStorage.getItem('steno.todo.selectedCategory')).toBe('done');
  });

  it('restores selected category from localStorage on mount', async () => {
    localStorage.setItem('steno.todo.selectedCategory', 'doing');

    const wrapper = mount(TodoView);
    await flushPromises();

    const store = useTodosStore();
    expect(store.selectedCategory).toBe('doing');
    expect(wrapper.find('[data-testid="category-doing"]').classes()).toContain('active');
  });

  it('submits a new todo from the toolbar input', async () => {
    const created = makeTodo({ id: 'new', content: '新任务' });
    createTodoIpc.mockResolvedValue(created);

    const wrapper = mount(TodoView);
    await flushPromises();

    const input = wrapper.find<HTMLInputElement>('[data-testid="todo-view-input"]');
    await input.setValue('新任务');
    await input.trigger('keydown', { key: 'Enter' });
    await flushPromises();

    expect(createTodoIpc).toHaveBeenCalledWith({ content: '新任务' });
    expect(input.element.value).toBe('');
  });

  it('completes a todo via the row checkbox', async () => {
    const todo = makeTodo({ id: 'r1', content: '勾选项' });
    const done = makeTodo({ id: 'r1', status: 'done', completedAt: nowIso() });
    listTodos.mockResolvedValue([todo]);
    completeTodoIpc.mockResolvedValue(done);

    const wrapper = mount(TodoView);
    await flushPromises();

    // 切到"全部"以确保 todo 一定可见（默认 'today' 可能不命中）。
    await wrapper.find('[data-testid="category-all"]').trigger('click');
    await flushPromises();

    await wrapper.find('[data-testid="todo-row-toggle-r1"]').trigger('change');
    await flushPromises();

    expect(completeTodoIpc).toHaveBeenCalledWith('r1');
  });

  it('inline edits content on dblclick + Enter and persists via updateTodo', async () => {
    const todo = makeTodo({ id: 'e1', content: '旧内容' });
    listTodos.mockResolvedValue([todo]);
    updateTodoIpc.mockResolvedValue(makeTodo({ id: 'e1', content: '新内容' }));

    const wrapper = mount(TodoView);
    await flushPromises();

    await wrapper.find('[data-testid="category-all"]').trigger('click');
    await flushPromises();

    const textSpan = wrapper.find('[data-testid="todo-row-text-e1"] .todo-row-content');
    await textSpan.trigger('dblclick');
    await flushPromises();

    const editInput = wrapper.find<HTMLInputElement>(
      '[data-testid="todo-row-edit-e1"]',
    );
    expect(editInput.exists()).toBe(true);
    await editInput.setValue('新内容');
    await editInput.trigger('keydown', { key: 'Enter' });
    await flushPromises();

    expect(updateTodoIpc).toHaveBeenCalledWith({ id: 'e1', content: '新内容' });
  });

  it('cancels inline edit on Escape without invoking updateTodo', async () => {
    const todo = makeTodo({ id: 'esc', content: '保持' });
    listTodos.mockResolvedValue([todo]);

    const wrapper = mount(TodoView);
    await flushPromises();

    await wrapper.find('[data-testid="category-all"]').trigger('click');
    await flushPromises();

    await wrapper
      .find('[data-testid="todo-row-text-esc"] .todo-row-content')
      .trigger('dblclick');
    await flushPromises();

    const editInput = wrapper.find<HTMLInputElement>(
      '[data-testid="todo-row-edit-esc"]',
    );
    await editInput.setValue('改了一下');
    await editInput.trigger('keydown', { key: 'Escape' });
    await flushPromises();

    expect(updateTodoIpc).not.toHaveBeenCalled();
    // 编辑态退出
    expect(
      wrapper.find('[data-testid="todo-row-edit-esc"]').exists(),
    ).toBe(false);
  });

  it('filters list by search keyword (case-insensitive)', async () => {
    const a = makeTodo({ id: 's1', content: '写报告' });
    const b = makeTodo({ id: 's2', content: '修复 BUG' });
    listTodos.mockResolvedValue([a, b]);

    const wrapper = mount(TodoView);
    await flushPromises();

    await wrapper.find('[data-testid="category-all"]').trigger('click');
    await flushPromises();

    const search = wrapper.find<HTMLInputElement>('[data-testid="todo-view-search"]');
    await search.setValue('bug');
    await flushPromises();

    expect(wrapper.find('[data-testid="todo-row-s1"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="todo-row-s2"]').exists()).toBe(true);
  });

  it('deletes a todo when delete button clicked', async () => {
    const todo = makeTodo({ id: 'd1' });
    listTodos.mockResolvedValue([todo]);
    deleteTodoIpc.mockResolvedValue();

    const wrapper = mount(TodoView);
    await flushPromises();

    await wrapper.find('[data-testid="category-all"]').trigger('click');
    await flushPromises();

    await wrapper.find('[data-testid="todo-row-delete-d1"]').trigger('click');
    await flushPromises();

    expect(deleteTodoIpc).toHaveBeenCalledWith('d1');
  });

  it('sets and clears a reminder from the row reminder dropdown', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-26T08:30:00.000Z'));
    const todo = makeTodo({ id: 'rem1' });
    listTodos.mockResolvedValue([todo]);
    updateTodoIpc.mockImplementation(async input =>
      makeTodo({
        id: input.id,
        reminderTime: input.reminderTime ?? null,
      }),
    );

    const wrapper = mount(TodoView);
    await flushPromises();
    await wrapper.find('[data-testid="category-all"]').trigger('click');
    await flushPromises();

    expect(wrapper.find('[data-testid="todo-row-reminder-rem1"]').exists()).toBe(true);

    const reminderDropdown = wrapper.findAllComponents(NDropdown)[1];
    reminderDropdown.vm.$emit('select', 'quick:after-30-minutes');
    await flushPromises();

    const firstCall = updateTodoIpc.mock.calls.at(-1)?.[0];
    expect(firstCall?.id).toBe('rem1');
    expect(new Date(firstCall?.reminderTime ?? '').getTime()).toBe(
      new Date('2026-05-26T09:00:00.000Z').getTime(),
    );

    reminderDropdown.vm.$emit('select', 'none');
    await flushPromises();

    expect(updateTodoIpc).toHaveBeenLastCalledWith({
      id: 'rem1',
      reminderTime: null,
    });
  });

  it('opens a custom datetime picker for reminders', async () => {
    const todo = makeTodo({ id: 'custom1' });
    listTodos.mockResolvedValue([todo]);
    updateTodoIpc.mockImplementation(async input =>
      makeTodo({ id: input.id, reminderTime: input.reminderTime ?? null }),
    );

    const wrapper = mount(TodoView);
    await flushPromises();
    await wrapper.find('[data-testid="category-all"]').trigger('click');
    await flushPromises();

    wrapper.findAllComponents(NDropdown)[1].vm.$emit('select', 'custom');
    await flushPromises();

    const picker = wrapper.findAllComponents(NDatePicker)[1];
    picker.vm.$emit('update:value', Date.parse('2026-05-30T14:00:00.000Z'));
    await flushPromises();

    expect(updateTodoIpc).toHaveBeenCalledWith({
      id: 'custom1',
      reminderTime: '2026-05-30T14:00:00.000Z',
    });
  });

  it('shows empty state when no todos match', async () => {
    listTodos.mockResolvedValue([]);

    const wrapper = mount(TodoView);
    await flushPromises();

    expect(wrapper.find('[data-testid="todo-view-empty"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('暂无任务');
  });

  it('renders count for all categories from store.categoryCounts', async () => {
    // 一条 todo（today + inbox + all）
    const t1 = makeTodo({ id: 'm1', content: '任务一' });
    // 一条 done 任务（done + all，因 listId='default' 仍计 inbox 中 only if status!=done）
    const t2 = makeTodo({
      id: 'm2',
      content: '任务二',
      status: 'done',
      completedAt: nowIso(),
    });
    listTodos.mockResolvedValue([t1, t2]);

    const wrapper = mount(TodoView);
    await flushPromises();

    expect(wrapper.find('[data-testid="count-all"]').text()).toBe('2');
    expect(wrapper.find('[data-testid="count-done"]').text()).toBe('1');
    expect(wrapper.find('[data-testid="count-inbox"]').text()).toBe('1');
  });
});
