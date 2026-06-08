/**
 * @file 剪贴板图片编辑组件 - Clipboard Image Editor
 *
 * 覆盖 Clipboard Image Editor 的主要行为、边界条件和跨模块契约，帮助重构时快速定位预期。
 * 注释重点标明数据入口、状态边界、事件通道和协作风险点，便于逐行阅读时快速判断代码意图。
 */

// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ClipboardEntry } from '@/types/steno';
import ClipboardImageEditor from './ClipboardImageEditor.vue';

// 局部常量 addImageEntry：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const addImageEntry = vi.fn(async () => ({ id: 'new-1' }) as ClipboardEntry);
// 局部常量 copyEditedImageToClipboard：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const copyEditedImageToClipboard = vi.fn(async () => {});

vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(async () => () => {}) }));

vi.mock('@/composables/useDb', () => ({
  useDb: () => ({
    copyEditedImageToClipboard,
    addImageClipboardEntry: vi.fn(),
    listClipboardEntries: vi.fn(async () => [])
  })
}));

vi.mock('@/stores/clipboard', () => ({
  useClipboardStore: () => ({ addImageEntry })
}));

vi.mock('@/utils/canvasRender', async orig => ({
  ...(await orig<typeof import('@/utils/canvasRender')>()),
  renderToDataUrl: vi.fn(() => 'data:image/png;base64,ZWRpdGVk')
}));

// 类 FakeImage：聚合相关状态与行为，保持调用侧只依赖清晰的公开方法。
class FakeImage {
  private onLoad: (() => void) | null = null;
  naturalWidth = 200;
  naturalHeight = 120;
  addEventListener(event: string, callback: () => void) {
    if (event === 'load') this.onLoad = callback;
  }
  set src(_value: string) {
    this.onLoad?.();
  }
}

const entry: ClipboardEntry = {
  id: 'img-1',
  contentType: 'image',
  content: 'data:image/png;base64,iVBORw0KGgo=',
  htmlContent: null,
  preview: '图片内容',
  createdAt: '2026-06-01T10:14:00Z',
  updatedAt: '2026-06-01T10:14:00Z',
  sizeBytes: 40
};

// 函数 mountEditor：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
function mountEditor() {
  return mount(ClipboardImageEditor, {
    props: { entry },
    attachTo: document.body,
    global: { stubs: { teleport: true } }
  });
}

beforeEach(() => {
  vi.stubGlobal('Image', FakeImage);
  // jsdom 不实现 canvas 2D；返回 null 让渲染走降级分支并静默告警
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  addImageEntry.mockClear();
  copyEditedImageToClipboard.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// 测试用例：验证「ClipboardImageEditor」场景，锁定 Clipboard Image Editor 的用户可见行为。
describe('ClipboardImageEditor', () => {
  // 测试用例：验证「renders the editor dialog without a backdrop mask」场景，锁定 Clipboard Image Editor 的用户可见行为。
  it('renders the editor dialog without a backdrop mask', () => {
    // 局部常量 w：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const w = mountEditor();
    expect(w.find('[data-testid="clip-image-editor"]').exists()).toBe(true);
    expect(w.find('[data-testid="clip-editor-backdrop"]').exists()).toBe(false);
    expect(w.find('[data-testid="clip-editor-resize-grip"]').exists()).toBe(true);
    w.unmount();
  });

  // 测试用例：验证「teleports into .app-theme-root so it inherits the --app-* theme variables」场景，锁定 Clipboard Image Editor 的用户可见行为。
  it('teleports into .app-theme-root so it inherits the --app-* theme variables', () => {
    // App.vue 把主题变量（--app-bg/-surface/-border/-muted…）只挂在
    // .app-theme-root 的内联 style 上。编辑器若 teleport 到 <body>（在该子树之外），
    // 这些 var() 全部解析失败 → 背景/边框/图标透明，工具栏按钮整排不可见。
    // 因此编辑器必须落在 .app-theme-root 内部。这里不 stub teleport，验证真实落点。
    const root = document.createElement('div');
    root.className = 'app-theme-root';
    document.body.appendChild(root);

    // 局部常量 w：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const w = mount(ClipboardImageEditor, {
      props: { entry },
      attachTo: document.body
    });

    // 局部常量 editor：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const editor = document.querySelector('[data-testid="clip-image-editor"]');
    expect(editor).not.toBeNull();
    expect(root.contains(editor)).toBe(true);

    w.unmount();
    root.remove();
  });

  // 测试用例：验证「emits close on the close button」场景，锁定 Clipboard Image Editor 的用户可见行为。
  it('emits close on the close button', async () => {
    // 局部常量 w：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const w = mountEditor();
    await w.get('[data-testid="clip-editor-close"]').trigger('click');
    expect(w.emitted('close')).toBeTruthy();
    w.unmount();
  });

  // 测试用例：验证「emits close on Escape」场景，锁定 Clipboard Image Editor 的用户可见行为。
  it('emits close on Escape', async () => {
    // 局部常量 w：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const w = mountEditor();
    await w.get('[data-testid="clip-image-editor"]').trigger('keydown', { key: 'Escape' });
    expect(w.emitted('close')).toBeTruthy();
    w.unmount();
  });

  // 测试用例：验证「adds a rotate op and toggles undo/redo」场景，锁定 Clipboard Image Editor 的用户可见行为。
  it('adds a rotate op and toggles undo/redo', async () => {
    // 局部常量 w：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const w = mountEditor();
    expect(w.get('[data-testid="clip-tool-undo"]').attributes('disabled')).toBeDefined();

    await w.get('[data-testid="clip-tool-rotate-right"]').trigger('click');
    expect(w.get('[data-testid="clip-editor-status"]').text()).toContain('1');
    expect(w.get('[data-testid="clip-tool-undo"]').attributes('disabled')).toBeUndefined();

    await w.get('[data-testid="clip-tool-undo"]').trigger('click');
    expect(w.get('[data-testid="clip-tool-redo"]').attributes('disabled')).toBeUndefined();
    w.unmount();
  });

  // 测试用例：验证「commits an adjust op from the brightness slider」场景，锁定 Clipboard Image Editor 的用户可见行为。
  it('commits an adjust op from the brightness slider', async () => {
    // 局部常量 w：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const w = mountEditor();
    await w.get('[data-testid="clip-tool-adjust"]').trigger('click');
    // 局部常量 slider：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const slider = w.get('[data-testid="clip-adjust-brightness"]');
    await slider.setValue('30');
    await slider.trigger('change');
    expect(w.get('[data-testid="clip-editor-status"]').text()).toContain('1');
    w.unmount();
  });

  // 测试用例：验证「commits a crop op when confirming the selection」场景，锁定 Clipboard Image Editor 的用户可见行为。
  it('commits a crop op when confirming the selection', async () => {
    // 局部常量 w：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const w = mountEditor();
    await w.get('[data-testid="clip-tool-crop"]').trigger('click');
    expect(w.find('[data-testid="clip-crop-box"]').exists()).toBe(true);
    expect(w.findAll('[data-testid^="clip-crop-handle-"]')).toHaveLength(4);
    await w.get('[data-testid="clip-crop-confirm"]').trigger('click');
    expect(w.get('[data-testid="clip-editor-status"]').text()).toContain('1');
    w.unmount();
  });

  // 测试用例：验证「opens the resize popover and commits a resize op with aspect lock」场景，锁定 Clipboard Image Editor 的用户可见行为。
  it('opens the resize popover and commits a resize op with aspect lock', async () => {
    // 局部常量 w：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const w = mountEditor();
    await w.get('[data-testid="clip-tool-resize"]').trigger('click');
    // 局部常量 width：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const width = w.get('[data-testid="clip-resize-width"]');
    await width.setValue('100');
    await width.trigger('input');
    // 锁定纵横比：源 200x120 → 宽 100 应联动高 60
    expect((w.get('[data-testid="clip-resize-height"]').element as HTMLInputElement).value).toBe('60');
    await w.get('[data-testid="clip-resize-confirm"]').trigger('click');
    expect(w.get('[data-testid="clip-editor-status"]').text()).toContain('100×60');
    w.unmount();
  });

  // 测试用例：验证「disables save until an edit makes the editor dirty」场景，锁定 Clipboard Image Editor 的用户可见行为。
  it('disables save until an edit makes the editor dirty', async () => {
    // 局部常量 w：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const w = mountEditor();
    expect(w.get('[data-testid="clip-editor-save"]').attributes('disabled')).toBeDefined();
    await w.get('[data-testid="clip-tool-rotate-right"]').trigger('click');
    expect(w.get('[data-testid="clip-editor-save"]').attributes('disabled')).toBeUndefined();
    w.unmount();
  });

  // 测试用例：验证「saves as a new entry then closes」场景，锁定 Clipboard Image Editor 的用户可见行为。
  it('saves as a new entry then closes', async () => {
    // 局部常量 w：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const w = mountEditor();
    await w.get('[data-testid="clip-tool-rotate-right"]').trigger('click');
    await w.get('[data-testid="clip-editor-save"]').trigger('click');
    await flushPromises();
    expect(addImageEntry).toHaveBeenCalledWith('data:image/png;base64,ZWRpdGVk');
    expect(w.emitted('close')).toBeTruthy();
    w.unmount();
  });

  // 测试用例：验证「keeps the editor open and shows an error when saving fails」场景，锁定 Clipboard Image Editor 的用户可见行为。
  it('keeps the editor open and shows an error when saving fails', async () => {
    addImageEntry.mockRejectedValueOnce(new Error('boom'));
    // 局部常量 w：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const w = mountEditor();
    await w.get('[data-testid="clip-tool-rotate-right"]').trigger('click');
    await w.get('[data-testid="clip-editor-save"]').trigger('click');
    await flushPromises();
    expect(w.get('[data-testid="clip-editor-error"]').text()).toContain('boom');
    expect(w.emitted('close')).toBeFalsy();
    w.unmount();
  });

  // 测试用例：验证「copies the edited result to the system clipboard」场景，锁定 Clipboard Image Editor 的用户可见行为。
  it('copies the edited result to the system clipboard', async () => {
    // 局部常量 w：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const w = mountEditor();
    await w.get('[data-testid="clip-editor-copy"]').trigger('click');
    await flushPromises();
    expect(copyEditedImageToClipboard).toHaveBeenCalledWith('data:image/png;base64,ZWRpdGVk');
    w.unmount();
  });
});
