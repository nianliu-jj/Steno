// @vitest-environment jsdom

import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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

vi.mock('@/composables/useDb', () => ({
  useDb: () => ({
    listClipboardEntries,
    deleteClipboardEntry,
    clearClipboardEntries,
    copyClipboardEntry,
    pasteClipboardEntry,
  }),
}));

vi.mock('@/composables/useWindow', () => ({
  useWindow: () => ({
    openQuicknote: vi.fn(async () => {}),
    openUrl,
    openPathInFileManager: vi.fn(async () => {}),
  }),
}));

describe('ClipboardView', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    listClipboardEntries.mockResolvedValue([]);
    copyClipboardEntry.mockClear();
    pasteClipboardEntry.mockClear();
    openUrl.mockClear();
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

  it('opens image entries in the built-in image previewer', async () => {
    const dataUrl = 'data:image/png;base64,iVBORw0KGgo=';
    listClipboardEntries.mockResolvedValueOnce([
      {
        id: 'img-1',
        contentType: 'image',
        content: dataUrl,
        htmlContent: null,
        preview: '截图/图片',
        createdAt: '2026-06-01T00:00:00Z',
        updatedAt: '2026-06-01T00:00:00Z',
        sizeBytes: dataUrl.length,
      },
    ]);

    const wrapper = mount(ClipboardView);
    await vi.dynamicImportSettled();

    await wrapper.get('[data-testid="clipboard-open-img-1"]').trigger('click');

    expect(openUrl).not.toHaveBeenCalled();
    expect(wrapper.get('[data-testid="clipboard-image-viewer"]').attributes('aria-label')).toBe('图片预览');
    expect(wrapper.get('[data-testid="clipboard-image-viewer-img"]').attributes('src')).toBe(dataUrl);

    await wrapper.get('[data-testid="clipboard-image-viewer-close"]').trigger('click');
    expect(wrapper.find('[data-testid="clipboard-image-viewer"]').exists()).toBe(false);
  });

  it('pastes an entry when double clicking the clipboard content area only', async () => {
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

    await wrapper.get('[data-testid="clipboard-card-header-1"]').trigger('dblclick');
    expect(pasteClipboardEntry).not.toHaveBeenCalled();

    await wrapper.get('[data-testid="clipboard-card-content-1"]').trigger('dblclick');
    expect(pasteClipboardEntry).toHaveBeenCalledWith('1');
    expect(copyClipboardEntry).not.toHaveBeenCalledWith('1');
  });
});
