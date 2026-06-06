// @vitest-environment jsdom

import { nextTick } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useClipboardStore } from '@/stores/clipboard';
import type { ClipboardEntry } from '@/types/steno';
import ClipboardView from './ClipboardView.vue';

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async () => () => {}),
}));

const listClipboardEntries = vi.fn<() => Promise<ClipboardEntry[]>>(async () => []);
const deleteClipboardEntry = vi.fn(async () => {});
const clearClipboardEntries = vi.fn(async () => {});
const copyClipboardEntry = vi.fn(async () => {});
const pasteClipboardEntry = vi.fn(async () => {});
const openUrl = vi.fn(async () => {});
const hideCurrent = vi.fn(async () => {});
const minimizeCurrent = vi.fn(async () => {});
const pinClipboardEntry = vi.fn(async (id: string) => ({
  id,
  contentType: 'text' as const,
  content: 'hello',
  htmlContent: null,
  preview: 'hello',
  createdAt: '2026-05-25T00:00:00Z',
  updatedAt: '2026-05-25T00:00:00Z',
  sizeBytes: 5,
  pinnedAt: '2026-05-25T00:00:02Z',
}));
const unpinClipboardEntry = vi.fn(async (id: string) => ({
  id,
  contentType: 'text' as const,
  content: 'hello',
  htmlContent: null,
  preview: 'hello',
  createdAt: '2026-05-25T00:00:00Z',
  updatedAt: '2026-05-25T00:00:00Z',
  sizeBytes: 5,
  pinnedAt: null,
}));
const messageSuccess = vi.fn();
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
    copyEditedImageToClipboard: vi.fn(async () => {}),
  }),
}));

vi.mock('naive-ui', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    useMessage: () => ({
      success: messageSuccess,
      error: messageError,
      warning: vi.fn(),
      info: vi.fn(),
      loading: vi.fn(),
    }),
  };
});

vi.mock('@/composables/useWindow', () => ({
  useWindow: () => ({
    openQuicknote: vi.fn(async () => {}),
    openUrl,
    openPathInFileManager: vi.fn(async () => {}),
    hideCurrent,
    minimizeCurrent,
  }),
}));

describe('ClipboardView', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    // ClipboardView 在真实应用里始终渲染于 .app-theme-root 内（主题变量作用域，
    // 也是 ClipboardImageEditor 的 teleport 目标）。单测补一个同名容器复刻该前提。
    if (!document.querySelector('.app-theme-root')) {
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

  it('renders an empty state when there is no clipboard history', async () => {
    const wrapper = mount(ClipboardView);
    await vi.dynamicImportSettled();

    expect(wrapper.text()).toContain('暂无剪贴板记录');
    expect(wrapper.find('[data-testid="clipboard-search"]').exists()).toBe(true);
  });

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
        sizeBytes: 19,
      },
    ]);

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
        sizeBytes: 5,
      },
    ]);

    const wrapper = mount(ClipboardView);
    await vi.dynamicImportSettled();

    await wrapper.get('[data-testid="clipboard-delete-1"]').trigger('click');
    expect(deleteClipboardEntry).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('确认删除');

    await wrapper.get('[data-testid="clipboard-delete-confirm-1"]').trigger('click');
    expect(deleteClipboardEntry).toHaveBeenCalledWith('1');
  });

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
        sizeBytes: 5,
      },
      {
        id: '2',
        contentType: 'code',
        content: 'const a = 1;',
        htmlContent: null,
        preview: 'const a = 1;',
        createdAt: '2026-05-25T00:00:01Z',
        updatedAt: '2026-05-25T00:00:01Z',
        sizeBytes: 12,
      },
    ]);

    const wrapper = mount(ClipboardView);
    await vi.dynamicImportSettled();

    await wrapper.get('[data-testid="clipboard-filter-code"]').trigger('click');
    const store = useClipboardStore();
    expect(store.typeFilter).toBe('code');
    expect(wrapper.text()).toContain('const a = 1;');
    expect(wrapper.text()).not.toContain('hello');
  });

  it('renders image entries as preview images', async () => {
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
        sizeBytes: dataUrl.length,
      },
    ]);

    const wrapper = mount(ClipboardView);
    await vi.dynamicImportSettled();

    const image = wrapper.get('img.clipboard-image');
    expect(image.attributes('src')).toBe(dataUrl);
    expect(image.attributes('alt')).toBe('剪贴板图片预览');
    expect(wrapper.find('pre.clipboard-preview').exists()).toBe(false);
  });

  it('opens image entries in the built-in image editor', async () => {
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
        sizeBytes: dataUrl.length,
      },
    ]);

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
        sizeBytes: 5,
      },
    ]);

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
        sizeBytes: 5,
      },
    ]);

    const wrapper = mount(ClipboardView);
    await vi.dynamicImportSettled();

    await wrapper.get('[data-testid="clipboard-copy-1"]').trigger('click');
    await flushPromises();

    expect(copyClipboardEntry).toHaveBeenCalledWith('1');
    expect(messageSuccess).toHaveBeenCalledWith('已复制到剪贴板');
  });

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
        sizeBytes: 5,
      },
    ]);

    const wrapper = mount(ClipboardView);
    await vi.dynamicImportSettled();

    await wrapper.get('[data-testid="clipboard-pin-1"]').trigger('click');
    await flushPromises();

    expect(pinClipboardEntry).toHaveBeenCalledWith('1');
    expect(messageSuccess).toHaveBeenCalledWith('已置顶');
  });

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
        sizeBytes: 5,
      },
    ]);

    const wrapper = mount(ClipboardView);
    await vi.dynamicImportSettled();

    await wrapper.get('[data-testid="clipboard-delete-1"]').trigger('click');
    await wrapper.get('[data-testid="clipboard-delete-confirm-1"]').trigger('click');
    await flushPromises();

    expect(deleteClipboardEntry).toHaveBeenCalledWith('1');
    expect(messageSuccess).toHaveBeenCalledWith('已删除');
  });

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
        sizeBytes: 19,
      },
    ]);

    const wrapper = mount(ClipboardView);
    await vi.dynamicImportSettled();

    await wrapper.get('[data-testid="clipboard-open-1"]').trigger('click');
    await flushPromises();

    expect(openUrl).toHaveBeenCalledWith('https://example.com');
    expect(messageSuccess).toHaveBeenCalledWith('已在浏览器中打开');
  });
});
