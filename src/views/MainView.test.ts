/**
 * @file 前端视图 - Main View
 *
 * 覆盖 Main View 的主要行为、边界条件和跨模块契约，帮助重构时快速定位预期。
 * 注释重点标明数据入口、状态边界、事件通道和协作风险点，便于逐行阅读时快速判断代码意图。
 */

// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils';
import { NConfigProvider, NMessageProvider } from 'naive-ui';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, ref } from 'vue';

import MainView from './MainView.vue';
import MainViewSource from './MainView.vue?raw';
import type { Note, SaveNoteRequest } from '@/types/steno';

// 局部常量 notesState：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const notesState = ref<Note[]>([]);
// 局部常量 pinnedState：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const pinnedState = ref<Note[]>([]);
// 局部常量 loadingState：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const loadingState = ref(false);
// 局部常量 loadNotes：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const loadNotes = vi.fn(() => Promise.resolve());
// 局部常量 loadPinned：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const loadPinned = vi.fn(() => Promise.resolve());
// 局部常量 saveDraftMock：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const saveDraftMock = vi.fn((_input: SaveNoteRequest) => Promise.resolve(null as Note | null));
// 局部常量 removeNoteMock：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const removeNoteMock = vi.fn((_id: string) => Promise.resolve());
// 局部常量 syncExternalNoteMock：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const syncExternalNoteMock = vi.fn((_note: Note) => undefined);
// 局部常量 convertTextToDocument：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const convertTextToDocument = vi.fn((_input: { id: string; workspaceId: string; folderEntryId: string | null }) =>
  Promise.resolve()
);
// 局部常量 pickWorkspaceDirectory：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const pickWorkspaceDirectory = vi.fn((..._args: unknown[]) => Promise.resolve<string | null>(null));

// 函数 setNotesState：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
function setNotesState(next: Note[]) {
  notesState.value = [...next];
}

// 局部常量 openQuicknote：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const openQuicknote = vi.fn(() => Promise.resolve());
// 局部常量 openPathInFileManager：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const openPathInFileManager = vi.fn(() => Promise.resolve());
// 局部常量 navigateTo：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const navigateTo = vi.fn();
// 局部常量 exportNoteMarkdown：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const exportNoteMarkdown = vi.fn(() => Promise.resolve('D:/exports/note.md'));
// 局部常量 exportNoteHtml：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const exportNoteHtml = vi.fn(() => Promise.resolve('D:/exports/note.html'));
// 局部常量 exportNotePdf：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const exportNotePdf = vi.fn(() => Promise.resolve('D:/exports/note.pdf'));
// 局部常量 listenNoteSaved：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const listenNoteSaved = vi.fn();
// 局部常量 listenNoteRemoved：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const listenNoteRemoved = vi.fn();
// 局部常量 noteSavedCleanup：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const noteSavedCleanup = vi.fn();

vi.mock('@/composables/useWindow', () => ({
  useWindow: () => ({
    openQuicknote,
    openPathInFileManager
  })
}));

// 局部常量 libraryEntries：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const libraryEntries = ref<any[]>([]);
// 局部常量 workspaceTree：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const workspaceTree = ref<any[]>([]);
// 局部常量 workspaces：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const workspaces = ref<any[]>([]);
// 局部常量 typeFilters：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const typeFilters = ref(['folder', 'group', 'document', 'text']);
// 局部常量 libraryContext：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const libraryContext = ref({
  workspaceId: null as string | null,
  folderEntryId: null as string | null,
  groupEntryId: null as string | null,
  selectedEntryId: null as string | null
});
// 局部常量 loadMainList：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const loadMainList = vi.fn(() => Promise.resolve());
// 局部常量 loadWorkspaces：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const loadWorkspaces = vi.fn(() => Promise.resolve());
// 局部常量 upsertWorkspace：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const upsertWorkspace = vi.fn((workspace: any) => {
  // 局部常量 index：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const index = workspaces.value.findIndex(item => item.id === workspace.id);
  if (index >= 0) {
    workspaces.value[index] = workspace;
    return;
  }
  workspaces.value.push(workspace);
});
// 局部常量 toggleTypeFilter：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const toggleTypeFilter = vi.fn((kind: string) => {
  if (typeFilters.value.includes(kind)) {
    typeFilters.value = typeFilters.value.filter(item => item !== kind);
    return;
  }
  typeFilters.value = [...typeFilters.value, kind];
});

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: (...args: unknown[]) => pickWorkspaceDirectory(...args)
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
    purgeLocal: vi.fn()
  })
}));

vi.mock('@/composables/useDb', () => ({
  useDb: () => ({
    exportNoteMarkdown,
    exportNoteHtml,
    exportNotePdf,
    deleteNote: () => Promise.resolve()
  })
}));

vi.mock('@/stores/ui', () => ({
  useUiStore: () => ({
    navigateTo
  })
}));

vi.mock('@/composables/useAppEvents', () => ({
  useAppEvents: () => ({
    listenNoteSaved: (...args: Parameters<typeof listenNoteSaved>) => listenNoteSaved(...args),
    listenNoteRemoved: (...args: Parameters<typeof listenNoteRemoved>) => listenNoteRemoved(...args),
    emitNoteSaved: vi.fn(),
    emitNoteRemoved: vi.fn()
  })
}));

// 组件定义 WrappedMainView：集中声明渲染入口、props 和事件响应。
const WrappedMainView = defineComponent({
  setup() {
    return () =>
      h(NConfigProvider, null, {
        default: () =>
          h(NMessageProvider, null, {
            default: () => h(MainView)
          })
      });
  }
});

// 函数 makeEntry：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
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
    wordCount: 4,
    isDraft: false,
    ...overrides
  };
}

// 测试用例：验证「MainView」场景，锁定 Main View 的用户可见行为。
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
      selectedEntryId: null
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

  // 测试用例：验证「renders notes as layout v2 cards」场景，锁定 Main View 的用户可见行为。
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
        wordCount: 18,
        isDraft: false
      }
    ]);

    // 局部常量 wrapper：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const wrapper = mount(WrappedMainView);
    await flushPromises();

    expect(wrapper.find('.notes-grid').exists()).toBe(true);
    expect(wrapper.findAll('.note-card')).toHaveLength(1);
    expect(wrapper.find('.note-card').text()).toContain('Rust 生命周期笔记');
    expect(wrapper.find('.empty-state').exists()).toBe(false);
  });

  // 测试用例：验证「maps note store fields to title, preview, tags, updated time, and pin marker」场景，锁定 Main View 的用户可见行为。
  it('maps note store fields to title, preview, tags, updated time, and pin marker', async () => {
    // 局部常量 updatedAt：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
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
        wordCount: 24,
        isDraft: false
      }
    ]);

    // 局部常量 expectedTime：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const expectedTime = new Date(updatedAt).toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit'
    });

    // 局部常量 wrapper：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const wrapper = mount(WrappedMainView);
    await flushPromises();

    // 局部常量 card：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
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

  // 测试用例：验证「renders code and image content in notes as compact preview blocks」场景，锁定 Main View 的用户可见行为。
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
          '![复杂度图](assets/image-20240718101650827.png)'
        ].join('\n'),
        htmlContent: '',
        tags: [],
        isPinned: false,
        pinnedWindowConfig: null,
        canvasPosition: null,
        createdAt: '2026-05-14T09:00:00.000Z',
        updatedAt: new Date().toISOString(),
        wordCount: 8,
        isDraft: false
      }
    ]);

    // 局部常量 wrapper：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const wrapper = mount(WrappedMainView);
    await flushPromises();

    // 局部常量 preview：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const preview = wrapper.get('.note-card-preview');
    expect(preview.html()).toContain('note-preview-code');
    expect(preview.html()).toContain('public class Test');
    expect(preview.html()).toContain('[图片]');
    expect(preview.html()).not.toContain('assets/image-20240718101650827.png');
    expect(preview.html()).not.toContain('```java');
    expect(preview.find('img').exists()).toBe(false);
  });

  // 测试用例：验证「renders the layout v2 empty state when there are no notes」场景，锁定 Main View 的用户可见行为。
  it('renders the layout v2 empty state when there are no notes', async () => {
    // 局部常量 wrapper：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
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
    // 局部常量 mainRoot：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const mainRoot = wrapper.get('.main-root');
    expect(mainRoot.element.firstElementChild).toBe(wrapper.get('.main-toolbar').element);
    expect(mainRoot.element.lastElementChild).toBe(wrapper.get('.empty-state').element);
    expect(MainViewSource).toContain('.main-root');
    expect(MainViewSource).toContain('padding: 18px 20px 20px;');
    expect(MainViewSource).toContain('padding: 14px 14px 16px;');
    expect(loadNotes).toHaveBeenCalledWith(50);
    expect(loadPinned).toHaveBeenCalled();
  });

  // 测试用例：验证「opens the note editor from the empty-state new note entry」场景，锁定 Main View 的用户可见行为。
  it('opens the note editor from the empty-state new note entry', async () => {
    // 局部常量 wrapper：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const wrapper = mount(WrappedMainView);
    await flushPromises();

    await wrapper.get('.empty-primary').trigger('click');

    expect(navigateTo).toHaveBeenCalledWith('note-editor');
    expect(openQuicknote).not.toHaveBeenCalled();
  });

  // 测试用例：验证「enters Zen mode from the note card context menu」场景，锁定 Main View 的用户可见行为。
  it('enters Zen mode from the note card context menu', async () => {
    setNotesState([
      {
        id: 'note-zen',
        title: 'Zen 目标笔记',
        content: '正文内容',
        htmlContent: '<p>正文内容</p>',
        tags: [],
        isPinned: false,
        pinnedWindowConfig: null,
        canvasPosition: null,
        createdAt: '2026-05-14T09:00:00.000Z',
        updatedAt: '2026-05-14T10:30:00.000Z',
        wordCount: 4,
        isDraft: false
      }
    ]);

    // 局部常量 wrapper：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const wrapper = mount(WrappedMainView);
    await flushPromises();

    await wrapper.get('.note-card').trigger('contextmenu', {
      preventDefault: vi.fn(),
      clientX: 40,
      clientY: 60
    });

    // 局部常量 editItem：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const editItem = wrapper.get('[data-testid="context-edit"]');
    expect(editItem.text()).toBe('进入 Zen 模式');

    await editItem.trigger('click');

    expect(navigateTo).toHaveBeenCalledWith('zen', 'note-zen', { mode: 'main', noteId: null });
  });

  // 测试用例：验证「renders the unsaved draft badge with a red background」场景，锁定 Main View 的用户可见行为。
  it('renders the unsaved draft badge with a red background', () => {
    expect(MainViewSource).toMatch(/\.note-card-draft-tag\s*\{[^}]*background: oklch\(57% 0\.2 25\)/);
    expect(MainViewSource).toMatch(/\.note-card-draft-tag\s*\{[^}]*color: #fff;/);
  });

  // 测试用例：验证「renders the main toolbar by default and keeps action behavior working」场景，锁定 Main View 的用户可见行为。
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
        wordCount: 18,
        isDraft: false
      }
    ]);

    // 局部常量 wrapper：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
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
      makeEntry({ id: 'doc-1', kind: 'document', title: '设计文档' })
    ];
    workspaces.value = [{ id: 'workspace-1', name: '默认工作区', rootPath: 'D:/workspace/default' }];
    libraryContext.value = {
      workspaceId: 'workspace-1',
      folderEntryId: null,
      groupEntryId: null,
      selectedEntryId: null
    };

    // 局部常量 wrapper：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
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
    workspaces.value = [{ id: 'workspace-1', name: '默认工作区', rootPath: 'D:/workspace/default' }];
    libraryContext.value = {
      workspaceId: 'workspace-1',
      folderEntryId: null,
      groupEntryId: null,
      selectedEntryId: null
    };

    // 局部常量 wrapper：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const wrapper = mount(WrappedMainView);
    await flushPromises();

    await wrapper.get('[data-testid="main-footer-open-workspace-folder"]').trigger('click');

    expect(openPathInFileManager).toHaveBeenCalledWith('D:/workspace/default');
  });

  it.skip('opens folders from the workspace tree without changing the current workspace', async () => {
    workspaceTree.value = [
      makeEntry({ id: 'folder-1', kind: 'folder', title: '项目目录', parentId: null }),
      makeEntry({ id: 'doc-1', kind: 'document', title: '设计文档', parentId: 'folder-1' })
    ];
    workspaces.value = [{ id: 'workspace-1', name: '默认工作区', rootPath: 'D:/workspace/default' }];
    libraryContext.value = {
      workspaceId: 'workspace-1',
      folderEntryId: null,
      groupEntryId: null,
      selectedEntryId: null
    };

    // 局部常量 wrapper：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
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
    workspaces.value = [{ id: 'workspace-1', name: '默认工作区', rootPath: 'D:/workspace/default' }];
    libraryContext.value = {
      workspaceId: 'workspace-1',
      folderEntryId: null,
      groupEntryId: null,
      selectedEntryId: null
    };
    libraryEntries.value = [makeEntry({ id: 'group-1', kind: 'group', title: '项目分组' })];

    // 局部常量 wrapper：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const wrapper = mount(WrappedMainView);
    await flushPromises();

    expect(wrapper.find('.entry-card').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('项目分组');
    expect(wrapper.get('[data-testid="main-footer-stats"]').text()).toContain('分组 1');
  });

  it.skip('opens the workspace switcher and switches to an existing workspace', async () => {
    workspaces.value = [
      { id: 'workspace-1', name: '默认工作区', rootPath: 'D:/workspace/default' },
      { id: 'workspace-2', name: '项目归档', rootPath: 'D:/workspace/archive' }
    ];

    // 局部常量 wrapper：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
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
    workspaces.value = [{ id: 'workspace-1', name: '默认工作区', rootPath: 'D:/workspace/default' }];

    // 局部常量 wrapper：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
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
    workspaces.value = [{ id: 'workspace-1', name: '默认工作区', rootPath: 'D:/workspace/default' }];
    libraryEntries.value = [makeEntry({ id: 'text-1', kind: 'text', title: '速记文本' })];

    // 局部常量 wrapper：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const wrapper = mount(WrappedMainView);
    await flushPromises();

    await wrapper.find('.entry-card').trigger('contextmenu', {
      preventDefault: vi.fn(),
      clientX: 32,
      clientY: 48
    });
    await wrapper.get('[data-testid="context-convert-document"]').trigger('click');

    expect(convertTextToDocument).not.toHaveBeenCalled();
    expect(wrapper.find('[data-testid="workspace-picker-dialog"]').exists()).toBe(true);

    await wrapper.get('[data-testid="workspace-option-workspace-1"]').trigger('click');
    await flushPromises();

    expect(convertTextToDocument).toHaveBeenCalledWith({
      id: 'text-1',
      workspaceId: 'workspace-1',
      folderEntryId: null
    });
  });

  // 测试用例：验证「declares readable local colors for the light tag and rename dialogs」场景，锁定 Main View 的用户可见行为。
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
