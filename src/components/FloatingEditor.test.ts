// @vitest-environment jsdom

import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, nextTick } from 'vue';

import FloatingEditor from './FloatingEditor.vue';

let quicknoteOpenHandler:
  | ((event: {
      payload: {
        fresh: boolean;
        noteId: string | null;
        clipboardPreview?: {
          content: string;
          contentType: 'text' | 'url' | 'code' | 'image' | 'file' | 'rich_text';
          htmlContent?: string | null;
          source?: string | null;
        } | null;
      };
    }) => void)
  | undefined;

const saveDraft = vi.fn();
const scheduleSave = vi.fn();
const flushSave = vi.fn(() => Promise.resolve());
const hideCurrent = vi.fn(() => Promise.resolve());

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async (event: string, handler: typeof quicknoteOpenHandler) => {
    if (event === 'quicknote:open') quicknoteOpenHandler = handler;
    return () => {
      quicknoteOpenHandler = undefined;
    };
  }),
}));

vi.mock('@/components/MarkdownEditor.vue', () => ({
  default: defineComponent({
    props: ['modelValue', 'placeholder'],
    emits: ['update:modelValue'],
    setup(props, { emit }) {
      return () =>
        h('textarea', {
          'data-testid': 'floating-markdown-editor',
          value: props.modelValue,
          placeholder: props.placeholder,
          onInput: (event: Event) =>
            emit('update:modelValue', (event.target as HTMLTextAreaElement).value),
        });
    },
  }),
}));

vi.mock('@/composables/useAutosave', () => ({
  useAutosave: () => ({
    status: { value: 'idle' },
    savedAt: { value: null },
    error: { value: null },
    scheduleSave,
    flushSave,
  }),
}));

vi.mock('@/stores/notes', () => ({
  useNotesStore: () => ({
    saveDraft,
    syncExternalNote: vi.fn(),
    unpinNote: vi.fn(),
  }),
}));

vi.mock('@/stores/settings', () => ({
  useSettingsStore: () => ({
    state: {
      blurCloseDelayMs: 800,
    },
  }),
}));

vi.mock('@/composables/useWindow', () => ({
  useWindow: () => ({
    currentLabel: () => 'quicknote',
    hideCurrent,
    closeCurrent: vi.fn(),
    closeStickyNote: vi.fn(),
    onCurrentWindowFocusChange: vi.fn(async () => () => {}),
    startDragCurrent: vi.fn(),
  }),
}));

vi.mock('@/composables/useDb', () => ({
  useDb: () => ({
    getLatestDraft: vi.fn(async () => null),
    getNote: vi.fn(async () => null),
    deleteNote: vi.fn(async () => {}),
    listNotes: vi.fn(async () => []),
    promoteDraft: vi.fn(async () => null),
  }),
}));

vi.mock('@/composables/useAppEvents', () => ({
  useAppEvents: () => ({
    emitNoteSaved: vi.fn(),
    emitNoteRemoved: vi.fn(),
  }),
}));

vi.mock('@/composables/useMarkdown', () => ({
  useMarkdown: () => ({
    countWords: (content: string) => content.trim().split(/\s+/).filter(Boolean).length,
  }),
}));

vi.mock('naive-ui', () => ({
  NButton: defineComponent({
    props: ['title'],
    emits: ['click', 'pointerdown'],
    setup(props, { attrs, emit, slots }) {
      return () =>
        h(
          'button',
          {
            ...attrs,
            title: props.title,
            onClick: (event: MouseEvent) => emit('click', event),
            onPointerdown: (event: PointerEvent) => emit('pointerdown', event),
          },
          slots.default?.() ?? slots.icon?.(),
        );
    },
  }),
  NIcon: defineComponent({
    setup(_props, { slots }) {
      return () => h('span', slots.default?.());
    },
  }),
  NInput: defineComponent({
    props: ['value', 'placeholder'],
    emits: ['update:value', 'keydown', 'blur'],
    setup(props, { attrs, emit }) {
      return () =>
        h('input', {
          ...attrs,
          value: props.value,
          placeholder: props.placeholder,
          onInput: (event: Event) =>
            emit('update:value', (event.target as HTMLInputElement).value),
          onKeydown: (event: KeyboardEvent) => emit('keydown', event),
          onBlur: (event: FocusEvent) => emit('blur', event),
        });
    },
  }),
  NText: defineComponent({
    setup(_props, { slots }) {
      return () => h('span', slots.default?.());
    },
  }),
  useMessage: () => ({
    warning: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  }),
}));

describe('FloatingEditor clipboard preview', () => {
  beforeEach(() => {
    quicknoteOpenHandler = undefined;
    saveDraft.mockClear();
    scheduleSave.mockClear();
    flushSave.mockClear();
    hideCurrent.mockClear();
  });

  it('loads code clipboard preview as a fenced code block and does not autosave edits', async () => {
    const wrapper = mount(FloatingEditor);
    await vi.dynamicImportSettled();

    quicknoteOpenHandler?.({
      payload: {
        fresh: false,
        noteId: null,
        clipboardPreview: {
          content: 'const value = 1;',
          contentType: 'code',
          htmlContent: null,
          source: '系统剪贴板',
        },
      },
    });
    await nextTick();

    const editor = wrapper.get('[data-testid="floating-markdown-editor"]');
    expect((editor.element as HTMLTextAreaElement).value).toBe(
      '```text\nconst value = 1;\n```',
    );
    expect(wrapper.get('[data-testid="floating-title-text"]').text()).toBe('剪贴板 · 代码');

    await editor.setValue('用户临时修改');

    expect(scheduleSave).not.toHaveBeenCalled();
    expect(saveDraft).not.toHaveBeenCalled();
  });
});
