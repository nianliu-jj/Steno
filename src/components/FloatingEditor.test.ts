// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils';
import { NConfigProvider, NMessageProvider } from 'naive-ui';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, ref } from 'vue';

import FloatingEditor from './FloatingEditor.vue';

const saveTextEntry = vi.fn(() => Promise.resolve({
  id: 'text-1',
  kind: 'text',
  title: '速记文本',
  previewText: '',
  tags: [],
}));
const hideCurrent = vi.fn(() => Promise.resolve());
const openStickyNote = vi.fn(() => Promise.resolve());

const autosaveStatus = ref<'idle' | 'scheduled' | 'saving' | 'saved' | 'error'>('idle');
const autosaveError = ref<unknown>(null);
const autosaveSavedAt = ref<Date | null>(null);

vi.mock('@/composables/useDb', () => ({
  useDb: () => ({
    saveTextEntry,
  }),
}));

vi.mock('@/stores/library', () => ({
  useLibraryStore: () => ({
    currentGroupId: ref('group-project'),
  }),
}));

vi.mock('@/stores/settings', () => ({
  useSettingsStore: () => ({
    state: {
      blurCloseDelayMs: 800,
    },
  }),
}));

vi.mock('@/composables/useMarkdown', () => ({
  useMarkdown: () => ({
    countWords: (content: string) => content.length,
  }),
}));

vi.mock('@/composables/useWindow', () => ({
  useWindow: () => ({
    hideCurrent,
    openStickyNote,
    startDragCurrent: vi.fn(() => Promise.resolve()),
    onCurrentWindowFocusChange: vi.fn(() => Promise.resolve(() => undefined)),
  }),
}));

vi.mock('@/composables/useAutosave', () => ({
  useAutosave: (saver: (payload: unknown) => Promise<unknown>) => {
    async function runSave(payload: unknown) {
      autosaveStatus.value = 'saving';
      try {
        await saver(payload);
        autosaveStatus.value = 'saved';
        autosaveSavedAt.value = new Date();
        autosaveError.value = null;
      } catch (error) {
        autosaveStatus.value = 'error';
        autosaveError.value = error;
      }
    }

    return {
      status: autosaveStatus,
      savedAt: autosaveSavedAt,
      error: autosaveError,
      scheduleSave: (payload: unknown) => {
        void runSave(payload);
      },
      flushSave: vi.fn(() => Promise.resolve()),
    };
  },
}));

vi.mock('@/components/MarkdownEditor.vue', () => ({
  default: {
    props: ['modelValue'],
    emits: ['update:modelValue'],
    template:
      '<textarea :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
  },
}));

const WrappedFloatingEditor = defineComponent({
  setup() {
    return () =>
      h(NConfigProvider, null, {
        default: () =>
          h(NMessageProvider, null, {
            default: () => h(FloatingEditor),
          }),
      });
  },
});

describe('FloatingEditor', () => {
  beforeEach(() => {
    autosaveStatus.value = 'idle';
    autosaveError.value = null;
    autosaveSavedAt.value = null;
    saveTextEntry.mockReset();
    saveTextEntry.mockResolvedValue({
      id: 'text-1',
      kind: 'text',
      title: '速记文本',
      previewText: '',
      tags: [],
    });
    hideCurrent.mockClear();
    openStickyNote.mockClear();
  });

  it('saves quicknote content through the text-entry command and keeps the group context', async () => {
    const wrapper = mount(WrappedFloatingEditor);
    await wrapper.find('textarea').setValue('今天的记录');
    await flushPromises();

    expect(saveTextEntry).toHaveBeenCalledWith({
      id: undefined,
      title: undefined,
      content: '今天的记录',
      tags: [],
      groupId: 'group-project',
    });
  });

  it('shows the 10KB size error returned by text-entry saving', async () => {
    saveTextEntry.mockRejectedValue(new Error('当前文件大小 11KB，文本文件最大不能超过 10KB'));

    const wrapper = mount(WrappedFloatingEditor);
    await wrapper.find('textarea').setValue('x'.repeat(12 * 1024));
    await flushPromises();

    expect(wrapper.text()).toContain('文本文件最大不能超过 10KB');
  });
});
