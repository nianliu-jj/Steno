/**
 * @file Phase 6 插件单元测试
 *
 * 覆盖两个核心插件：
 * - instant-render（decorations）：用 parser 解析含 `**粗体**` 的 markdown 建 doc，
 *   验证光标在文档别处时 `**` 语法标记被 decoration 隐藏（puremark-syntax-hidden），
 *   光标进入该粗体区域时显示（puremark-syntax-visible）。
 * - input-rules：模拟在段落开头输入 `> ` 触发引用块、`# ` 不触发（标题由解析处理）、
 *   `## ` 等不在范围；这里用 `> ` 与 `1. ` 验证节点类型变化。
 *
 * 说明：
 * - 直接断言 decorations 插件的 DecorationSet（通过 decorationPluginKey 读插件状态
 *   再 find），无需依赖像素布局，jsdom 下稳定。
 * - input-rules 通过构造一个带 inputRules 插件的 EditorView，并调用
 *   `view.someProp('handleTextInput')` 模拟输入触发字符（与 prosemirror-inputrules
 *   的触发路径一致）。
 * - paste / keymap 难以在 jsdom 可靠模拟（剪贴板 DataTransfer / execCommand 等），
 *   这里只做最小 smoke：断言装配函数返回的插件数量与关键插件存在，不模拟真实交互。
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import type { Node } from 'prosemirror-model';

import { stenoSchema } from '../schema';
import { parseMarkdown } from '../parser';
import { createInstantRenderPlugin } from '../plugins/instant-render';
import { createInputRulesPlugin } from '../plugins/input-rules';
import { createEditorPlugins } from '../plugins';
import {
  decorationPluginKey,
  findSyntaxMarkerRegions,
  type DecorationPluginState,
} from '../decorations';

/** 在指定 doc 上挂载一个带 instant-render 插件的 EditorView。 */
function mountWithInstantRender(doc: Node): { view: EditorView; place: HTMLElement } {
  const place = document.createElement('div');
  document.body.appendChild(place);
  const state = EditorState.create({
    schema: stenoSchema,
    doc,
    plugins: createInstantRenderPlugin(),
  });
  const view = new EditorView(place, { state });
  return { view, place };
}

/** 把光标设置到指定文档位置。 */
function setCursor(view: EditorView, pos: number): void {
  const tr = view.state.tr.setSelection(TextSelection.create(view.state.doc, pos));
  view.dispatch(tr);
}

/** 读出当前 decoration 插件状态。 */
function decoState(view: EditorView): DecorationPluginState {
  const s = decorationPluginKey.getState(view.state);
  if (!s) throw new Error('decoration plugin state missing');
  return s;
}

/** 收集某区间内 decoration 的 class（用于断言隐藏/显示）。 */
function decoClassesIn(view: EditorView, from: number, to: number): string[] {
  const set = decoState(view).decorations;
  const found = set.find(from, to);
  return found
    .map(d => {
      // Decoration.inline 的 type.attrs.class
      const spec = (d as unknown as { type?: { attrs?: { class?: string } } }).type;
      return spec?.attrs?.class ?? '';
    })
    .filter(Boolean);
}

describe('instant-render — syntax_marker 显隐', () => {
  /**
   * 解析 `**粗体**` 得到一个段落，结构为：
   *   [syntax_marker `**`][strong 粗体][syntax_marker `**`]
   * 段落内文本：`**粗体**`，长度 8（** = 2，粗体 = 2，** = 2 ... 共 6 个字符）。
   * 用 findSyntaxMarkerRegions 拿到两个 `**` 区域的精确位置再断言。
   */
  function makeBoldDoc(): Node {
    const { doc } = parseMarkdown('前缀 **粗体** 后缀');
    return doc;
  }

  it('光标在文档别处时，** 语法标记被 decoration 隐藏', () => {
    const doc = makeBoldDoc();
    const { view } = mountWithInstantRender(doc);

    const regions = findSyntaxMarkerRegions(view.state.doc).filter(r => r.syntaxType === 'strong');
    expect(regions.length).toBe(2); // 前后两个 **

    // 把光标放到文档开头（在 ** 区域之外）
    setCursor(view, 1);

    for (const region of regions) {
      const classes = decoClassesIn(view, region.from, region.to);
      expect(classes).toContain('puremark-syntax-hidden');
      expect(classes).not.toContain('puremark-syntax-visible');
    }

    view.destroy();
  });

  it('光标进入粗体区域时，** 语法标记变为显示', () => {
    const doc = makeBoldDoc();
    const { view } = mountWithInstantRender(doc);

    const regions = findSyntaxMarkerRegions(view.state.doc).filter(r => r.syntaxType === 'strong');
    // 第一个 ** 的结束位置之后即进入粗体内容，光标落在两个 ** 之间
    const firstMarker = regions[0];
    const secondMarker = regions[1];
    // 光标放到粗体内容中间（first.to 与 second.from 之间）
    const insidePos = Math.floor((firstMarker.to + secondMarker.from) / 2);
    setCursor(view, insidePos);

    for (const region of regions) {
      const classes = decoClassesIn(view, region.from, region.to);
      expect(classes).toContain('puremark-syntax-visible');
      expect(classes).not.toContain('puremark-syntax-hidden');
    }

    view.destroy();
  });

  it('光标直接落在 ** 标记内时也显示该标记', () => {
    const doc = makeBoldDoc();
    const { view } = mountWithInstantRender(doc);
    const regions = findSyntaxMarkerRegions(view.state.doc).filter(r => r.syntaxType === 'strong');
    const firstMarker = regions[0];
    // 光标落在第一个 ** 标记中间
    setCursor(view, firstMarker.from + 1);

    const classes = decoClassesIn(view, firstMarker.from, firstMarker.to);
    expect(classes).toContain('puremark-syntax-visible');

    view.destroy();
  });
});

describe('input-rules — Markdown 即时转换', () => {
  /** 挂载一个空段落文档 + input-rules 插件，返回 view。 */
  function mountEmpty(): EditorView {
    const place = document.createElement('div');
    document.body.appendChild(place);
    const state = EditorState.create({
      schema: stenoSchema,
      doc: stenoSchema.nodes.doc.create(null, [stenoSchema.nodes.paragraph.create()]),
      plugins: [createInputRulesPlugin()],
    });
    return new EditorView(place, { state });
  }

  /** 模拟逐字符文本输入，触发 inputRules 的 handleTextInput。 */
  function typeText(view: EditorView, text: string): void {
    for (const ch of text) {
      const { from, to } = view.state.selection;
      // handleTextInput 第 5 个参数 deflt 是「默认插入文本」的 transaction 工厂
      const handled = view.someProp('handleTextInput', f =>
        f(view, from, to, ch, () => view.state.tr.insertText(ch, from, to)),
      );
      if (!handled) {
        // 未被 input rule 拦截，按普通文本插入
        view.dispatch(view.state.tr.insertText(ch, from, to));
      }
    }
  }

  it('输入 `> ` 触发引用块转换（paragraph → blockquote > paragraph）', () => {
    const view = mountEmpty();
    // 光标已在段落内 pos=1
    typeText(view, '> ');
    expect(view.state.doc.firstChild?.type.name).toBe('blockquote');
    expect(view.state.doc.firstChild?.firstChild?.type.name).toBe('paragraph');
    view.destroy();
  });

  it('输入 `1. ` 触发有序列表转换', () => {
    const view = mountEmpty();
    typeText(view, '1. ');
    expect(view.state.doc.firstChild?.type.name).toBe('ordered_list');
    expect(view.state.doc.firstChild?.firstChild?.type.name).toBe('list_item');
    view.destroy();
  });

  it('输入 `- ` 触发无序列表转换', () => {
    const view = mountEmpty();
    typeText(view, '- ');
    expect(view.state.doc.firstChild?.type.name).toBe('bullet_list');
    view.destroy();
  });

  it('行内输入 `**粗体**` 触发粗体规则并写入 syntax_marker', () => {
    const view = mountEmpty();
    typeText(view, '**粗体**');
    // 段落内应出现带 strong + syntax_marker 的结构
    const regions = findSyntaxMarkerRegions(view.state.doc).filter(r => r.syntaxType === 'strong');
    expect(regions.length).toBe(2);
    // 粗体内容应带 strong mark
    let hasStrong = false;
    view.state.doc.descendants(node => {
      if (node.isText && node.marks.some(m => m.type.name === 'strong')) hasStrong = true;
      return true;
    });
    expect(hasStrong).toBe(true);
    view.destroy();
  });
});

describe('createEditorPlugins — 装配 smoke', () => {
  it('返回非空 Plugin 数组，且能正常 EditorState.create', () => {
    const plugins = createEditorPlugins({ placeholder: '开始记录…' });
    expect(plugins.length).toBeGreaterThan(0);
    // 能用这些插件构造 state（验证插件 key 无冲突、init 不抛错）
    const state = EditorState.create({
      schema: stenoSchema,
      doc: stenoSchema.nodes.doc.create(null, [stenoSchema.nodes.paragraph.create()]),
      plugins,
    });
    // decorations 插件状态可用
    expect(decorationPluginKey.getState(state)).toBeTruthy();
  });

  it('placeholder 在空文档时通过 attributes 暴露 data-placeholder', () => {
    const plugins = createEditorPlugins({ placeholder: '占位文字' });
    const place = document.createElement('div');
    document.body.appendChild(place);
    const view = new EditorView(place, {
      state: EditorState.create({
        schema: stenoSchema,
        doc: stenoSchema.nodes.doc.create(null, [stenoSchema.nodes.paragraph.create()]),
        plugins,
      }),
    });
    expect(view.dom.getAttribute('data-placeholder')).toBe('占位文字');
    expect(view.dom.className).toContain('steno-editor-empty');
    view.destroy();
  });
});
