/**
 * @file 前端视图 - Todo Quick Panel
 *
 * 覆盖 Todo Quick Panel 的主要行为、边界条件和跨模块契约，帮助重构时快速定位预期。
 * 注释重点标明数据入口、状态边界、事件通道和协作风险点，便于逐行阅读时快速判断代码意图。
 */

// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ClipboardEntry, CreateTodoRequest, Todo, UpdateTodoRequest } from '@/types/steno';
import { useTodosStore } from '@/stores/todos';
import TodoQuickPanel from './TodoQuickPanel.vue';
import TodoQuickPanelSource from './TodoQuickPanel.vue?raw';

// ---- mocks ----

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
// 局部常量 hideTodoPanel：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const hideTodoPanel = vi.fn<() => Promise<void>>();
// 局部常量 setSetting：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const setSetting = vi.fn<(key: string, value: string) => Promise<void>>();
// 局部常量 listClipboardEntries：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const listClipboardEntries = vi.fn<() => Promise<ClipboardEntry[]>>();
// 局部常量 pasteClipboardEntry：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const pasteClipboardEntry = vi.fn<(id: string) => Promise<void>>();
// 局部常量 setAlwaysOnTop：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const setAlwaysOnTop = vi.fn<(alwaysOnTop: boolean) => Promise<void>>();
let focusChangedHandler: ((event: { payload: boolean }) => void) | null = null;

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
    listClipboardEntries,
    pasteClipboardEntry
  })
}));

vi.mock('@/composables/useAppEvents', () => ({
  useAppEvents: () => ({
    listenTodoChanged: vi.fn(async () => () => {}),
    listenTodoPanelToggle: vi.fn(async () => () => {})
  })
}));

vi.mock('@tauri-apps/api/core', () => ({
  isTauri: () => false
}));

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    outerPosition: async () => ({ x: 0, y: 0 }),
    setAlwaysOnTop,
    onFocusChanged: async (handler: (event: { payload: boolean }) => void) => {
      focusChangedHandler = handler;
      return () => {
        focusChangedHandler = null;
      };
    }
  })
}));

vi.mock('naive-ui', async () => {
  // 局部常量 actual：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const actual = await vi.importActual<typeof import('naive-ui')>('naive-ui');
  return {
    ...actual,
    useMessage: () => ({
      warning: vi.fn(),
      error: vi.fn(),
      success: vi.fn(),
      info: vi.fn()
    })
  };
});

// ---- fixtures ----

function nowIso(): string {
  return new Date().toISOString();
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

// 函数 makeClipboardEntry：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
function makeClipboardEntry(overrides: Partial<ClipboardEntry> = {}): ClipboardEntry {
  return {
    id: 'clip-1',
    contentType: 'text',
    content: '剪贴板内容',
    htmlContent: null,
    preview: '剪贴板内容',
    createdAt: nowIso(),
    updatedAt: nowIso(),
    sizeBytes: 15,
    pinnedAt: null,
    ...overrides
  };
}

// 测试用例：验证「TodoQuickPanel」场景，锁定 Todo Quick Panel 的用户可见行为。
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
    listClipboardEntries.mockReset().mockResolvedValue([]);
    pasteClipboardEntry.mockReset().mockResolvedValue();
    setAlwaysOnTop.mockReset().mockResolvedValue();
    focusChangedHandler = null;
  });

  // 测试用例：验证「renders empty state when no todos」场景，锁定 Todo Quick Panel 的用户可见行为。
  it('renders empty state when no todos', async () => {
    // 局部常量 wrapper：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const wrapper = mount(TodoQuickPanel);
    await flushPromises();

    expect(wrapper.find('[data-testid="todo-panel-empty"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('太棒了');
    expect(wrapper.text()).toContain('所有任务都已完成');
  });

  // 测试用例：验证「submits draft and clears input on Enter」场景，锁定 Todo Quick Panel 的用户可见行为。
  it('submits draft and clears input on Enter', async () => {
    // 局部常量 created：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const created = makeTodo({ id: 'new', content: '新建任务' });
    createTodoIpc.mockResolvedValue(created);

    // 局部常量 wrapper：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const wrapper = mount(TodoQuickPanel);
    await flushPromises();

    // 局部常量 input：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const input = wrapper.find<HTMLInputElement>('[data-testid="todo-panel-input"]');
    await input.setValue('新建任务');
    await input.trigger('keydown', { key: 'Enter' });
    await flushPromises();

    expect(createTodoIpc).toHaveBeenCalledWith({ content: '新建任务' });
    expect(input.element.value).toBe('');
  });

  // 测试用例：验证「does not submit when draft is blank or whitespace」场景，锁定 Todo Quick Panel 的用户可见行为。
  it('does not submit when draft is blank or whitespace', async () => {
    // 局部常量 wrapper：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const wrapper = mount(TodoQuickPanel);
    await flushPromises();

    // 局部常量 input：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const input = wrapper.find<HTMLInputElement>('[data-testid="todo-panel-input"]');
    await input.setValue('   ');
    await input.trigger('keydown', { key: 'Enter' });
    await flushPromises();

    expect(createTodoIpc).not.toHaveBeenCalled();
  });

  // 测试用例：验证「lists todays todos and shows pending count in the header」场景，锁定 Todo Quick Panel 的用户可见行为。
  it('lists todays todos and shows pending count in the header', async () => {
    // 局部常量 t1：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const t1 = makeTodo({ id: '1', content: '任务一' });
    // 局部常量 t2：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const t2 = makeTodo({ id: '2', content: '任务二' });
    listTodos.mockResolvedValue([t1, t2]);
    getTodayTodos.mockResolvedValue([t1, t2]);

    // 局部常量 wrapper：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const wrapper = mount(TodoQuickPanel);
    await flushPromises();

    expect(wrapper.find('[data-testid="todo-panel-list"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('任务一');
    expect(wrapper.text()).toContain('任务二');
    expect(wrapper.text()).toContain('共 2 个任务');
  });

  // 测试用例：验证「toggles a todo to done via checkbox」场景，锁定 Todo Quick Panel 的用户可见行为。
  it('toggles a todo to done via checkbox', async () => {
    // 局部常量 todo：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const todo = makeTodo({ id: 'a', content: '勾选项' });
    // 局部常量 done：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const done = makeTodo({
      id: 'a',
      content: '勾选项',
      status: 'done',
      completedAt: nowIso()
    });
    listTodos.mockResolvedValue([todo]);
    getTodayTodos.mockResolvedValue([todo]);
    completeTodoIpc.mockResolvedValue(done);

    // 局部常量 wrapper：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const wrapper = mount(TodoQuickPanel);
    await flushPromises();

    // 局部常量 checkbox：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const checkbox = wrapper.find('[data-testid="todo-toggle-a"]');
    await checkbox.trigger('change');
    await flushPromises();

    expect(completeTodoIpc).toHaveBeenCalledWith('a');
  });

  // 测试用例：验证「deletes a todo when delete button is clicked」场景，锁定 Todo Quick Panel 的用户可见行为。
  it('deletes a todo when delete button is clicked', async () => {
    // 局部常量 todo：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const todo = makeTodo({ id: 'd', content: '要删' });
    listTodos.mockResolvedValue([todo]);
    getTodayTodos.mockResolvedValue([todo]);
    deleteTodoIpc.mockResolvedValue();

    // 局部常量 wrapper：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const wrapper = mount(TodoQuickPanel);
    await flushPromises();

    // 局部常量 btn：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const btn = wrapper.find('[data-testid="todo-delete-d"]');
    await btn.trigger('click');
    await flushPromises();

    expect(deleteTodoIpc).toHaveBeenCalledWith('d');
  });

  // 测试用例：验证「invokes hideTodoPanel when close button clicked」场景，锁定 Todo Quick Panel 的用户可见行为。
  it('invokes hideTodoPanel when close button clicked', async () => {
    // 局部常量 wrapper：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const wrapper = mount(TodoQuickPanel);
    await flushPromises();

    await wrapper.find('[data-testid="todo-panel-close"]').trigger('click');
    await flushPromises();

    expect(hideTodoPanel).toHaveBeenCalledOnce();
  });

  // 测试用例：验证「pending count reflects the todos store today getter」场景，锁定 Todo Quick Panel 的用户可见行为。
  it('pending count reflects the todos store today getter', async () => {
    // 局部常量 wrapper：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const wrapper = mount(TodoQuickPanel);
    await flushPromises();

    // 通过 applyRemoteChange 模拟跨窗口新增
    const store = useTodosStore();
    store.applyRemoteChange({
      kind: 'created',
      id: 'remote',
      todo: makeTodo({ id: 'remote', content: '远程新增' })
    });
    await flushPromises();

    expect(wrapper.text()).toContain('远程新增');
    expect(wrapper.text()).toContain('共 1 个任务');
  });

  // 测试用例：验证「switches to clipboard tab and pastes an entry from the content area」场景，锁定 Todo Quick Panel 的用户可见行为。
  it('switches to clipboard tab and pastes an entry from the content area', async () => {
    listClipboardEntries.mockResolvedValueOnce([makeClipboardEntry({ id: 'clip-a', content: '从浮窗粘贴' })]);

    // 局部常量 wrapper：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const wrapper = mount(TodoQuickPanel);
    await flushPromises();

    await wrapper.get('[data-testid="todo-panel-tab-clipboard"]').trigger('click');

    expect(wrapper.get('[data-testid="todo-panel-clipboard-list"]').text()).toContain('从浮窗粘贴');

    await wrapper.get('[data-testid="todo-panel-clipboard-content-clip-a"]').trigger('dblclick');
    await flushPromises();

    expect(pasteClipboardEntry).toHaveBeenCalledWith('clip-a');
  });

  // 测试用例：验证「toggles pinned state and only auto closes on blur while unpinned」场景，锁定 Todo Quick Panel 的用户可见行为。
  it('toggles pinned state and only auto closes on blur while unpinned', async () => {
    // 局部常量 wrapper：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const wrapper = mount(TodoQuickPanel);
    await flushPromises();

    expect(setAlwaysOnTop).toHaveBeenCalledWith(false);

    await wrapper.get('[data-testid="todo-panel-pin"]').trigger('click');
    await flushPromises();

    expect(setAlwaysOnTop).toHaveBeenLastCalledWith(true);
    focusChangedHandler?.({ payload: false });
    await flushPromises();
    expect(hideTodoPanel).not.toHaveBeenCalled();

    await wrapper.get('[data-testid="todo-panel-pin"]').trigger('click');
    await flushPromises();

    expect(setAlwaysOnTop).toHaveBeenLastCalledWith(false);
    focusChangedHandler?.({ payload: false });
    await flushPromises();
    expect(hideTodoPanel).toHaveBeenCalledOnce();
  });

  // 测试用例：验证「clips the transparent todo panel window to a smooth rounded rectangle」场景，锁定 Todo Quick Panel 的用户可见行为。
  it('clips the transparent todo panel window to a smooth rounded rectangle', () => {
    expect(TodoQuickPanelSource).toContain('clip-path: inset(0 round 18px);');
    expect(TodoQuickPanelSource).toContain('background-clip: padding-box;');
  });
});
