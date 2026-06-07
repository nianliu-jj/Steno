// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';

import PrintView from './PrintView.vue';
import type { Note } from '@/types/steno';

const getNote = vi.fn<(id: string) => Promise<Note | null>>();
const closeCurrent = vi.fn(() => Promise.resolve());

vi.mock('@/composables/useDb', () => ({
  useDb: () => ({ getNote }),
}));

vi.mock('@/composables/useWindow', () => ({
  useWindow: () => ({ closeCurrent }),
}));

// 避免在 jsdom 跑 ProseMirror —— 只验证标题/正文被透传给只读渲染面板。
vi.mock('@/components/MarkdownReadSurface.vue', () => ({
  default: defineComponent({
    props: ['title', 'content'],
    setup(props: { title: string; content: string }) {
      return () =>
        h('div', { 'data-testid': 'read-surface' }, `${props.title}::${props.content}`);
    },
  }),
}));

const sampleNote = {
  id: 'n1',
  title: '我的笔记',
  content: '# 正文\n![图](steno-asset:images/x.png)',
  htmlContent: '',
  tags: [],
  isPinned: false,
  isDraft: false,
  createdAt: '2026-06-01T00:00:00Z',
  updatedAt: '2026-06-01T00:00:00Z',
  wordCount: 0,
} as unknown as Note;

describe('PrintView', () => {
  beforeEach(() => {
    getNote.mockReset();
    closeCurrent.mockClear();
    vi.useFakeTimers();
    window.print = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('加载笔记、渲染只读内容并在稳定后自动触发打印', async () => {
    getNote.mockResolvedValue(sampleNote);

    const wrapper = mount(PrintView, { props: { noteId: 'n1' } });
    await flushPromises();

    expect(getNote).toHaveBeenCalledWith('n1');
    const surface = wrapper.get('[data-testid="read-surface"]');
    expect(surface.text()).toContain('我的笔记');
    expect(surface.text()).toContain('# 正文');

    // 尚未到延迟阈值，不应打印
    expect(window.print).not.toHaveBeenCalled();
    vi.advanceTimersByTime(500);
    expect(window.print).toHaveBeenCalledTimes(1);
  });

  it('打印对话框关闭后自动关闭打印窗口', async () => {
    getNote.mockResolvedValue(sampleNote);

    mount(PrintView, { props: { noteId: 'n1' } });
    await flushPromises();
    vi.advanceTimersByTime(500);

    window.dispatchEvent(new Event('afterprint'));
    await flushPromises();

    expect(closeCurrent).toHaveBeenCalled();
  });

  it('笔记不存在时直接关闭窗口、不打印', async () => {
    getNote.mockResolvedValue(null);

    mount(PrintView, { props: { noteId: 'missing' } });
    await flushPromises();
    vi.advanceTimersByTime(500);

    expect(closeCurrent).toHaveBeenCalled();
    expect(window.print).not.toHaveBeenCalled();
  });
});
