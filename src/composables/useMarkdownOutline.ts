/**
 * @file Markdown 大纲解析工具
 *
 * 从 Markdown 内容中提取 ATX 标题（`#` ~ `######`），构建树形大纲结构。
 * 同时支持为 HTML 渲染输出中的 `<h1>`–`<h6>` 标签注入 id 锚点。
 */

/**
 * 大纲树节点 — 递归结构。
 *
 * @example
 * ```ts
 * { id: 'heading-5', text: '简介', level: 2, line: 5, children: [
 *   { id: 'heading-8', text: '背景', level: 3, line: 8, children: [] }
 * ]}
 * ```
 */
export interface OutlineNode {
  /** 唯一 id，格式 `heading-{行号}`。 */
  id: string;
  /** 标题文本（不含 `#` 前缀）。 */
  text: string;
  /** 标题级别 1–6。 */
  level: number;
  /** 在原文档中的行号（1-indexed）。 */
  line: number;
  /** 子标题列表。 */
  children: OutlineNode[];
}

/**
 * 扁平标题 — `listHeadings` 的返回项。
 *
 * 与 `OutlineNode` 的区别：无 `children` 字段，是 buildOutline 的中间产物。
 */
export interface FlatHeading {
  id: string;
  text: string;
  level: number;
  line: number;
}

/**
 * ATX 标题正则：`#{1,6} 标题文本`。
 * 仅匹配行首的 `#` 前缀，不匹配行内 `#`（如 `## 标题 #tag`）。
 */
const HEADING_RE = /^(#{1,6})\s+(.+?)\s*$/;

/**
 * Markdown 大纲工具集。
 *
 * @returns `{ listHeadings, buildOutline, decorateHeadingAnchors }`
 */
export function useMarkdownOutline() {
  /**
   * 从 Markdown 文本中提取所有 ATX 标题（扁平列表）。
   *
   * 算法：逐行匹配 `HEADING_RE`，提取级别和文本。
   * 不识别 Setext 标题（下划线风格 `===` / `---`）。
   *
   * @param content - Markdown 原文
   * @returns 扁平标题数组，按文档顺序排列
   */
  function listHeadings(content: string): FlatHeading[] {
    return content
      .split('\n')
      .map((rawLine, index) => {
        // 局部常量 match：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
        const match = HEADING_RE.exec(rawLine);
        if (!match) return null;

        return {
          id: `heading-${index + 1}`,
          text: match[2].trim(), // group 2 = 标题文本（去掉 `#` 和前后空格）
          level: match[1].length, // group 1 = `#` 的数量 → 标题级别
          line: index + 1 // 1-indexed 行号
        } satisfies FlatHeading;
      })
      .filter((heading): heading is FlatHeading => heading !== null);
  }

  /**
   * 从扁平标题构建树形大纲。
   *
   * 算法：使用栈维护"当前嵌套路径"。
   * - 遇到比栈顶级别更深（数字更大）的标题 → 作为栈顶的子节点
   * - 遇到级别相同或更浅的标题 → pop 栈直到找到合适父节点
   * - 栈为空 → 根级节点
   *
   * **为什么用栈而不是递归**：栈天然匹配 Markdown 标题的线性扫描特性，
   * 一次遍历即可构建完整树，时间复杂度 O(n)。
   *
   * @param content - Markdown 原文
   * @returns 大纲根节点数组
   *
   * @example
   * ```
   * # H1              → roots[0] (level=1)
   * ## H2             → roots[0].children[0] (level=2)
   * ### H3            → roots[0].children[0].children[0]
   * # H1 again        → roots[1] (pop back to root)
   * ```
   */
  function buildOutline(content: string): OutlineNode[] {
    const roots: OutlineNode[] = [];
    const stack: OutlineNode[] = []; // 当前从根到最深标题的路径

    for (const heading of listHeadings(content)) {
      const node: OutlineNode = { ...heading, children: [] };

      // pop 直到找到级别比当前小的父节点（或栈空=根级）
      while (stack.length > 0 && stack.at(-1)!.level >= node.level) {
        stack.pop();
      }

      if (stack.length === 0) {
        roots.push(node);
      } else {
        stack.at(-1)!.children.push(node);
      }

      stack.push(node); // 当前节点成为后续更深标题的潜在父节点
    }

    return roots;
  }

  /**
   * 为渲染后的 HTML 中的 `<h1>`–`<h6>` 标签注入 id 和 data 属性。
   *
   * 用途：MarkdownReadSurface 只读预览中，大纲点击 → `document.getElementById(id)`
   * 跳转到对应标题。
   *
   * **为什么用字符串替换而不是 DOM 操作**：
   * 渲染后的 HTML 通过 `v-html` 绑定，Vue 不会对 v-html 内容做响应式处理。
   * 直接在 HTML 字符串上做 `replace` 比 `nextTick` + `querySelectorAll`
   * 更简单且不会触发额外渲染。
   *
   * @param html - marked 渲染的 HTML 字符串
   * @param headings - `listHeadings` 的返回数组（需与 HTML 中 `<h*>` 顺序一致）
   * @returns 注入了 id 属性的 HTML 字符串
   */
  function decorateHeadingAnchors(html: string, headings: FlatHeading[]): string {
    if (headings.length === 0) return html;

    let headingIndex = 0;

    // `<h1>`–`<h6>` 在 marked 输出中按文档顺序出现，与 headings 数组一一对应
    return html.replace(/<h([1-6])>/g, match => {
      // 局部常量 heading：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
      const heading = headings[headingIndex];
      headingIndex += 1;
      if (!heading) return match;
      return `<h${heading.level} id="${heading.id}" data-heading-id="${heading.id}">`;
    });
  }

  return {
    listHeadings,
    buildOutline,
    decorateHeadingAnchors
  };
}
