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
import { EditorState } from 'prosemirror-state';
import { EditorView as PMEditorView } from 'prosemirror-view';
import type { EditorView } from 'prosemirror-view';

import { stenoSchema } from '../schema';
import { createImageNodeView } from '../nodeviews/image';
import { createTaskItemNodeView } from '../nodeviews/task-list-item';
import { createHtmlBlockNodeView } from '../nodeviews/html-block';
import { createMathBlockNodeView } from '../nodeviews/math-block';
import { createMermaidBlockNodeView } from '../nodeviews/mermaid-block';
import { createCodeBlockNodeView } from '../nodeviews/code-block';
import { setStenoAssetDataDir } from '@/utils/stenoAssets';

/** 创建一个最小的 EditorView 桩，仅暴露 state.tr / dispatch 用于 task-list-item 的 setNodeMarkup 路径。 */
function stubView(): { view: EditorView; dispatched: unknown[] } {
  const dispatched: unknown[] = [];
  // 局部常量 view：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const view = {
    state: {
      schema: stenoSchema,
      tr: {
        setNodeMarkup() {
          return this;
        },
        replaceWith() {
          return this;
        }
      }
    },
    dispatch(tr: unknown) {
      dispatched.push(tr);
    }
  } as unknown as EditorView;
  return { view, dispatched };
}

// 函数式常量 getPos：以闭包形式组织逻辑，便于在组件、store 或测试中传递。
const getPos = () => 0;

// 测试用例：验证「image NodeView」场景，锁定 nodeviews 的用户可见行为。
describe('image NodeView', () => {
  // 测试用例：验证「普通图片：渲染为图片容器，src/alt 注入正确」场景，锁定 nodeviews 的用户可见行为。
  it('普通图片：渲染为图片容器，src/alt 注入正确', () => {
    // 局部常量 node：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const node = stenoSchema.nodes.image.create({
      src: 'steno-asset:foo.png',
      alt: '一张图',
      title: 't'
    });
    const { view } = stubView();
    // 局部常量 nv：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const nv = createImageNodeView(node, view, getPos);
    expect(nv.dom.classList.contains('steno-image-node')).toBe(true);
    // 局部常量 img：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const img = nv.dom.querySelector('img') as HTMLImageElement;
    expect(img).not.toBeNull();
    // 浏览器/jsdom 会把 src 解析为绝对 URL，所以用 includes 断言相对路径片段
    expect(img.src).toContain('foo.png');
    expect(img.alt).toBe('一张图');
    expect(img.title).toBe('t');
  });

  // 测试用例：验证「带 linkHref 时外层 dom 包裹为 <a>」场景，锁定 nodeviews 的用户可见行为。
  it('带 linkHref 时外层 dom 包裹为 <a>', () => {
    // 局部常量 node：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const node = stenoSchema.nodes.image.create({
      src: 'steno-asset:bar.png',
      alt: '',
      linkHref: 'https://example.com',
      linkTitle: 'hover'
    });
    const { view } = stubView();
    // 局部常量 nv：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const nv = createImageNodeView(node, view, getPos);
    // 局部常量 a：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const a = nv.dom.querySelector('a') as HTMLAnchorElement;
    expect(a).not.toBeNull();
    expect(a.getAttribute('href')).toBe('https://example.com');
    expect(a.title).toBe('hover');
    expect(a.querySelector('img')).not.toBeNull();
  });

  // 测试用例：验证「<img> load 失败时切换为 .image-fallback 占位」场景，锁定 nodeviews 的用户可见行为。
  it('<img> load 失败时切换为 .image-fallback 占位', () => {
    // 局部常量 node：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const node = stenoSchema.nodes.image.create({ src: 'broken.png', alt: '备用文本' });
    const { view } = stubView();
    // 局部常量 nv：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const nv = createImageNodeView(node, view, getPos);
    // 局部常量 img：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const img = nv.dom.querySelector('img') as HTMLImageElement;
    // 模拟加载失败
    img.dispatchEvent(new Event('error'));
    // 局部常量 fallback：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const fallback = nv.dom.querySelector('.image-fallback') as HTMLElement;
    expect(fallback).not.toBeNull();
    expect(fallback.textContent).toBe('备用文本');
  });

  // 测试用例：验证「点击图片后在图片下方显示原始路径」场景，锁定 nodeviews 的用户可见行为。
  it('点击图片后在图片下方显示原始路径', () => {
    // 局部常量 node：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const node = stenoSchema.nodes.image.create({
      src: 'assets/image-20240718101650827.png',
      alt: '复杂度图'
    });
    const { view } = stubView();
    // 局部常量 nv：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const nv = createImageNodeView(node, view, getPos);
    // 局部常量 img：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const img = nv.dom.querySelector('img') as HTMLImageElement;
    // 局部常量 path：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const path = nv.dom.querySelector('.steno-image-path') as HTMLElement;

    expect(path).not.toBeNull();
    expect(path.hidden).toBe(true);

    img.click();

    expect(path.hidden).toBe(false);
    expect(path.textContent).toBe('assets/image-20240718101650827.png');
  });

  // 测试用例：验证「数据目录在图片渲染后才就绪时刷新已渲染图片的 src（修复速记浮窗图片不显示）」场景，锁定 nodeviews 的用户可见行为。
  it('数据目录在图片渲染后才就绪时刷新已渲染图片的 src（修复速记浮窗图片不显示）', () => {
    // 模拟首帧渲染时数据目录尚未就绪（cachedDataDir 为空）
    setStenoAssetDataDir(null);
    // 局部常量 node：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const node = stenoSchema.nodes.image.create({ src: 'steno-asset:foo.png' });
    const { view } = stubView();
    // 局部常量 nv：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const nv = createImageNodeView(node, view, getPos);
    // 函数式常量 before：以闭包形式组织逻辑，便于在组件、store 或测试中传递。
    const before = (nv.dom.querySelector('img') as HTMLImageElement).src;
    expect(before).not.toContain('tmp/steno');

    // 数据目录异步就绪：应触发 NodeView 重建，使 src 指向真实数据目录
    setStenoAssetDataDir('/tmp/steno');
    // 函数式常量 after：以闭包形式组织逻辑，便于在组件、store 或测试中传递。
    const after = (nv.dom.querySelector('img') as HTMLImageElement).src;
    expect(after).toContain('tmp/steno');

    nv.destroy?.();
    setStenoAssetDataDir(null);
  });
});

// 测试用例：验证「task-list-item NodeView」场景，锁定 nodeviews 的用户可见行为。
describe('task-list-item NodeView', () => {
  // 函数 makeTaskItem：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
  function makeTaskItem(checked: boolean) {
    return stenoSchema.nodes.task_item.create({ checked }, [
      stenoSchema.nodes.paragraph.create(null, stenoSchema.text('todo'))
    ]);
  }

  // 测试用例：验证「checked=true 时 checkbox 已勾选」场景，锁定 nodeviews 的用户可见行为。
  it('checked=true 时 checkbox 已勾选', () => {
    // 局部常量 node：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const node = makeTaskItem(true);
    const { view } = stubView();
    // 局部常量 nv：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const nv = createTaskItemNodeView(node, view, getPos);
    // 局部常量 cb：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const cb = nv.dom!.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(cb).not.toBeNull();
    expect(cb.checked).toBe(true);
  });

  // 测试用例：验证「checked=false 时 checkbox 未勾选」场景，锁定 nodeviews 的用户可见行为。
  it('checked=false 时 checkbox 未勾选', () => {
    // 局部常量 node：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const node = makeTaskItem(false);
    const { view } = stubView();
    // 局部常量 nv：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const nv = createTaskItemNodeView(node, view, getPos);
    // 局部常量 cb：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const cb = nv.dom!.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(cb.checked).toBe(false);
  });

  // 测试用例：验证「点击 checkbox 会派发 transaction」场景，锁定 nodeviews 的用户可见行为。
  it('点击 checkbox 会派发 transaction', () => {
    // 局部常量 node：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const node = makeTaskItem(false);
    const { view, dispatched } = stubView();
    // 局部常量 nv：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const nv = createTaskItemNodeView(node, view, getPos);
    // 局部常量 cb：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const cb = nv.dom!.querySelector('input[type="checkbox"]') as HTMLInputElement;
    cb.checked = true;
    cb.dispatchEvent(new Event('change'));
    expect(dispatched.length).toBe(1);
  });

  // 测试用例：验证「contentDOM 与 checkbox 分离（checkbox 不在 contentDOM 内）」场景，锁定 nodeviews 的用户可见行为。
  it('contentDOM 与 checkbox 分离（checkbox 不在 contentDOM 内）', () => {
    // 局部常量 node：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const node = makeTaskItem(false);
    const { view } = stubView();
    // 局部常量 nv：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const nv = createTaskItemNodeView(node, view, getPos);
    // 局部常量 cb：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const cb = nv.dom!.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(nv.contentDOM).toBeTruthy();
    expect(nv.contentDOM!.contains(cb)).toBe(false);
  });
});

// 测试用例：验证「html-block NodeView」场景，锁定 nodeviews 的用户可见行为。
describe('html-block NodeView', () => {
  // 函数 makeHtmlBlock：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
  function makeHtmlBlock(raw: string) {
    return stenoSchema.nodes.html_block.create(null, raw ? [stenoSchema.text(raw)] : []);
  }

  // 测试用例：验证「渲染态注入 sanitized innerHTML」场景，锁定 nodeviews 的用户可见行为。
  it('渲染态注入 sanitized innerHTML', () => {
    // 局部常量 node：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const node = makeHtmlBlock('<p>hello <strong>world</strong></p>');
    const { view } = stubView();
    // 局部常量 nv：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const nv = createHtmlBlockNodeView(node, view, getPos);
    expect((nv.dom as HTMLElement).innerHTML).toContain('<strong>world</strong>');
  });

  // 测试用例：验证「注入的 HTML 经过 sanitize：<script> 被剥离」场景，锁定 nodeviews 的用户可见行为。
  it('注入的 HTML 经过 sanitize：<script> 被剥离', () => {
    // 局部常量 node：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const node = makeHtmlBlock('<p>x</p><script>alert(1)</script>');
    const { view } = stubView();
    // 局部常量 nv：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const nv = createHtmlBlockNodeView(node, view, getPos);
    // 函数式常量 html：以闭包形式组织逻辑，便于在组件、store 或测试中传递。
    const html = (nv.dom as HTMLElement).innerHTML.toLowerCase();
    expect(html).not.toContain('<script');
  });

  // 测试用例：验证「双击进入编辑态：dom 内出现 <textarea>」场景，锁定 nodeviews 的用户可见行为。
  it('双击进入编辑态：dom 内出现 <textarea>', () => {
    // 局部常量 node：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const node = makeHtmlBlock('<p>edit me</p>');
    const { view } = stubView();
    // 局部常量 nv：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const nv = createHtmlBlockNodeView(node, view, getPos);
    (nv.dom as HTMLElement).dispatchEvent(new Event('dblclick'));
    // 函数式常量 ta：以闭包形式组织逻辑，便于在组件、store 或测试中传递。
    const ta = (nv.dom as HTMLElement).querySelector('textarea');
    expect(ta).not.toBeNull();
    expect((ta as HTMLTextAreaElement).value).toBe('<p>edit me</p>');
  });
});

// 测试用例：验证「math-block NodeView」场景，锁定 nodeviews 的用户可见行为。
describe('math-block NodeView', () => {
  // 函数 makeMathBlock：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
  function makeMathBlock(tex: string) {
    return stenoSchema.nodes.math_block.create(null, tex ? [stenoSchema.text(tex)] : []);
  }

  // 测试用例：验证「渲染 KaTeX 公式后 dom 内出现 .katex 元素」场景，锁定 nodeviews 的用户可见行为。
  it('渲染 KaTeX 公式后 dom 内出现 .katex 元素', () => {
    // 局部常量 node：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const node = makeMathBlock('E = mc^2');
    const { view } = stubView();
    // 局部常量 nv：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const nv = createMathBlockNodeView(node, view, getPos);
    expect((nv.dom as HTMLElement).querySelector('.katex')).not.toBeNull();
  });

  // 测试用例：验证「throwOnError=false：非法 LaTeX 不抛错，渲染为 .katex 兜底节点」场景，锁定 nodeviews 的用户可见行为。
  it('throwOnError=false：非法 LaTeX 不抛错，渲染为 .katex 兜底节点', () => {
    // 局部常量 node：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const node = makeMathBlock('\\unknownmacro{x}');
    const { view } = stubView();
    expect(() => createMathBlockNodeView(node, view, getPos)).not.toThrow();
  });
});

// 测试用例：验证「mermaid-block NodeView」场景，锁定 nodeviews 的用户可见行为。
describe('mermaid-block NodeView', () => {
  beforeEach(() => {
    // 渲染 mermaid 涉及动态 import，在测试里我们只检查占位元素，不等待真实渲染。
    vi.useFakeTimers();
  });

  // 测试用例：验证「构造后 dom 内有 pre.mermaid-placeholder 且带 base64 data-source」场景，锁定 nodeviews 的用户可见行为。
  it('构造后 dom 内有 pre.mermaid-placeholder 且带 base64 data-source', () => {
    // 局部常量 node：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const node = stenoSchema.nodes.mermaid_block.create(null, [stenoSchema.text('graph TD; A-->B')]);
    const { view } = stubView();
    // 局部常量 nv：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const nv = createMermaidBlockNodeView(node, view, getPos);
    // 函数式常量 placeholder：以闭包形式组织逻辑，便于在组件、store 或测试中传递。
    const placeholder = (nv.dom as HTMLElement).querySelector('pre.mermaid-placeholder');
    expect(placeholder).not.toBeNull();
    // 局部常量 encoded：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const encoded = placeholder!.getAttribute('data-source') ?? '';
    expect(encoded.length).toBeGreaterThan(0);
    // base64 解码后应包含原 mermaid 源
    expect(atob(encoded)).toContain('graph TD');
  });
});

// 测试用例：验证「code-block NodeView」场景，锁定 nodeviews 的用户可见行为。
describe('code-block NodeView', () => {
  /**
   * 用真实 EditorView 挂载一个 code_block，并让其使用 createCodeBlockNodeView。
   * 返回挂载后该代码块的 NodeView dom（即外层 .steno-code-block 容器）。
   *
   * jsdom 下 CodeMirror 的像素测量 API（getBoundingClientRect 等）会返回 0，
   * 因此测试只断言 DOM 结构存在性，不验证布局。
   */
  function mountCodeBlock(language: string, code: string, editable = true) {
    // 局部常量 doc：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const doc = stenoSchema.nodes.doc.create(null, [
      stenoSchema.nodes.code_block.create({ language }, code ? [stenoSchema.text(code)] : [])
    ]);
    // 局部常量 place：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const place = document.createElement('div');
    document.body.appendChild(place);
    // 局部常量 view：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const view = new PMEditorView(place, {
      state: EditorState.create({ schema: stenoSchema, doc }),
      editable: () => editable,
      nodeViews: {
        code_block: createCodeBlockNodeView
      }
    });
    // 局部常量 container：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const container = place.querySelector('.steno-code-block') as HTMLElement;
    return { view, container };
  }

  // 测试用例：验证「挂载后存在 CodeMirror 容器 DOM 与 .cm-editor」场景，锁定 nodeviews 的用户可见行为。
  it('挂载后存在 CodeMirror 容器 DOM 与 .cm-editor', () => {
    const { view, container } = mountCodeBlock('ts', 'const x = 1');
    expect(container).not.toBeNull();
    // 局部常量 editorContainer：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const editorContainer = container.querySelector('.steno-code-block-editor');
    expect(editorContainer).not.toBeNull();
    // CodeMirror 6 会在 parent 内渲染 .cm-editor / .cm-content
    expect(editorContainer!.querySelector('.cm-editor')).not.toBeNull();
    expect(editorContainer!.querySelector('.cm-content')).not.toBeNull();
    view.destroy();
  });

  // 测试用例：验证「语言标签显示规范化后的语言名（ts -> TypeScript）」场景，锁定 nodeviews 的用户可见行为。
  it('语言标签显示规范化后的语言名（ts -> TypeScript）', () => {
    const { view, container } = mountCodeBlock('ts', 'const x = 1');
    // 局部常量 label：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const label = container.querySelector('.steno-code-block-lang-label') as HTMLElement;
    expect(label).not.toBeNull();
    expect(label.textContent).toBe('TypeScript');
    view.destroy();
  });

  // 测试用例：验证「复制按钮存在且点击后写入剪贴板并临时显示「已复制」」场景，锁定 nodeviews 的用户可见行为。
  it('复制按钮存在且点击后写入剪贴板并临时显示「已复制」', () => {
    // 局部常量 writeText：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const writeText = vi.fn().mockResolvedValue(undefined);
    // jsdom 默认无 navigator.clipboard，注入桩
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true
    });

    const { view, container } = mountCodeBlock('ts', 'const x = 1');
    // 局部常量 copyBtn：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const copyBtn = container.querySelector('.steno-code-block-copy-btn') as HTMLButtonElement;
    expect(copyBtn).not.toBeNull();
    expect(copyBtn.textContent).toBe('复制');

    copyBtn.click();
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText.mock.calls[0][0]).toContain('const x = 1');
    expect(writeText.mock.calls[0][0]).toContain('```ts');
    // 点击后即时反馈
    expect(copyBtn.textContent).toBe('已复制');

    view.destroy();
  });

  // 测试用例：验证「只读模式渲染为不可编辑代码视图，保留语言标签与复制按钮」场景，锁定 nodeviews 的用户可见行为。
  it('只读模式渲染为不可编辑代码视图，保留语言标签与复制按钮', () => {
    const { view, container } = mountCodeBlock('java', 'public class Test {\n}', false);

    expect(container.classList.contains('is-readonly')).toBe(true);
    expect(container.querySelector('.cm-editor')).toBeNull();
    expect(container.querySelector('pre.steno-code-block-readonly')).not.toBeNull();
    expect(container.querySelector('.steno-code-block-line')).not.toBeNull();
    expect(container.querySelector('.steno-code-block-lang-label')?.textContent).toBe('Java');
    expect(container.querySelector('.steno-code-block-copy-btn')).not.toBeNull();

    view.destroy();
  });
});
