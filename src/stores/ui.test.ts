/**
 * @file Pinia 状态管理 - ui
 *
 * 覆盖 ui 的主要行为、边界条件和跨模块契约，帮助重构时快速定位预期。
 * 注释重点标明数据入口、状态边界、事件通道和协作风险点，便于逐行阅读时快速判断代码意图。
 */

// @vitest-environment jsdom

import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useUiStore } from './ui';

// 类型 Listener：记录模块边界的数据形状，帮助调用方理解字段来源和约束。
type Listener<T> = (event: { payload: T }) => void;

// 局部常量 listeners：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const listeners = new Map<string, Listener<unknown>>();
let currentLabel = 'main';

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({ label: currentLabel })
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn((event: string, handler: Listener<unknown>) => {
    listeners.set(event, handler);
    return Promise.resolve(() => listeners.delete(event));
  })
}));

// 函数 emit：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
function emit<T>(event: string, payload: T) {
  // 局部常量 handler：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const handler = listeners.get(event) as Listener<T> | undefined;
  if (!handler) throw new Error(`Missing listener: ${event}`);
  handler({ payload });
}

// 测试用例：验证「ui store」场景，锁定 ui 的用户可见行为。
describe('ui store', () => {
  beforeEach(() => {
    listeners.clear();
    currentLabel = 'main';
    window.location.hash = '';
    setActivePinia(createPinia());
  });

  // 测试用例：验证「switches the main window view when navigation event is received」场景，锁定 ui 的用户可见行为。
  it('switches the main window view when navigation event is received', async () => {
    // 局部常量 ui：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const ui = useUiStore();
    await Promise.resolve();

    emit('steno:navigate', { mode: 'canvas' });

    expect(ui.mode).toBe('canvas');
    expect(ui.noteId).toBeNull();
  });

  // 测试用例：验证「keeps the target note when navigating to Zen from the main window」场景，锁定 ui 的用户可见行为。
  it('keeps the target note when navigating to Zen from the main window', async () => {
    // 局部常量 ui：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const ui = useUiStore();
    await Promise.resolve();

    emit('steno:navigate', { mode: 'zen', noteId: 'note-1' });

    expect(ui.mode).toBe('zen');
    expect(ui.noteId).toBe('note-1');
  });

  // 测试用例：验证「ignores main-window navigation events in the quicknote window」场景，锁定 ui 的用户可见行为。
  it('ignores main-window navigation events in the quicknote window', async () => {
    currentLabel = 'quicknote';

    // 局部常量 ui：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const ui = useUiStore();
    await Promise.resolve();

    expect(listeners.has('steno:navigate')).toBe(false);
    expect(ui.mode).toBe('floating');
    expect(ui.noteId).toBeNull();
  });

  // 测试用例：验证「resolves print mode and note id from a print-{id} window label」场景，锁定 ui 的用户可见行为。
  it('resolves print mode and note id from a print-{id} window label', () => {
    currentLabel = 'print-note-42';

    // 局部常量 ui：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const ui = useUiStore();

    expect(ui.mode).toBe('print');
    expect(ui.noteId).toBe('note-42');
  });

  // 测试用例：验证「uses the hash route when the main window is created directly for a page」场景，锁定 ui 的用户可见行为。
  it('uses the hash route when the main window is created directly for a page', () => {
    window.location.hash = '#canvas';

    // 局部常量 ui：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const ui = useUiStore();

    expect(ui.mode).toBe('canvas');
    expect(ui.noteId).toBeNull();
  });

  // 测试用例：验证「returns to the main view and clears the current note」场景，锁定 ui 的用户可见行为。
  it('returns to the main view and clears the current note', () => {
    // 局部常量 ui：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const ui = useUiStore();

    ui.navigateTo('zen', 'note-1');
    ui.navigateToMain();

    expect(ui.mode).toBe('main');
    expect(ui.noteId).toBeNull();
  });

  // 测试用例：验证「opens the note editor in the main window and keeps the note id」场景，锁定 ui 的用户可见行为。
  it('opens the note editor in the main window and keeps the note id', () => {
    // 局部常量 ui：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const ui = useUiStore();

    ui.navigateTo('note-editor', 'note-1');

    expect(ui.mode).toBe('note-editor');
    expect(ui.noteId).toBe('note-1');
  });

  // 测试用例：验证「opens a blank note editor from the main window」场景，锁定 ui 的用户可见行为。
  it('opens a blank note editor from the main window', () => {
    // 局部常量 ui：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const ui = useUiStore();

    ui.navigateTo('note-editor');

    expect(ui.mode).toBe('note-editor');
    expect(ui.noteId).toBeNull();
  });

  // 测试用例：验证「returns to the same note editor after opening Zen from the editor page」场景，锁定 ui 的用户可见行为。
  it('returns to the same note editor after opening Zen from the editor page', () => {
    // 局部常量 ui：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const ui = useUiStore();

    ui.navigateTo('note-editor', 'note-1');
    ui.navigateToZenFromEditor('note-1');
    ui.exitZen();

    expect(ui.mode).toBe('note-editor');
    expect(ui.noteId).toBe('note-1');
  });

  // 测试用例：验证「navigates to placeholder pages in the main window」场景，锁定 ui 的用户可见行为。
  it('navigates to placeholder pages in the main window', () => {
    // 局部常量 ui：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const ui = useUiStore();

    ui.navigateTo('clipboard');

    expect(ui.mode).toBe('clipboard');
    expect(ui.noteId).toBeNull();
  });

  // 测试用例：验证「navigates to the stats page in the main window」场景，锁定 ui 的用户可见行为。
  it('navigates to the stats page in the main window', async () => {
    // 局部常量 ui：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const ui = useUiStore();
    await Promise.resolve();

    emit('steno:navigate', { mode: 'stats' });

    expect(ui.mode).toBe('stats');
    expect(ui.noteId).toBeNull();
  });

  // 测试用例：验证「returns to the canvas view after opening Zen from the canvas」场景，锁定 ui 的用户可见行为。
  it('returns to the canvas view after opening Zen from the canvas', () => {
    // 局部常量 ui：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const ui = useUiStore();

    ui.navigateTo('canvas');
    ui.navigateToZenFromCanvas('note-1');
    ui.exitZen();

    expect(ui.mode).toBe('canvas');
    expect(ui.noteId).toBeNull();
  });

  // 测试用例：验证「returns to note-editor after opening Zen from the editor page and keeps the note id」场景，锁定 ui 的用户可见行为。
  it('returns to note-editor after opening Zen from the editor page and keeps the note id', () => {
    // 局部常量 ui：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const ui = useUiStore();

    ui.navigateTo('note-editor', 'note-1');
    ui.navigateTo('zen', 'note-1', { mode: 'note-editor', noteId: 'note-1' });
    ui.exitZen();

    expect(ui.mode).toBe('note-editor');
    expect(ui.noteId).toBe('note-1');
  });

  // 测试用例：验证「opens settings as a modal state without replacing the current workbench route」场景，锁定 ui 的用户可见行为。
  it('opens settings as a modal state without replacing the current workbench route', () => {
    // 局部常量 ui：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const ui = useUiStore();

    ui.navigateTo('note-editor', 'note-1');
    ui.navigateTo('settings');

    expect(ui.mode).toBe('note-editor');
    expect(ui.noteId).toBe('note-1');
    expect(ui.settingsOpen).toBe(true);

    ui.closeSettings();

    expect(ui.mode).toBe('note-editor');
    expect(ui.noteId).toBe('note-1');
    expect(ui.settingsOpen).toBe(false);
  });
});
