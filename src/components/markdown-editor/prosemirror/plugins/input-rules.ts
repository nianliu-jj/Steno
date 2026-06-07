/**
 * @file Steno 输入规则插件
 *
 * 移植自 PureMark `src/core/plugins/input-rules.ts`（732 行）。
 * 自动转换 Markdown 语法：`# `（标题由解析时处理，这里不含）、`> `（引用）、
 * `- `/`* `（无序列表）、`1. `（有序列表）、` ``` `（代码块）、`---`（分隔线）、
 * 行内 `**`/`*`/`~~`/反引号/`==`/`[](...)`/`$...$` 等。
 *
 * Steno 适配说明：
 * - schema 由 `../schema` 的 `stenoSchema` 提供；mark 名 `syntax_marker`、
 *   attr `syntaxType` 与 PureMark 一致。
 * - 保留 PureMark 的 source-view 守卫（`decorationState?.sourceView`）；Steno 的
 *   decorations 插件同样跟踪 `sourceView` 布尔，因此该守卫安全可用。
 * - `any` 全部替换为 `Node` / 具体类型以满足 oxlint 严格模式。
 */

import { inputRules, wrappingInputRule, InputRule } from 'prosemirror-inputrules';
import { type NodeType, type MarkType, type Schema, Fragment, type Node } from 'prosemirror-model';
import { Plugin, TextSelection } from 'prosemirror-state';
import { stenoSchema } from '../schema';
import { decorationPluginKey } from '../decorations';

/** 标题：行首 `#`~`######` + 空格 → 对应级别 heading（即时渲染） */
function headingRule(nodeType: NodeType): InputRule {
  return new InputRule(/^(#{1,6})\s$/, (state, match, start, end) => {
    // 源码视图模式下不自动转换块类型
    const decorationState = decorationPluginKey.getState(state);
    if (decorationState?.sourceView) return null;

    const hashes = match[1];
    const level = hashes.length;
    const $start = state.doc.resolve(start);
    if (!$start.node(-1).canReplaceWith($start.index(-1), $start.indexAfter(-1), nodeType)) {
      return null;
    }

    const syntaxMarkerType = state.schema.marks.syntax_marker;
    // 关键修复：保留 "#" 作为带 syntax_marker(heading) 的可见文本，与 parser.parseHeading
    // 的文档结构（"#" + 普通空格 + 内容）保持一致。
    //
    // 旧实现 `delete(start, end)` 删掉了 "#"，使 heading 节点不含任何级别标记；而
    // serializer 的 heading 处理器只遍历文本节点、不主动补 "#"，于是序列化结果丢失级别
    // 标记，保存后再次解析就退化成普通段落 —— 即"速记/编辑页重新进入标题失效"的根因。
    let tr = state.tr.setBlockType(start, end, nodeType, { level });
    if (syntaxMarkerType) {
      // 此时触发规则的空格尚未插入，start..end 恰好是已输入的 "#"
      tr = tr.addMark(start, end, syntaxMarkerType.create({ syntaxType: 'heading' }));
      // 在 "#" 后补一个分隔空格，并清除其继承的 syntax_marker，使空格保持普通文本
      tr = tr.insertText(' ', end);
      tr = tr.removeMark(end, end + 1, syntaxMarkerType);
    } else {
      tr = tr.insertText(' ', end);
    }
    return tr;
  });
}

/** 引用块：`> ` */
function blockquoteRule(nodeType: NodeType): InputRule {
  return wrappingInputRule(/^>\s$/, nodeType);
}

/** 代码块：` ```lang ` 后按空格 */
function codeBlockRule(nodeType: NodeType): InputRule {
  return new InputRule(/^```(\w*) $/, (state, match, start, end) => {
    // 源码视图模式下不自动创建代码块
    const decorationState = decorationPluginKey.getState(state);
    if (decorationState?.sourceView) return null;

    const language = match[1] || '';
    const $start = state.doc.resolve(start);

    if (!$start.node(-1).canReplaceWith($start.index(-1), $start.indexAfter(-1), nodeType)) {
      return null;
    }

    const paragraphStart = $start.start();
    const codeBlock = nodeType.create({ language });
    const tr = state.tr.replaceWith(paragraphStart, end, codeBlock);
    tr.setSelection(TextSelection.create(tr.doc, paragraphStart + 1));
    return tr;
  });
}

/** 分隔线：`---` / `***` / `___` */
function horizontalRuleRule(nodeType: NodeType): InputRule {
  return new InputRule(/^([-*_]){3,}\s$/, (state, _match, start, end) =>
    state.tr.replaceWith(start - 1, end, nodeType.create()),
  );
}

/** 无序列表：`- ` / `* ` / `+ ` */
function bulletListRule(listType: NodeType, itemType: NodeType): InputRule {
  return wrappingInputRule(/^[-*+]\s$/, listType, null, (_, node) => node.type === itemType);
}

/** 有序列表：`1. ` */
function orderedListRule(listType: NodeType, itemType: NodeType): InputRule {
  return wrappingInputRule(
    /^(\d+)\.\s$/,
    listType,
    match => ({ start: parseInt(match[1], 10) }),
    (match, node) => node.type === itemType && node.childCount + parseInt(match[1], 10) === 1,
  );
}

/** 任务列表：在无序列表项内输入 `[] ` / `[ ] ` / `[x] ` */
function taskListRule(listType: NodeType, itemType: NodeType): InputRule {
  return new InputRule(/^\[([ xX]?)\]\s$/, (state, match, start, end) => {
    const checked = match[1].toLowerCase() === 'x';
    const $start = state.doc.resolve(start);

    if ($start.depth < 2) return null;

    const listItemDepth = $start.depth - 1;
    const listItem = $start.node(listItemDepth);
    const listDepth = listItemDepth - 1;
    const list = $start.node(listDepth);

    if (listItem.type.name !== 'list_item' || list.type.name !== 'bullet_list') return null;

    const paraStart = $start.start($start.depth);
    if (start !== paraStart) return null;

    const listPos = $start.before(listDepth);
    const matchLen = end - start;

    const para = $start.node($start.depth);
    const newParaContent = para.content.cut(matchLen);
    const newPara = para.type.create(
      para.attrs,
      newParaContent.size > 0 ? newParaContent : undefined,
    );

    const itemChildren: Node[] = [newPara];
    for (let i = 1; i < listItem.childCount; i++) {
      itemChildren.push(listItem.child(i));
    }

    if (list.childCount === 1) {
      const newItem = itemType.create({ checked }, itemChildren);
      const newList = listType.create(null, newItem);
      let tr = state.tr.replaceWith(listPos, listPos + list.nodeSize, newList);
      tr = tr.setSelection(TextSelection.near(tr.doc.resolve(listPos + 2)));
      return tr;
    }

    const itemIndex = $start.index(listDepth);
    const newItem = itemType.create({ checked }, itemChildren);
    const newTaskList = listType.create(null, newItem);

    const beforeItems: Node[] = [];
    const afterItems: Node[] = [];
    list.forEach((child, _offset, index) => {
      if (index < itemIndex) beforeItems.push(child);
      else if (index > itemIndex) afterItems.push(child);
    });

    const fragments: Node[] = [];
    if (beforeItems.length > 0) {
      fragments.push(list.type.create(list.attrs, Fragment.from(beforeItems)));
    }
    fragments.push(newTaskList);
    if (afterItems.length > 0) {
      fragments.push(list.type.create(list.attrs, Fragment.from(afterItems)));
    }

    let tr = state.tr.replaceWith(listPos, listPos + list.nodeSize, fragments);
    let cursorPos = listPos;
    if (beforeItems.length > 0) {
      cursorPos += beforeItems.reduce((s, n) => s + n.nodeSize, 0) + 2;
    }
    cursorPos += 2; // 进入 task_list > task_item > paragraph
    tr = tr.setSelection(TextSelection.near(tr.doc.resolve(cursorPos)));
    return tr;
  });
}

/** 无序列表项 → 有序列表（在 bullet_list > list_item > paragraph 开头输入 `数字. `） */
function bulletToOrderedRule(
  orderedListType: NodeType,
  bulletListType: NodeType,
  itemType: NodeType,
): InputRule {
  return new InputRule(/^(\d+)\.\s$/, (state, match, start, end) => {
    const startNum = parseInt(match[1], 10);
    const $start = state.doc.resolve(start);
    if ($start.depth < 2) return null;

    const listItemDepth = $start.depth - 1;
    const listItem = $start.node(listItemDepth);
    const listDepth = listItemDepth - 1;
    const list = $start.node(listDepth);

    if (listItem.type.name !== 'list_item' || list.type !== bulletListType) return null;

    const paraStart = $start.start($start.depth);
    if (start !== paraStart) return null;

    const listPos = $start.before(listDepth);
    const matchLen = end - start;
    const para = $start.node($start.depth);
    const newParaContent = para.content.cut(matchLen);
    const newPara = para.type.create(
      para.attrs,
      newParaContent.size > 0 ? newParaContent : undefined,
    );

    const itemChildren: Node[] = [newPara];
    for (let i = 1; i < listItem.childCount; i++) {
      itemChildren.push(listItem.child(i));
    }

    const newItem = itemType.create(null, itemChildren);
    const newList = orderedListType.create({ start: startNum }, newItem);

    if (list.childCount === 1) {
      let tr = state.tr.replaceWith(listPos, listPos + list.nodeSize, newList);
      tr = tr.setSelection(TextSelection.near(tr.doc.resolve(listPos + 2)));
      return tr;
    }

    const itemIndex = $start.index(listDepth);
    const beforeItems: Node[] = [];
    const afterItems: Node[] = [];
    list.forEach((child, _offset, index) => {
      if (index < itemIndex) beforeItems.push(child);
      else if (index > itemIndex) afterItems.push(child);
    });

    const fragments: Node[] = [];
    if (beforeItems.length > 0) {
      fragments.push(bulletListType.create(list.attrs, Fragment.from(beforeItems)));
    }
    fragments.push(newList);
    if (afterItems.length > 0) {
      fragments.push(bulletListType.create(list.attrs, Fragment.from(afterItems)));
    }

    let tr = state.tr.replaceWith(listPos, listPos + list.nodeSize, fragments);
    let cursorPos = listPos;
    if (beforeItems.length > 0) {
      cursorPos += beforeItems.reduce((s, n) => s + n.nodeSize, 0) + 2;
    }
    cursorPos += 2;
    tr = tr.setSelection(TextSelection.near(tr.doc.resolve(cursorPos)));
    return tr;
  });
}

/** 有序列表项 → 无序列表（在 ordered_list > list_item > paragraph 开头输入 `- `/`* `/`+ `） */
function orderedToBulletRule(
  bulletListType: NodeType,
  orderedListType: NodeType,
  itemType: NodeType,
): InputRule {
  return new InputRule(/^[-*+]\s$/, (state, _match, start, end) => {
    const $start = state.doc.resolve(start);
    if ($start.depth < 2) return null;

    const listItemDepth = $start.depth - 1;
    const listItem = $start.node(listItemDepth);
    const listDepth = listItemDepth - 1;
    const list = $start.node(listDepth);

    if (listItem.type.name !== 'list_item' || list.type !== orderedListType) return null;

    const paraStart = $start.start($start.depth);
    if (start !== paraStart) return null;

    const listPos = $start.before(listDepth);
    const matchLen = end - start;
    const para = $start.node($start.depth);
    const newParaContent = para.content.cut(matchLen);
    const newPara = para.type.create(
      para.attrs,
      newParaContent.size > 0 ? newParaContent : undefined,
    );

    const itemChildren: Node[] = [newPara];
    for (let i = 1; i < listItem.childCount; i++) {
      itemChildren.push(listItem.child(i));
    }

    const newItem = itemType.create(null, itemChildren);
    const newList = bulletListType.create(null, newItem);

    if (list.childCount === 1) {
      let tr = state.tr.replaceWith(listPos, listPos + list.nodeSize, newList);
      tr = tr.setSelection(TextSelection.near(tr.doc.resolve(listPos + 2)));
      return tr;
    }

    const itemIndex = $start.index(listDepth);
    const beforeItems: Node[] = [];
    const afterItems: Node[] = [];
    list.forEach((child, _offset, index) => {
      if (index < itemIndex) beforeItems.push(child);
      else if (index > itemIndex) afterItems.push(child);
    });

    const fragments: Node[] = [];
    if (beforeItems.length > 0) {
      fragments.push(orderedListType.create(list.attrs, Fragment.from(beforeItems)));
    }
    fragments.push(newList);
    if (afterItems.length > 0) {
      fragments.push(orderedListType.create(list.attrs, Fragment.from(afterItems)));
    }

    let tr = state.tr.replaceWith(listPos, listPos + list.nodeSize, fragments);
    let cursorPos = listPos;
    if (beforeItems.length > 0) {
      cursorPos += beforeItems.reduce((s, n) => s + n.nodeSize, 0) + 2;
    }
    cursorPos += 2;
    tr = tr.setSelection(TextSelection.near(tr.doc.resolve(cursorPos)));
    return tr;
  });
}

/**
 * 创建带 syntax_marker 的行内规则，保持与解析器一致的文档结构。
 */
function createInlineRuleWithSyntax(
  pattern: RegExp,
  markType: MarkType,
  prefix: string | ((match: RegExpMatchArray) => string),
  suffix: string | ((match: RegExpMatchArray) => string),
  contentIndex: number,
  syntaxType: string,
): InputRule {
  return new InputRule(pattern, (state, match, start, end) => {
    const schema = state.schema;
    const syntaxMarkerType = schema.marks.syntax_marker;
    const contentMark = markType.create();

    const prefixStr = typeof prefix === 'function' ? prefix(match) : prefix;
    const suffixStr = typeof suffix === 'function' ? suffix(match) : suffix;
    // 支持多个捕获组的情况（如 strong 的正则有两种模式）
    const content = match[contentIndex] || match[contentIndex + 2] || '';

    if (!prefixStr || !content) return null;

    let tr = state.tr.delete(start, end);

    // 前缀（syntax_marker + 语义 mark）
    tr = tr.insertText(prefixStr, start);
    if (syntaxMarkerType) {
      tr = tr.addMark(start, start + prefixStr.length, syntaxMarkerType.create({ syntaxType }));
    }
    tr = tr.addMark(start, start + prefixStr.length, contentMark);

    // 内容（语义 mark）
    const contentStart = start + prefixStr.length;
    tr = tr.insertText(content, contentStart);
    tr = tr.addMark(contentStart, contentStart + content.length, contentMark);

    // 后缀（syntax_marker + 语义 mark）
    const suffixStart = contentStart + content.length;
    tr = tr.insertText(suffixStr, suffixStart);
    if (syntaxMarkerType) {
      tr = tr.addMark(
        suffixStart,
        suffixStart + suffixStr.length,
        syntaxMarkerType.create({ syntaxType }),
      );
    }
    tr = tr.addMark(suffixStart, suffixStart + suffixStr.length, contentMark);

    return tr;
  });
}

/** 行内代码：`` `code` `` */
function inlineCodeRule(markType: MarkType): InputRule {
  return createInlineRuleWithSyntax(/`([^`]+)`$/, markType, '`', '`', 1, 'code_inline');
}

/** 粗体：`**text**` / `__text__` */
function strongRule(markType: MarkType): InputRule {
  return createInlineRuleWithSyntax(
    /(?<!\*)(\*\*)(?!\*)(.+?)(?<!\*)\1(?!\*)$|(?<!_)(__)(?!_)(.+?)(?<!_)\3(?!_)$/,
    markType,
    m => m[1] || m[3],
    m => m[1] || m[3],
    2,
    'strong',
  );
}

/** 斜体：`*text*` / `_text_` */
function emphasisRule(markType: MarkType): InputRule {
  return createInlineRuleWithSyntax(
    /(?<![*_\w])(\*)(?![*\s])(.+?)(?<![*\s])\1(?![*])$|(?<![*_])(_)(?![_\s])(?=\S)(.+?)(?<=\S)(?<![_\s])\3(?![_\w])$/,
    markType,
    m => m[1] || m[3],
    m => m[1] || m[3],
    2,
    'emphasis',
  );
}

/** 删除线：`~~text~~` */
function strikethroughRule(markType: MarkType): InputRule {
  return createInlineRuleWithSyntax(/~~(.+?)~~$/, markType, '~~', '~~', 1, 'strikethrough');
}

/** 高亮：`==text==` */
function highlightRule(markType: MarkType): InputRule {
  return createInlineRuleWithSyntax(/==(.+?)==$/, markType, '==', '==', 1, 'highlight');
}

/** 链接：`[text](url)`（url 可为空，排除图片语法） */
function linkRule(markType: MarkType): InputRule {
  return new InputRule(
    /(?<!!)\[([^\]]+)\]\(((?:[^)\\]|\\.)*)?\)$/,
    (state, match, start, end) => {
      const schema = state.schema;
      const syntaxMarkerType = schema.marks.syntax_marker;
      const url = match[2] || '';
      const linkMark = markType.create({ href: url, title: '' });
      const text = match[1];

      let tr = state.tr.delete(start, end);

      const prefix = '[';
      const suffix = `](${url})`;

      // 前缀 [ (syntax_marker + link)
      tr = tr.insertText(prefix, start);
      if (syntaxMarkerType) {
        tr = tr.addMark(start, start + prefix.length, syntaxMarkerType.create({ syntaxType: 'link' }));
      }
      tr = tr.addMark(start, start + prefix.length, linkMark);

      // 链接文本 (link only)
      const textStart = start + prefix.length;
      tr = tr.insertText(text, textStart);
      tr = tr.addMark(textStart, textStart + text.length, linkMark);

      // 后缀 ](url) (syntax_marker + link)
      const suffixStart = textStart + text.length;
      tr = tr.insertText(suffix, suffixStart);
      if (syntaxMarkerType) {
        tr = tr.addMark(
          suffixStart,
          suffixStart + suffix.length,
          syntaxMarkerType.create({ syntaxType: 'link' }),
        );
      }
      tr = tr.addMark(suffixStart, suffixStart + suffix.length, linkMark);

      return tr;
    },
  );
}

/** 行内图片：`![alt](src)` */
function imageRule(nodeType: NodeType): InputRule {
  return new InputRule(/!\[([^\]]*)\]\(([^)]+)\)$/, (state, match, start, end) => {
    const alt = match[1] || '';
    const src = match[2] || '';
    return state.tr.replaceWith(start, end, nodeType.create({ src, alt, title: '' }));
  });
}

/** 链接图片：`[![alt](src)](href)` */
function linkedImageRule(nodeType: NodeType): InputRule {
  return new InputRule(/\[!\[([^\]]*)\]\(([^)]+)\)\]\(([^)]+)\)$/, (state, match, start, end) => {
    const alt = match[1] || '';
    const src = match[2] || '';
    const linkHref = match[3] || '';
    return state.tr.replaceWith(
      start,
      end,
      nodeType.create({ src, alt, title: '', linkHref, linkTitle: '' }),
    );
  });
}

/** 下标：`<sub>text</sub>` */
function subRule(markType: MarkType): InputRule {
  return createInlineRuleWithSyntax(/<sub>(.+?)<\/sub>$/, markType, '<sub>', '</sub>', 1, 'sub');
}

/** 上标：`<sup>text</sup>` */
function supRule(markType: MarkType): InputRule {
  return createInlineRuleWithSyntax(/<sup>(.+?)<\/sup>$/, markType, '<sup>', '</sup>', 1, 'sup');
}

/** 不应通过通用 html_inline 规则处理的标签（已有专用 mark） */
const HTML_INLINE_SKIP_TAGS = new Set(['sub', 'sup']);

/** 通用行内 HTML：`<tag attrs>content</tag>` */
function htmlInlineRule(markType: MarkType): InputRule {
  return new InputRule(
    /<([a-zA-Z][a-zA-Z0-9]*)(\s(?:[^>"']|"[^"]*"|'[^']*')*)?>(.+?)<\/\1>$/,
    (state, match, start, end) => {
      const tag = match[1].toLowerCase();
      const htmlAttrs = (match[2] || '').trim();

      if (HTML_INLINE_SKIP_TAGS.has(tag)) return null;

      const schema = state.schema;
      const syntaxMarkerType = schema.marks.syntax_marker;
      const contentMark = markType.create({ tag, htmlAttrs });

      const prefix = `<${match[1]}${match[2] || ''}>`;
      const suffix = `</${match[1]}>`;
      const content = match[3];
      if (!content) return null;

      let tr = state.tr.delete(start, end);

      tr = tr.insertText(prefix, start);
      if (syntaxMarkerType) {
        tr = tr.addMark(
          start,
          start + prefix.length,
          syntaxMarkerType.create({ syntaxType: 'html_inline' }),
        );
      }
      tr = tr.addMark(start, start + prefix.length, contentMark);

      const contentStart = start + prefix.length;
      tr = tr.insertText(content, contentStart);
      tr = tr.addMark(contentStart, contentStart + content.length, contentMark);

      const suffixStart = contentStart + content.length;
      tr = tr.insertText(suffix, suffixStart);
      if (syntaxMarkerType) {
        tr = tr.addMark(
          suffixStart,
          suffixStart + suffix.length,
          syntaxMarkerType.create({ syntaxType: 'html_inline' }),
        );
      }
      tr = tr.addMark(suffixStart, suffixStart + suffix.length, contentMark);

      return tr;
    },
  );
}

/** 数学块：行首 `$$ ` 后空格创建空数学块 */
function mathBlockRule(nodeType: NodeType): InputRule {
  return new InputRule(/^\$\$\s$/, (state, _match, start, end) => {
    const $start = state.doc.resolve(start);
    if (!$start.node(-1).canReplaceWith($start.index(-1), $start.indexAfter(-1), nodeType)) {
      return null;
    }
    const tr = state.tr.delete(start, end).setBlockType(start, start, nodeType);
    tr.setSelection(TextSelection.create(tr.doc, start + 1));
    return tr;
  });
}

/** 单行数学块：`$$content$$` */
function mathBlockInlineRule(nodeType: NodeType): InputRule {
  return new InputRule(/^\$\$(.+)\$\$$/, (state, match, start, end) => {
    const $start = state.doc.resolve(start);
    if (!$start.node(-1).canReplaceWith($start.index(-1), $start.indexAfter(-1), nodeType)) {
      return null;
    }
    const content = match[1];
    const textNode = content ? state.schema.text(content) : null;
    return state.tr
      .delete(start, end)
      .replaceWith(start, start, nodeType.create({}, textNode ? [textNode] : []));
  });
}

/** 行内数学：`$content$`（排除 `$$`） */
function mathInlineRule(markType: MarkType): InputRule {
  return createInlineRuleWithSyntax(/(?<!\$)\$([^$]+)\$$/, markType, '$', '$', 1, 'math_inline');
}

/** 容器：`:::type` */
function containerRule(nodeType: NodeType): InputRule {
  return new InputRule(/^:::(\w+)(?:\s+(.*))?$/, (state, match, start, end) => {
    const type = match[1];
    const title = match[2] || '';
    const paragraph = state.schema.nodes.paragraph.create();
    return state.tr.replaceWith(start - 1, end, nodeType.create({ type, title }, paragraph));
  });
}

/**
 * 创建输入规则插件
 */
export function createInputRulesPlugin(schema: Schema = stenoSchema): Plugin {
  const rules: InputRule[] = [];

  // 块级规则（标题 `# ` 即时转换；其余块级语法见下）
  if (schema.nodes.heading) {
    rules.push(headingRule(schema.nodes.heading));
  }
  if (schema.nodes.blockquote) {
    rules.push(blockquoteRule(schema.nodes.blockquote));
  }
  if (schema.nodes.code_block) {
    rules.push(codeBlockRule(schema.nodes.code_block));
  }
  if (schema.nodes.horizontal_rule) {
    rules.push(horizontalRuleRule(schema.nodes.horizontal_rule));
  }
  // 列表类型转换规则（必须在基础列表规则之前，否则 wrappingInputRule 会先匹配）
  if (schema.nodes.bullet_list && schema.nodes.ordered_list && schema.nodes.list_item) {
    rules.push(
      bulletToOrderedRule(schema.nodes.ordered_list, schema.nodes.bullet_list, schema.nodes.list_item),
    );
    rules.push(
      orderedToBulletRule(schema.nodes.bullet_list, schema.nodes.ordered_list, schema.nodes.list_item),
    );
  }
  if (schema.nodes.task_list && schema.nodes.task_item) {
    rules.push(taskListRule(schema.nodes.task_list, schema.nodes.task_item));
  }
  // 基础列表创建规则
  if (schema.nodes.bullet_list && schema.nodes.list_item) {
    rules.push(bulletListRule(schema.nodes.bullet_list, schema.nodes.list_item));
  }
  if (schema.nodes.ordered_list && schema.nodes.list_item) {
    rules.push(orderedListRule(schema.nodes.ordered_list, schema.nodes.list_item));
  }
  if (schema.nodes.math_block) {
    rules.push(mathBlockRule(schema.nodes.math_block));
    rules.push(mathBlockInlineRule(schema.nodes.math_block));
  }
  if (schema.nodes.container) {
    rules.push(containerRule(schema.nodes.container));
  }

  // 行内规则
  if (schema.marks.code_inline) {
    rules.push(inlineCodeRule(schema.marks.code_inline));
  }
  if (schema.marks.strong) {
    rules.push(strongRule(schema.marks.strong));
  }
  if (schema.marks.emphasis) {
    rules.push(emphasisRule(schema.marks.emphasis));
  }
  if (schema.marks.strikethrough) {
    rules.push(strikethroughRule(schema.marks.strikethrough));
  }
  if (schema.marks.highlight) {
    rules.push(highlightRule(schema.marks.highlight));
  }
  if (schema.marks.link) {
    rules.push(linkRule(schema.marks.link));
  }
  if (schema.nodes.image) {
    rules.push(linkedImageRule(schema.nodes.image));
    rules.push(imageRule(schema.nodes.image));
  }
  if (schema.marks.math_inline) {
    rules.push(mathInlineRule(schema.marks.math_inline));
  }
  if (schema.marks.sub) {
    rules.push(subRule(schema.marks.sub));
  }
  if (schema.marks.sup) {
    rules.push(supRule(schema.marks.sup));
  }
  if (schema.marks.html_inline) {
    rules.push(htmlInlineRule(schema.marks.html_inline));
  }

  return inputRules({ rules });
}
