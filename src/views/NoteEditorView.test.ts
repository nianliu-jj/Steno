// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils';
import { NConfigProvider, NMessageProvider } from 'naive-ui';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';

import NoteEditorView from './NoteEditorView.vue';
import NoteEditorViewSource from './NoteEditorView.vue?raw';

let autosaveStatus = 'saved';
const navigateToMain = vi.fn();
const navigateTo = vi.fn();

const getEditorEntry = vi.fn(() => Promise.resolve(null));
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
    wordCount: 14,    isDraft: false,
  }),
);

const saveDraft = vi.fn(() => Promise.resolve({ id: 'note-1' }));
const saveDocumentEntry = vi.fn(() => Promise.resolve({ id: 'doc-1' }));

vi.mock('@/composables/useDb', () => ({
  useDb: () => ({
    getEditorEntry,
    getNote,
    saveDocumentEntry,
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
    navigateToMain,
    navigateTo,
  }),
}));

vi.mock('@/composables/useMarkdown', () => ({
  useMarkdown: () => ({
    countWords: (content: string) => content.length,
  }),
}));

vi.mock('@/composables/useAutosave', () => ({
  useAutosave: (saver: (payload: unknown) => Promise<unknown>) => ({
    status: { value: autosaveStatus },
    savedAt: { value: null },
    error: { value: null },
    scheduleSave: (payload: unknown) => void saver(payload),
    flushSave: vi.fn(() => Promise.resolve()),
  }),
}));

vi.mock('@/components/MarkdownEditor.vue', () => ({
  default: defineComponent({
    props: ['modelValue'],
    emits: ['update:modelValue'],
    setup(_props, { emit, expose }) {
      expose({
        focus: vi.fn(),
        scrollToLine: vi.fn(),
      });

      return () =>
        h('textarea', {
          value: _props.modelValue,
          onInput: (event: Event) =>
            emit('update:modelValue', (event.target as HTMLTextAreaElement).value),
        });
    },
  }),
}));

vi.mock('@/components/MarkdownReadSurface.vue', () => ({
  default: {
    props: ['title', 'content'],
    template:
      '<section data-testid="note-read-surface"><h1>{{ title }}</h1><div>{{ content }}</div></section>',
  },
}));

vi.mock('@/components/DocumentOutlineTree.vue', () => ({
  default: {
    props: ['nodes'],
    emits: ['select'],
    template: `
      <div data-testid="note-outline-tree">
        <button
          v-for="node in nodes"
          :key="node.id"
          :data-testid="'note-outline-node-' + node.id"
          @click="$emit('select', node)"
        >
          {{ node.text }}
        </button>
      </div>
    `,
  },
}));

vi.mock('@/composables/useOutlineSidebarState', () => ({
  useOutlineSidebarState: () => ({
    open: { value: false },
    width: { value: 280 },
    toggle: vi.fn(),
    setWidth: vi.fn(),
  }),
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
  beforeEach(() => {
    autosaveStatus = 'saved';
    uiNoteId = 'note-1';
    libraryContext.workspaceId = 'workspace-1';
    libraryContext.folderEntryId = null;
    getNote.mockClear();
    getEditorEntry.mockClear();
    saveDraft.mockClear();
    navigateToMain.mockClear();
    navigateTo.mockClear();
  });

  it('loads the target note into the main-window editor', async () => {
    const wrapper = mount(WrappedNoteEditorView);
    await flushPromises();

    expect(getNote).toHaveBeenCalledWith('note-1');
    expect(wrapper.get('.note-editor-title-text').text()).toBe('Rust 生命周期笔记');
    expect(wrapper.find('.note-editor-title input').exists()).toBe(false);
    expect((wrapper.find('textarea').element as HTMLTextAreaElement).value)
      .toContain('函数中的生命周期标注影响返回值。');
  });

  it('saves a new draft from the main-window editor', async () => {
    const wrapper = mount(WrappedNoteEditorView);
    await flushPromises();

    await wrapper.find('textarea').setValue('新内容');

    expect(saveDraft).toHaveBeenCalled();
  });

  it('routes the editor footer Zen action through the ui store', async () => {
    const wrapper = mount(WrappedNoteEditorView);
    await flushPromises();

    await wrapper.get('[data-testid="surface-open-zen"]').trigger('click');

    expect(navigateToZenFromEditor).toHaveBeenCalledWith('note-1');
  });

  it('moves note tags and save metadata into the editor footer', async () => {
    const wrapper = mount(WrappedNoteEditorView);
    await flushPromises();

    expect(wrapper.find('.note-editor-header .note-editor-meta').exists()).toBe(false);

    const footerTags = wrapper.get('.note-editor-footer-tags');
    expect(footerTags.text()).toContain('#rust');

    const footerMeta = wrapper.get('.note-editor-footer-meta');
    expect(footerMeta.text()).toContain('16 字');
    expect(footerMeta.text()).toContain('已保存');
  });

  it('switches the header title into an editable input from the title icon button', async () => {
    const wrapper = mount(WrappedNoteEditorView);
    await flushPromises();

    expect(wrapper.find('.note-editor-header .note-editor-title-input input').exists()).toBe(false);
    expect(wrapper.find('.note-editor-body .note-editor-title').exists()).toBe(false);

    await wrapper.get('[data-testid="note-title-edit"]').trigger('click');

    const headerTitle = wrapper.get('.note-editor-header .note-editor-title-input input');
    expect((headerTitle.element as HTMLInputElement).value).toBe('Rust 生命周期笔记');

    await headerTitle.setValue('迁移后的标题');
    await headerTitle.trigger('keydown.enter');

    expect(saveDraft).toHaveBeenLastCalledWith(expect.objectContaining({
      id: 'note-1',
      title: '迁移后的标题',
    }));
    expect(wrapper.get('.note-editor-title-text').text()).toBe('迁移后的标题');
  });

  it('edits document tags as one single-line input per row from the tag dialog', async () => {
    const wrapper = mount(WrappedNoteEditorView);
    await flushPromises();

    expect(wrapper.find('[role="dialog"]').exists()).toBe(false);

    await wrapper.get('[data-testid="note-tags-edit"]').trigger('click');

    const dialog = wrapper.get('[role="dialog"]');
    expect(dialog.text()).toContain('编辑标签');
    expect(dialog.find('.note-editor-tags-input textarea').exists()).toBe(false);

    const firstInput = dialog.get('[data-testid="note-tag-input-0"] input');
    expect((firstInput.element as HTMLInputElement).value).toBe('rust');

    await firstInput.setValue('rust-updated');
    await dialog.get('[data-testid="note-tag-add"]').trigger('click');
    await dialog.get('[data-testid="note-tag-input-1"] input').setValue('vue');
    await dialog.get('[data-testid="note-tag-delete-1"]').trigger('click');
    await dialog.get('[data-testid="note-tag-add"]').trigger('click');
    await dialog.get('[data-testid="note-tag-input-1"] input').setValue('标签');
    await dialog.get('[data-testid="note-tags-confirm"]').trigger('click');

    expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
    expect(saveDraft).toHaveBeenLastCalledWith(expect.objectContaining({
      id: 'note-1',
      tags: ['rust-updated', '标签'],
    }));
    expect(wrapper.get('.note-editor-footer-tags').text()).toContain('#rust-updated');
    expect(wrapper.get('.note-editor-footer-tags').text()).toContain('#标签');
  });

  it('switches between read mode and edit mode from the footer', async () => {
    const wrapper = mount(WrappedNoteEditorView);
    await flushPromises();

    expect(wrapper.find('[data-testid="note-read-surface"]').exists()).toBe(false);
    expect(wrapper.find('textarea').exists()).toBe(true);

    await wrapper.get('[data-testid="note-mode-read"]').trigger('click');

    expect(wrapper.find('[data-testid="note-read-surface"]').exists()).toBe(true);
    expect(wrapper.find('textarea').exists()).toBe(false);
    expect(wrapper.get('[data-testid="note-read-surface"]').text()).toContain('Rust 生命周期笔记');

    await wrapper.get('[data-testid="note-mode-edit"]').trigger('click');

    expect(wrapper.find('[data-testid="note-read-surface"]').exists()).toBe(false);
    expect(wrapper.find('textarea').exists()).toBe(true);
  });

  it('opens the floating outline and routes zen back to note-editor', async () => {
    const wrapper = mount(WrappedNoteEditorView);
    await flushPromises();

    expect(wrapper.find('[data-testid="note-outline-panel"]').exists()).toBe(false);

    await wrapper.get('[data-testid="note-outline-toggle"]').trigger('click');

    expect(wrapper.find('[data-testid="note-outline-panel"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="note-outline-tree"]').exists()).toBe(true);

    await wrapper.get('[data-testid="note-open-zen"]').trigger('click');

    expect(navigateTo).toHaveBeenCalledWith('zen', 'note-1', 'note-editor');
  });

  it('declares readable local colors for the tag editing dialog controls', () => {
    expect(NoteEditorViewSource).toContain('class="note-editor-dialog-cancel"');
    expect(NoteEditorViewSource).toContain('--n-text-color: #2a2a2a');
    expect(NoteEditorViewSource).toContain('--n-placeholder-color: #8a7c70');
    expect(NoteEditorViewSource).toContain('--n-color: #fffdf9');
    expect(NoteEditorViewSource).toContain('-webkit-text-fill-color: #2a2a2a');
    expect(NoteEditorViewSource).toContain('--n-text-color: #6f5c4c');
    expect(NoteEditorViewSource).toContain('--n-color-hover: rgba(55, 46, 36, 0.08)');
  });

  it('declares readable text colors for the light workbench editor surface', () => {
    expect(NoteEditorViewSource).toContain('class="note-editor-meta-text"');
    expect(NoteEditorViewSource).toContain('class="note-editor-back-button"');
    expect(NoteEditorViewSource).toMatch(/color: #5f564d(?: !important)?;/);
    expect(NoteEditorViewSource).toMatch(/color: #6f5c4c(?: !important)?;/);
    expect(NoteEditorViewSource).toContain('caret-color: #2a2a2a;');
    expect(NoteEditorViewSource).toMatch(/color: #7e7469(?: !important)?;/);
  });

  it('renders the lifted rounded editor card shell for the main editor', async () => {
    const wrapper = mount(WrappedNoteEditorView);
    await flushPromises();

    expect(wrapper.find('[data-testid="note-editor-shell"]').exists()).toBe(true);
    expect(NoteEditorViewSource).toContain('data-testid="note-editor-shell"');
    expect(NoteEditorViewSource).toContain('border-radius: 18px 18px 14px 14px;');
  });

  it('saves a new workspace-backed entry as a document when no note id is present', async () => {
    uiNoteId = null;

    const wrapper = mount(WrappedNoteEditorView);
    await flushPromises();

    await wrapper.find('textarea').setValue('新的文档正文');

    expect(saveDocumentEntry).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: 'workspace-1',
      folderEntryId: null,
      content: '新的文档正文',
    }));
    expect(saveDraft).not.toHaveBeenCalled();
  });
});
