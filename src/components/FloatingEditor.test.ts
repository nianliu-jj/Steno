/**
 * @file 前端通用组件 - Floating Editor
 *
 * 覆盖 Floating Editor 的主要行为、边界条件和跨模块契约，帮助重构时快速定位预期。
 * 注释重点标明数据入口、状态边界、事件通道和协作风险点，便于逐行阅读时快速判断代码意图。
 */

// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, nextTick } from 'vue';

import FloatingEditor from './FloatingEditor.vue';

let quicknoteOpenHandler:
  | ((event: {
      payload: {
        fresh: boolean;
        noteId: string | null;
        initialContent?: string | null;
        clipboardContext?: boolean | null;
        clipboardEntryId?: string | null;
      };
    }) => void)
  | undefined;

// 局部常量 saveDraft：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const saveDraft = vi.fn();
// 局部常量 scheduleSave：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const scheduleSave = vi.fn();
// 局部常量 flushSave：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const flushSave = vi.fn(() => Promise.resolve());
// 局部常量 hideCurrent：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const hideCurrent = vi.fn(() => Promise.resolve());
// 局部常量 updateEntry：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const updateEntry = vi.fn(() => Promise.resolve());

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async (event: string, handler: typeof quicknoteOpenHandler) => {
    if (event === 'quicknote:open') quicknoteOpenHandler = handler;
    return () => {
      quicknoteOpenHandler = undefined;
    };
  })
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
          onInput: (event: Event) => emit('update:modelValue', (event.target as HTMLTextAreaElement).value)
        });
    }
  })
}));

vi.mock('@/composables/useAutosave', () => ({
  useAutosave: () => ({
    status: { value: 'idle' },
    savedAt: { value: null },
    error: { value: null },
    scheduleSave,
    flushSave
  })
}));

vi.mock('@/stores/notes', () => ({
  useNotesStore: () => ({
    saveDraft,
    syncExternalNote: vi.fn(),
    unpinNote: vi.fn()
  })
}));

vi.mock('@/stores/clipboard', () => ({
  useClipboardStore: () => ({
    updateEntry
  })
}));

vi.mock('@/stores/settings', () => ({
  useSettingsStore: () => ({
    state: {
      blurCloseDelayMs: 800
    }
  })
}));

vi.mock('@/composables/useWindow', () => ({
  useWindow: () => ({
    currentLabel: () => 'quicknote',
    hideCurrent,
    closeCurrent: vi.fn(),
    closeStickyNote: vi.fn(),
    onCurrentWindowFocusChange: vi.fn(async () => () => {}),
    startDragCurrent: vi.fn()
  })
}));

vi.mock('@/composables/useDb', () => ({
  useDb: () => ({
    getLatestDraft: vi.fn(async () => null),
    getNote: vi.fn(async () => null),
    deleteNote: vi.fn(async () => {}),
    listNotes: vi.fn(async () => []),
    promoteDraft: vi.fn(async () => null)
  })
}));

vi.mock('@/composables/useAppEvents', () => ({
  useAppEvents: () => ({
    emitNoteSaved: vi.fn(),
    emitNoteRemoved: vi.fn()
  })
}));

vi.mock('@/composables/useMarkdown', () => ({
  useMarkdown: () => ({
    countWords: (content: string) => content.trim().split(/\s+/).filter(Boolean).length
  })
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
            onPointerdown: (event: PointerEvent) => emit('pointerdown', event)
          },
          slots.default?.() ?? slots.icon?.()
        );
    }
  }),
  NIcon: defineComponent({
    setup(_props, { slots }) {
      return () => h('span', slots.default?.());
    }
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
          onInput: (event: Event) => emit('update:value', (event.target as HTMLInputElement).value),
          onKeydown: (event: KeyboardEvent) => emit('keydown', event),
          onBlur: (event: FocusEvent) => emit('blur', event)
        });
    }
  }),
  NText: defineComponent({
    setup(_props, { slots }) {
      return () => h('span', slots.default?.());
    }
  }),
  useMessage: () => ({
    warning: vi.fn(),
    error: vi.fn(),
    success: vi.fn()
  })
}));

// 测试用例：验证「FloatingEditor clipboard preview」场景，锁定 Floating Editor 的用户可见行为。
describe('FloatingEditor clipboard preview', () => {
  beforeEach(() => {
    quicknoteOpenHandler = undefined;
    saveDraft.mockClear();
    scheduleSave.mockClear();
    flushSave.mockClear();
    hideCurrent.mockClear();
    updateEntry.mockClear();
  });

  // 测试用例：验证「打开剪贴板文本后不修改内容直接关闭，不创建笔记草稿」场景，锁定 Floating Editor 的用户可见行为。
  it('打开剪贴板文本后不修改内容直接关闭，不创建笔记草稿', async () => {
    // 局部常量 wrapper：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const wrapper = mount(FloatingEditor);
    await flushPromises();

    quicknoteOpenHandler?.({
      payload: {
        fresh: true,
        noteId: null,
        initialContent: '这是一段被复制的文本',
        clipboardContext: true,
        clipboardEntryId: 'clip-1'
      }
    });
    await nextTick();

    await wrapper.get('[data-testid="floating-close"]').trigger('click');
    await flushPromises();

    expect(scheduleSave).not.toHaveBeenCalled();
    expect(saveDraft).not.toHaveBeenCalled();
  });

  // 测试用例：验证「打开剪贴板文本后不修改内容直接关闭，不更新剪贴板条目（不会被标记为已修改）」场景，锁定 Floating Editor 的用户可见行为。
  it('打开剪贴板文本后不修改内容直接关闭，不更新剪贴板条目（不会被标记为已修改）', async () => {
    // 局部常量 wrapper：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const wrapper = mount(FloatingEditor);
    await flushPromises();

    quicknoteOpenHandler?.({
      payload: {
        fresh: true,
        noteId: null,
        initialContent: '这是一段被复制的文本',
        clipboardContext: true,
        clipboardEntryId: 'clip-1'
      }
    });
    await nextTick();

    await wrapper.get('[data-testid="floating-close"]').trigger('click');
    await flushPromises();

    expect(updateEntry).not.toHaveBeenCalled();
  });

  // 测试用例：验证「打开剪贴板文本后修改内容再关闭，写回剪贴板条目」场景，锁定 Floating Editor 的用户可见行为。
  it('打开剪贴板文本后修改内容再关闭，写回剪贴板条目', async () => {
    // 局部常量 wrapper：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const wrapper = mount(FloatingEditor);
    await flushPromises();

    quicknoteOpenHandler?.({
      payload: {
        fresh: true,
        noteId: null,
        initialContent: '原始内容',
        clipboardContext: true,
        clipboardEntryId: 'clip-1'
      }
    });
    await nextTick();

    // 局部常量 editor：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const editor = wrapper.get('[data-testid="floating-markdown-editor"]');
    await editor.setValue('用户修改后的内容');
    await nextTick();

    await wrapper.get('[data-testid="floating-close"]').trigger('click');
    await flushPromises();

    expect(updateEntry).toHaveBeenCalledWith('clip-1', '用户修改后的内容');
  });
});
