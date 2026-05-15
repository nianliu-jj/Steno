// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils';
import { NConfigProvider, NMessageProvider } from 'naive-ui';
import { describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';

import NoteEditorView from './NoteEditorView.vue';
import NoteEditorViewSource from './NoteEditorView.vue?raw';

const getNote = vi.fn(() =>
  Promise.resolve({
    id: 'note-1',
    title: 'Rust 生命周期笔记',
    content: '函数中的生命周期标注影响返回值。',
    htmlContent: '<p>函数中的生命周期标注影响返回值。</p>',
    tags: ['rust'],
    isPinned: false,
    pinnedWindowConfig: null,
    canvasPosition: null,
    createdAt: '2026-05-13T00:00:00.000Z',
    updatedAt: '2026-05-13T00:00:00.000Z',
    wordCount: 14,
  }),
);

const saveDraft = vi.fn(() => Promise.resolve({ id: 'note-1' }));

vi.mock('@/composables/useDb', () => ({
  useDb: () => ({
    getNote,
  }),
}));

vi.mock('@/stores/notes', () => ({
  useNotesStore: () => ({
    saveDraft,
  }),
}));

vi.mock('@/stores/ui', () => ({
  useUiStore: () => ({
    noteId: 'note-1',
    navigateToMain: vi.fn(),
  }),
}));

vi.mock('@/composables/useMarkdown', () => ({
  useMarkdown: () => ({
    countWords: (content: string) => content.length,
  }),
}));

vi.mock('@/composables/useAutosave', () => ({
  useAutosave: (saver: (payload: unknown) => Promise<unknown>) => ({
    status: { value: 'idle' },
    savedAt: { value: null },
    error: { value: null },
    scheduleSave: (payload: unknown) => void saver(payload),
    flushSave: vi.fn(() => Promise.resolve()),
  }),
}));

vi.mock('@/components/MarkdownEditor.vue', () => ({
  default: {
    props: ['modelValue'],
    emits: ['update:modelValue'],
    template:
      '<textarea :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
  },
}));

const WrappedNoteEditorView = defineComponent({
  setup() {
    return () =>
      h(NConfigProvider, null, {
        default: () =>
          h(NMessageProvider, null, {
            default: () => h(NoteEditorView),
          }),
      });
  },
});

describe('NoteEditorView', () => {
  it('loads the target note into the main-window editor', async () => {
    const wrapper = mount(WrappedNoteEditorView);
    await flushPromises();

    expect(getNote).toHaveBeenCalledWith('note-1');
    expect((wrapper.find('.note-editor-title input').element as HTMLInputElement).value)
      .toBe('Rust 生命周期笔记');
    expect((wrapper.find('textarea').element as HTMLTextAreaElement).value)
      .toContain('函数中的生命周期标注影响返回值。');
  });

  it('saves a new draft from the main-window editor', async () => {
    const wrapper = mount(WrappedNoteEditorView);
    await flushPromises();

    await wrapper.find('textarea').setValue('新内容');

    expect(saveDraft).toHaveBeenCalled();
  });

  it('declares readable text colors for the light workbench editor surface', () => {
    expect(NoteEditorViewSource).toContain('class="note-editor-meta-text"');
    expect(NoteEditorViewSource).toContain('class="note-editor-back-button"');
    expect(NoteEditorViewSource).toMatch(/color: #5f564d(?: !important)?;/);
    expect(NoteEditorViewSource).toMatch(/color: #6f5c4c(?: !important)?;/);
    expect(NoteEditorViewSource).toContain('caret-color: #2a2a2a;');
    expect(NoteEditorViewSource).toMatch(/color: #7e7469(?: !important)?;/);
  });
});
