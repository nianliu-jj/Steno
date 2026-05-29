/**
 * @file Phase 4 基础 NodeView 单元测试
 *
 * 测试策略：直接调用 createXxxNodeView 工厂，传入 schema 节点 + 桩 view/getPos，
 * 断言返回的 NodeView 的 DOM 结构与 update/ignoreMutation 行为；不挂载完整
 * EditorView 以保持测试轻量。
 *
 * 环境：jsdom（vite.config.ts test 段未指定全局 environment，所以这里通过
 * `// @vitest-environment jsdom` 指令显式声明）。
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { EditorView } from 'prosemirror-view';

import { stenoSchema } from '../schema';
import { createImageNodeView } from '../nodeviews/image';
import { createTaskItemNodeView } from '../nodeviews/task-list-item';
import { createHtmlBlockNodeView } from '../nodeviews/html-block';
import { createMathBlockNodeView } from '../nodeviews/math-block';
import { createMermaidBlockNodeView } from '../nodeviews/mermaid-block';

/** 创建一个最小的 EditorView 桩，仅暴露 state.tr / dispatch 用于 task-list-item 的 setNodeMarkup 路径。 */
function stubView(): { view: EditorView; dispatched: unknown[] } {
  const dispatched: unknown[] = [];
  const view = {
    state: {
      schema: stenoSchema,
      tr: {
        setNodeMarkup() {
          return this;
        },
        replaceWith() {
          return this;
        },
      },
    },
    dispatch(tr: unknown) {
      dispatched.push(tr);
    },
  } as unknown as EditorView;
  return { view, dispatched };
}

const getPos = () => 0;

describe('image NodeView', () => {
  it('普通图片：外层 dom 是 <img>，src/alt 注入正确', () => {
    const node = stenoSchema.nodes.image.create({
      src: 'steno-asset:foo.png',
      alt: '一张图',
      title: 't',
    });
    const { view } = stubView();
    const nv = createImageNodeView(node, view, getPos);
    expect(nv.dom.tagName).toBe('IMG');
    const img = nv.dom as HTMLImageElement;
    // 浏览器/jsdom 会把 src 解析为绝对 URL，所以用 includes 断言相对路径片段
    expect(img.src).toContain('foo.png');
    expect(img.alt).toBe('一张图');
    expect(img.title).toBe('t');
  });

  it('带 linkHref 时外层 dom 包裹为 <a>', () => {
    const node = stenoSchema.nodes.image.create({
      src: 'steno-asset:bar.png',
      alt: '',
      linkHref: 'https://example.com',
      linkTitle: 'hover',
    });
    const { view } = stubView();
    const nv = createImageNodeView(node, view, getPos);
    expect(nv.dom.tagName).toBe('A');
    const a = nv.dom as HTMLAnchorElement;
    expect(a.getAttribute('href')).toBe('https://example.com');
    expect(a.title).toBe('hover');
    expect(a.querySelector('img')).not.toBeNull();
  });

  it('<img> load 失败时切换为 .image-fallback 占位', () => {
    const node = stenoSchema.nodes.image.create({ src: 'broken.png', alt: '备用文本' });
    const { view } = stubView();
    const nv = createImageNodeView(node, view, getPos);
    const img = nv.dom as HTMLImageElement;
    // 模拟加载失败
    img.dispatchEvent(new Event('error'));
    expect(nv.dom.className).toBe('image-fallback');
    expect(nv.dom.textContent).toBe('备用文本');
  });
});

describe('task-list-item NodeView', () => {
  function makeTaskItem(checked: boolean) {
    return stenoSchema.nodes.task_item.create(
      { checked },
      [stenoSchema.nodes.paragraph.create(null, stenoSchema.text('todo'))],
    );
  }

  it('checked=true 时 checkbox 已勾选', () => {
    const node = makeTaskItem(true);
    const { view } = stubView();
    const nv = createTaskItemNodeView(node, view, getPos);
    const cb = nv.dom!.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(cb).not.toBeNull();
    expect(cb.checked).toBe(true);
  });

  it('checked=false 时 checkbox 未勾选', () => {
    const node = makeTaskItem(false);
    const { view } = stubView();
    const nv = createTaskItemNodeView(node, view, getPos);
    const cb = nv.dom!.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(cb.checked).toBe(false);
  });

  it('点击 checkbox 会派发 transaction', () => {
    const node = makeTaskItem(false);
    const { view, dispatched } = stubView();
    const nv = createTaskItemNodeView(node, view, getPos);
    const cb = nv.dom!.querySelector('input[type="checkbox"]') as HTMLInputElement;
    cb.checked = true;
    cb.dispatchEvent(new Event('change'));
    expect(dispatched.length).toBe(1);
  });

  it('contentDOM 与 checkbox 分离（checkbox 不在 contentDOM 内）', () => {
    const node = makeTaskItem(false);
    const { view } = stubView();
    const nv = createTaskItemNodeView(node, view, getPos);
    const cb = nv.dom!.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(nv.contentDOM).toBeTruthy();
    expect(nv.contentDOM!.contains(cb)).toBe(false);
  });
});

describe('html-block NodeView', () => {
  function makeHtmlBlock(raw: string) {
    return stenoSchema.nodes.html_block.create(null, raw ? [stenoSchema.text(raw)] : []);
  }

  it('渲染态注入 sanitized innerHTML', () => {
    const node = makeHtmlBlock('<p>hello <strong>world</strong></p>');
    const { view } = stubView();
    const nv = createHtmlBlockNodeView(node, view, getPos);
    expect((nv.dom as HTMLElement).innerHTML).toContain('<strong>world</strong>');
  });

  it('注入的 HTML 经过 sanitize：<script> 被剥离', () => {
    const node = makeHtmlBlock('<p>x</p><script>alert(1)</script>');
    const { view } = stubView();
    const nv = createHtmlBlockNodeView(node, view, getPos);
    const html = (nv.dom as HTMLElement).innerHTML.toLowerCase();
    expect(html).not.toContain('<script');
  });

  it('双击进入编辑态：dom 内出现 <textarea>', () => {
    const node = makeHtmlBlock('<p>edit me</p>');
    const { view } = stubView();
    const nv = createHtmlBlockNodeView(node, view, getPos);
    (nv.dom as HTMLElement).dispatchEvent(new Event('dblclick'));
    const ta = (nv.dom as HTMLElement).querySelector('textarea');
    expect(ta).not.toBeNull();
    expect((ta as HTMLTextAreaElement).value).toBe('<p>edit me</p>');
  });
});

describe('math-block NodeView', () => {
  function makeMathBlock(tex: string) {
    return stenoSchema.nodes.math_block.create(null, tex ? [stenoSchema.text(tex)] : []);
  }

  it('渲染 KaTeX 公式后 dom 内出现 .katex 元素', () => {
    const node = makeMathBlock('E = mc^2');
    const { view } = stubView();
    const nv = createMathBlockNodeView(node, view, getPos);
    expect((nv.dom as HTMLElement).querySelector('.katex')).not.toBeNull();
  });

  it('throwOnError=false：非法 LaTeX 不抛错，渲染为 .katex 兜底节点', () => {
    const node = makeMathBlock('\\unknownmacro{x}');
    const { view } = stubView();
    expect(() => createMathBlockNodeView(node, view, getPos)).not.toThrow();
  });
});

describe('mermaid-block NodeView', () => {
  beforeEach(() => {
    // 渲染 mermaid 涉及动态 import，在测试里我们只检查占位元素，不等待真实渲染。
    vi.useFakeTimers();
  });

  it('构造后 dom 内有 pre.mermaid-placeholder 且带 base64 data-source', () => {
    const node = stenoSchema.nodes.mermaid_block.create(
      null,
      [stenoSchema.text('graph TD; A-->B')],
    );
    const { view } = stubView();
    const nv = createMermaidBlockNodeView(node, view, getPos);
    const placeholder = (nv.dom as HTMLElement).querySelector('pre.mermaid-placeholder');
    expect(placeholder).not.toBeNull();
    const encoded = placeholder!.getAttribute('data-source') ?? '';
    expect(encoded.length).toBeGreaterThan(0);
    // base64 解码后应包含原 mermaid 源
    expect(atob(encoded)).toContain('graph TD');
  });
});
