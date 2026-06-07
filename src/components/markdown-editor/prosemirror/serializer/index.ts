/**
 * @file Steno ProseMirror → Markdown 序列化器
 *
 * 由 PureMark `src/core/serializer/index.ts` 全量移植。
 *
 * 核心思路（与 PureMark 一致）：parser 已经把 `**`、`>`、`#` 等 Markdown
 * 语法标记符号作为带 `syntax_marker` mark 的可见文本节点保留进文档；
 * 因此 serializer 只需直接遍历文本节点输出原文，无需重新构造标记。
 * `serializeTextWithMarks` / `wrapWithMark` 是兼容路径，处理文档中
 * 因 input-rules / 粘贴等渠道进来、未携带 syntax_marker 的 mark 文本。
 *
 * Steno 适配点：
 * - 新增 `mermaid_block` 节点处理器（输出 ```mermaid 围栏块）
 * - import 类型仅使用 prosemirror-model 公共 API
 */

import type { Fragment, Mark, Node } from 'prosemirror-model';

/** 序列化选项。 */
export interface SerializeOptions {
  /** 是否使用紧凑模式（减少空行） */
  compact?: boolean;
  /** 列表缩进字符数 */
  listIndent?: number;
  /** 代码块围栏字符 */
  codeFence?: string;
}

const defaultOptions: Required<SerializeOptions> = {
  compact: false,
  listIndent: 2,
  codeFence: '```',
};

/** Markdown 序列化器。 */
export class MarkdownSerializer {
  private options: Required<SerializeOptions>;

  constructor(options: SerializeOptions = {}) {
    this.options = { ...defaultOptions, ...options };
  }

  /** 序列化文档。 */
  serialize(doc: Node): string {
    const lines: string[] = [];
    this.serializeFragment(doc.content, lines, '');
    return lines.join('\n');
  }

  /** 序列化 Fragment。 */
  private serializeFragment(fragment: Fragment, lines: string[], indent: string): void {
    fragment.forEach((node, _, index) => {
      this.serializeNode(node, lines, indent, index, fragment);
    });
  }

  /** 序列化节点（派发到对应 handler）。 */
  private serializeNode(
    node: Node,
    lines: string[],
    indent: string,
    index: number,
    fragment: Fragment,
  ): void {
    const handler = this.nodeHandlers[node.type.name];
    if (handler) {
      handler.call(this, node, lines, indent, index, fragment);
    } else {
      this.serializeFragment(node.content, lines, indent);
    }
  }

  /** 节点处理器映射。 */
  private nodeHandlers: Record<
    string,
    (node: Node, lines: string[], indent: string, index: number, fragment: Fragment) => void
  > = {
    paragraph: (node, lines, indent) => {
      // PureMark source-view 模式遗留的 paragraph 子类型（Steno 不会主动生成
      // 这些 attrs，但保留兼容以接收 PureMark 风格的文档输入）
      if (node.attrs.codeBlockId) {
        const text = node.textContent;
        lines.push(indent + text);
        const isLastLine = node.attrs.lineIndex === (node.attrs.totalLines as number) - 1;
        if (isLastLine && !this.options.compact) lines.push('');
      } else if (node.attrs.tableId) {
        const text = node.textContent;
        lines.push(indent + text);
        const isLastLine = node.attrs.tableRowIndex === (node.attrs.tableTotalRows as number) - 1;
        if (isLastLine && !this.options.compact) lines.push('');
      } else if (node.attrs.htmlBlockId) {
        const text = node.textContent;
        lines.push(indent + text);
        const isLastLine = node.attrs.htmlBlockLineIndex === (node.attrs.htmlBlockTotalLines as number) - 1;
        if (isLastLine && !this.options.compact) lines.push('');
      } else if (node.attrs.mathBlockId) {
        const text = node.textContent;
        lines.push(indent + text);
        const isLastLine = node.attrs.mathBlockLineIndex === (node.attrs.mathBlockTotalLines as number) - 1;
        if (isLastLine && !this.options.compact) lines.push('');
      } else if (node.attrs.listId) {
        const text = node.textContent;
        lines.push(indent + text);
        const isLastLine = node.attrs.listLineIndex === (node.attrs.listTotalLines as number) - 1;
        if (isLastLine && !this.options.compact) lines.push('');
      } else {
        const text = this.serializeInline(node);
        lines.push(indent + text);
        if (!this.options.compact && text.length > 0) lines.push('');
      }
    },

    heading: (node, lines, indent) => {
      const level = (node.attrs.level as number) || 1;
      // serializeInline 会输出节点内可能保留的 "# " 标记文本（parser / input-rules 路径）。
      // 以 attrs.level 为权威级别统一重建 "#" 前缀：先剥离开头可能存在的标记，再按 level 补回。
      // 这样无论 heading 由何种途径产生（parser / input-rules / setHeading 命令），都能稳定
      // 序列化出正确级别标记，避免标记丢失（旧 input-rules 删 "#" 导致重新加载标题失效）
      // 或 "#" 数量与 level 不一致。
      const body = this.serializeInline(node).replace(/^#{1,6}[ \t]/, '');
      lines.push(`${indent}${'#'.repeat(level)} ${body}`);
      if (!this.options.compact) lines.push('');
    },

    blockquote: (node, lines, indent) => {
      // 逐个序列化子节点，自行控制分隔符，避免 !compact 空行被转为 ">"
      // 导致重新解析时产生多余空段落（往返膨胀问题）。
      let prevWasContent = false;
      node.content.forEach((child, _, index) => {
        const childLines: string[] = [];
        this.serializeNode(child, childLines, '', index, node.content);

        // 剥离 paragraph 序列化器追加的 !compact 尾部空行
        while (childLines.length > 0 && childLines[childLines.length - 1] === '') {
          childLines.pop();
        }

        // 判断当前子节点是否为空段落（文本仅为 "> " 即引用前缀）
        const isEmptyParagraph =
          child.type.name === 'paragraph'
          && childLines.length === 1
          && (childLines[0].trim() === '>' || childLines[0] === '> ');

        if (prevWasContent) {
          lines.push(indent + '>');
        }

        for (const line of childLines) {
          if (line.startsWith('> ')) {
            lines.push(indent + line);
          } else if (line === '') {
            lines.push(indent + '>');
          } else {
            lines.push(`${indent}> ${line}`);
          }
        }

        prevWasContent = !isEmptyParagraph;
      });
      if (!this.options.compact) lines.push('');
    },

    code_block: (node, lines, indent) => {
      const content = node.textContent;
      const lang = (node.attrs.language as string) || '';
      const fence = this.options.codeFence;

      lines.push(indent + fence + lang);
      if (content) {
        for (const line of content.split('\n')) {
          lines.push(indent + line);
        }
      }
      lines.push(indent + fence);
      if (!this.options.compact) lines.push('');
    },

    mermaid_block: (node, lines, indent) => {
      const content = node.textContent;
      const fence = this.options.codeFence;
      lines.push(`${indent}${fence}mermaid`);
      if (content) {
        for (const line of content.split('\n')) {
          lines.push(indent + line);
        }
      }
      lines.push(indent + fence);
      if (!this.options.compact) lines.push('');
    },

    horizontal_rule: (_node, lines, indent) => {
      lines.push(`${indent}---`);
      if (!this.options.compact) lines.push('');
    },

    bullet_list: (node, lines, indent) => {
      node.content.forEach(item => {
        this.serializeListItem(item, lines, indent, '-');
      });
      if (!this.options.compact) lines.push('');
    },

    ordered_list: (node, lines, indent) => {
      const start = (node.attrs.start as number) || 1;
      node.content.forEach((item, _, i) => {
        this.serializeListItem(item, lines, indent, `${start + i}.`);
      });
      if (!this.options.compact) lines.push('');
    },

    task_list: (node, lines, indent) => {
      node.content.forEach(item => {
        const checked = item.attrs.checked ? 'x' : ' ';
        this.serializeListItem(item, lines, indent, `- [${checked}]`);
      });
      if (!this.options.compact) lines.push('');
    },

    table: (node, lines, indent) => {
      const rows: string[][] = [];
      let headerRow: string[] = [];

      node.content.forEach((row, _, rowIndex) => {
        const cells: string[] = [];
        row.content.forEach(cell => {
          cells.push(this.serializeInline(cell));
        });
        if (rowIndex === 0) headerRow = cells;
        rows.push(cells);
      });

      if (headerRow.length > 0) {
        lines.push(`${indent}| ${headerRow.join(' | ')} |`);
        lines.push(`${indent}| ${headerRow.map(() => '---').join(' | ')} |`);
        for (let i = 1; i < rows.length; i++) {
          lines.push(`${indent}| ${rows[i].join(' | ')} |`);
        }
      }
      if (!this.options.compact) lines.push('');
    },

    math_block: (node, lines, indent) => {
      lines.push(`${indent}$$`);
      const content = node.textContent || '';
      if (content) {
        for (const line of content.split('\n')) {
          lines.push(indent + line);
        }
      }
      lines.push(`${indent}$$`);
      if (!this.options.compact) lines.push('');
    },

    html_block: (node, lines, indent) => {
      const content = node.textContent || '';
      for (const line of content.split('\n')) {
        lines.push(indent + line);
      }
      if (!this.options.compact) lines.push('');
    },

    container: (node, lines, indent) => {
      const type = (node.attrs.type as string) || 'note';
      const title = (node.attrs.title as string) || '';
      lines.push(`${indent}:::${type}${title ? ` ${title}` : ''}`);
      this.serializeFragment(node.content, lines, indent);
      lines.push(`${indent}:::`);
      if (!this.options.compact) lines.push('');
    },

    image: (node, lines, indent, index, fragment) => {
      const alt = (node.attrs.alt as string) || '';
      const src = (node.attrs.src as string) || '';
      const title = (node.attrs.title as string) || '';
      const linkHref = (node.attrs.linkHref as string) || '';
      const linkTitle = (node.attrs.linkTitle as string) || '';
      const consecutiveGroup = (node.attrs.consecutiveGroup as string | null) || null;
      const titlePart = title ? ` "${title}"` : '';
      const imgMarkdown = `![${alt}](${src}${titlePart})`;
      const markdown = linkHref
        ? `[${imgMarkdown}](${linkHref}${linkTitle ? ` "${linkTitle}"` : ''})`
        : imgMarkdown;
      const prevNode = index > 0 ? fragment.child(index - 1) : null;
      const nextNode = index + 1 < fragment.childCount ? fragment.child(index + 1) : null;
      const prevSameGroup =
        !!consecutiveGroup
        && prevNode?.type.name === 'image'
        && prevNode.attrs.consecutiveGroup === consecutiveGroup;
      const nextSameGroup =
        !!consecutiveGroup
        && nextNode?.type.name === 'image'
        && nextNode.attrs.consecutiveGroup === consecutiveGroup;

      if (prevSameGroup && lines.length > 0) {
        lines[lines.length - 1] += markdown;
      } else {
        lines.push(indent + markdown);
      }

      if (!nextSameGroup && !this.options.compact) lines.push('');
    },

    hard_break: () => {
      // 硬换行由行内序列化处理
    },
  };

  /** 序列化列表项（处理多行内容与续行缩进对齐）。 */
  private serializeListItem(item: Node, lines: string[], indent: string, marker: string): void {
    const innerLines: string[] = [];
    this.serializeFragment(item.content, innerLines, '');

    // 续行缩进需要与标记宽度对齐：'- ' = 2 / '1. ' = 3 / '10. ' = 4
    const continuationIndent = marker.length + 1;

    for (let i = 0; i < innerLines.length; i++) {
      const line = innerLines[i];
      if (i === 0) {
        lines.push(`${indent}${marker} ${line}`);
      } else if (line !== '') {
        lines.push(indent + ' '.repeat(continuationIndent) + line);
      }
    }
  }

  /**
   * 序列化行内内容。
   *
   * 直接输出所有文本节点（包括语法标记 `**` 等），保留用户原始输入。
   * 仅对 image / hard_break 这两种 leaf inline 节点做特殊处理。
   */
  private serializeInline(node: Node): string {
    let result = '';

    node.content.forEach(child => {
      if (child.isText) {
        result += child.text || '';
      } else if (child.type.name === 'hard_break') {
        result += '  \n';
      } else if (child.type.name === 'image') {
        const alt = (child.attrs.alt as string) || '';
        const src = (child.attrs.src as string) || '';
        const title = (child.attrs.title as string) || '';
        const linkHref = (child.attrs.linkHref as string) || '';
        const linkTitle = (child.attrs.linkTitle as string) || '';
        const titlePart = title ? ` "${title}"` : '';
        const imgMarkdown = `![${alt}](${src}${titlePart})`;
        if (linkHref) {
          const linkTitlePart = linkTitle ? ` "${linkTitle}"` : '';
          result += `[${imgMarkdown}](${linkHref}${linkTitlePart})`;
        } else {
          result += imgMarkdown;
        }
      }
    });

    return result;
  }

  /**
   * 用 Mark 包装文本（兼容路径）。
   *
   * 当文档中存在不带 syntax_marker 的 mark 文本（如经 input-rules / 粘贴
   * 进来的内容），需要在序列化时显式补回 Markdown 语法符号。
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private serializeTextWithMarks(node: Node): string {
    if (node.marks.some(m => m.type.name === 'syntax_marker')) {
      return '';
    }

    let text = node.text || '';
    for (const mark of node.marks) {
      if (mark.type.name !== 'syntax_marker') {
        text = this.wrapWithMark(text, mark);
      }
    }
    return text;
  }

  /** 用 Mark 包装文本（兼容路径辅助）。 */
  private wrapWithMark(text: string, mark: Mark): string {
    switch (mark.type.name) {
      case 'strong':
        return `**${text}**`;
      case 'emphasis':
        return `*${text}*`;
      case 'code_inline':
        return `\`${text}\``;
      case 'strikethrough':
        return `~~${text}~~`;
      case 'highlight':
        return `==${text}==`;
      case 'link': {
        const rawHref = (mark.attrs.href as string) || '';
        // 重新转义 URL 中的括号，避免 ) 提前终止链接语法
        const href = rawHref.replace(/([()])/g, '\\$1');
        const title = (mark.attrs.title as string) || '';
        const titlePart = title ? ` "${title}"` : '';
        return `[${text}](${href}${titlePart})`;
      }
      case 'math_inline':
        return `$${text}$`;
      case 'sub':
        return `<sub>${text}</sub>`;
      case 'sup':
        return `<sup>${text}</sup>`;
      case 'html_inline': {
        const tag = (mark.attrs.tag as string) || 'span';
        const htmlAttrs = (mark.attrs.htmlAttrs as string) || '';
        const openTag = htmlAttrs ? `<${tag} ${htmlAttrs}>` : `<${tag}>`;
        return `${openTag}${text}</${tag}>`;
      }
      case 'footnote_ref':
        return `[^${mark.attrs.id}]`;
      default:
        return text;
    }
  }
}

/** 默认序列化器实例。 */
export const defaultSerializer = new MarkdownSerializer();

/** 序列化文档为 Markdown 字符串（推荐入口）。 */
export function serializeMarkdown(doc: Node, options?: SerializeOptions): string {
  const serializer = options ? new MarkdownSerializer(options) : defaultSerializer;
  return serializer.serialize(doc);
}

/** 兼容别名：与计划文档中的 `serializeDoc` 等价。 */
export const serializeDoc = serializeMarkdown;
