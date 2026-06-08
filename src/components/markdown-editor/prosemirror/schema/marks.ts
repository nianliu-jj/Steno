/**
 * @file ProseMirror MarkSpec 集合
 *
 * 由 PureMark `src/core/schema/index.ts` 标记定义部分移植。Mark 名称、attrs、
 * parseDOM、toDOM 保持与 PureMark 完全一致，便于后续 parser/serializer 直接套用。
 *
 * 重点：`syntax_marker` 是 Typora 风格 WYSIWYG 的关键 —— 它把 Markdown 源码标记
 * 符号（`**` / `*` / `~~` / `` ` `` 等）作为可见文本节点保留进文档，并由
 * `plugins/instant-render.ts` 通过 Decoration 控制显隐。
 */

import type { MarkSpec, DOMOutputSpec } from 'prosemirror-model';
import { SAFE_INLINE_TAGS, parseHtmlAttrs } from './html-inline';

const strong: MarkSpec = {
  // 新输入的文本不自动继承此 mark
  inclusive: false,
  parseDOM: [
    { tag: 'strong' },
    {
      tag: 'b',
      getAttrs: node => (node as HTMLElement).style.fontWeight !== 'normal' && null
    },
    {
      style: 'font-weight',
      getAttrs: value => /^(bold(er)?|[5-9]\d{2,})$/.test(value as string) && null
    }
  ],
  toDOM(): DOMOutputSpec {
    return ['strong', 0];
  }
};

const emphasis: MarkSpec = {
  inclusive: false,
  parseDOM: [
    { tag: 'em' },
    {
      tag: 'i',
      getAttrs: node => (node as HTMLElement).style.fontStyle !== 'normal' && null
    },
    { style: 'font-style=italic' }
  ],
  toDOM(): DOMOutputSpec {
    return ['em', 0];
  }
};

const code_inline: MarkSpec = {
  inclusive: false,
  parseDOM: [{ tag: 'code' }],
  toDOM(): DOMOutputSpec {
    return ['code', { class: 'steno-code-inline' }, 0];
  }
};

const strikethrough: MarkSpec = {
  inclusive: false,
  parseDOM: [
    { tag: 's' },
    { tag: 'del' },
    { tag: 'strike' },
    {
      style: 'text-decoration',
      getAttrs: value => (value as string).includes('line-through') && null
    }
  ],
  toDOM(): DOMOutputSpec {
    return ['del', 0];
  }
};

const link: MarkSpec = {
  attrs: {
    href: { default: '' },
    title: { default: '' }
  },
  inclusive: false,
  parseDOM: [
    {
      tag: 'a[href]',
      getAttrs(node) {
        // 局部常量 el：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
        const el = node as HTMLElement;
        return {
          href: el.getAttribute('href') ?? '',
          title: el.getAttribute('title') ?? ''
        };
      }
    }
  ],
  toDOM(mark): DOMOutputSpec {
    return ['a', { href: mark.attrs.href, title: mark.attrs.title || null }, 0];
  }
};

const highlight: MarkSpec = {
  inclusive: false,
  parseDOM: [
    { tag: 'mark' },
    {
      style: 'background-color',
      getAttrs: value => (value as string) !== 'transparent' && null
    }
  ],
  toDOM(): DOMOutputSpec {
    return ['mark', 0];
  }
};

const math_inline: MarkSpec = {
  attrs: {
    content: { default: '' }
  },
  parseDOM: [
    {
      tag: 'span.math-inline',
      getAttrs(node) {
        // 局部常量 el：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
        const el = node as HTMLElement;
        return { content: el.getAttribute('data-content') ?? '' };
      }
    }
  ],
  toDOM(mark): DOMOutputSpec {
    return ['span', { class: 'math-inline', 'data-content': mark.attrs.content }, 0];
  }
};

const sub: MarkSpec = {
  inclusive: false,
  parseDOM: [{ tag: 'sub' }],
  toDOM(): DOMOutputSpec {
    return ['sub', 0];
  }
};

const sup: MarkSpec = {
  inclusive: false,
  parseDOM: [{ tag: 'sup' }],
  toDOM(): DOMOutputSpec {
    return ['sup', 0];
  }
};

const html_inline: MarkSpec = {
  attrs: {
    tag: { default: 'span' },
    /** 原始属性字符串，例如 `style="color:red" class="foo"` */
    htmlAttrs: { default: '' }
  },
  inclusive: false,
  // 与其他 mark 共存
  excludes: '',
  toDOM(mark): DOMOutputSpec {
    // 函数式常量 tag：以闭包形式组织逻辑，便于在组件、store 或测试中传递。
    const tag = (mark.attrs.tag as string) || 'span';
    // 局部常量 safeTag：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const safeTag = SAFE_INLINE_TAGS.has(tag) ? tag : 'span';
    // 局部常量 attrs：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const attrs = parseHtmlAttrs(mark.attrs.htmlAttrs as string);
    return [safeTag, attrs, 0];
  }
};

const footnote_ref: MarkSpec = {
  attrs: {
    id: { default: '' }
  },
  parseDOM: [
    {
      tag: 'sup.footnote-ref',
      getAttrs(node) {
        // 局部常量 el：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
        const el = node as HTMLElement;
        return { id: el.getAttribute('data-id') ?? '' };
      }
    }
  ],
  toDOM(mark): DOMOutputSpec {
    return ['sup', { class: 'footnote-ref', 'data-id': mark.attrs.id }, 0];
  }
};

/**
 * 语法标记 Mark —— Typora 风格 WYSIWYG 的关键。
 *
 * 把 Markdown 源码符号（如 `**`、`*`、`~~`、`` ` `` 等）作为带此 mark 的可见
 * 文本节点保留进文档，让光标能在源码标记内自由移动；由
 * `plugins/instant-render.ts` 通过 Decoration 控制隐藏/显示。
 */
const syntax_marker: MarkSpec = {
  attrs: {
    /** 语法类型：strong / emphasis / code_inline / strikethrough / highlight / link / image / math_inline … */
    syntaxType: { default: '' }
  },
  excludes: '',
  // 防止用户在语法区域内继续输入时无法逃出
  inclusive: false,
  parseDOM: [
    {
      tag: 'span.steno-syntax',
      getAttrs(node) {
        // 局部常量 el：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
        const el = node as HTMLElement;
        return { syntaxType: el.getAttribute('data-syntax-type') ?? '' };
      }
    }
  ],
  toDOM(mark): DOMOutputSpec {
    return [
      'span',
      {
        class: 'steno-syntax',
        'data-syntax-type': mark.attrs.syntaxType
      },
      0
    ];
  }
};

/**
 * Mark 定义集合。`syntax_marker` 放在最前面，优先级最高，便于和其它 mark
 * 共存（与 PureMark 一致）。
 */
export const marks = {
  syntax_marker,
  strong,
  emphasis,
  code_inline,
  strikethrough,
  link,
  highlight,
  math_inline,
  sub,
  sup,
  html_inline,
  footnote_ref
};
