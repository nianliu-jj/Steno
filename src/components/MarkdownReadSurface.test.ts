/**
 * @file 前端通用组件 - Markdown Read Surface
 *
 * 覆盖 Markdown Read Surface 的主要行为、边界条件和跨模块契约，帮助重构时快速定位预期。
 * 注释重点标明数据入口、状态边界、事件通道和协作风险点，便于逐行阅读时快速判断代码意图。
 */

// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';

import MarkdownReadSurface from './MarkdownReadSurface.vue';

vi.mock('@tauri-apps/api/core', () => ({
  isTauri: () => false,
  convertFileSrc: (path: string) => `asset://${path}`
}));

vi.mock('@/composables/useDb', () => ({
  useDb: () => ({
    getDataPaths: vi.fn(async () => ({
      dataDir: '/tmp/steno',
      dbPath: '/tmp/steno/data.db',
      backupDir: '/tmp/steno/backup'
    }))
  })
}));

// 测试用例：验证「MarkdownReadSurface（ProseMirror 只读内核）」场景，锁定 Markdown Read Surface 的用户可见行为。
describe('MarkdownReadSurface（ProseMirror 只读内核）', () => {
  // 测试用例：验证「以只读 ProseMirror 渲染并为标题注入 heading 锚点」场景，锁定 Markdown Read Surface 的用户可见行为。
  it('以只读 ProseMirror 渲染并为标题注入 heading 锚点', async () => {
    // 局部常量 wrapper：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const wrapper = mount(MarkdownReadSurface, {
      props: {
        title: '测试文档',
        content: '# 标题\n\n正文\n\n## 二级标题'
      },
      attachTo: document.body
    });
    await flushPromises();

    expect(wrapper.get('[data-testid="markdown-read-surface"]').text()).toContain('测试文档');
    // 局部常量 body：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const body = wrapper.get('.markdown-read-surface__body');
    // heading 渲染为 h1/h2 且带 data-heading-id（与 useMarkdownOutline 的 heading-{行号} 对齐）
    expect(body.find('h1[data-heading-id="heading-1"]').exists()).toBe(true);
    expect(body.find('h2[data-heading-id="heading-5"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('正文');
    wrapper.unmount();
  });

  // 测试用例：验证「标题为空时回退为“无标题”」场景，锁定 Markdown Read Surface 的用户可见行为。
  it('标题为空时回退为“无标题”', () => {
    // 局部常量 wrapper：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const wrapper = mount(MarkdownReadSurface, {
      props: { title: '', content: '普通正文' },
      attachTo: document.body
    });
    expect(wrapper.get('.markdown-read-surface__title').text()).toBe('无标题');
    wrapper.unmount();
  });

  // 测试用例：验证「把图一样例渲染为 WYSIWYG 结构（与编辑态一致）」场景，锁定 Markdown Read Surface 的用户可见行为。
  it('把图一样例渲染为 WYSIWYG 结构（与编辑态一致）', async () => {
    // 局部常量 sample：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
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
      '[a](hh)'
    ].join('\n');
    // 局部常量 wrapper：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const wrapper = mount(MarkdownReadSurface, {
      props: { title: 'x', content: sample },
      attachTo: document.body
    });
    await flushPromises();
    // 局部常量 body：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
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

  // 测试用例：验证「把 steno-asset 图片 URL 渲染为可预览图片」场景，锁定 Markdown Read Surface 的用户可见行为。
  it('把 steno-asset 图片 URL 渲染为可预览图片', async () => {
    // 局部常量 wrapper：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const wrapper = mount(MarkdownReadSurface, {
      props: {
        title: '图片',
        content: '![截图](steno-asset:images/2026-05-28/paste.png)'
      },
      attachTo: document.body
    });
    await flushPromises();

    // 局部常量 image：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const image = wrapper.get('.markdown-read-surface__body img');
    expect(image.attributes('alt')).toBe('截图');
    expect(image.attributes('src')).toBe('/tmp/steno/images/2026-05-28/paste.png');
    wrapper.unmount();
  });

  // 测试用例：验证「把旧 home-steno 图片 URL 渲染为可预览图片」场景，锁定 Markdown Read Surface 的用户可见行为。
  it('把旧 home-steno 图片 URL 渲染为可预览图片', async () => {
    // 局部常量 wrapper：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const wrapper = mount(MarkdownReadSurface, {
      props: {
        title: '图片',
        content: '![pasted image](～/.steno/images/2026-05-28/paste.png)'
      },
      attachTo: document.body
    });
    await flushPromises();

    // 局部常量 image：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const image = wrapper.get('.markdown-read-surface__body img');
    expect(image.attributes('alt')).toBe('pasted image');
    expect(image.attributes('src')).toBe('/tmp/steno/images/2026-05-28/paste.png');
    wrapper.unmount();
  });

  // 测试用例：验证「暴露 scrollToHeading 且不抛错」场景，锁定 Markdown Read Surface 的用户可见行为。
  it('暴露 scrollToHeading 且不抛错', async () => {
    // 局部常量 wrapper：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const wrapper = mount(MarkdownReadSurface, {
      props: { title: 'x', content: '# 一\n\n正文\n\n## 二' },
      attachTo: document.body
    });
    await flushPromises();
    // 局部常量 exposed：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const exposed = wrapper.vm as unknown as { scrollToHeading: (id: string) => void };
    expect(() => exposed.scrollToHeading('heading-1')).not.toThrow();
    expect(() => exposed.scrollToHeading('heading-999')).not.toThrow();
    wrapper.unmount();
  });
});
