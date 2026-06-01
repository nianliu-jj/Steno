// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ClipboardEntry } from '@/types/steno';
import ClipboardImageEditor from './ClipboardImageEditor.vue';

const addImageEntry = vi.fn(async () => ({ id: 'new-1' }) as ClipboardEntry);
const copyEditedImageToClipboard = vi.fn(async () => {});

vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(async () => () => {}) }));

vi.mock('@/composables/useDb', () => ({
  useDb: () => ({
    copyEditedImageToClipboard,
    addImageClipboardEntry: vi.fn(),
    listClipboardEntries: vi.fn(async () => []),
  }),
}));

vi.mock('@/stores/clipboard', () => ({
  useClipboardStore: () => ({ addImageEntry }),
}));

vi.mock('@/utils/canvasRender', async (orig) => ({
  ...(await orig<typeof import('@/utils/canvasRender')>()),
  renderToDataUrl: vi.fn(() => 'data:image/png;base64,ZWRpdGVk'),
}));

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
  sizeBytes: 40,
};

function mountEditor() {
  return mount(ClipboardImageEditor, {
    props: { entry },
    attachTo: document.body,
    global: { stubs: { teleport: true } },
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

describe('ClipboardImageEditor', () => {
  it('renders the editor dialog without a backdrop mask', () => {
    const w = mountEditor();
    expect(w.find('[data-testid="clip-image-editor"]').exists()).toBe(true);
    expect(w.find('[data-testid="clip-editor-backdrop"]').exists()).toBe(false);
    expect(w.find('[data-testid="clip-editor-resize-grip"]').exists()).toBe(true);
    w.unmount();
  });

  it('emits close on the close button', async () => {
    const w = mountEditor();
    await w.get('[data-testid="clip-editor-close"]').trigger('click');
    expect(w.emitted('close')).toBeTruthy();
    w.unmount();
  });

  it('emits close on Escape', async () => {
    const w = mountEditor();
    await w.get('[data-testid="clip-image-editor"]').trigger('keydown', { key: 'Escape' });
    expect(w.emitted('close')).toBeTruthy();
    w.unmount();
  });

  it('adds a rotate op and toggles undo/redo', async () => {
    const w = mountEditor();
    expect(w.get('[data-testid="clip-tool-undo"]').attributes('disabled')).toBeDefined();

    await w.get('[data-testid="clip-tool-rotate-right"]').trigger('click');
    expect(w.get('[data-testid="clip-editor-status"]').text()).toContain('1');
    expect(w.get('[data-testid="clip-tool-undo"]').attributes('disabled')).toBeUndefined();

    await w.get('[data-testid="clip-tool-undo"]').trigger('click');
    expect(w.get('[data-testid="clip-tool-redo"]').attributes('disabled')).toBeUndefined();
    w.unmount();
  });

  it('commits an adjust op from the brightness slider', async () => {
    const w = mountEditor();
    await w.get('[data-testid="clip-tool-adjust"]').trigger('click');
    const slider = w.get('[data-testid="clip-adjust-brightness"]');
    await slider.setValue('30');
    await slider.trigger('change');
    expect(w.get('[data-testid="clip-editor-status"]').text()).toContain('1');
    w.unmount();
  });

  it('commits a crop op when confirming the selection', async () => {
    const w = mountEditor();
    await w.get('[data-testid="clip-tool-crop"]').trigger('click');
    expect(w.find('[data-testid="clip-crop-box"]').exists()).toBe(true);
    expect(w.findAll('[data-testid^="clip-crop-handle-"]')).toHaveLength(4);
    await w.get('[data-testid="clip-crop-confirm"]').trigger('click');
    expect(w.get('[data-testid="clip-editor-status"]').text()).toContain('1');
    w.unmount();
  });

  it('opens the resize popover and commits a resize op with aspect lock', async () => {
    const w = mountEditor();
    await w.get('[data-testid="clip-tool-resize"]').trigger('click');
    const width = w.get('[data-testid="clip-resize-width"]');
    await width.setValue('100');
    await width.trigger('input');
    // 锁定纵横比：源 200x120 → 宽 100 应联动高 60
    expect((w.get('[data-testid="clip-resize-height"]').element as HTMLInputElement).value).toBe('60');
    await w.get('[data-testid="clip-resize-confirm"]').trigger('click');
    expect(w.get('[data-testid="clip-editor-status"]').text()).toContain('100×60');
    w.unmount();
  });

  it('disables save until an edit makes the editor dirty', async () => {
    const w = mountEditor();
    expect(w.get('[data-testid="clip-editor-save"]').attributes('disabled')).toBeDefined();
    await w.get('[data-testid="clip-tool-rotate-right"]').trigger('click');
    expect(w.get('[data-testid="clip-editor-save"]').attributes('disabled')).toBeUndefined();
    w.unmount();
  });

  it('saves as a new entry then closes', async () => {
    const w = mountEditor();
    await w.get('[data-testid="clip-tool-rotate-right"]').trigger('click');
    await w.get('[data-testid="clip-editor-save"]').trigger('click');
    await flushPromises();
    expect(addImageEntry).toHaveBeenCalledWith('data:image/png;base64,ZWRpdGVk');
    expect(w.emitted('close')).toBeTruthy();
    w.unmount();
  });

  it('keeps the editor open and shows an error when saving fails', async () => {
    addImageEntry.mockRejectedValueOnce(new Error('boom'));
    const w = mountEditor();
    await w.get('[data-testid="clip-tool-rotate-right"]').trigger('click');
    await w.get('[data-testid="clip-editor-save"]').trigger('click');
    await flushPromises();
    expect(w.get('[data-testid="clip-editor-error"]').text()).toContain('boom');
    expect(w.emitted('close')).toBeFalsy();
    w.unmount();
  });

  it('copies the edited result to the system clipboard', async () => {
    const w = mountEditor();
    await w.get('[data-testid="clip-editor-copy"]').trigger('click');
    await flushPromises();
    expect(copyEditedImageToClipboard).toHaveBeenCalledWith('data:image/png;base64,ZWRpdGVk');
    w.unmount();
  });
});
