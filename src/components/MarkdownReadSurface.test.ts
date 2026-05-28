// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';

import MarkdownReadSurface from './MarkdownReadSurface.vue';

vi.mock('@tauri-apps/api/core', () => ({
  isTauri: () => false,
  convertFileSrc: (path: string) => `asset://${path}`,
}));

vi.mock('@/composables/useDb', () => ({
  useDb: () => ({
    getDataPaths: vi.fn(async () => ({
      dataDir: '/tmp/steno',
      dbPath: '/tmp/steno/data.db',
      backupDir: '/tmp/steno/backup',
    })),
  }),
}));

vi.mock('@/i18n', () => ({
  useI18n: () => ({
    state: { locale: 'zh-CN' },
    t: (key: string) => key,
  }),
}));

describe('MarkdownReadSurface', () => {
  it('renders markdown html with heading anchors in read mode', () => {
    const wrapper = mount(MarkdownReadSurface, {
      props: {
        title: '测试文档',
        content: '# 标题\n正文\n## 二级标题',
      },
    });

    expect(wrapper.get('[data-testid="markdown-read-surface"]').text()).toContain('测试文档');
    expect(wrapper.get('.markdown-read-surface__body').html()).toContain(
      'data-heading-id="heading-1"',
    );
    expect(wrapper.get('.markdown-read-surface__body').html()).toContain(
      'data-heading-id="heading-3"',
    );
    expect(wrapper.text()).toContain('正文');
  });

  it('falls back to an untitled heading when title is empty', () => {
    const wrapper = mount(MarkdownReadSurface, {
      props: {
        title: '',
        content: '普通正文',
      },
    });

    expect(wrapper.get('.markdown-read-surface__title').text()).toBe('无标题');
  });

  it('renders steno asset image URLs as previewable images', async () => {
    const wrapper = mount(MarkdownReadSurface, {
      props: {
        title: '图片',
        content: '![截图](steno-asset:images/2026-05-28/paste.png)',
      },
    });
    await flushPromises();

    const image = wrapper.get('.markdown-read-surface__body img');
    expect(image.attributes('alt')).toBe('截图');
    expect(image.attributes('src')).toBe('/tmp/steno/images/2026-05-28/paste.png');
  });

  it('renders legacy home-steno image URLs as previewable images', async () => {
    const wrapper = mount(MarkdownReadSurface, {
      props: {
        title: '图片',
        content: '![pasted image](～/.steno/images/2026-05-28/paste.png)',
      },
    });
    await flushPromises();

    const image = wrapper.get('.markdown-read-surface__body img');
    expect(image.attributes('alt')).toBe('pasted image');
    expect(image.attributes('src')).toBe('/tmp/steno/images/2026-05-28/paste.png');
  });
});
