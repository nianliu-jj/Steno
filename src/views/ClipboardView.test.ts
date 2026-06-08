/**
 * @file 前端视图 - Clipboard View
 *
 * 覆盖 Clipboard View 的主要行为、边界条件和跨模块契约，帮助重构时快速定位预期。
 * 注释重点标明数据入口、状态边界、事件通道和协作风险点，便于逐行阅读时快速判断代码意图。
 */

// @vitest-environment jsdom

import { nextTick } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useClipboardStore } from '@/stores/clipboard';
import type { ClipboardEntry } from '@/types/steno';
import ClipboardView from './ClipboardView.vue';

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async () => () => {})
}));

// 局部常量 listClipboardEntries：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const listClipboardEntries = vi.fn<() => Promise<ClipboardEntry[]>>(async () => []);
// 局部常量 deleteClipboardEntry：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const deleteClipboardEntry = vi.fn(async () => {});
// 局部常量 clearClipboardEntries：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const clearClipboardEntries = vi.fn(async () => {});
// 局部常量 copyClipboardEntry：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const copyClipboardEntry = vi.fn(async () => {});
// 局部常量 pasteClipboardEntry：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const pasteClipboardEntry = vi.fn(async () => {});
// 局部常量 openUrl：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const openUrl = vi.fn(async () => {});
// 局部常量 hideCurrent：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const hideCurrent = vi.fn(async () => {});
// 局部常量 minimizeCurrent：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const minimizeCurrent = vi.fn(async () => {});
// 局部常量 pinClipboardEntry：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const pinClipboardEntry = vi.fn(async (id: string) => ({
  id,
  contentType: 'text' as const,
  content: 'hello',
  htmlContent: null,
  preview: 'hello',
  createdAt: '2026-05-25T00:00:00Z',
  updatedAt: '2026-05-25T00:00:00Z',
  sizeBytes: 5,
  pinnedAt: '2026-05-25T00:00:02Z'
}));
// 局部常量 unpinClipboardEntry：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const unpinClipboardEntry = vi.fn(async (id: string) => ({
  id,
  contentType: 'text' as const,
  content: 'hello',
  htmlContent: null,
  preview: 'hello',
  createdAt: '2026-05-25T00:00:00Z',
  updatedAt: '2026-05-25T00:00:00Z',
  sizeBytes: 5,
  pinnedAt: null
}));
// 局部常量 messageSuccess：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const messageSuccess = vi.fn();
// 局部常量 messageError：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const messageError = vi.fn();

vi.mock('@/composables/useDb', () => ({
  useDb: () => ({
    listClipboardEntries,
    deleteClipboardEntry,
    clearClipboardEntries,
    copyClipboardEntry,
    pasteClipboardEntry,
    pinClipboardEntry,
    unpinClipboardEntry,
    addImageClipboardEntry: vi.fn(async () => ({})),
    copyEditedImageToClipboard: vi.fn(async () => {})
  })
}));

vi.mock('naive-ui', async importOriginal => {
  // 局部常量 actual：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    useMessage: () => ({
      success: messageSuccess,
      error: messageError,
      warning: vi.fn(),
      info: vi.fn(),
      loading: vi.fn()
    })
  };
});

vi.mock('@/composables/useWindow', () => ({
  useWindow: () => ({
    openQuicknote: vi.fn(async () => {}),
    openUrl,
    openPathInFileManager: vi.fn(async () => {}),
    hideCurrent,
    minimizeCurrent
  })
}));

// 测试用例：验证「ClipboardView」场景，锁定 Clipboard View 的用户可见行为。
describe('ClipboardView', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    // ClipboardView 在真实应用里始终渲染于 .app-theme-root 内（主题变量作用域，
    // 也是 ClipboardImageEditor 的 teleport 目标）。单测补一个同名容器复刻该前提。
    if (!document.querySelector('.app-theme-root')) {
      // 局部常量 root：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
      const root = document.createElement('div');
      root.className = 'app-theme-root';
      document.body.appendChild(root);
    }
    listClipboardEntries.mockResolvedValue([]);
    copyClipboardEntry.mockClear();
    pasteClipboardEntry.mockClear();
    pinClipboardEntry.mockClear();
    unpinClipboardEntry.mockClear();
    deleteClipboardEntry.mockClear();
    openUrl.mockClear();
    hideCurrent.mockClear();
    minimizeCurrent.mockClear();
    messageSuccess.mockClear();
    messageError.mockClear();
  });

  afterEach(() => {
    document.querySelector('.app-theme-root')?.remove();
  });

  // 测试用例：验证「renders an empty state when there is no clipboard history」场景，锁定 Clipboard View 的用户可见行为。
  it('renders an empty state when there is no clipboard history', async () => {
    // 局部常量 wrapper：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const wrapper = mount(ClipboardView);
    await vi.dynamicImportSettled();

    expect(wrapper.text()).toContain('暂无剪贴板记录');
    expect(wrapper.find('[data-testid="clipboard-search"]').exists()).toBe(true);
  });

  // 测试用例：验证「renders entries and delegates copy action」场景，锁定 Clipboard View 的用户可见行为。
  it('renders entries and delegates copy action', async () => {
    listClipboardEntries.mockResolvedValueOnce([
      {
        id: '1',
        contentType: 'url',
        content: 'https://example.com',
        htmlContent: null,
        preview: 'https://example.com',
        createdAt: '2026-05-25T00:00:00Z',
        updatedAt: '2026-05-25T00:00:00Z',
        sizeBytes: 19
      }
    ]);

    // 局部常量 wrapper：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const wrapper = mount(ClipboardView);
    await vi.dynamicImportSettled();

    expect(wrapper.find('[data-testid="clipboard-card-1"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="clipboard-card-header-1"]').text()).toContain('链接');
    expect(wrapper.get('[data-testid="clipboard-card-footer-1"]').text()).toContain('05/25');
    expect(wrapper.text()).toContain('链接');
    expect(wrapper.text()).toContain('https://example.com');
    expect(wrapper.get('[data-testid="clipboard-copy-1"]').attributes('aria-label')).toBe('复制');
    expect(wrapper.get('[data-testid="clipboard-delete-1"]').attributes('aria-label')).toBe('删除');
    expect(wrapper.find('[data-testid="clipboard-card-footer-actions-1"]').exists()).toBe(true);
    await wrapper.get('[data-testid="clipboard-copy-1"]').trigger('click');
    expect(copyClipboardEntry).toHaveBeenCalledWith('1');
  });

  // 测试用例：验证「requires confirmation before deleting an entry」场景，锁定 Clipboard View 的用户可见行为。
  it('requires confirmation before deleting an entry', async () => {
    listClipboardEntries.mockResolvedValueOnce([
      {
        id: '1',
        contentType: 'text',
        content: 'hello',
        htmlContent: null,
        preview: 'hello',
        createdAt: '2026-05-25T00:00:00Z',
        updatedAt: '2026-05-25T00:00:00Z',
        sizeBytes: 5
      }
    ]);

    // 局部常量 wrapper：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const wrapper = mount(ClipboardView);
    await vi.dynamicImportSettled();

    await wrapper.get('[data-testid="clipboard-delete-1"]').trigger('click');
    expect(deleteClipboardEntry).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('确认删除');

    await wrapper.get('[data-testid="clipboard-delete-confirm-1"]').trigger('click');
    expect(deleteClipboardEntry).toHaveBeenCalledWith('1');
  });

  // 测试用例：验证「filters visible entries by type button」场景，锁定 Clipboard View 的用户可见行为。
  it('filters visible entries by type button', async () => {
    listClipboardEntries.mockResolvedValueOnce([
      {
        id: '1',
        contentType: 'text',
        content: 'hello',
        htmlContent: null,
        preview: 'hello',
        createdAt: '2026-05-25T00:00:00Z',
        updatedAt: '2026-05-25T00:00:00Z',
        sizeBytes: 5
      },
      {
        id: '2',
        contentType: 'code',
        content: 'const a = 1;',
        htmlContent: null,
        preview: 'const a = 1;',
        createdAt: '2026-05-25T00:00:01Z',
        updatedAt: '2026-05-25T00:00:01Z',
        sizeBytes: 12
      }
    ]);

    // 局部常量 wrapper：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const wrapper = mount(ClipboardView);
    await vi.dynamicImportSettled();

    await wrapper.get('[data-testid="clipboard-filter-code"]').trigger('click');
    // 局部常量 store：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const store = useClipboardStore();
    expect(store.typeFilter).toBe('code');
    expect(wrapper.text()).toContain('const a = 1;');
    expect(wrapper.text()).not.toContain('hello');
  });

  // 测试用例：验证「renders image entries as preview images」场景，锁定 Clipboard View 的用户可见行为。
  it('renders image entries as preview images', async () => {
    // 局部常量 dataUrl：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const dataUrl = 'data:image/png;base64,iVBORw0KGgo=';
    listClipboardEntries.mockResolvedValueOnce([
      {
        id: 'img-1',
        contentType: 'image',
        content: dataUrl,
        htmlContent: null,
        preview: '图片内容',
        createdAt: '2026-06-01T00:00:00Z',
        updatedAt: '2026-06-01T00:00:00Z',
        sizeBytes: dataUrl.length
      }
    ]);

    // 局部常量 wrapper：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const wrapper = mount(ClipboardView);
    await vi.dynamicImportSettled();

    // 局部常量 image：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const image = wrapper.get('img.clipboard-image');
    expect(image.attributes('src')).toBe(dataUrl);
    expect(image.attributes('alt')).toBe('剪贴板图片预览');
    expect(wrapper.find('pre.clipboard-preview').exists()).toBe(false);
  });

  // 测试用例：验证「opens image entries in the built-in image editor」场景，锁定 Clipboard View 的用户可见行为。
  it('opens image entries in the built-in image editor', async () => {
    // 局部常量 dataUrl：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const dataUrl = 'data:image/png;base64,iVBORw0KGgo=';
    listClipboardEntries.mockResolvedValueOnce([
      {
        id: 'img-1',
        contentType: 'image',
        content: dataUrl,
        htmlContent: null,
        preview: '图片内容',
        createdAt: '2026-06-01T00:00:00Z',
        updatedAt: '2026-06-01T00:00:00Z',
        sizeBytes: dataUrl.length
      }
    ]);

    // 局部常量 wrapper：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const wrapper = mount(ClipboardView, { attachTo: document.body });
    await vi.dynamicImportSettled();

    expect(document.querySelector('[data-testid="clip-image-editor"]')).toBeNull();

    await wrapper.get('[data-testid="clipboard-open-img-1"]').trigger('click');
    expect(openUrl).not.toHaveBeenCalled();
    expect(document.querySelector('[data-testid="clip-image-editor"]')).not.toBeNull();

    (document.querySelector('[data-testid="clip-editor-close"]') as HTMLElement).click();
    await nextTick();
    expect(document.querySelector('[data-testid="clip-image-editor"]')).toBeNull();

    wrapper.unmount();
  });

  // 测试用例：验证「双击内容区=最小化主窗口并粘贴到光标，提示已粘贴」场景，锁定 Clipboard View 的用户可见行为。
  it('双击内容区=最小化主窗口并粘贴到光标，提示已粘贴', async () => {
    listClipboardEntries.mockResolvedValueOnce([
      {
        id: '1',
        contentType: 'text',
        content: 'hello',
        htmlContent: null,
        preview: 'hello',
        createdAt: '2026-05-25T00:00:00Z',
        updatedAt: '2026-05-25T00:00:00Z',
        sizeBytes: 5
      }
    ]);

    // 局部常量 wrapper：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const wrapper = mount(ClipboardView);
    await vi.dynamicImportSettled();

    // 头部双击不触发任何动作（@dblclick 仅绑定在内容区）。
    await wrapper.get('[data-testid="clipboard-card-header-1"]').trigger('dblclick');
    expect(pasteClipboardEntry).not.toHaveBeenCalled();
    expect(minimizeCurrent).not.toHaveBeenCalled();

    // 内容区双击 = 最小化主窗口让出前台焦点 → 粘贴到上一个应用光标 → 提示已粘贴。
    // 双击不再走「复制」路径（复制由 footer 的复制按钮承担）。
    await wrapper.get('[data-testid="clipboard-card-content-1"]').trigger('dblclick');
    await flushPromises();
    expect(minimizeCurrent).toHaveBeenCalled();
    expect(pasteClipboardEntry).toHaveBeenCalledWith('1');
    expect(copyClipboardEntry).not.toHaveBeenCalled();
    expect(messageSuccess).toHaveBeenCalledWith('已粘贴');
  });

  // 测试用例：验证「点击复制按钮后弹出已复制提示」场景，锁定 Clipboard View 的用户可见行为。
  it('点击复制按钮后弹出已复制提示', async () => {
    listClipboardEntries.mockResolvedValueOnce([
      {
        id: '1',
        contentType: 'text',
        content: 'hello',
        htmlContent: null,
        preview: 'hello',
        createdAt: '2026-05-25T00:00:00Z',
        updatedAt: '2026-05-25T00:00:00Z',
        sizeBytes: 5
      }
    ]);

    // 局部常量 wrapper：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const wrapper = mount(ClipboardView);
    await vi.dynamicImportSettled();

    await wrapper.get('[data-testid="clipboard-copy-1"]').trigger('click');
    await flushPromises();

    expect(copyClipboardEntry).toHaveBeenCalledWith('1');
    expect(messageSuccess).toHaveBeenCalledWith('已复制到剪贴板');
  });

  // 测试用例：验证「置顶后弹出已置顶提示」场景，锁定 Clipboard View 的用户可见行为。
  it('置顶后弹出已置顶提示', async () => {
    listClipboardEntries.mockResolvedValueOnce([
      {
        id: '1',
        contentType: 'text',
        content: 'hello',
        htmlContent: null,
        preview: 'hello',
        createdAt: '2026-05-25T00:00:00Z',
        updatedAt: '2026-05-25T00:00:00Z',
        sizeBytes: 5
      }
    ]);

    // 局部常量 wrapper：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const wrapper = mount(ClipboardView);
    await vi.dynamicImportSettled();

    await wrapper.get('[data-testid="clipboard-pin-1"]').trigger('click');
    await flushPromises();

    expect(pinClipboardEntry).toHaveBeenCalledWith('1');
    expect(messageSuccess).toHaveBeenCalledWith('已置顶');
  });

  // 测试用例：验证「删除确认后弹出已删除提示」场景，锁定 Clipboard View 的用户可见行为。
  it('删除确认后弹出已删除提示', async () => {
    listClipboardEntries.mockResolvedValueOnce([
      {
        id: '1',
        contentType: 'text',
        content: 'hello',
        htmlContent: null,
        preview: 'hello',
        createdAt: '2026-05-25T00:00:00Z',
        updatedAt: '2026-05-25T00:00:00Z',
        sizeBytes: 5
      }
    ]);

    // 局部常量 wrapper：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const wrapper = mount(ClipboardView);
    await vi.dynamicImportSettled();

    await wrapper.get('[data-testid="clipboard-delete-1"]').trigger('click');
    await wrapper.get('[data-testid="clipboard-delete-confirm-1"]').trigger('click');
    await flushPromises();

    expect(deleteClipboardEntry).toHaveBeenCalledWith('1');
    expect(messageSuccess).toHaveBeenCalledWith('已删除');
  });

  // 测试用例：验证「打开链接后弹出提示」场景，锁定 Clipboard View 的用户可见行为。
  it('打开链接后弹出提示', async () => {
    listClipboardEntries.mockResolvedValueOnce([
      {
        id: '1',
        contentType: 'url',
        content: 'https://example.com',
        htmlContent: null,
        preview: 'https://example.com',
        createdAt: '2026-05-25T00:00:00Z',
        updatedAt: '2026-05-25T00:00:00Z',
        sizeBytes: 19
      }
    ]);

    // 局部常量 wrapper：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const wrapper = mount(ClipboardView);
    await vi.dynamicImportSettled();

    await wrapper.get('[data-testid="clipboard-open-1"]').trigger('click');
    await flushPromises();

    expect(openUrl).toHaveBeenCalledWith('https://example.com');
    expect(messageSuccess).toHaveBeenCalledWith('已在浏览器中打开');
  });

  // 测试用例：验证「卡片时间显示最近使用时间（lastUsedAt）而非内容修改时间」场景，锁定 Clipboard View 的用户可见行为。
  it('卡片时间显示最近使用时间（lastUsedAt）而非内容修改时间', async () => {
    listClipboardEntries.mockResolvedValueOnce([
      {
        id: '1',
        contentType: 'text',
        content: 'hello',
        htmlContent: null,
        preview: 'hello',
        createdAt: '2026-05-25T00:00:00Z',
        updatedAt: '2026-05-25T00:00:00Z',
        sizeBytes: 5,
        lastUsedAt: '2026-06-06T00:00:00Z'
      }
    ]);

    // 局部常量 wrapper：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const wrapper = mount(ClipboardView);
    await vi.dynamicImportSettled();

    // 局部常量 footer：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const footer = wrapper.get('[data-testid="clipboard-card-footer-1"]');
    expect(footer.text()).toContain('06/06');
    expect(footer.text()).not.toContain('05/25');
  });
});
