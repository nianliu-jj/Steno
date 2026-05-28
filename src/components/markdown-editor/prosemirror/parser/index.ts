/**
 * @file Steno Markdown 解析器 — 由 PureMark `src/core/parser/index.ts` 全量移植
 *
 * 核心思想（与 PureMark 一致）：保留 Markdown 源码的语法标记符号
 * （如 `**`、`*`、`~~`、`` ` ``、`[`、`]`、`(...)` 等）作为带
 * `syntax_marker` mark 的可见文本节点，让光标能在源码标记内自由移动；
 * 显隐由 `plugins/instant-render.ts` 在运行时通过 Decoration 控制。
 *
 * Steno 适配点：
 * - import 路径改用 Steno 一侧的 `stenoSchema`
 * - `SyntaxMarker` 类型从本地 `./types` 引入
 * - 在每个块级节点（heading / paragraph / blockquote / list / table / hr /
 *   code_block / math_block / mermaid_block / html_block / container / image）
 *   构造时记录源 Markdown 行号到 `attrs.startLine`，用于支撑
 *   `MarkdownEditor.scrollToLine(line)`。
 * - `any` 全部替换为 `unknown` / 具体类型以满足 oxlint 严格模式。
 *
 * 行内规则、块级解析逻辑、嵌套列表 / 表格 / blockquote / 转义处理等与
 * PureMark 完全一致；详尽中文注释见各方法。
 */

import type { Mark, Node, Schema } from 'prosemirror-model';

import { stenoSchema } from '../schema';
import type { ParseResult, SyntaxMarker } from './types';

/** 行内语法定义 */
interface InlineSyntax {
  type: string;
  pattern: RegExp;
  prefix: string | ((match: RegExpExecArray) => string);
  suffix: string | ((match: RegExpExecArray) => string);
  contentIndex: number;
  getAttrs?: (match: RegExpExecArray) => Record<string, unknown>;
}

/** 行内语法列表 — 按优先级排序。 */
const INLINE_SYNTAXES: InlineSyntax[] = [
  // 粗斜体 ***text*** 或 ___text___ — 必须在 strong 和 emphasis 之前
  {
    type: 'strong_emphasis',
    pattern: /(\*\*\*|___)(.+?)\1/g,
    prefix: m => m[1],
    suffix: m => m[1],
    contentIndex: 2,
  },
  // 粗体 **text** 或 __text__ — 排除 *** 的情况
  {
    type: 'strong',
    pattern: /(?<!\*)(\*\*)(?!\*)(.+?)(?<!\*)\1(?!\*)|(?<!_)(__)(?!_)(.+?)(?<!_)\3(?!_)/g,
    prefix: m => m[1] || m[3],
    suffix: m => m[1] || m[3],
    contentIndex: 2,
  },
  {
    type: 'emphasis',
    pattern:
      /(?<![*_\w])(\*)(?![*\s])(.+?)(?<![*\s])\1(?![*])|(?<![*_])(_)(?![_\s])(?=\S)(.+?)(?<=\S)(?<![_\s])\3(?![_\w])/g,
    prefix: m => m[1] || m[3],
    suffix: m => m[1] || m[3],
    contentIndex: 2,
  },
  {
    type: 'code_inline',
    pattern: /`([^`]+)`/g,
    prefix: '`',
    suffix: '`',
    contentIndex: 1,
  },
  {
    type: 'strikethrough',
    pattern: /~~(.+?)~~/g,
    prefix: '~~',
    suffix: '~~',
    contentIndex: 1,
  },
  {
    type: 'highlight',
    pattern: /==(.+?)==/g,
    prefix: '==',
    suffix: '==',
    contentIndex: 1,
  },
  {
    type: 'link',
    pattern: /(?<!!)\[([^\]]+)\]\(((?:[^)\s\\]|\\.)+)(?:\s+"([^"]*)")?\)/g,
    prefix: '[',
    suffix: (m: RegExpExecArray) => `](${m[2]}${m[3] ? ` "${m[3]}"` : ''})`,
    contentIndex: 1,
    getAttrs: (m: RegExpExecArray) => ({
      href: (m[2] || '').replace(/\\([()])/g, '$1'),
      title: m[3] || '',
    }),
  },
  {
    // 行内数学 $expr$ — 排除 $$ 的情况
    type: 'math_inline',
    pattern: /(?<!\$)\$(?!\$)([^$]+)\$(?!\$)/g,
    prefix: '$',
    suffix: '$',
    contentIndex: 1,
    getAttrs: m => ({ content: m[1] }),
  },
  // sub / sup 上下标（专属 mark）
  {
    type: 'sub',
    pattern: /<sub>(.+?)<\/sub>/g,
    prefix: '<sub>',
    suffix: '</sub>',
    contentIndex: 1,
  },
  {
    type: 'sup',
    pattern: /<sup>(.+?)<\/sup>/g,
    prefix: '<sup>',
    suffix: '</sup>',
    contentIndex: 1,
  },
  // 通用行内 HTML 元素（排除已有专用 mark 的 sub/sup）
  {
    type: 'html_inline',
    pattern: /<([a-zA-Z][a-zA-Z0-9]*)(\s(?:[^>"']|"[^"]*"|'[^']*')*)?>(.+?)<\/\1>/g,
    prefix: (m: RegExpExecArray) => `<${m[1]}${m[2] || ''}>`,
    suffix: (m: RegExpExecArray) => `</${m[1]}>`,
    contentIndex: 3,
    getAttrs: (m: RegExpExecArray) => ({ tag: m[1].toLowerCase(), htmlAttrs: (m[2] || '').trim() }),
  },
];

/** 块级语法模式 */
const BLOCK_PATTERNS = {
  heading: /^(#{1,6})\s+(.*)$/,
  // 允许前导空格（列表项内的代码块），语言标识后跟任意属性
  code_block_start: /^(\s*)```([^\s`]*)(.*)$/,
  // 允许前导空格和行尾空格
  code_block_end: /^\s*```\s*$/,
  blockquote: /^>\s?(.*)$/,
  bullet_list: /^(\s*)([-*+])\s+(.*)$/,
  ordered_list: /^(\s*)(\d+)\.\s+(.*)$/,
  task_item: /^(\s*)[-*+]\s+\[([ xX]?)\]\s+(.*)$/,
  // 允许行尾有空格
  horizontal_rule: /^([-*_]){3,}\s*$/,
  table_row: /^\|(.+)\|\s*$/,
  table_separator: /^\|[-:\s|]+\|\s*$/,
  math_block_start: /^\s*\$\$\s*$/,
  math_block_end: /^\s*\$\$\s*$/,
  math_block_inline: /^\s*\$\$(.+)\$\$\s*$/,
  // 图片 ![alt](src "title") — 允许 URL 中有空格
  image: /^!\[([^\]]*)\]\((.+?)(?:\s+"([^"]*)")?\)\s*$/,
  // 链接图片 [![alt](src)](href)
  linked_image: /^\[!\[([^\]]*)\]\((.+?)(?:\s+"([^"]*)")?\)\]\((.+?)(?:\s+"([^"]*)")?\)\s*$/,
  container_start: /^:::(\w+)(?:\s+(.*))?$/,
  // 允许行尾有空格
  container_end: /^:::\s*$/,
  // 以 < 开头后跟标签名
  html_block_start: /^<([a-zA-Z][a-zA-Z0-9]*)/,
};

const IMAGE_TOKEN_PATTERNS = {
  linked: /\[!\[([^\]]*)\]\((.+?)(?:\s+"([^"]*)")?\)\]\((.+?)(?:\s+"([^"]*)")?\)/y,
  normal: /!\[([^\]]*)\]\((.+?)(?:\s+"([^"]*)")?\)/y,
};

function generateConsecutiveImageGroupId(): string {
  return `cig_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

/** 行内元素集合 — 这些标签不应被解析为块级 html_block。 */
const INLINE_ELEMENTS = new Set([
  'a',
  'abbr',
  'b',
  'bdi',
  'bdo',
  'cite',
  'code',
  'data',
  'dfn',
  'em',
  'i',
  'kbd',
  'mark',
  'q',
  'rp',
  'rt',
  'ruby',
  's',
  'samp',
  'small',
  'span',
  'strong',
  'sub',
  'sup',
  'time',
  'u',
  'var',
  'del',
  'ins',
  'label',
  'font',
]);

/**
 * Markdown 解析器类。
 *
 * 主要方法：
 * - `parse(md)` —— 顶层入口
 * - `parseBlocks(lines)` —— 块级派发器
 * - `parseInlineWithSyntax(text, marks)` —— 行内解析（带 syntax_marker）
 * - 各个块级 `parseHeading` / `parseCodeBlock` / `parseBlockquote` / ...
 */
export class MarkdownParser {
  private schema: Schema;
  private markers: SyntaxMarker[] = [];

  constructor(schema: Schema = stenoSchema) {
    this.schema = schema;
  }

  /** 解析 Markdown 文本。 */
  parse(markdown: string): ParseResult {
    this.markers = [];

    // 统一换行符
    const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
    const blocks = this.parseBlocks(lines, 0);

    const content = blocks.length > 0 ? blocks : [this.schema.node('paragraph')];
    const doc = this.schema.node('doc', null, content);

    return { doc, markers: this.markers };
  }

  /**
   * 解析块级元素。
   *
   * @param lines 已按行拆分的源文本
   * @param baseLineOffset 第一行在整篇文档中的行号偏移（嵌套调用时用于
   *                       让 list_item / blockquote 内的块也能拿到全局行号）
   */
  private parseBlocks(lines: string[], baseLineOffset = 0): Node[] {
    const blocks: Node[] = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];
      const startLine = baseLineOffset + i;

      if (line.trim() === '') {
        let emptyCount = 0;
        while (i < lines.length && lines[i].trim() === '') {
          emptyCount++;
          i++;
        }
        // 第一个空行是块之间的标准分隔符，多余的空行用空段落节点保留
        const extra = blocks.length > 0 ? emptyCount - 1 : emptyCount;
        for (let j = 0; j < extra; j++) {
          if (i >= lines.length && j === extra - 1) break;
          blocks.push(this.schema.node('paragraph'));
        }
        continue;
      }

      // 代码块（只有闭合的代码块才解析为 code_block 节点）
      const codeMatch = line.match(BLOCK_PATTERNS.code_block_start);
      if (codeMatch) {
        const result = this.parseCodeBlock(lines, i, baseLineOffset);
        if (result) {
          blocks.push(result.node);
          i = result.endIndex + 1;
          continue;
        }
      }

      // 单行数学块 $$content$$
      const mathInlineMatch = line.match(BLOCK_PATTERNS.math_block_inline);
      if (mathInlineMatch) {
        const content = mathInlineMatch[1];
        const textNode = content ? this.schema.text(content) : null;
        blocks.push(
          this.schema.node('math_block', { startLine }, textNode ? [textNode] : []),
        );
        i++;
        continue;
      }

      // 多行数学块
      if (BLOCK_PATTERNS.math_block_start.test(line)) {
        const result = this.parseMathBlock(lines, i, baseLineOffset);
        blocks.push(result.node);
        i = result.endIndex + 1;
        continue;
      }

      // 容器
      const containerMatch = line.match(BLOCK_PATTERNS.container_start);
      if (containerMatch) {
        const result = this.parseContainer(lines, i, baseLineOffset);
        blocks.push(result.node);
        i = result.endIndex + 1;
        continue;
      }

      // 标题
      const headingMatch = line.match(BLOCK_PATTERNS.heading);
      if (headingMatch) {
        blocks.push(this.parseHeading(headingMatch, startLine));
        i++;
        continue;
      }

      // 连续图片（非标准 Markdown，但主流编辑器普遍支持）
      const consecutiveImages = this.parseConsecutiveImages(line, startLine);
      if (consecutiveImages) {
        blocks.push(...consecutiveImages);
        i++;
        continue;
      }

      // 链接图片 [![alt](src)](href)
      const linkedImageMatch = line.match(BLOCK_PATTERNS.linked_image);
      if (linkedImageMatch) {
        blocks.push(this.parseLinkedImage(linkedImageMatch, startLine));
        i++;
        continue;
      }

      // 图片
      const imageMatch = line.match(BLOCK_PATTERNS.image);
      if (imageMatch) {
        blocks.push(this.parseImage(imageMatch, startLine));
        i++;
        continue;
      }

      // 分隔线
      if (BLOCK_PATTERNS.horizontal_rule.test(line)) {
        blocks.push(this.schema.node('horizontal_rule', { startLine }));
        i++;
        continue;
      }

      // 引用
      if (BLOCK_PATTERNS.blockquote.test(line)) {
        const result = this.parseBlockquote(lines, i, baseLineOffset);
        blocks.push(result.node);
        i = result.endIndex + 1;
        continue;
      }

      // 任务列表
      if (BLOCK_PATTERNS.task_item.test(line)) {
        const result = this.parseTaskList(lines, i, baseLineOffset);
        blocks.push(result.node);
        i = result.endIndex + 1;
        continue;
      }

      // 无序列表
      if (BLOCK_PATTERNS.bullet_list.test(line)) {
        const result = this.parseBulletList(lines, i, baseLineOffset);
        blocks.push(result.node);
        i = result.endIndex + 1;
        continue;
      }

      // 有序列表
      if (BLOCK_PATTERNS.ordered_list.test(line)) {
        const result = this.parseOrderedList(lines, i, baseLineOffset);
        blocks.push(result.node);
        i = result.endIndex + 1;
        continue;
      }

      // 表格
      if (BLOCK_PATTERNS.table_row.test(line)) {
        const result = this.parseTable(lines, i, baseLineOffset);
        if (result) {
          blocks.push(result.node);
          i = result.endIndex + 1;
          continue;
        }
      }

      // HTML 块（排除 autolink 如 <https://...> 和 <http://...>）
      const htmlMatch = line.match(BLOCK_PATTERNS.html_block_start);
      if (htmlMatch && !/^<(?:https?:\/\/|mailto:)/i.test(line)) {
        const tagName = htmlMatch[1].toLowerCase();
        // 行内元素不解析为 html_block，作为段落处理
        if (!INLINE_ELEMENTS.has(tagName)) {
          const result = this.parseHtmlBlock(lines, i, baseLineOffset);
          blocks.push(result.node);
          i = result.endIndex + 1;
          continue;
        }
      }

      // 段落
      blocks.push(this.parseParagraph(line, startLine));
      i++;
    }

    return blocks;
  }

  /** 解析标题 — 保留 # 标记。 */
  private parseHeading(match: RegExpMatchArray, startLine: number): Node {
    const hashes = match[1];
    const content = match[2];
    const level = hashes.length;

    const nodes: Node[] = [];

    const syntaxMark = this.schema.marks.syntax_marker?.create({ syntaxType: 'heading' });
    if (syntaxMark) {
      nodes.push(this.schema.text(hashes, [syntaxMark]));
      nodes.push(this.schema.text(' '));
    }

    const inlineNodes = this.parseInlineWithSyntax(content);
    nodes.push(...inlineNodes);

    return this.schema.node('heading', { level, startLine }, nodes);
  }

  /** 解析图片 — `![alt](src "title")` */
  private parseImage(match: RegExpMatchArray, startLine: number): Node {
    const alt = match[1] || '';
    const src = match[2] || '';
    const title = match[3] || '';
    return this.schema.node('image', { src, alt, title, startLine });
  }

  /** 解析链接图片 — `[![alt](src "title")](href "linkTitle")` */
  private parseLinkedImage(match: RegExpMatchArray, startLine: number): Node {
    const alt = match[1] || '';
    const src = match[2] || '';
    const title = match[3] || '';
    const linkHref = match[4] || '';
    const linkTitle = match[5] || '';
    return this.schema.node('image', { src, alt, title, linkHref, linkTitle, startLine });
  }

  /**
   * 解析同一行上的连续图片，例如 `![a](1.png)![b](2.png)`。
   */
  private parseConsecutiveImages(line: string, startLine: number): Node[] | null {
    const images: Node[] = [];
    let index = 0;
    const groupId = generateConsecutiveImageGroupId();

    while (index < line.length) {
      while (index < line.length && /\s/.test(line[index])) {
        index++;
      }

      if (index >= line.length) break;

      IMAGE_TOKEN_PATTERNS.linked.lastIndex = index;
      let match = IMAGE_TOKEN_PATTERNS.linked.exec(line);
      if (match) {
        images.push(
          this.schema.node('image', {
            alt: match[1] || '',
            src: match[2] || '',
            title: match[3] || '',
            linkHref: match[4] || '',
            linkTitle: match[5] || '',
            consecutiveGroup: groupId,
            startLine,
          }),
        );
        index = IMAGE_TOKEN_PATTERNS.linked.lastIndex;
        continue;
      }

      IMAGE_TOKEN_PATTERNS.normal.lastIndex = index;
      match = IMAGE_TOKEN_PATTERNS.normal.exec(line);
      if (match) {
        images.push(
          this.schema.node('image', {
            alt: match[1] || '',
            src: match[2] || '',
            title: match[3] || '',
            consecutiveGroup: groupId,
            startLine,
          }),
        );
        index = IMAGE_TOKEN_PATTERNS.normal.lastIndex;
        continue;
      }

      return null;
    }

    return images.length >= 2 ? images : null;
  }

  /** 解析段落。 */
  private parseParagraph(line: string, startLine: number): Node {
    const nodes = this.parseInlineWithSyntax(line);
    return this.schema.node('paragraph', { startLine }, nodes.length > 0 ? nodes : undefined);
  }

  /** 转义正则：匹配 `\` 后跟特殊字符。 */
  private static ESCAPE_RE = /\\([\\`*_{}[\]()#+\-.!|~=$>])/g;

  /** 解析行内内容 — 保留语法标记，支持嵌套语法。 */
  private parseInlineWithSyntax(text: string, inheritedMarks: Mark[] = []): Node[] {
    if (!text) return [];

    // 转义预处理：先收集链接和行内数学匹配范围，这些范围内的转义不拆分文本
    const protectedRanges: Array<{ start: number; end: number }> = [];
    const linkSyntax = INLINE_SYNTAXES.find(s => s.type === 'link');
    if (linkSyntax) {
      const linkRe = new RegExp(linkSyntax.pattern.source, 'g');
      let lm: RegExpExecArray | null;
      while ((lm = linkRe.exec(text)) !== null) {
        protectedRanges.push({ start: lm.index, end: lm.index + lm[0].length });
      }
    }
    const mathSyntax = INLINE_SYNTAXES.find(s => s.type === 'math_inline');
    if (mathSyntax) {
      const mathRe = new RegExp(mathSyntax.pattern.source, 'g');
      let mm: RegExpExecArray | null;
      while ((mm = mathRe.exec(text)) !== null) {
        protectedRanges.push({ start: mm.index, end: mm.index + mm[0].length });
      }
    }

    const escapePositions: Array<{ index: number; char: string }> = [];
    const escapeRe = new RegExp(MarkdownParser.ESCAPE_RE.source, 'g');
    let escMatch: RegExpExecArray | null;
    while ((escMatch = escapeRe.exec(text)) !== null) {
      // 跳过链接 / 数学公式范围内的转义（公式中的 \| \hat 等是 LaTeX 命令，不是 Markdown 转义）
      const inProtected = protectedRanges.some(
        r => escMatch!.index >= r.start && escMatch!.index + 2 <= r.end,
      );
      if (!inProtected) {
        escapePositions.push({ index: escMatch.index, char: escMatch[1] });
      }
    }

    if (escapePositions.length > 0) {
      return this.parseInlineWithEscapes(text, inheritedMarks, escapePositions);
    }

    interface MatchInfo {
      syntax: InlineSyntax;
      match: RegExpExecArray;
      start: number;
      end: number;
      prefix: string;
      suffix: string;
      content: string;
      attrs?: Record<string, unknown>;
    }

    const matches: MatchInfo[] = [];

    for (const syntax of INLINE_SYNTAXES) {
      const re = new RegExp(syntax.pattern.source, 'g');
      let match: RegExpExecArray | null;

      while ((match = re.exec(text)) !== null) {
        const prefix = typeof syntax.prefix === 'function' ? syntax.prefix(match) : syntax.prefix;
        const suffix = typeof syntax.suffix === 'function' ? syntax.suffix(match) : syntax.suffix;
        // 支持多捕获组的情况（如 strong 的正则有两种模式）
        const content = match[syntax.contentIndex] || match[syntax.contentIndex + 2] || '';

        if (!prefix || !content) continue;

        matches.push({
          syntax,
          match,
          start: match.index,
          end: match.index + match[0].length,
          prefix,
          suffix,
          content,
          attrs: syntax.getAttrs?.(match),
        });
      }
    }

    // 按位置排序，优先选择更长的匹配（外层语法）
    matches.sort((a, b) => {
      if (a.start !== b.start) return a.start - b.start;
      return b.end - a.end;
    });

    // 过滤完全重叠的匹配（保留外层）
    const filtered: MatchInfo[] = [];
    let lastEnd = 0;
    for (const m of matches) {
      if (m.start >= lastEnd) {
        filtered.push(m);
        lastEnd = m.end;
      }
    }

    const nodes: Node[] = [];
    let pos = 0;

    for (const m of filtered) {
      // 前面的纯文本
      if (m.start > pos) {
        const plainText = text.slice(pos, m.start);
        if (inheritedMarks.length > 0) {
          nodes.push(this.schema.text(plainText, inheritedMarks));
        } else {
          nodes.push(this.schema.text(plainText));
        }
      }

      const syntaxMark = this.schema.marks.syntax_marker?.create({
        syntaxType: m.syntax.type,
      });

      const contentMarks: Mark[] = [];
      if (m.syntax.type === 'strong_emphasis') {
        const strongMark = this.schema.marks.strong?.create();
        const emphasisMark = this.schema.marks.emphasis?.create();
        if (strongMark) contentMarks.push(strongMark);
        if (emphasisMark) contentMarks.push(emphasisMark);
      } else {
        const contentMark = this.schema.marks[m.syntax.type]?.create(m.attrs);
        if (contentMark) contentMarks.push(contentMark);
      }

      const allContentMarks = [...inheritedMarks, ...contentMarks];

      // 前缀（带 syntax_marker）
      if (syntaxMark) {
        const prefixMarks = [...inheritedMarks, syntaxMark, ...contentMarks];
        nodes.push(this.schema.text(m.prefix, prefixMarks));
      }

      // 递归解析内容（可能包含嵌套语法）
      const innerNodes = this.parseInlineWithSyntax(m.content, allContentMarks);
      if (innerNodes.length > 0) {
        nodes.push(...innerNodes);
      } else if (m.content) {
        nodes.push(this.schema.text(m.content, allContentMarks));
      }

      // 后缀（带 syntax_marker）
      if (syntaxMark) {
        const suffixMarks = [...inheritedMarks, syntaxMark, ...contentMarks];
        nodes.push(this.schema.text(m.suffix, suffixMarks));
      }

      pos = m.end;
    }

    // 剩余文本
    if (pos < text.length) {
      const remainingText = text.slice(pos);
      if (inheritedMarks.length > 0) {
        nodes.push(this.schema.text(remainingText, inheritedMarks));
      } else {
        nodes.push(this.schema.text(remainingText));
      }
    }

    return nodes;
  }

  /**
   * 处理包含转义序列的行内文本。
   * 将文本按转义位置分割，非转义片段递归解析，转义部分生成带
   * `syntax_marker(escape)` 的 `\` + 普通字符两个文本节点。
   */
  private parseInlineWithEscapes(
    text: string,
    inheritedMarks: Mark[],
    escapePositions: Array<{ index: number; char: string }>,
  ): Node[] {
    const nodes: Node[] = [];
    let pos = 0;

    for (const esc of escapePositions) {
      if (esc.index > pos) {
        const segment = text.slice(pos, esc.index);
        nodes.push(...this.parseInlineWithSyntax(segment, inheritedMarks));
      }

      const syntaxMark = this.schema.marks.syntax_marker?.create({ syntaxType: 'escape' });
      if (syntaxMark) {
        const backslashMarks = [...inheritedMarks, syntaxMark];
        nodes.push(this.schema.text('\\', backslashMarks));
      }

      if (inheritedMarks.length > 0) {
        nodes.push(this.schema.text(esc.char, inheritedMarks));
      } else {
        nodes.push(this.schema.text(esc.char));
      }

      pos = esc.index + 2;
    }

    if (pos < text.length) {
      const remaining = text.slice(pos);
      nodes.push(...this.parseInlineWithSyntax(remaining, inheritedMarks));
    }

    return nodes;
  }

  /**
   * 解析代码块。
   * 支持嵌套代码围栏：内部带语言标识的 ``` 开启嵌套层，对应的 ``` 关闭嵌套层。
   * 如果代码块未闭合（没有找到结束的 ```），返回 null，由调用方当作普通段落处理。
   */
  private parseCodeBlock(
    lines: string[],
    startIndex: number,
    baseLineOffset: number,
  ): { node: Node; endIndex: number } | null {
    const startLineText = lines[startIndex];
    const startLine = baseLineOffset + startIndex;
    const langMatch = startLineText.match(BLOCK_PATTERNS.code_block_start);
    const fenceIndent = langMatch ? langMatch[1].length : 0;
    const language = langMatch ? langMatch[2] || '' : '';

    let endIndex = startIndex + 1;
    const contentLines: string[] = [];
    let nestedLevel = 0;

    while (endIndex < lines.length) {
      const line = lines[endIndex];
      const isEnd = BLOCK_PATTERNS.code_block_end.test(line);
      const isStart = !isEnd && BLOCK_PATTERNS.code_block_start.test(line);

      if (isStart) {
        nestedLevel++;
      } else if (isEnd) {
        if (nestedLevel > 0) {
          nestedLevel--;
        } else {
          break;
        }
      }

      const stripped =
        fenceIndent > 0 && line.length >= fenceIndent ? line.slice(fenceIndent) : line;
      contentLines.push(stripped);
      endIndex++;
    }

    if (endIndex >= lines.length) {
      return null;
    }

    const content = contentLines.join('\n');
    const textNode = content ? this.schema.text(content) : null;

    // Steno 扩展：language === 'mermaid' 时输出 mermaid_block 节点，
    // 其余按 code_block 节点处理（含 startLine）
    const nodeName = language.toLowerCase() === 'mermaid' ? 'mermaid_block' : 'code_block';
    const attrs = nodeName === 'mermaid_block' ? { startLine } : { language, startLine };

    return {
      node: this.schema.node(nodeName, attrs, textNode ? [textNode] : []),
      endIndex,
    };
  }

  /** 解析数学块。 */
  private parseMathBlock(
    lines: string[],
    startIndex: number,
    baseLineOffset: number,
  ): { node: Node; endIndex: number } {
    let endIndex = startIndex + 1;
    const contentLines: string[] = [];

    while (endIndex < lines.length) {
      if (BLOCK_PATTERNS.math_block_end.test(lines[endIndex])) {
        break;
      }
      contentLines.push(lines[endIndex]);
      endIndex++;
    }

    const content = contentLines.join('\n');
    const textNode = content ? this.schema.text(content) : null;
    const startLine = baseLineOffset + startIndex;

    return {
      node: this.schema.node('math_block', { startLine }, textNode ? [textNode] : []),
      endIndex,
    };
  }

  /** 解析容器。 */
  private parseContainer(
    lines: string[],
    startIndex: number,
    baseLineOffset: number,
  ): { node: Node; endIndex: number } {
    const startLineText = lines[startIndex];
    const match = startLineText.match(BLOCK_PATTERNS.container_start)!;
    const type = match[1];
    const title = match[2] || '';
    const startLine = baseLineOffset + startIndex;

    let endIndex = startIndex + 1;
    const contentLines: string[] = [];

    while (endIndex < lines.length) {
      if (BLOCK_PATTERNS.container_end.test(lines[endIndex])) {
        break;
      }
      contentLines.push(lines[endIndex]);
      endIndex++;
    }

    const innerBlocks = this.parseBlocks(contentLines, startLine + 1);

    return {
      node: this.schema.node('container', { type, title, startLine }, innerBlocks),
      endIndex,
    };
  }

  /** 解析 HTML 块（支持自闭合标签和嵌套标签）。 */
  private parseHtmlBlock(
    lines: string[],
    startIndex: number,
    baseLineOffset: number,
  ): { node: Node; endIndex: number } {
    const startLineText = lines[startIndex];
    const tagMatch = startLineText.match(BLOCK_PATTERNS.html_block_start);
    const tagName = tagMatch ? tagMatch[1] : '';
    const startLine = baseLineOffset + startIndex;

    const voidElements = new Set([
      'area',
      'base',
      'br',
      'col',
      'embed',
      'hr',
      'img',
      'input',
      'link',
      'meta',
      'param',
      'source',
      'track',
      'wbr',
    ]);

    if (voidElements.has(tagName.toLowerCase()) || startLineText.trimEnd().endsWith('/>')) {
      const textNode = startLineText ? this.schema.text(startLineText) : null;
      return {
        node: this.schema.node('html_block', { startLine }, textNode ? [textNode] : []),
        endIndex: startIndex,
      };
    }

    const closePattern = new RegExp(`</${tagName}\\s*>`, 'i');

    if (closePattern.test(startLineText)) {
      const textNode = startLineText ? this.schema.text(startLineText) : null;
      return {
        node: this.schema.node('html_block', { startLine }, textNode ? [textNode] : []),
        endIndex: startIndex,
      };
    }

    const contentLines: string[] = [startLineText];
    let endIndex = startIndex + 1;
    let nestLevel = 1;

    const openPattern = new RegExp(`<${tagName}[\\s>/]`, 'i');

    while (endIndex < lines.length) {
      const line = lines[endIndex];
      contentLines.push(line);

      if (openPattern.test(line) && endIndex !== startIndex) {
        nestLevel++;
      }
      if (closePattern.test(line)) {
        nestLevel--;
        if (nestLevel <= 0) {
          break;
        }
      }

      endIndex++;
    }

    const content = contentLines.join('\n');
    const textNode = content ? this.schema.text(content) : null;

    return {
      node: this.schema.node('html_block', { startLine }, textNode ? [textNode] : []),
      endIndex,
    };
  }

  /** 解析引用块。 */
  private parseBlockquote(
    lines: string[],
    startIndex: number,
    baseLineOffset: number,
  ): { node: Node; endIndex: number } {
    const startLine = baseLineOffset + startIndex;
    let endIndex = startIndex;
    const contentLines: string[] = [];

    while (endIndex < lines.length) {
      const line = lines[endIndex];
      if (line.trim() === '') {
        if (endIndex + 1 < lines.length && BLOCK_PATTERNS.blockquote.test(lines[endIndex + 1])) {
          contentLines.push('');
          endIndex++;
          continue;
        }
        break;
      }
      const match = line.match(BLOCK_PATTERNS.blockquote);
      if (!match) break;
      contentLines.push(match[1]);
      endIndex++;
    }

    const innerBlocks = this.parseBlocks(contentLines, startLine);

    // 为每个块级元素添加 > 前缀
    const processedBlocks = innerBlocks.map(block => {
      if (block.type.name === 'paragraph') {
        const syntaxMark = this.schema.marks.syntax_marker?.create({ syntaxType: 'blockquote' });
        const nodes: Node[] = [];
        if (syntaxMark) {
          nodes.push(this.schema.text('> ', [syntaxMark]));
        }
        block.forEach(child => {
          nodes.push(child);
        });
        return this.schema.node('paragraph', block.attrs, nodes);
      }
      return block;
    });

    return {
      node: this.schema.node(
        'blockquote',
        { startLine },
        processedBlocks.length > 0 ? processedBlocks : [this.schema.node('paragraph')],
      ),
      endIndex: endIndex - 1,
    };
  }

  /** 解析无序列表（支持列表项中的多行内容，如代码块）。 */
  private parseBulletList(
    lines: string[],
    startIndex: number,
    baseLineOffset: number,
  ): { node: Node; endIndex: number } {
    const startLine = baseLineOffset + startIndex;
    const items: Node[] = [];
    let endIndex = startIndex;
    let baseIndent = -1;

    while (endIndex < lines.length) {
      const line = lines[endIndex];

      if (line.trim() === '') {
        if (endIndex + 1 < lines.length) {
          const nextLine = lines[endIndex + 1];
          const nextMatch = nextLine.match(BLOCK_PATTERNS.bullet_list);
          if (nextMatch && (baseIndent === -1 || nextMatch[1].length === baseIndent)) {
            endIndex++;
            continue;
          }
        }
        break;
      }

      const match = line.match(BLOCK_PATTERNS.bullet_list);
      if (!match) {
        if (baseIndent !== -1 && line.match(/^\s+/) && items.length > 0) {
          break;
        }
        break;
      }

      const indent = match[1].length;
      if (baseIndent === -1) {
        baseIndent = indent;
      }

      if (indent > baseIndent) break;
      if (indent < baseIndent) break;

      const itemLines: string[] = [match[3]];
      const itemIndent = indent + 2;
      let itemEndIndex = endIndex + 1;
      let inCodeBlock = match[3].trim().startsWith('```');

      while (itemEndIndex < lines.length) {
        const nextLine = lines[itemEndIndex];

        if (nextLine.trim().startsWith('```')) {
          inCodeBlock = !inCodeBlock;
        }

        if (nextLine.trim() === '') {
          if (!inCodeBlock && itemEndIndex + 1 < lines.length) {
            const afterEmpty = lines[itemEndIndex + 1];
            const afterBulletMatch = afterEmpty.match(BLOCK_PATTERNS.bullet_list);
            if (afterBulletMatch) {
              if (afterBulletMatch[1].length < itemIndent) break;
            } else if (!afterEmpty.match(/^\s{2,}/)) {
              break;
            }
          }
          itemLines.push('');
          itemEndIndex++;
          continue;
        }

        if (!inCodeBlock) {
          const nextBulletMatch = nextLine.match(BLOCK_PATTERNS.bullet_list);
          if (nextBulletMatch && nextBulletMatch[1].length < itemIndent) {
            break;
          }
        }

        const lineIndent = nextLine.match(/^(\s*)/)?.[1].length || 0;
        if (lineIndent >= itemIndent || inCodeBlock || nextLine.trim().startsWith('```')) {
          const trimmedLine = nextLine.slice(Math.min(lineIndent, itemIndent));
          itemLines.push(trimmedLine);
          itemEndIndex++;
        } else {
          break;
        }
      }

      const itemContent = this.parseBlocks(itemLines, baseLineOffset + endIndex);
      items.push(
        this.schema.node(
          'list_item',
          null,
          itemContent.length > 0 ? itemContent : [this.schema.node('paragraph')],
        ),
      );
      endIndex = itemEndIndex;
    }

    return {
      node: this.schema.node(
        'bullet_list',
        { startLine },
        items.length > 0
          ? items
          : [this.schema.node('list_item', null, [this.schema.node('paragraph')])],
      ),
      endIndex: endIndex - 1,
    };
  }

  /** 解析有序列表。 */
  private parseOrderedList(
    lines: string[],
    startIndex: number,
    baseLineOffset: number,
  ): { node: Node; endIndex: number } {
    const startLine = baseLineOffset + startIndex;
    const items: Node[] = [];
    let endIndex = startIndex;
    let start = 1;
    let baseIndent = -1;

    while (endIndex < lines.length) {
      const line = lines[endIndex];

      if (line.trim() === '') {
        if (endIndex + 1 < lines.length) {
          const nextLine = lines[endIndex + 1];
          const nextMatch = nextLine.match(BLOCK_PATTERNS.ordered_list);
          if (nextMatch && (baseIndent === -1 || nextMatch[1].length === baseIndent)) {
            endIndex++;
            continue;
          }
        }
        break;
      }

      const match = line.match(BLOCK_PATTERNS.ordered_list);
      if (!match) {
        if (baseIndent !== -1 && line.match(/^\s+/) && items.length > 0) break;
        break;
      }

      const indent = match[1].length;
      if (baseIndent === -1) {
        baseIndent = indent;
        start = Number.parseInt(match[2], 10);
      }

      if (indent > baseIndent) break;
      if (indent < baseIndent) break;

      const itemLines: string[] = [match[3]];
      const itemIndent = indent + match[2].length + 2;
      let itemEndIndex = endIndex + 1;
      let inCodeBlock = match[3].trim().startsWith('```');

      while (itemEndIndex < lines.length) {
        const nextLine = lines[itemEndIndex];

        if (nextLine.trim().startsWith('```')) {
          inCodeBlock = !inCodeBlock;
        }

        if (nextLine.trim() === '') {
          if (!inCodeBlock && itemEndIndex + 1 < lines.length) {
            const afterEmpty = lines[itemEndIndex + 1];
            const afterOrderedMatch = afterEmpty.match(BLOCK_PATTERNS.ordered_list);
            if (afterOrderedMatch) {
              if (afterOrderedMatch[1].length < itemIndent) break;
            } else if (!afterEmpty.match(/^\s{2,}/)) {
              break;
            }
          }
          itemLines.push('');
          itemEndIndex++;
          continue;
        }

        if (!inCodeBlock) {
          const nextOrderedMatch = nextLine.match(BLOCK_PATTERNS.ordered_list);
          if (nextOrderedMatch && nextOrderedMatch[1].length < itemIndent) {
            break;
          }
        }

        const lineIndent = nextLine.match(/^(\s*)/)?.[1].length || 0;
        if (lineIndent >= itemIndent || inCodeBlock || nextLine.trim().startsWith('```')) {
          const trimmedLine = nextLine.slice(Math.min(lineIndent, itemIndent));
          itemLines.push(trimmedLine);
          itemEndIndex++;
        } else {
          break;
        }
      }

      const itemContent = this.parseBlocks(itemLines, baseLineOffset + endIndex);
      items.push(
        this.schema.node(
          'list_item',
          null,
          itemContent.length > 0 ? itemContent : [this.schema.node('paragraph')],
        ),
      );
      endIndex = itemEndIndex;
    }

    return {
      node: this.schema.node(
        'ordered_list',
        { start, startLine },
        items.length > 0
          ? items
          : [this.schema.node('list_item', null, [this.schema.node('paragraph')])],
      ),
      endIndex: endIndex - 1,
    };
  }

  /** 解析任务列表。 */
  private parseTaskList(
    lines: string[],
    startIndex: number,
    baseLineOffset: number,
  ): { node: Node; endIndex: number } {
    const startLine = baseLineOffset + startIndex;
    const items: Node[] = [];
    let endIndex = startIndex;

    while (endIndex < lines.length) {
      const line = lines[endIndex];
      if (line.trim() === '') break;

      const match = line.match(BLOCK_PATTERNS.task_item);
      if (!match) break;

      const checked = match[2].toLowerCase() === 'x';
      const content = match[3];
      const para = this.parseParagraph(content, baseLineOffset + endIndex);
      items.push(this.schema.node('task_item', { checked }, [para]));
      endIndex++;
    }

    return {
      node: this.schema.node(
        'task_list',
        { startLine },
        items.length > 0
          ? items
          : [this.schema.node('task_item', { checked: false }, [this.schema.node('paragraph')])],
      ),
      endIndex: endIndex - 1,
    };
  }

  /** 解析表格。 */
  private parseTable(
    lines: string[],
    startIndex: number,
    baseLineOffset: number,
  ): { node: Node; endIndex: number } | null {
    let sepIndex = startIndex + 1;
    if (sepIndex < lines.length && lines[sepIndex].trim() === '') sepIndex++;
    if (sepIndex >= lines.length) return null;
    if (!BLOCK_PATTERNS.table_separator.test(lines[sepIndex])) return null;

    const startLine = baseLineOffset + startIndex;
    const rows: Node[] = [];
    let endIndex = startIndex;

    const separatorLine = lines[sepIndex].trimEnd();
    const alignments = separatorLine
      .slice(1, -1)
      .split('|')
      .map(col => {
        const trimmed = col.trim();
        const left = trimmed.startsWith(':');
        const right = trimmed.endsWith(':');
        if (left && right) return 'center';
        if (right) return 'right';
        if (left) return 'left';
        return null;
      });

    const headerCells = this.parseTableRow(lines[startIndex], true, alignments);
    rows.push(this.schema.node('table_row', null, headerCells));
    endIndex = sepIndex + 1;

    while (endIndex < lines.length) {
      if (lines[endIndex].trim() === '') {
        endIndex++;
        continue;
      }
      if (!BLOCK_PATTERNS.table_row.test(lines[endIndex])) break;
      const cells = this.parseTableRow(lines[endIndex], false, alignments);
      rows.push(this.schema.node('table_row', null, cells));
      endIndex++;
    }

    return {
      node: this.schema.node('table', { startLine }, rows),
      endIndex: endIndex - 1,
    };
  }

  /** 解析表格行。 */
  private parseTableRow(
    line: string,
    isHeader: boolean,
    alignments: (string | null)[] = [],
  ): Node[] {
    const cells: Node[] = [];
    const content = line.trimEnd().slice(1, -1);
    const cellContents = content.split('|');

    for (let i = 0; i < cellContents.length; i++) {
      const trimmed = cellContents[i].trim();
      const inlineContent = this.parseInlineWithSyntax(trimmed);
      const nodeType = isHeader ? 'table_header' : 'table_cell';
      const align = alignments[i] || null;
      cells.push(
        this.schema.node(
          nodeType,
          align ? { align } : null,
          inlineContent.length > 0 ? inlineContent : undefined,
        ),
      );
    }

    return cells;
  }
}

/** 默认 Steno 解析器实例。 */
export const defaultParser = new MarkdownParser();

/** 解析 Markdown 文本（推荐入口）。 */
export function parseMarkdown(markdown: string): ParseResult {
  return defaultParser.parse(markdown);
}

export type { ParseResult, SyntaxMarker } from './types';
