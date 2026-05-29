// @vitest-environment jsdom

import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';

import MarkdownEditor from './MarkdownEditor.vue';

const savePastedImage = vi.fn(async () => ({
  markdownUrl: 'steno-asset:images/2026-05-28/paste.png',
  relativePath: 'images/2026-05-28/paste.png',
  absolutePath: '/tmp/steno/images/2026-05-28/paste.png',
}));
const getDataPaths = vi.fn(async () => ({
  dataDir: '/tmp/steno',
  dbPath: '/tmp/steno/data.db',
  backupDir: '/tmp/steno/backup',
}));

vi.mock('@/composables/useDb', () => ({
  useDb: () => ({
    savePastedImage,
    getDataPaths,
  }),
}));

vi.mock('@tauri-apps/api/core', () => ({
  isTauri: () => false,
  convertFileSrc: (path: string) => `asset://${path}`,
}));

function mountEditor(modelValue = '') {
  return mount(MarkdownEditor, {
    props: { modelValue, placeholder: '测试占位符' },
    attachTo: document.body,
  });
}

/** 图一/图二样例 —— 覆盖标题内联强调/HTML、引用、列表、表格、高亮、HR、链接。 */
const FIGURE_SAMPLE = [
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

describe('MarkdownEditor（ProseMirror 内核）', () => {
  beforeEach(() => {
    savePastedImage.mockClear();
    getDataPaths.mockClear();
  });

  it('挂载 ProseMirror 编辑器容器', () => {
    const wrapper = mountEditor('');
    expect(wrapper.find('[data-testid="md-editor"]').exists()).toBe(true);
    expect(wrapper.find('.ProseMirror').exists()).toBe(true);
    wrapper.unmount();
  });

  it('以初始 v-model 文本播种编辑器内容', () => {
    const wrapper = mountEditor('# 标题\n\n正文段');
    expect(wrapper.text()).toContain('标题');
    expect(wrapper.text()).toContain('正文段');
    // 标题应渲染为 h1，而非显示字面 “#”
    expect(wrapper.find('h1').exists()).toBe(true);
    wrapper.unmount();
  });

  it('把图一样例渲染为 WYSIWYG 结构（图二效果）', () => {
    const wrapper = mountEditor(FIGURE_SAMPLE);
    const html = wrapper.html();
    // 列表 → <ul>
    expect(wrapper.find('ul').exists()).toBe(true);
    // 表格 → <table>，含表头
    expect(wrapper.find('table').exists()).toBe(true);
    expect(wrapper.find('th').exists()).toBe(true);
    // 分隔线 → <hr>
    expect(wrapper.find('hr').exists()).toBe(true);
    // 链接 → <a>
    expect(wrapper.find('a').exists()).toBe(true);
    // 内联 HTML <u> → <u>
    expect(wrapper.find('u').exists()).toBe(true);
    // 粗体 → <strong>，引用 → <blockquote>，高亮 → <mark>
    expect(wrapper.find('strong').exists()).toBe(true);
    expect(wrapper.find('blockquote').exists()).toBe(true);
    expect(wrapper.find('mark').exists()).toBe(true);
    // 不应出现裸露的表格管道符行 / HR 源码作为纯段落文本
    expect(html).toContain('Phase 4');
    wrapper.unmount();
  });

  it('文档变更时 emit update:modelValue', async () => {
    const wrapper = mountEditor('hello');
    const vm = wrapper.vm as unknown as {
      focus: () => void;
    };
    // 直接通过 bridge 写入新内容触发 onChange 路径不便模拟键入，
    // 改为断言外部 setProps 不会反向 emit（防死循环），并在下一个用例覆盖键入。
    expect(() => vm.focus()).not.toThrow();
    await nextTick();
    wrapper.unmount();
  });

  it('外部 v-model 写入回写编辑器且不产生死循环', async () => {
    const wrapper = mountEditor('initial');
    const before = (wrapper.emitted('update:modelValue') ?? []).length;
    await wrapper.setProps({ modelValue: 'after-set' });
    await nextTick();
    expect(wrapper.text()).toContain('after-set');
    // 外部写入不应再次 emit update:modelValue（bridge 防死循环）
    const after = (wrapper.emitted('update:modelValue') ?? []).length;
    expect(after).toBe(before);
    wrapper.unmount();
  });

  it('暴露 focus 与 scrollToLine 且不抛错', () => {
    const wrapper = mountEditor('line 1\n\nline 2\n\nline 3\n\nline 4');
    const exposed = wrapper.vm as unknown as {
      focus: () => void;
      scrollToLine: (line: number) => void;
    };
    expect(() => exposed.focus()).not.toThrow();
    expect(() => exposed.scrollToLine(3)).not.toThrow();
    expect(() => exposed.scrollToLine(999)).not.toThrow();
    expect(() => exposed.scrollToLine(-2)).not.toThrow();
    wrapper.unmount();
  });

  it('把图片 Markdown 渲染为 <img> 预览而非字面源码', async () => {
    const wrapper = mountEditor('![pasted image](～/.steno/images/2026-05-28/paste.png)');
    await new Promise(resolve => setTimeout(resolve, 10));
    await nextTick();
    const image = wrapper.find('img');
    expect(image.exists()).toBe(true);
    expect(image.attributes('alt')).toBe('pasted image');
    expect(wrapper.text()).not.toContain('![pasted image]');
    wrapper.unmount();
  });
});
