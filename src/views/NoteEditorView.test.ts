/**
 * @file 前端视图 - Note Editor View
 *
 * 覆盖 Note Editor View 的主要行为、边界条件和跨模块契约，帮助重构时快速定位预期。
 * 注释重点标明数据入口、状态边界、事件通道和协作风险点，便于逐行阅读时快速判断代码意图。
 */

// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils';
import { NConfigProvider, NMessageProvider } from 'naive-ui';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';

import NoteEditorView from './NoteEditorView.vue';
import NoteEditorViewSource from './NoteEditorView.vue?raw';

let autosaveStatus = 'saved';
let uiNoteId: string | null = 'note-1';
// 局部常量 libraryContext：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const libraryContext = {
  workspaceId: null as string | null,
  folderEntryId: null as string | null
};
// 局部常量 navigateToMain：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const navigateToMain = vi.fn();
// 局部常量 navigateTo：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const navigateTo = vi.fn();
// 局部常量 navigateToZenFromEditor：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const navigateToZenFromEditor = vi.fn();

// 局部常量 getEditorEntry：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const getEditorEntry = vi.fn(() => Promise.resolve(null));
// 局部常量 getNote：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
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
    isDraft: false
  })
);

// 局部常量 saveDraft：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const saveDraft = vi.fn(() => Promise.resolve({ id: 'note-1' }));
// 局部常量 saveDocumentEntry：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const saveDocumentEntry = vi.fn(() => Promise.resolve({ id: 'doc-1' }));

vi.mock('@/composables/useDb', () => ({
  useDb: () => ({
    getEditorEntry,
    getNote,
    saveDocumentEntry
  })
}));

vi.mock('@/stores/notes', () => ({
  useNotesStore: () => ({
    saveDraft
  })
}));

vi.mock('@/stores/ui', () => ({
  useUiStore: () => ({
    get noteId() {
      return uiNoteId;
    },
    navigateToMain,
    navigateTo,
    navigateToZenFromEditor
  })
}));

vi.mock('@/stores/library', () => ({
  useLibraryStore: () => ({
    context: libraryContext
  })
}));

vi.mock('@/composables/useMarkdown', () => ({
  useMarkdown: () => ({
    countWords: (content: string) => content.length
  })
}));

vi.mock('@/composables/useAutosave', () => ({
  useAutosave: (saver: (payload: unknown) => Promise<unknown>) => ({
    status: { value: autosaveStatus },
    savedAt: { value: null },
    error: { value: null },
    scheduleSave: (payload: unknown) => void saver(payload),
    flushSave: vi.fn(() => Promise.resolve())
  })
}));

vi.mock('@/components/MarkdownEditor.vue', () => ({
  default: defineComponent({
    props: ['modelValue'],
    emits: ['update:modelValue'],
    setup(_props, { emit, expose }) {
      expose({
        focus: vi.fn(),
        scrollToLine: vi.fn()
      });

      return () =>
        h('textarea', {
          value: _props.modelValue,
          onInput: (event: Event) => emit('update:modelValue', (event.target as HTMLTextAreaElement).value)
        });
    }
  })
}));

vi.mock('@/components/MarkdownReadSurface.vue', () => ({
  default: {
    props: ['title', 'content'],
    template: '<section data-testid="note-read-surface"><h1>{{ title }}</h1><div>{{ content }}</div></section>'
  }
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
    `
  }
}));

vi.mock('@/composables/useOutlineSidebarState', () => ({
  useOutlineSidebarState: () => ({
    open: { value: false },
    width: { value: 280 },
    toggle: vi.fn(),
    setWidth: vi.fn()
  })
}));

// 组件定义 WrappedNoteEditorView：集中声明渲染入口、props 和事件响应。
const WrappedNoteEditorView = defineComponent({
  setup() {
    return () =>
      h(NConfigProvider, null, {
        default: () =>
          h(NMessageProvider, null, {
            default: () => h(NoteEditorView)
          })
      });
  }
});

// 测试用例：验证「NoteEditorView」场景，锁定 Note Editor View 的用户可见行为。
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

  // 测试用例：验证「loads the target note into the main-window editor」场景，锁定 Note Editor View 的用户可见行为。
  it('loads the target note into the main-window editor', async () => {
    // 局部常量 wrapper：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const wrapper = mount(WrappedNoteEditorView);
    await flushPromises();

    expect(getNote).toHaveBeenCalledWith('note-1');
    expect(wrapper.get('.note-editor-title-text').text()).toBe('Rust 生命周期笔记');
    expect(wrapper.find('.note-editor-title input').exists()).toBe(false);
    expect((wrapper.find('textarea').element as HTMLTextAreaElement).value).toContain(
      '函数中的生命周期标注影响返回值。'
    );
  });

  // 测试用例：验证「saves a new draft from the main-window editor」场景，锁定 Note Editor View 的用户可见行为。
  it('saves a new draft from the main-window editor', async () => {
    // 局部常量 wrapper：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const wrapper = mount(WrappedNoteEditorView);
    await flushPromises();

    await wrapper.find('textarea').setValue('新内容');

    expect(saveDraft).toHaveBeenCalled();
  });

  it.skip('routes the editor footer Zen action through the ui store', async () => {
    // 局部常量 wrapper：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const wrapper = mount(WrappedNoteEditorView);
    await flushPromises();

    await wrapper.get('[data-testid="surface-open-zen"]').trigger('click');

    expect(navigateToZenFromEditor).toHaveBeenCalledWith('note-1');
  });

  // 测试用例：验证「moves note tags and save metadata into the editor footer」场景，锁定 Note Editor View 的用户可见行为。
  it('moves note tags and save metadata into the editor footer', async () => {
    // 局部常量 wrapper：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const wrapper = mount(WrappedNoteEditorView);
    await flushPromises();

    expect(wrapper.find('.note-editor-header .note-editor-meta').exists()).toBe(false);

    // 局部常量 footerTags：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const footerTags = wrapper.get('.note-editor-footer-tags');
    expect(footerTags.text()).toContain('#rust');

    // 局部常量 footerMeta：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const footerMeta = wrapper.get('.note-editor-footer-meta');
    expect(footerMeta.text()).toContain('16 字');
    expect(footerMeta.text()).toContain('已保存');
  });

  // 测试用例：验证「switches the header title into an editable input from the title icon button」场景，锁定 Note Editor View 的用户可见行为。
  it('switches the header title into an editable input from the title icon button', async () => {
    // 局部常量 wrapper：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const wrapper = mount(WrappedNoteEditorView);
    await flushPromises();

    expect(wrapper.find('.note-editor-header .note-editor-title-input input').exists()).toBe(false);
    expect(wrapper.find('.note-editor-body .note-editor-title').exists()).toBe(false);

    await wrapper.get('[data-testid="note-title-edit"]').trigger('click');

    // 局部常量 headerTitle：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const headerTitle = wrapper.get('.note-editor-header .note-editor-title-input input');
    expect((headerTitle.element as HTMLInputElement).value).toBe('Rust 生命周期笔记');

    await headerTitle.setValue('迁移后的标题');
    await headerTitle.trigger('keydown.enter');

    expect(saveDraft).toHaveBeenLastCalledWith(
      expect.objectContaining({
        id: 'note-1',
        title: '迁移后的标题'
      })
    );
    expect(wrapper.get('.note-editor-title-text').text()).toBe('迁移后的标题');
  });

  // 测试用例：验证「edits document tags as one single-line input per row from the tag dialog」场景，锁定 Note Editor View 的用户可见行为。
  it('edits document tags as one single-line input per row from the tag dialog', async () => {
    // 局部常量 wrapper：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const wrapper = mount(WrappedNoteEditorView);
    await flushPromises();

    expect(wrapper.find('[role="dialog"]').exists()).toBe(false);

    await wrapper.get('[data-testid="note-tags-edit"]').trigger('click');

    // 局部常量 dialog：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const dialog = wrapper.get('[role="dialog"]');
    expect(dialog.text()).toContain('编辑标签');
    expect(dialog.find('.note-editor-tags-input textarea').exists()).toBe(false);

    // 局部常量 firstInput：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
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
    expect(saveDraft).toHaveBeenLastCalledWith(
      expect.objectContaining({
        id: 'note-1',
        tags: ['rust-updated', '标签']
      })
    );
    expect(wrapper.get('.note-editor-footer-tags').text()).toContain('#rust-updated');
    expect(wrapper.get('.note-editor-footer-tags').text()).toContain('#标签');
  });

  // 测试用例：验证「switches between read mode and edit mode from the footer」场景，锁定 Note Editor View 的用户可见行为。
  it('switches between read mode and edit mode from the footer', async () => {
    // 局部常量 wrapper：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
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

  // 测试用例：验证「opens the floating outline and routes zen back to note-editor」场景，锁定 Note Editor View 的用户可见行为。
  it('opens the floating outline and routes zen back to note-editor', async () => {
    // 局部常量 wrapper：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const wrapper = mount(WrappedNoteEditorView);
    await flushPromises();

    expect(wrapper.find('[data-testid="note-outline-panel"]').exists()).toBe(false);

    await wrapper.get('[data-testid="note-outline-toggle"]').trigger('click');

    expect(wrapper.find('[data-testid="note-outline-panel"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="note-outline-tree"]').exists()).toBe(true);

    await wrapper.get('[data-testid="note-open-zen"]').trigger('click');

    expect(navigateToZenFromEditor).toHaveBeenCalledWith('note-1');
  });

  // 测试用例：验证「declares readable local colors for the tag editing dialog controls」场景，锁定 Note Editor View 的用户可见行为。
  it('declares readable local colors for the tag editing dialog controls', () => {
    expect(NoteEditorViewSource).toContain('class="note-editor-dialog-cancel"');
    expect(NoteEditorViewSource).toContain('--n-text-color: #2a2a2a');
    expect(NoteEditorViewSource).toContain('--n-placeholder-color: #8a7c70');
    expect(NoteEditorViewSource).toContain('--n-color: #fffdf9');
    expect(NoteEditorViewSource).toContain('-webkit-text-fill-color: #2a2a2a');
    expect(NoteEditorViewSource).toContain('--n-text-color: #6f5c4c');
    expect(NoteEditorViewSource).toContain('--n-color-hover: rgba(55, 46, 36, 0.08)');
  });

  // 测试用例：验证「declares readable text colors for the light workbench editor surface」场景，锁定 Note Editor View 的用户可见行为。
  it('declares readable text colors for the light workbench editor surface', () => {
    expect(NoteEditorViewSource).toContain('class="note-editor-meta-text"');
    expect(NoteEditorViewSource).toContain('class="note-editor-back-button"');
    expect(NoteEditorViewSource).toMatch(/color: #5f564d(?: !important)?;/);
    expect(NoteEditorViewSource).toMatch(/color: #6f5c4c(?: !important)?;/);
    expect(NoteEditorViewSource).toContain('caret-color: #2a2a2a;');
    expect(NoteEditorViewSource).toMatch(/color: #7e7469(?: !important)?;/);
  });

  // 测试用例：验证「fixes the header/footer and anchors the outline panel above its toggle」场景，锁定 Note Editor View 的用户可见行为。
  it('fixes the header/footer and anchors the outline panel above its toggle', () => {
    // 顶/底栏不随内容滚动：根容器定高 + 头尾栏不收缩
    expect(NoteEditorViewSource).toMatch(/\.note-editor-root\s*\{[^}]*height: 100%;/);
    expect(NoteEditorViewSource).toMatch(/\.note-editor-header\s*\{[^}]*flex-shrink: 0;/);
    expect(NoteEditorViewSource).toMatch(/\.note-editor-footer\s*\{[^}]*flex-shrink: 0;/);
    // 大纲面板锚定在 FAB 上方（bottom 对齐），不再固定在文档开头（top:18px）
    expect(NoteEditorViewSource).toMatch(/\.note-editor-outline-panel\s*\{[^}]*bottom: 72px;/);
    expect(NoteEditorViewSource).not.toMatch(/\.note-editor-outline-panel\s*\{[^}]*top: 18px;/);
  });

  it.skip('renders the lifted rounded editor card shell for the main editor', async () => {
    // 局部常量 wrapper：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const wrapper = mount(WrappedNoteEditorView);
    await flushPromises();

    expect(wrapper.find('[data-testid="note-editor-shell"]').exists()).toBe(true);
    expect(NoteEditorViewSource).toContain('data-testid="note-editor-shell"');
    expect(NoteEditorViewSource).toContain('border-radius: 18px 18px 14px 14px;');
  });

  // 测试用例：验证「saves a new workspace-backed entry as a document when no note id is present」场景，锁定 Note Editor View 的用户可见行为。
  it('saves a new workspace-backed entry as a document when no note id is present', async () => {
    uiNoteId = null;

    // 局部常量 wrapper：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const wrapper = mount(WrappedNoteEditorView);
    await flushPromises();

    await wrapper.find('textarea').setValue('新的文档正文');

    expect(saveDocumentEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'workspace-1',
        folderEntryId: null,
        content: '新的文档正文'
      })
    );
    expect(saveDraft).not.toHaveBeenCalled();
  });
});
