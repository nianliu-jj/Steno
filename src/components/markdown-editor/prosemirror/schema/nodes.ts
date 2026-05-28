/**
 * @file ProseMirror NodeSpec 集合
 *
 * 由 PureMark `src/core/schema/index.ts` 节点定义部分移植；保留 PureMark 注释，
 * 增加 Steno 适配说明：
 *
 * - 块级节点统一新增 `startLine: { default: null }` attr，用于支撑
 *   `MarkdownEditor.scrollToLine(line)` 与 `MarkdownReadSurface.scrollToHeading(id)`
 *   的视口滚动。parser 在生成节点时填充该值。
 *
 * - paragraph 节点保留了 PureMark 用于 source-view 模式的 attrs（codeBlockId /
 *   imageAttrs / tableId 等），Steno 不实现 source-view，但保留 attrs 可以最大化
 *   后续 parser 移植的兼容性，避免在迁移期遇到"PureMark parser 写入属性而
 *   schema 不接收"的问题。
 *
 * - 仍未实现的 PureMark 节点（container 自定义容器）保留 spec 占位，parser/serializer
 *   暂不消费；后续 change 启用时只需补 parser 规则。
 */

import type { NodeSpec, DOMOutputSpec } from 'prosemirror-model';

const doc: NodeSpec = {
  content: 'block+',
};

const paragraph: NodeSpec = {
  attrs: {
    // Steno 增量：源 Markdown 行号，用于 scrollToLine
    startLine: { default: null },
    // 以下为 PureMark source-view 模式遗留 attrs，Steno 暂不使用但保留兼容
    codeBlockId: { default: null },
    lineIndex: { default: null },
    totalLines: { default: null },
    language: { default: null },
    imageAttrs: { default: null },
    imageGroupSource: { default: null },
    hrSource: { default: null },
    tableId: { default: null },
    tableRowIndex: { default: null },
    tableTotalRows: { default: null },
    htmlBlockId: { default: null },
    htmlBlockLineIndex: { default: null },
    htmlBlockTotalLines: { default: null },
    mathBlockId: { default: null },
    mathBlockLineIndex: { default: null },
    mathBlockTotalLines: { default: null },
    listId: { default: null },
    listLineIndex: { default: null },
    listTotalLines: { default: null },
  },
  content: 'inline*',
  group: 'block',
  parseDOM: [{ tag: 'p' }],
  toDOM(node): DOMOutputSpec {
    const attrs: Record<string, unknown> = {};
    if (node.attrs.codeBlockId) {
      attrs['data-code-block-id'] = node.attrs.codeBlockId;
      attrs['data-line-index'] = node.attrs.lineIndex;
      attrs['data-total-lines'] = node.attrs.totalLines;
      attrs['data-language'] = node.attrs.language;
    }
    if (node.attrs.imageAttrs) {
      attrs['data-image-source'] = 'true';
    }
    if (node.attrs.hrSource) {
      attrs['data-hr-source'] = 'true';
    }
    if (node.attrs.tableId) {
      attrs['data-table-id'] = node.attrs.tableId;
      attrs['data-table-row-index'] = node.attrs.tableRowIndex;
      attrs['data-table-total-rows'] = node.attrs.tableTotalRows;
    }
    if (node.attrs.htmlBlockId) {
      attrs['data-html-block-id'] = node.attrs.htmlBlockId;
      attrs['data-html-block-line-index'] = node.attrs.htmlBlockLineIndex;
      attrs['data-html-block-total-lines'] = node.attrs.htmlBlockTotalLines;
    }
    if (node.attrs.mathBlockId) {
      attrs['data-math-block-id'] = node.attrs.mathBlockId;
      attrs['data-math-block-line-index'] = node.attrs.mathBlockLineIndex;
      attrs['data-math-block-total-lines'] = node.attrs.mathBlockTotalLines;
    }
    if (node.attrs.listId) {
      attrs['data-list-id'] = node.attrs.listId;
      attrs['data-list-line-index'] = node.attrs.listLineIndex;
      attrs['data-list-total-lines'] = node.attrs.listTotalLines;
    }
    return ['p', attrs, 0];
  },
};

const heading: NodeSpec = {
  attrs: {
    level: { default: 1 },
    startLine: { default: null },
  },
  content: 'inline*',
  group: 'block',
  defining: true,
  parseDOM: [
    { tag: 'h1', attrs: { level: 1 } },
    { tag: 'h2', attrs: { level: 2 } },
    { tag: 'h3', attrs: { level: 3 } },
    { tag: 'h4', attrs: { level: 4 } },
    { tag: 'h5', attrs: { level: 5 } },
    { tag: 'h6', attrs: { level: 6 } },
  ],
  toDOM(node): DOMOutputSpec {
    return [`h${node.attrs.level}`, 0];
  },
};

const blockquote: NodeSpec = {
  attrs: {
    startLine: { default: null },
  },
  content: 'block+',
  group: 'block',
  defining: true,
  parseDOM: [{ tag: 'blockquote' }],
  toDOM(): DOMOutputSpec {
    return ['blockquote', 0];
  },
};

const code_block: NodeSpec = {
  attrs: {
    language: { default: '' },
    startLine: { default: null },
  },
  content: 'text*',
  marks: '',
  group: 'block',
  code: true,
  defining: true,
  parseDOM: [
    {
      tag: 'pre',
      preserveWhitespace: 'full' as const,
      getAttrs(node) {
        const el = node as HTMLElement;
        const code = el.querySelector('code');
        const className = code?.className ?? '';
        const match = /language-(\w+)/.exec(className);
        return { language: match ? match[1] : '' };
      },
    },
  ],
  toDOM(node): DOMOutputSpec {
    return [
      'pre',
      ['code', { class: node.attrs.language ? `language-${node.attrs.language}` : '' }, 0],
    ];
  },
};

const horizontal_rule: NodeSpec = {
  attrs: {
    startLine: { default: null },
  },
  group: 'block',
  parseDOM: [{ tag: 'hr' }],
  toDOM(): DOMOutputSpec {
    return ['hr'];
  },
};

const bullet_list: NodeSpec = {
  attrs: {
    startLine: { default: null },
  },
  content: 'list_item+',
  group: 'block',
  parseDOM: [{ tag: 'ul' }],
  toDOM(): DOMOutputSpec {
    return ['ul', 0];
  },
};

const ordered_list: NodeSpec = {
  attrs: {
    start: { default: 1 },
    startLine: { default: null },
  },
  content: 'list_item+',
  group: 'block',
  parseDOM: [
    {
      tag: 'ol',
      getAttrs(node) {
        const el = node as HTMLElement;
        return { start: el.hasAttribute('start') ? Number(el.getAttribute('start')) : 1 };
      },
    },
  ],
  toDOM(node): DOMOutputSpec {
    return node.attrs.start === 1 ? ['ol', 0] : ['ol', { start: node.attrs.start }, 0];
  },
};

const list_item: NodeSpec = {
  content: 'block+',
  parseDOM: [{ tag: 'li' }],
  toDOM(): DOMOutputSpec {
    return ['li', 0];
  },
  defining: true,
};

const task_list: NodeSpec = {
  attrs: {
    startLine: { default: null },
  },
  content: 'task_item+',
  group: 'block',
  parseDOM: [{ tag: 'ul.task-list' }],
  toDOM(): DOMOutputSpec {
    return ['ul', { class: 'task-list' }, 0];
  },
};

const task_item: NodeSpec = {
  attrs: {
    checked: { default: false },
  },
  content: 'block+',
  parseDOM: [
    {
      tag: 'li.task-item',
      getAttrs(node) {
        const el = node as HTMLElement;
        const checkbox = el.querySelector('input[type="checkbox"]');
        return { checked: checkbox ? (checkbox as HTMLInputElement).checked : false };
      },
    },
  ],
  toDOM(node): DOMOutputSpec {
    return [
      'li',
      { class: 'task-item' },
      ['input', { type: 'checkbox', checked: node.attrs.checked ? 'checked' : null }],
      ['span', 0],
    ];
  },
  defining: true,
};

const table: NodeSpec = {
  attrs: {
    startLine: { default: null },
  },
  content: 'table_row+',
  group: 'block',
  tableRole: 'table',
  isolating: true,
  parseDOM: [{ tag: 'table' }],
  toDOM(): DOMOutputSpec {
    return ['table', ['tbody', 0]];
  },
};

const table_row: NodeSpec = {
  content: '(table_cell | table_header)+',
  tableRole: 'row',
  parseDOM: [{ tag: 'tr' }],
  toDOM(): DOMOutputSpec {
    return ['tr', 0];
  },
};

const table_cell: NodeSpec = {
  content: 'inline*',
  attrs: {
    colspan: { default: 1 },
    rowspan: { default: 1 },
    align: { default: null },
  },
  tableRole: 'cell',
  isolating: true,
  parseDOM: [
    {
      tag: 'td',
      getAttrs(node) {
        const el = node as HTMLElement;
        return {
          colspan: Number(el.getAttribute('colspan')) || 1,
          rowspan: Number(el.getAttribute('rowspan')) || 1,
          align: el.style.textAlign || null,
        };
      },
    },
  ],
  toDOM(node): DOMOutputSpec {
    const attrs: Record<string, unknown> = {};
    if (node.attrs.colspan !== 1) attrs.colspan = node.attrs.colspan;
    if (node.attrs.rowspan !== 1) attrs.rowspan = node.attrs.rowspan;
    if (node.attrs.align) attrs.style = `text-align: ${node.attrs.align}`;
    return ['td', attrs, 0];
  },
};

const table_header: NodeSpec = {
  content: 'inline*',
  attrs: {
    colspan: { default: 1 },
    rowspan: { default: 1 },
    align: { default: null },
  },
  tableRole: 'header_cell',
  isolating: true,
  parseDOM: [
    {
      tag: 'th',
      getAttrs(node) {
        const el = node as HTMLElement;
        return {
          colspan: Number(el.getAttribute('colspan')) || 1,
          rowspan: Number(el.getAttribute('rowspan')) || 1,
          align: el.style.textAlign || null,
        };
      },
    },
  ],
  toDOM(node): DOMOutputSpec {
    const attrs: Record<string, unknown> = {};
    if (node.attrs.colspan !== 1) attrs.colspan = node.attrs.colspan;
    if (node.attrs.rowspan !== 1) attrs.rowspan = node.attrs.rowspan;
    if (node.attrs.align) attrs.style = `text-align: ${node.attrs.align}`;
    return ['th', attrs, 0];
  },
};

const math_block: NodeSpec = {
  attrs: {
    language: { default: 'latex' },
    startLine: { default: null },
  },
  content: 'text*',
  marks: '',
  group: 'block',
  code: true,
  defining: true,
  parseDOM: [{ tag: 'div.math-block', preserveWhitespace: 'full' as const }],
  toDOM(): DOMOutputSpec {
    return ['div', { class: 'math-block' }, ['pre', 0]];
  },
};

const mermaid_block: NodeSpec = {
  attrs: {
    startLine: { default: null },
  },
  content: 'text*',
  marks: '',
  group: 'block',
  code: true,
  defining: true,
  parseDOM: [{ tag: 'div.mermaid-block', preserveWhitespace: 'full' as const }],
  toDOM(): DOMOutputSpec {
    return ['div', { class: 'mermaid-block' }, ['pre', 0]];
  },
};

const html_block: NodeSpec = {
  attrs: {
    startLine: { default: null },
  },
  content: 'text*',
  marks: '',
  group: 'block',
  code: true,
  defining: true,
  parseDOM: [{ tag: 'div.html-block', preserveWhitespace: 'full' as const }],
  toDOM(): DOMOutputSpec {
    return ['div', { class: 'html-block' }, ['pre', 0]];
  },
};

const container: NodeSpec = {
  attrs: {
    type: { default: 'note' },
    title: { default: '' },
    startLine: { default: null },
  },
  content: 'block+',
  group: 'block',
  defining: true,
  parseDOM: [
    {
      tag: 'div.container',
      getAttrs(node) {
        const el = node as HTMLElement;
        return {
          type: el.getAttribute('data-type') ?? 'note',
          title: el.getAttribute('data-title') ?? '',
        };
      },
    },
  ],
  toDOM(node): DOMOutputSpec {
    return [
      'div',
      {
        class: `container container-${node.attrs.type}`,
        'data-type': node.attrs.type,
        'data-title': node.attrs.title,
      },
      0,
    ];
  },
};

const image: NodeSpec = {
  attrs: {
    src: { default: '' },
    alt: { default: '' },
    title: { default: '' },
    linkHref: { default: '' },
    linkTitle: { default: '' },
    consecutiveGroup: { default: null },
    startLine: { default: null },
  },
  group: 'block',
  draggable: true,
  parseDOM: [
    {
      tag: 'img[src]',
      getAttrs(node) {
        const el = node as HTMLElement;
        const parentA = el.parentElement?.tagName === 'A' ? el.parentElement : null;
        return {
          src: el.getAttribute('src') ?? '',
          alt: el.getAttribute('alt') ?? '',
          title: el.getAttribute('title') ?? '',
          linkHref: parentA?.getAttribute('href') ?? '',
          linkTitle: parentA?.getAttribute('title') ?? '',
        };
      },
    },
  ],
  toDOM(node): DOMOutputSpec {
    const img: DOMOutputSpec = [
      'img',
      { src: node.attrs.src, alt: node.attrs.alt, title: node.attrs.title },
    ];
    if (node.attrs.linkHref) {
      return ['a', { href: node.attrs.linkHref, title: node.attrs.linkTitle || null }, img];
    }
    return img;
  },
};

const text: NodeSpec = {
  group: 'inline',
};

const hard_break: NodeSpec = {
  inline: true,
  group: 'inline',
  selectable: false,
  parseDOM: [{ tag: 'br' }],
  toDOM(): DOMOutputSpec {
    return ['br'];
  },
};

/** 节点定义集合 —— 顺序与 PureMark 保持一致，便于对照。 */
export const nodes = {
  doc,
  paragraph,
  heading,
  blockquote,
  code_block,
  horizontal_rule,
  bullet_list,
  ordered_list,
  list_item,
  task_list,
  task_item,
  table,
  table_row,
  table_cell,
  table_header,
  math_block,
  mermaid_block,
  html_block,
  container,
  image,
  text,
  hard_break,
};
