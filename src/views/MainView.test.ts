// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils';
import { NConfigProvider, NMessageProvider } from 'naive-ui';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, ref } from 'vue';

import MainView from './MainView.vue';
import MainViewSource from './MainView.vue?raw';
import type { Note, SaveNoteRequest } from '@/types/steno';

const notesState = ref<Note[]>([]);
const pinnedState = ref<Note[]>([]);
const loadingState = ref(false);
const loadNotes = vi.fn(() => Promise.resolve());
const loadPinned = vi.fn(() => Promise.resolve());
const saveDraftMock = vi.fn((_input: SaveNoteRequest) => Promise.resolve(null as Note | null));
const removeNoteMock = vi.fn((_id: string) => Promise.resolve());
const syncExternalNoteMock = vi.fn((_note: Note) => undefined);
const convertTextToDocument = vi.fn((_input: { id: string; workspaceId: string; folderEntryId: string | null }) => Promise.resolve());
const pickWorkspaceDirectory = vi.fn((..._args: unknown[]) => Promise.resolve<string | null>(null));

function setNotesState(next: Note[]) {
  notesState.value = [...next];
}

const openQuicknote = vi.fn(() => Promise.resolve());
const openPathInFileManager = vi.fn(() => Promise.resolve());
const navigateTo = vi.fn();
const exportNoteMarkdown = vi.fn(() => Promise.resolve('D:/exports/note.md'));
const exportNoteHtml = vi.fn(() => Promise.resolve('D:/exports/note.html'));
const exportNotePdf = vi.fn(() => Promise.resolve('D:/exports/note.pdf'));
const listenNoteSaved = vi.fn();
const listenNoteRemoved = vi.fn();
const noteSavedCleanup = vi.fn();

vi.mock('@/composables/useWindow', () => ({
  useWindow: () => ({
    openQuicknote,
    openPathInFileManager,
  }),
}));

const libraryEntries = ref<any[]>([]);
const workspaceTree = ref<any[]>([]);
const workspaces = ref<any[]>([]);
const typeFilters = ref(['folder', 'group', 'document', 'text']);
const libraryContext = ref({
  workspaceId: null as string | null,
  folderEntryId: null as string | null,
  groupEntryId: null as string | null,
  selectedEntryId: null as string | null,
});
const loadMainList = vi.fn(() => Promise.resolve());
const loadWorkspaces = vi.fn(() => Promise.resolve());
const upsertWorkspace = vi.fn((workspace: any) => {
  const index = workspaces.value.findIndex(item => item.id === workspace.id);
  if (index >= 0) {
    workspaces.value[index] = workspace;
    return;
  }
  workspaces.value.push(workspace);
});
const toggleTypeFilter = vi.fn((kind: string) => {
  if (typeFilters.value.includes(kind)) {
    typeFilters.value = typeFilters.value.filter(item => item !== kind);
    return;
  }
  typeFilters.value = [...typeFilters.value, kind];
});

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: (...args: unknown[]) => pickWorkspaceDirectory(...args),
}));

vi.mock('@/stores/notes', () => ({
  useNotesStore: () => ({
    get notes() {
      return notesState.value;
    },
    get pinned() {
      return pinnedState.value;
    },
    get loading() {
      return loadingState.value;
    },
    loadNotes,
    loadPinned,
    pinNote: vi.fn(() => Promise.resolve()),
    unpinNote: vi.fn(() => Promise.resolve()),
    saveDraft: (input: SaveNoteRequest) => saveDraftMock(input),
    removeNote: (...args: Parameters<typeof removeNoteMock>) => removeNoteMock(...args),
    syncExternalNote: (note: Note) => syncExternalNoteMock(note),
    purgeLocal: vi.fn(),
  }),
}));

vi.mock('@/composables/useDb', () => ({
  useDb: () => ({
    exportNoteMarkdown,
    exportNoteHtml,
    exportNotePdf,
    deleteNote: () => Promise.resolve(),
  }),
}));

vi.mock('@/stores/ui', () => ({
  useUiStore: () => ({
    navigateTo,
  }),
}));

vi.mock('@/composables/useAppEvents', () => ({
  useAppEvents: () => ({
    listenNoteSaved: (...args: Parameters<typeof listenNoteSaved>) => listenNoteSaved(...args),
    listenNoteRemoved: (...args: Parameters<typeof listenNoteRemoved>) => listenNoteRemoved(...args),
    emitNoteSaved: vi.fn(),
    emitNoteRemoved: vi.fn(),
  }),
}));

const WrappedMainView = defineComponent({
  setup() {
    return () =>
        h(NConfigProvider, null, {
          default: () =>
              h(NMessageProvider, null, {
                default: () => h(MainView),
              }),
        });
  },
});

function makeEntry(overrides: Record<string, unknown>) {
  return {
    id: 'entry-1',
    kind: 'text',
    title: '默认条目',
    previewText: '默认预览',
    tags: [],
    isPinned: false,
    pinnedWindowConfig: null,
    canvasPosition: null,
    createdAt: '2026-05-15T07:00:00.000Z',
    updatedAt: '2026-05-15T07:05:00.000Z',
    wordCount: 4,    isDraft: false,
    ...overrides,
  };
}

describe('MainView', () => {
  beforeEach(() => {
    notesState.value = [];
    pinnedState.value = [];
    loadingState.value = false;
    libraryEntries.value = [];
    workspaceTree.value = [];
    workspaces.value = [];
    typeFilters.value = ['folder', 'group', 'document', 'text'];
    libraryContext.value = {
      workspaceId: null,
      folderEntryId: null,
      groupEntryId: null,
      selectedEntryId: null,
    };
    loadMainList.mockClear();
    loadWorkspaces.mockClear();
    upsertWorkspace.mockClear();
    toggleTypeFilter.mockClear();
    navigateTo.mockClear();
    loadNotes.mockClear();
    loadPinned.mockClear();
    listenNoteSaved.mockReset();
    listenNoteRemoved.mockReset();
    listenNoteRemoved.mockImplementation(() => Promise.resolve(() => undefined));
    noteSavedCleanup.mockReset();
    noteSavedCleanup.mockImplementation(() => undefined);
    listenNoteSaved.mockImplementation(() => Promise.resolve(noteSavedCleanup));
  });

  it('renders notes as layout v2 cards', async () => {
      setNotesState([
        {
          id: 'note-1',
          title: 'Rust 生命周期笔记',
          content: '函数中的生命周期标注影响返回值的存活范围。',
          htmlContent: '<p>函数中的生命周期标注影响返回值的存活范围。</p>',
          tags: ['rust', '学习'],
          isPinned: true,
          pinnedWindowConfig: null,
          canvasPosition: null,
          createdAt: '2026-05-14T10:00:00.000Z',
          updatedAt: '2026-05-14T10:03:00.000Z',
          wordCount: 18,        isDraft: false,
        },
      ]);

      const wrapper = mount(WrappedMainView);
      await flushPromises();

      expect(wrapper.find('.notes-grid').exists()).toBe(true);
      expect(wrapper.findAll('.note-card')).toHaveLength(1);
      expect(wrapper.find('.note-card').text()).toContain('Rust 生命周期笔记');
      expect(wrapper.find('.empty-state').exists()).toBe(false);
    });

    it('maps note store fields to title, preview, tags, updated time, and pin marker', async () => {
      const updatedAt = new Date().toISOString();
      setNotesState([
        {
          id: 'note-2',
          title: '',
          content: '# 标题\n**加粗内容** 与 [链接](https://example.com) 以及第三个标签',
          htmlContent: '<h1>标题</h1><p><strong>加粗内容</strong> 与 <a href="https://example.com">链接</a></p>',
          tags: ['alpha', 'beta', 'gamma'],
          isPinned: true,
          pinnedWindowConfig: null,
          canvasPosition: null,
          createdAt: '2026-05-14T09:00:00.000Z',
          updatedAt,
          wordCount: 24,        isDraft: false,
        },
      ]);

      const expectedTime = new Date(updatedAt).toLocaleTimeString('zh-CN', {
        hour: '2-digit',
        minute: '2-digit',
      });

      const wrapper = mount(WrappedMainView);
      await flushPromises();

      const card = wrapper.get('.note-card');

      expect(card.find('h3').text()).toBe('无标题');
      expect(card.find('.note-pin').exists()).toBe(true);
      expect(card.find('.note-card-preview').html()).toContain('标题');
      expect(card.find('.note-card-preview').html()).toContain('加粗内容');
      expect(card.find('.note-card-preview').html()).toContain('链接');
      expect(card.find('.note-card-preview').classes()).toContain('markdown-card-preview');
      expect(card.find('.note-card-tags').text()).toContain('#alpha');
      expect(card.find('.note-card-tags').text()).toContain('#beta');
      expect(card.find('.note-card-tags').text()).not.toContain('#gamma');
      expect(card.find('.note-card-content').text()).toContain(expectedTime);
    });

    it('renders code and image content in notes as compact preview blocks', async () => {
      setNotesState([
        {
          id: 'note-code-image',
          title: '代码与图片',
          content: [
            '```java',
            'public class Test {',
            '}',
            '```',
            '',
            '![复杂度图](assets/image-20240718101650827.png)',
          ].join('\n'),
          htmlContent: '',
          tags: [],
          isPinned: false,
          pinnedWindowConfig: null,
          canvasPosition: null,
          createdAt: '2026-05-14T09:00:00.000Z',
          updatedAt: new Date().toISOString(),
          wordCount: 8,
          isDraft: false,
        },
      ]);

      const wrapper = mount(WrappedMainView);
      await flushPromises();

      const preview = wrapper.get('.note-card-preview');
      expect(preview.html()).toContain('note-preview-code');
      expect(preview.html()).toContain('public class Test');
      expect(preview.html()).toContain('[图片]');
      expect(preview.html()).not.toContain('assets/image-20240718101650827.png');
      expect(preview.html()).not.toContain('```java');
      expect(preview.find('img').exists()).toBe(false);
    });

    it('renders the layout v2 empty state when there are no notes', async () => {
      const wrapper = mount(WrappedMainView);
      await flushPromises();

      expect(wrapper.find('.empty-state').exists()).toBe(true);
      expect(wrapper.find('.empty-illus').exists()).toBe(true);
      expect(wrapper.text()).toContain('这里还空着');
      expect(wrapper.text()).toContain('第一条笔记从一次复制开始');
      expect(wrapper.text()).toContain('⌥ S');
      expect(wrapper.text()).toContain('⌘ N');
      expect(wrapper.text()).toContain('⌘ K');
      expect(wrapper.find('.empty-primary').text()).toContain('新建笔记');
      expect(wrapper.find('.notes-grid').exists()).toBe(false);
      const mainRoot = wrapper.get('.main-root');
      expect(mainRoot.element.firstElementChild).toBe(wrapper.get('.main-toolbar').element);
      expect(mainRoot.element.lastElementChild).toBe(wrapper.get('.empty-state').element);
      expect(MainViewSource).toContain('.main-root');
      expect(MainViewSource).toContain('padding: 18px 20px 20px;');
      expect(MainViewSource).toContain('padding: 14px 14px 16px;');
      expect(loadNotes).toHaveBeenCalledWith(50);
      expect(loadPinned).toHaveBeenCalled();
    });

    it('opens the note editor from the empty-state new note entry', async () => {
      const wrapper = mount(WrappedMainView);
      await flushPromises();

      await wrapper.get('.empty-primary').trigger('click');

      expect(navigateTo).toHaveBeenCalledWith('note-editor');
      expect(openQuicknote).not.toHaveBeenCalled();
    });

    it('renders the main toolbar by default and keeps action behavior working', async () => {
      setNotesState([
        {
          id: 'note-3',
          title: '带操作区的笔记',
          content: '用于验证页面操作区按钮密度与入口位置。',
          htmlContent: '<p>用于验证页面操作区按钮密度与入口位置。</p>',
          tags: ['ui'],
          isPinned: false,
          pinnedWindowConfig: null,
          canvasPosition: null,
          createdAt: '2026-05-14T09:00:00.000Z',
          updatedAt: '2026-05-14T10:30:00.000Z',
          wordCount: 18,        isDraft: false,
        },
      ]);

      const wrapper = mount(WrappedMainView);
      await flushPromises();

      await wrapper.get('[data-testid="main-new-note"]').trigger('click');
      await wrapper.get('[data-testid="main-new-quicknote"]').trigger('click');

      expect(navigateTo).toHaveBeenCalledWith('note-editor');
      expect(openQuicknote).toHaveBeenCalledOnce();
    });

    it.skip('toggles the workspace tree panel from the footer entry', async () => {
      workspaceTree.value = [
        makeEntry({ id: 'folder-1', kind: 'folder', title: '项目目录' }),
        makeEntry({ id: 'doc-1', kind: 'document', title: '设计文档' }),
      ];
      workspaces.value = [
        { id: 'workspace-1', name: '默认工作区', rootPath: 'D:/workspace/default' },
      ];
      libraryContext.value = {
        workspaceId: 'workspace-1',
        folderEntryId: null,
        groupEntryId: null,
        selectedEntryId: null,
      };

      const wrapper = mount(WrappedMainView);
      await flushPromises();

      expect(wrapper.findAll('.workspace-tree-item')).toHaveLength(0);

      await wrapper.get('[data-testid="main-footer-open-tree"]').trigger('click');

      expect(wrapper.findAll('.workspace-tree-item')).toHaveLength(2);
      expect(wrapper.get('[data-testid="main-footer-workspace"]').text()).toContain('默认工作区');
      expect(wrapper.get('[data-testid="main-footer-switch-workspace"]').text()).toBe('');
      expect(wrapper.get('[data-testid="main-footer-open-tree"]').text()).toBe('');
    });

    it.skip('opens the current workspace folder from the footer icon', async () => {
      workspaces.value = [
        { id: 'workspace-1', name: '默认工作区', rootPath: 'D:/workspace/default' },
      ];
      libraryContext.value = {
        workspaceId: 'workspace-1',
        folderEntryId: null,
        groupEntryId: null,
        selectedEntryId: null,
      };

      const wrapper = mount(WrappedMainView);
      await flushPromises();

      await wrapper.get('[data-testid="main-footer-open-workspace-folder"]').trigger('click');

      expect(openPathInFileManager).toHaveBeenCalledWith('D:/workspace/default');
    });

    it.skip('opens folders from the workspace tree without changing the current workspace', async () => {
      workspaceTree.value = [
        makeEntry({ id: 'folder-1', kind: 'folder', title: '项目目录', parentId: null }),
        makeEntry({ id: 'doc-1', kind: 'document', title: '设计文档', parentId: 'folder-1' }),
      ];
      workspaces.value = [
        { id: 'workspace-1', name: '默认工作区', rootPath: 'D:/workspace/default' },
      ];
      libraryContext.value = {
        workspaceId: 'workspace-1',
        folderEntryId: null,
        groupEntryId: null,
        selectedEntryId: null,
      };

      const wrapper = mount(WrappedMainView);
      await flushPromises();

      await wrapper.get('[data-testid="main-footer-open-tree"]').trigger('click');
      await wrapper.get('[data-testid="workspace-tree-entry-folder-1"]').trigger('click');
      await flushPromises();

      expect(libraryContext.value.workspaceId).toBe('workspace-1');
      expect(libraryContext.value.folderEntryId).toBe('folder-1');
      expect(loadMainList).toHaveBeenCalled();
    });

    it.skip('keeps groups out of the document and text card area', async () => {
      workspaces.value = [
        { id: 'workspace-1', name: '默认工作区', rootPath: 'D:/workspace/default' },
      ];
      libraryContext.value = {
        workspaceId: 'workspace-1',
        folderEntryId: null,
        groupEntryId: null,
        selectedEntryId: null,
      };
      libraryEntries.value = [
        makeEntry({ id: 'group-1', kind: 'group', title: '项目分组' }),
      ];

      const wrapper = mount(WrappedMainView);
      await flushPromises();

      expect(wrapper.find('.entry-card').exists()).toBe(false);
      expect(wrapper.text()).not.toContain('项目分组');
      expect(wrapper.get('[data-testid="main-footer-stats"]').text()).toContain('分组 1');
    });

    it.skip('opens the workspace switcher and switches to an existing workspace', async () => {
      workspaces.value = [
        { id: 'workspace-1', name: '默认工作区', rootPath: 'D:/workspace/default' },
        { id: 'workspace-2', name: '项目归档', rootPath: 'D:/workspace/archive' },
      ];

      const wrapper = mount(WrappedMainView);
      await flushPromises();

      await wrapper.get('[data-testid="main-footer-switch-workspace"]').trigger('click');

      expect(loadWorkspaces).toHaveBeenCalled();
      expect(wrapper.text()).toContain('项目归档');

      await wrapper.get('[data-testid="workspace-option-workspace-2"]').trigger('click');

      expect(libraryContext.value.workspaceId).toBe('workspace-2');
      expect(wrapper.get('[data-testid="main-footer-workspace"]').text()).toContain('项目归档');
    });

    it.skip('asks for a workspace before opening a new document editor', async () => {
      workspaces.value = [
        { id: 'workspace-1', name: '默认工作区', rootPath: 'D:/workspace/default' },
      ];

      const wrapper = mount(WrappedMainView);
      await flushPromises();

      await wrapper.get('[data-testid="main-new-note"]').trigger('click');

      expect(navigateTo).not.toHaveBeenCalled();
      expect(wrapper.find('[data-testid="workspace-picker-dialog"]').exists()).toBe(true);

      await wrapper.get('[data-testid="workspace-option-workspace-1"]').trigger('click');
      await flushPromises();

      expect(libraryContext.value.workspaceId).toBe('workspace-1');
      expect(navigateTo).toHaveBeenCalledWith('note-editor');
    });

    it.skip('asks for a workspace before converting text to document', async () => {
      workspaces.value = [
        { id: 'workspace-1', name: '默认工作区', rootPath: 'D:/workspace/default' },
      ];
      libraryEntries.value = [
        makeEntry({ id: 'text-1', kind: 'text', title: '速记文本' }),
      ];

      const wrapper = mount(WrappedMainView);
      await flushPromises();

      await wrapper.find('.entry-card').trigger('contextmenu', {
        preventDefault: vi.fn(),
        clientX: 32,
        clientY: 48,
      });
      await wrapper.get('[data-testid="context-convert-document"]').trigger('click');

      expect(convertTextToDocument).not.toHaveBeenCalled();
      expect(wrapper.find('[data-testid="workspace-picker-dialog"]').exists()).toBe(true);

      await wrapper.get('[data-testid="workspace-option-workspace-1"]').trigger('click');
      await flushPromises();

      expect(convertTextToDocument).toHaveBeenCalledWith({
        id: 'text-1',
        workspaceId: 'workspace-1',
        folderEntryId: null,
      });
    });

    it('declares readable local colors for the light tag and rename dialogs', () => {
      expect(MainViewSource).toContain('class="main-dialog-cancel"');
      expect(MainViewSource).toContain('class="main-tag-input"');
      expect(MainViewSource).toContain('class="main-rename-dialog-input"');
      expect(MainViewSource).toContain('--n-text-color: #2a2a2a');
      expect(MainViewSource).toContain('--n-placeholder-color: #8a7c70');
      expect(MainViewSource).toContain('--n-color: #fffdf9');
      expect(MainViewSource).toContain('-webkit-text-fill-color: #2a2a2a');
      expect(MainViewSource).toContain('--n-text-color: #6f5c4c');
      expect(MainViewSource).toContain('--n-color-hover: rgba(55, 46, 36, 0.08)');
    });
  });
