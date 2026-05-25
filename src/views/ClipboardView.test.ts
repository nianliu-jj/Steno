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

vi.mock('@/composables/useDb', () => ({
  useDb: () => ({
    listClipboardEntries,
    deleteClipboardEntry,
    clearClipboardEntries,
    copyClipboardEntry,
  }),
}));

describe('ClipboardView', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    listClipboardEntries.mockResolvedValue([]);
    copyClipboardEntry.mockClear();
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

    expect(wrapper.text()).toContain('链接');
    expect(wrapper.text()).toContain('https://example.com');
    await wrapper.get('[data-testid="clipboard-copy-1"]').trigger('click');
    expect(copyClipboardEntry).toHaveBeenCalledWith('1');
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
});
