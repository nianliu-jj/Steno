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

describe('MarkdownReadSurface（ProseMirror 只读内核）', () => {
  it('以只读 ProseMirror 渲染并为标题注入 heading 锚点', async () => {
    const wrapper = mount(MarkdownReadSurface, {
      props: {
        title: '测试文档',
        content: '# 标题\n\n正文\n\n## 二级标题',
      },
      attachTo: document.body,
    });
    await flushPromises();

    expect(wrapper.get('[data-testid="markdown-read-surface"]').text()).toContain('测试文档');
    const body = wrapper.get('.markdown-read-surface__body');
    // heading 渲染为 h1/h2 且带 data-heading-id（与 useMarkdownOutline 的 heading-{行号} 对齐）
    expect(body.find('h1[data-heading-id="heading-1"]').exists()).toBe(true);
    expect(body.find('h2[data-heading-id="heading-5"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('正文');
    wrapper.unmount();
  });

  it('标题为空时回退为“无标题”', () => {
    const wrapper = mount(MarkdownReadSurface, {
      props: { title: '', content: '普通正文' },
      attachTo: document.body,
    });
    expect(wrapper.get('.markdown-read-surface__title').text()).toBe('无标题');
    wrapper.unmount();
  });

  it('把图一样例渲染为 WYSIWYG 结构（与编辑态一致）', async () => {
    const sample = [
      '继续**推进** <u>Phase 4</u>',
      '',
      '>你好啊',
      '',
      '- a',
      '- v',
      '',
      '|A | B |',
      '|--|--|',
      '|a|b|',
      '',
      '==buha== 你',
      '',
      '---',
      '',
      '[a](hh)',
    ].join('\n');
    const wrapper = mount(MarkdownReadSurface, {
      props: { title: 'x', content: sample },
      attachTo: document.body,
    });
    await flushPromises();
    const body = wrapper.get('.markdown-read-surface__body');
    expect(body.find('ul').exists()).toBe(true);
    expect(body.find('table').exists()).toBe(true);
    expect(body.find('hr').exists()).toBe(true);
    expect(body.find('a').exists()).toBe(true);
    expect(body.find('u').exists()).toBe(true);
    expect(body.find('strong').exists()).toBe(true);
    expect(body.find('blockquote').exists()).toBe(true);
    expect(body.find('mark').exists()).toBe(true);
    wrapper.unmount();
  });

  it('把 steno-asset 图片 URL 渲染为可预览图片', async () => {
    const wrapper = mount(MarkdownReadSurface, {
      props: {
        title: '图片',
        content: '![截图](steno-asset:images/2026-05-28/paste.png)',
      },
      attachTo: document.body,
    });
    await flushPromises();

    const image = wrapper.get('.markdown-read-surface__body img');
    expect(image.attributes('alt')).toBe('截图');
    expect(image.attributes('src')).toBe('/tmp/steno/images/2026-05-28/paste.png');
    wrapper.unmount();
  });

  it('把旧 home-steno 图片 URL 渲染为可预览图片', async () => {
    const wrapper = mount(MarkdownReadSurface, {
      props: {
        title: '图片',
        content: '![pasted image](～/.steno/images/2026-05-28/paste.png)',
      },
      attachTo: document.body,
    });
    await flushPromises();

    const image = wrapper.get('.markdown-read-surface__body img');
    expect(image.attributes('alt')).toBe('pasted image');
    expect(image.attributes('src')).toBe('/tmp/steno/images/2026-05-28/paste.png');
    wrapper.unmount();
  });

  it('暴露 scrollToHeading 且不抛错', async () => {
    const wrapper = mount(MarkdownReadSurface, {
      props: { title: 'x', content: '# 一\n\n正文\n\n## 二' },
      attachTo: document.body,
    });
    await flushPromises();
    const exposed = wrapper.vm as unknown as { scrollToHeading: (id: string) => void };
    expect(() => exposed.scrollToHeading('heading-1')).not.toThrow();
    expect(() => exposed.scrollToHeading('heading-999')).not.toThrow();
    wrapper.unmount();
  });
});
