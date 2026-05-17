// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils';
import { NConfigProvider, NMessageProvider } from 'naive-ui';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { computed, defineComponent, h, ref } from 'vue';

import MainView from './MainView.vue';

const openQuicknote = vi.fn(() => Promise.resolve());
const navigateTo = vi.fn();
const convertTextToDocument = vi.fn(() => Promise.resolve());
const createWorkspace = vi.fn();
const pickWorkspaceDirectory = vi.fn();

vi.mock('@/composables/useWindow', () => ({
  useWindow: () => ({
    openQuicknote,
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

vi.mock('@/stores/library', () => ({
  useLibraryStore: () => ({
    typeFilters,
    visibleEntries: computed(() =>
      libraryEntries.value.filter(entry => typeFilters.value.includes(entry.kind)),
    ),
    workspaceTree: computed(() => workspaceTree.value),
    workspaces: computed(() => workspaces.value),
    context: libraryContext,
    currentWorkspaceLabel: computed(() => {
      const matched = workspaces.value.find(item => item.id === libraryContext.value.workspaceId);
      return matched?.name ?? '';
    }),
    stats: computed(() => ({
      folders: libraryEntries.value.filter(entry => entry.kind === 'folder' && typeFilters.value.includes('folder')).length,
      groups: libraryEntries.value.filter(entry => entry.kind === 'group' && typeFilters.value.includes('group')).length,
      documents: libraryEntries.value.filter(entry => entry.kind === 'document' && typeFilters.value.includes('document')).length,
      texts: libraryEntries.value.filter(entry => entry.kind === 'text' && typeFilters.value.includes('text')).length,
    })),
    loadMainList,
    loadWorkspaces,
    upsertWorkspace,
    toggleTypeFilter,
  }),
}));

vi.mock('@/composables/useDb', () => ({
  useDb: () => ({
    convertTextToDocument,
    createWorkspace,
  }),
}));

vi.mock('@/stores/ui', () => ({
  useUiStore: () => ({
    navigateTo,
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
    ...overrides,
  };
}

describe('MainView', () => {
  beforeEach(() => {
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
    openQuicknote.mockClear();
    convertTextToDocument.mockClear();
    createWorkspace.mockClear();
    pickWorkspaceDirectory.mockReset();
    pickWorkspaceDirectory.mockResolvedValue(null);
  });

  it('renders mixed cards with type badges and current-page footer stats', async () => {
    libraryEntries.value = [
      makeEntry({ id: 'folder-1', kind: 'folder', title: '项目目录' }),
      makeEntry({ id: 'doc-1', kind: 'document', title: '设计文档' }),
      makeEntry({ id: 'group-1', kind: 'group', title: '收件箱' }),
      makeEntry({ id: 'text-1', kind: 'text', title: '速记文本' }),
    ];

    const wrapper = mount(WrappedMainView);
    await flushPromises();

    expect(wrapper.findAll('.entry-card')).toHaveLength(4);
    expect(wrapper.text()).toContain('文件夹');
    expect(wrapper.text()).toContain('文档');
    expect(wrapper.text()).toContain('分组');
    expect(wrapper.text()).toContain('文本');
    expect(wrapper.get('[data-testid="main-footer-stats"]').text()).toContain('文档 1');
    expect(wrapper.get('[data-testid="main-footer-stats"]').text()).toContain('文本 1');
    expect(wrapper.get('[data-testid="main-footer-workspace"]').text()).toContain('未选择工作区');
  });

  it('shows type filter options and re-renders cards with persisted filter choices', async () => {
    libraryEntries.value = [
      makeEntry({ id: 'folder-1', kind: 'folder', title: '项目目录' }),
      makeEntry({ id: 'doc-1', kind: 'document', title: '设计文档' }),
      makeEntry({ id: 'group-1', kind: 'group', title: '收件箱' }),
      makeEntry({ id: 'text-1', kind: 'text', title: '速记文本' }),
    ];

    const wrapper = mount(WrappedMainView);
    await flushPromises();

    await wrapper.get('[data-testid="main-filter-toggle"]').trigger('click');

    expect(wrapper.get('[data-testid="main-type-filter-panel"]').text()).toContain('文件夹');
    expect(wrapper.get('[data-testid="main-type-filter-panel"]').text()).toContain('分组');
    expect(wrapper.get('[data-testid="main-type-filter-panel"]').text()).toContain('文档');
    expect(wrapper.get('[data-testid="main-type-filter-panel"]').text()).toContain('文本');

    await wrapper.get('[data-testid="type-filter-folder"]').trigger('click');
    await flushPromises();

    expect(toggleTypeFilter).toHaveBeenCalledWith('folder');
    expect(wrapper.findAll('.entry-card')).toHaveLength(3);
    expect(wrapper.text()).not.toContain('项目目录');
    expect(wrapper.get('[data-testid="main-footer-stats"]').text()).toContain('文件夹 0');
  });

  it('enables convert-to-document only for text cards', async () => {
    libraryEntries.value = [
      makeEntry({ id: 'doc-1', kind: 'document', title: '设计文档' }),
      makeEntry({ id: 'text-1', kind: 'text', title: '速记文本' }),
    ];

    const wrapper = mount(WrappedMainView);
    await flushPromises();

    await wrapper.findAll('.entry-card')[0].trigger('contextmenu', {
      preventDefault: vi.fn(),
      clientX: 50,
      clientY: 60,
    });
    expect(wrapper.get('[data-testid="context-convert-document"]').attributes('aria-disabled')).toBe('true');

    await wrapper.findAll('.entry-card')[1].trigger('contextmenu', {
      preventDefault: vi.fn(),
      clientX: 50,
      clientY: 60,
    });
    expect(wrapper.get('[data-testid="context-convert-document"]').attributes('aria-disabled')).toBe('false');
  });

  it('keeps toolbar quick actions working', async () => {
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

    await wrapper.get('[data-testid="main-new-note"]').trigger('click');
    await wrapper.get('[data-testid="main-new-quicknote"]').trigger('click');

    expect(navigateTo).toHaveBeenCalledWith('note-editor');
    expect(openQuicknote).toHaveBeenCalledOnce();
  });

  it('toggles the workspace tree panel from the footer entry', async () => {
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
  });

  it('opens folders from the workspace tree without changing the current workspace', async () => {
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

  it('enters a subgroup from the mixed list while keeping the current workspace unchanged', async () => {
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

    await wrapper.find('.entry-card').trigger('click');
    await flushPromises();

    expect(libraryContext.value.workspaceId).toBe('workspace-1');
    expect(libraryContext.value.groupEntryId).toBe('group-1');
    expect(loadMainList).toHaveBeenCalled();
  });

  it('opens the workspace switcher and switches to an existing workspace', async () => {
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

  it('asks for a workspace before opening a new document editor', async () => {
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

  it('asks for a workspace before converting text to document', async () => {
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
});
