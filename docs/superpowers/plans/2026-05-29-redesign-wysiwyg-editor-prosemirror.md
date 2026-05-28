# Redesign WYSIWYG Editor (ProseMirror) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (推荐) 或 superpowers:executing-plans 来按任务逐项推进。所有步骤使用 checkbox (`- [ ]`) 语法跟踪。

**Goal:** 把 `MarkdownEditor.vue`（编辑态）与 `MarkdownReadSurface.vue`（只读态）的内核统一从 CodeMirror 6 + 自建 live-render / markdown-it 管线迁移到 ProseMirror，实现 Typora 风格 WYSIWYG（图二），并把两者落到同一套 schema / parser / serializer / nodeviews 上。

**Architecture:** 在 `src/components/markdown-editor/prosemirror/` 下建立 ProseMirror 内核，子模块按职责拆分（schema / parser / serializer / nodeviews / plugins / view / styles / tests）。Vue 组件成为薄壳，调 `createEditor` 工厂；上层 `useAutosave` / `useMarkdownOutline` / `useDb` 不变。代码块 NodeView 内嵌 CodeMirror 6；数学公式 NodeView 调 KaTeX；Mermaid NodeView 调既有 `utils/markdown/mermaid.ts`。

**Tech Stack:** Vue 3 + TypeScript + Tauri 2 + ProseMirror（state/view/model/transform/history/keymap/commands/inputrules/schema-list/dropcursor/gapcursor/tables）+ CodeMirror 6（仅 NodeView 内嵌）+ KaTeX + Mermaid + Shiki + DOMPurify + Vitest + jsdom。

**Reference Projects (read-only):**
- `D:\Markdown项目\PureMark\src\core\` — 主参考，~11000 行核心代码
- `D:\Markdown项目\milkup` — 同构早期版本

**OpenSpec:** `openspec/changes/redesign-wysiwyg-editor-prosemirror/`

---

## How to Use This Plan

1. **每个 Phase 是一段可独立交付的工作** —— 完成后必须满足：仓库能编译（`pnpm typecheck`）、ESLint 干净（`pnpm lint`）、单测通过（`pnpm test`）、做一次中文 git commit、勾选本计划与 `openspec/changes/.../tasks.md` 中对应项。
2. **参考项目代码全部只读** —— 不允许修改 PureMark / milkup 目录下任何文件。Steno 这一侧的文件保留 PureMark 原注释 + 增补 Steno 适配说明。
3. **每个 Phase 的"参考映射"小节明确"打开哪个参考文件 → 创建/修改 Steno 的哪个文件"**。除非显式标注「按原样复制」，否则必须按 *本计划写明的 diff 列表* 适配（命名、import 路径、Steno 的 stenoAssets/db 注入等）。
4. **本计划不会内联 PureMark 上千行原代码**。执行者按映射打开参考文件 → 复制 → 适配 → 跑测试。这是与该计划"零上下文工程师"理想的取舍：移植任务的本质就是参考原代码，复制后做差量适配。

---

## File Structure（最终落点）

新增（Steno 这一侧）：

```
src/components/markdown-editor/prosemirror/
  README.md                                # 对照 PureMark → Steno 的迁移映射表（Phase 11 写）
  schema/
    index.ts                               # 整套 schema 装配，导出 stenoSchema
    nodes.ts                               # NodeSpec：doc/paragraph/heading/blockquote/list/table/code_block/math_block/mermaid_block/html_block/horizontal_rule/image/...
    marks.ts                               # MarkSpec：strong/em/code/strike/link/highlight/syntax_marker/html_inline
    html-inline.ts                         # SAFE_INLINE_TAGS 白名单 + parseHtmlAttrs
  parser/
    index.ts                               # 入口：parseMarkdown(md): { doc, markers }
    inline.ts                              # 行内规则（INLINE_SYNTAXES）
    block.ts                               # 块级规则（heading/blockquote/list/table/code/hr/math/html_block）
    types.ts                               # ParseResult、SyntaxMarker
  serializer/
    index.ts                               # serializeDoc(doc): string
    node-serializers.ts
    mark-serializers.ts
  nodeviews/
    index.ts
    image.ts                               # 相对路径解析 + 占位
    task-list-item.ts                      # 复选框
    html-block.ts                          # DOMPurify innerHTML
    math-block.ts                          # KaTeX
    mermaid-block.ts                       # 调 utils/markdown/mermaid.ts
    table.ts                               # 首版仅渲染 + 单元格编辑
    code-block.ts                          # 内嵌 CodeMirror 6（最复杂）
  plugins/
    index.ts
    instant-render.ts                      # 光标进入/离开 → 显隐 syntax_marker（核心）
    input-rules.ts                         # `# `、`> `、`- `、`1. ` 等触发
    syntax-fixer.ts                        # 光标离开后修复破损
    paste.ts                               # 粘贴 HTML/图片
    placeholder.ts                         # 空文档占位
    keymap.ts                              # 快捷键
    history.ts                             # prosemirror-history 包装
    drop-cursor.ts                         # prosemirror-dropcursor 包装
    gap-cursor.ts                          # prosemirror-gapcursor 包装
  view/
    create-editor.ts                       # 工厂：装配 schema/plugins/nodeviews → EditorView
    editor-bridge.ts                       # v-model 双向绑定 + focus + scrollToLine + scrollToHeading
  styles/
    base.css
    typography.css
    table.css
    code-block.css
    syntax-marker.css
  tests/
    schema.test.ts
    parser.test.ts
    serializer.test.ts
    instant-render.test.ts
    nodeviews.test.ts
    bridge.test.ts
    e2e-image-two.test.ts                  # 题目图二样例
```

修改（Steno 这一侧）：

```
src/components/MarkdownEditor.vue         # 内核换成 prosemirror，对外 API 不变
src/components/MarkdownEditor.test.ts     # 按新内核改写
src/components/MarkdownReadSurface.vue    # 内核换成 prosemirror（editable=false），对外 API 不变
src/components/MarkdownReadSurface.test.ts # 按新内核改写
package.json                              # 新增 4 个 prosemirror-* + 移除 3 个 codemirror 包
```

删除（Steno 这一侧，Phase 10 收尾）：

```
src/components/markdown-editor/live-render.ts
src/components/markdown-editor/live-render.test.ts
src/components/markdown-editor/extensions.ts   # 现 CodeMirror 主插件集合；若代码块 NodeView 复用片段则保留必要部分
src/components/markdown-editor/keymap.ts       # 现 CodeMirror keymap；以同名 prosemirror keymap 替代
src/utils/markdown/{mermaid.ts 被 NodeView 复用所以保留}
```

---

## Phase 0 — 依赖与目录骨架

**目标：** 装好新依赖，建出空目录骨架，仓库可编译。

**对应 tasks.md：** §1.1 ~ §1.4

### Task 0.1 — 安装新增 ProseMirror 依赖

- [ ] **Step 1：在 `D:\Steno` 下安装 4 个新包**

```bash
pnpm add prosemirror-dropcursor prosemirror-gapcursor prosemirror-tables prosemirror-transform
```

- [ ] **Step 2：跑 typecheck 确认 lockfile 与类型可解析**

```bash
pnpm typecheck
```
Expected: 通过（warnings 不阻塞）

### Task 0.2 — 创建空目录骨架

- [ ] **Step 1：在 `D:\Steno\src\components\markdown-editor\` 下建 `prosemirror/` 子树**

```bash
mkdir -p src/components/markdown-editor/prosemirror/{schema,parser,serializer,nodeviews,plugins,view,styles,tests}
```

- [ ] **Step 2：每个子目录创建占位 `index.ts`**（防止空目录被 git 忽略 + ts 解析失败）

每个文件内容：

```ts
// 占位：实际实现将在后续 Phase 落地
export {};
```

落点：
- `src/components/markdown-editor/prosemirror/schema/index.ts`
- `src/components/markdown-editor/prosemirror/parser/index.ts`
- `src/components/markdown-editor/prosemirror/serializer/index.ts`
- `src/components/markdown-editor/prosemirror/nodeviews/index.ts`
- `src/components/markdown-editor/prosemirror/plugins/index.ts`
- `src/components/markdown-editor/prosemirror/view/index.ts`

- [ ] **Step 3：跑 typecheck 与 lint**

```bash
pnpm typecheck && pnpm lint
```
Expected: 通过

### Task 0.3 — 提交 Phase 0

- [ ] **Step 1：勾选 `openspec/changes/redesign-wysiwyg-editor-prosemirror/tasks.md` 中 §1.1 ~ §1.4 的 checkbox**
- [ ] **Step 2：暂存并 commit**

```bash
git add package.json pnpm-lock.yaml src/components/markdown-editor/prosemirror openspec/changes/redesign-wysiwyg-editor-prosemirror/tasks.md
git commit -m "chore(editor): 添加 ProseMirror 依赖与骨架目录"
```

---

## Phase 1 — Schema

**目标：** 把 PureMark 的 schema 完整移植到 `prosemirror/schema/`，建立"携带 syntax_marker"的节点/标记体系。

**对应 tasks.md：** §2.1 ~ §2.5

### 参考映射

| 参考文件 (read-only) | Steno 目标文件 |
|---|---|
| `D:\Markdown项目\PureMark\src\core\schema\index.ts` | `src/components/markdown-editor/prosemirror/schema/index.ts` |

PureMark `schema/index.ts` 是单文件 726 行，我们拆三个文件方便维护。

### Task 1.1 — 移植 schema 主体

- [ ] **Step 1：完整阅读 PureMark `src/core/schema/index.ts`** —— 不打开就动手 = 必返工。

- [ ] **Step 2：在 `src/components/markdown-editor/prosemirror/schema/html-inline.ts` 中按原样复制：**
  - `SAFE_INLINE_TAGS` 常量
  - `parseHtmlAttrs(attrStr: string): Record<string, string>` 函数
  - 顶部加 Steno 中文注释，注明源出处。

- [ ] **Step 3：在 `prosemirror/schema/nodes.ts` 中复制 PureMark schema 里所有 NodeSpec：**
  - `doc / paragraph / heading / blockquote / horizontal_rule / hard_break`
  - `bullet_list / ordered_list / list_item / task_list_item`
  - `code_block / math_block / mermaid_block / html_block`
  - `table / table_row / table_cell / table_header`
  - `image`
  - 每个 spec 的 `attrs` / `parseDOM` / `toDOM` 与 PureMark 一致；中文注释解释每个 attr 的语义。

- [ ] **Step 4：在 `prosemirror/schema/marks.ts` 中复制 MarkSpec：**
  - `strong / em / code / strike / link / highlight`
  - `syntax_marker`（核心：携带"语法标记符号"的文本 mark）
  - `html_inline`（白名单 inline HTML 的 mark）

- [ ] **Step 5：在 `prosemirror/schema/index.ts` 装配并导出：**

```ts
import { Schema } from 'prosemirror-model';
import { nodes } from './nodes';
import { marks } from './marks';

export { SAFE_INLINE_TAGS, parseHtmlAttrs } from './html-inline';

/** Steno ProseMirror schema —— 由 PureMark 移植，保留 syntax_marker 以支持 Typora 风格 WYSIWYG。 */
export const stenoSchema = new Schema({ nodes, marks });

export type StenoNodeType = keyof typeof nodes;
export type StenoMarkType = keyof typeof marks;
```

### Task 1.2 — schema 单测

- [ ] **Step 1：写 `prosemirror/tests/schema.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { stenoSchema } from '../schema';

describe('stenoSchema', () => {
  it('包含所有必要的 node 类型', () => {
    const required = [
      'doc', 'paragraph', 'heading', 'blockquote', 'horizontal_rule',
      'bullet_list', 'ordered_list', 'list_item', 'task_list_item',
      'code_block', 'math_block', 'mermaid_block', 'html_block',
      'table', 'table_row', 'table_cell', 'table_header', 'image',
    ];
    for (const name of required) {
      expect(stenoSchema.nodes[name]).toBeDefined();
    }
  });

  it('包含所有必要的 mark 类型（含 syntax_marker / html_inline）', () => {
    for (const name of ['strong', 'em', 'code', 'strike', 'link', 'highlight', 'syntax_marker', 'html_inline']) {
      expect(stenoSchema.marks[name]).toBeDefined();
    }
  });

  it('可创建空文档', () => {
    const doc = stenoSchema.node('doc', null, [stenoSchema.node('paragraph')]);
    expect(doc.firstChild?.type.name).toBe('paragraph');
  });

  it('paragraph 可以包含 text', () => {
    const para = stenoSchema.node('paragraph', null, [stenoSchema.text('hello')]);
    expect(para.textContent).toBe('hello');
  });
});
```

- [ ] **Step 2：跑测试**

```bash
pnpm test src/components/markdown-editor/prosemirror/tests/schema.test.ts
```
Expected: 4/4 PASS

### Task 1.3 — 提交 Phase 1

- [ ] **Step 1：勾选 tasks.md §2.1 ~ §2.5**
- [ ] **Step 2：full 验证**

```bash
pnpm typecheck && pnpm lint && pnpm test
```

- [ ] **Step 3：commit**

```bash
git add src/components/markdown-editor/prosemirror/schema src/components/markdown-editor/prosemirror/tests/schema.test.ts openspec/changes/redesign-wysiwyg-editor-prosemirror/tasks.md
git commit -m "feat(editor): 从 PureMark 移植 ProseMirror schema 与 inline HTML 白名单"
```

---

## Phase 2 — Parser（Markdown → Doc）

**目标：** 把 PureMark `parser/index.ts`（1357 行）移植到 Steno，保留语法标记符号作为 `syntax_marker` mark 文本节点。

**对应 tasks.md：** §3.1 ~ §3.6

### 参考映射

| 参考文件 (read-only) | Steno 目标文件 |
|---|---|
| `D:\Markdown项目\PureMark\src\core\parser\index.ts` | 拆分到 `prosemirror/parser/{index.ts, inline.ts, block.ts, types.ts}` |

### Task 2.1 — 移植 types 与入口

- [ ] **Step 1：阅读 PureMark `parser/index.ts` 全文**（重点是 `INLINE_SYNTAXES`、`BLOCK` 解析路径、`SyntaxMarker` 数据结构）

- [ ] **Step 2：`prosemirror/parser/types.ts`：**

```ts
import type { Node } from 'prosemirror-model';

export interface SyntaxMarker {
  from: number;
  to: number;
  type: string;
}

export interface ParseResult {
  doc: Node;
  markers: SyntaxMarker[];
}
```

### Task 2.2 — 移植行内规则

- [ ] **Step 1：`prosemirror/parser/inline.ts`** —— 复制 PureMark 里 `INLINE_SYNTAXES` 数组（strong_emphasis / strong / emphasis / code_inline / strikethrough / highlight / link / image / autolink / html_inline）；保留每条规则的 `pattern` / `prefix` / `suffix` / `contentIndex` / `getAttrs`。

- [ ] **Step 2：导出 `parseInline(text: string, schema: Schema): { nodes: Node[]; markers: SyntaxMarker[] }`**，与 PureMark `parseInline` 函数等价。

- [ ] **Step 3：HTML inline 处理时用 `SAFE_INLINE_TAGS` 白名单 + `parseHtmlAttrs` 过滤危险属性**。

### Task 2.3 — 移植块级规则

- [ ] **Step 1：`prosemirror/parser/block.ts`** —— 复制 PureMark `parseBlock`：
  - 标题 ATX h1-h6
  - blockquote（含无空格 `>foo`）
  - bullet/ordered list（含嵌套）
  - task list item（识别 `- [ ]` / `- [x]`）
  - horizontal rule（`---` / `***` / `___`）
  - fenced code block（含 info string）
  - math block（`$$ ... $$`）
  - mermaid block（``` ```mermaid ``` ）
  - html block
  - table（GFM）
  - paragraph 兜底

- [ ] **Step 2：在每个块级节点的 `attrs` 中记录 `startLine: number`**（这是 Steno 的扩展，用于 `scrollToLine`；PureMark 没有这一项，需新增）：

```ts
// 例：parseHeading 内
const headingNode = schema.nodes.heading.createAndFill(
  { level, startLine: lineNo },
  inlineContent,
);
```

如果 PureMark 的 NodeSpec 没有 `startLine` attr，需要在 Phase 1 的 `nodes.ts` 里补上。**这里要回到 Phase 1 改 schema** —— 如果发现未加，先补 schema、再补测试，再继续。

### Task 2.4 — 装配 parser 入口

- [ ] **Step 1：`prosemirror/parser/index.ts`：**

```ts
import { stenoSchema } from '../schema';
import { parseBlock } from './block';
import type { ParseResult } from './types';

export function parseMarkdown(md: string): ParseResult {
  return parseBlock(md, stenoSchema);
}

export type { ParseResult, SyntaxMarker } from './types';
```

### Task 2.5 — parser 测试

- [ ] **Step 1：`prosemirror/tests/parser.test.ts`** —— 覆盖以下场景（每个一个 `it()`）：
  1. ATX 标题 `# foo` / `## bar` / `###### baz` 生成 heading 节点 + 正确 level
  2. blockquote 含无空格：`>foo` 与 `> foo` 都生成 blockquote
  3. 无序列表 `- a\n- b` 生成 bullet_list 含 2 个 list_item
  4. 有序列表 `1. a\n2. b` 生成 ordered_list
  5. 任务列表 `- [ ] todo\n- [x] done` 生成 task_list_item，第二个 `checked: true`
  6. 水平分隔线 `---` 单独成行生成 horizontal_rule
  7. GFM 表格生成 table + thead + tbody + 正确列对齐
  8. 围栏代码块 ``` ```ts\nconst a = 1;\n``` ``` 生成 code_block，attrs.language='ts'
  9. 链接 `[a](hh)` 生成带 link mark 的 text + 保留语法标记
  10. 内联 HTML `<u>Phase 4</u>` 生成 html_inline mark
  11. 危险标签 `<script>x</script>` 不生成 html_inline
  12. 块级数学 `$$ E=mc^2 $$` 生成 math_block
  13. mermaid 块生成 mermaid_block
  14. 行内强调 `**bold**` 生成带 strong mark 的文本 + 两侧 `**` 带 syntax_marker mark
  15. 题目图二输入的完整文档解析后包含 heading / blockquote / bullet_list / table / horizontal_rule / link 节点

每个用例形如：

```ts
import { parseMarkdown } from '../parser';

it('解析 ATX 标题', () => {
  const { doc } = parseMarkdown('# Hello');
  expect(doc.firstChild?.type.name).toBe('heading');
  expect(doc.firstChild?.attrs.level).toBe(1);
  expect(doc.firstChild?.textContent).toContain('Hello');
});
```

- [ ] **Step 2：跑测试**

```bash
pnpm test src/components/markdown-editor/prosemirror/tests/parser.test.ts
```
Expected: 15/15 PASS

### Task 2.6 — 提交 Phase 2

- [ ] **Step 1：勾选 tasks.md §3.1 ~ §3.6**
- [ ] **Step 2：full 验证 + commit**

```bash
pnpm typecheck && pnpm lint && pnpm test
git add src/components/markdown-editor/prosemirror/parser src/components/markdown-editor/prosemirror/schema/nodes.ts src/components/markdown-editor/prosemirror/tests/parser.test.ts openspec/changes/redesign-wysiwyg-editor-prosemirror/tasks.md
git commit -m "feat(editor): 移植 Markdown→ProseMirror parser 并记录 startLine"
```

---

## Phase 3 — Serializer（Doc → Markdown）

**目标：** 移植 PureMark `serializer/index.ts`（433 行）；保证 `serialize(parse(md))` 与 `md` 在归一化后相等。

**对应 tasks.md：** §4.1 ~ §4.4

### 参考映射

| PureMark | Steno |
|---|---|
| `src/core/serializer/index.ts` | `prosemirror/serializer/{index.ts, node-serializers.ts, mark-serializers.ts}` |

### Task 3.1 — 移植

- [ ] **Step 1：`prosemirror/serializer/node-serializers.ts`** —— 一个 `Record<节点名, (state, node) => void>`，照搬 PureMark。
- [ ] **Step 2：`prosemirror/serializer/mark-serializers.ts`** —— 包括 `syntax_marker` 的"原样输出符号"行为。
- [ ] **Step 3：`prosemirror/serializer/index.ts`：**

```ts
import { MarkdownSerializer } from 'prosemirror-markdown';
// 注意：我们只借 prosemirror-markdown 的 MarkdownSerializer 工具类，不用其默认 schema
import { nodeSerializers } from './node-serializers';
import { markSerializers } from './mark-serializers';
import type { Node } from 'prosemirror-model';

const serializer = new MarkdownSerializer(nodeSerializers, markSerializers);

export function serializeDoc(doc: Node): string {
  return serializer.serialize(doc);
}
```

### Task 3.2 — 归一化规则

- [ ] **Step 1：在 `prosemirror/serializer/index.ts` 里加一个 `normalize` 函数**（PureMark 没有，但我们的 round-trip 需要）：

```ts
function normalizeMarkdown(md: string): string {
  return md
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+$/gm, '')        // 行尾空白
    .replace(/\n{3,}/g, '\n\n')      // 收敛多余空行
    .replace(/\n+$/, '\n');           // 文档末尾单换行
}
```

### Task 3.3 — round-trip 测试

- [ ] **Step 1：`prosemirror/tests/serializer.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { parseMarkdown } from '../parser';
import { serializeDoc } from '../serializer';

function roundtrip(md: string): string {
  return serializeDoc(parseMarkdown(md).doc);
}

describe('serializer roundtrip', () => {
  const cases: [string, string][] = [
    ['标题', '# Hello\n'],
    ['多级标题', '# a\n\n## b\n\n### c\n'],
    ['无序列表', '- a\n- b\n'],
    ['有序列表', '1. a\n2. b\n'],
    ['任务列表', '- [ ] todo\n- [x] done\n'],
    ['blockquote', '> hello\n'],
    ['无空格 blockquote', '>hello\n'],
    ['水平分隔线', '---\n'],
    ['链接', '[a](hh)\n'],
    ['粗体', '**bold**\n'],
    ['行内代码', '`code`\n'],
    ['表格', '| A | B |\n| - | - |\n| a | b |\n'],
    ['围栏代码块', '```ts\nconst a = 1\n```\n'],
    ['math block', '$$\nE = mc^2\n$$\n'],
    ['inline HTML', '<u>Phase 4</u>\n'],
  ];

  for (const [label, md] of cases) {
    it(label, () => {
      expect(roundtrip(md)).toBe(md);
    });
  }
});
```

- [ ] **Step 2：跑测试**

```bash
pnpm test src/components/markdown-editor/prosemirror/tests/serializer.test.ts
```
Expected: 15/15 PASS（如有失败，按差异修 parser 或 serializer，不允许"修改用例"）

### Task 3.4 — 提交 Phase 3

- [ ] **Step 1：勾选 tasks.md §4.1 ~ §4.4**

```bash
pnpm typecheck && pnpm lint && pnpm test
git add src/components/markdown-editor/prosemirror/serializer src/components/markdown-editor/prosemirror/tests/serializer.test.ts openspec/changes/redesign-wysiwyg-editor-prosemirror/tasks.md
git commit -m "feat(editor): 移植 ProseMirror→Markdown serializer 并通过 round-trip 测试"
```

---

## Phase 4 — 基础 NodeView

**目标：** 把 image、task-list-item、html-block、math-block、mermaid-block、table 六个 NodeView 落地（不含代码块，代码块在 Phase 5）。

**对应 tasks.md：** §5.1 ~ §5.7

### 参考映射

| PureMark | Steno |
|---|---|
| `src/core/nodeviews/image.ts` (710) | `prosemirror/nodeviews/image.ts`（用 `utils/stenoAssets.ts` 替换 PureMark 的本地路径解析） |
| `src/core/nodeviews/list.ts` (583) | `prosemirror/nodeviews/task-list-item.ts`（只取 task-list 相关部分） |
| `src/core/nodeviews/html-block.ts` (465) | `prosemirror/nodeviews/html-block.ts`（注入前用 Steno 的 `sanitizeHtml`） |
| `src/core/nodeviews/math-block.ts` (229) | `prosemirror/nodeviews/math-block.ts`（直接调 `katex`） |
| —— | `prosemirror/nodeviews/mermaid-block.ts`（复用 `src/utils/markdown/mermaid.ts` 中的 `renderMermaidPlaceholders` 思路，按 NodeView 适配） |
| —— | `prosemirror/nodeviews/table.ts`（首版仅渲染 + 单元格编辑，无右键菜单） |

### Task 4.1 — image NodeView

- [ ] **Step 1：参考 PureMark image.ts → 写 `prosemirror/nodeviews/image.ts`**：
  - Constructor 接受 `(node, view, getPos)` ，把 `node.attrs.src` 经 `stenoAssetDisplaySrc(src)` 解析为可加载 URL（见 `src/utils/stenoAssets.ts`）
  - DOM：`<img>` + 失败时切换到占位 `<div class="image-fallback">{alt}</div>`
  - 实现 ProseMirror NodeView 接口：`dom`、`contentDOM`（leaf 节点无）、`update(node)`、`destroy()`

- [ ] **Step 2：注入 dataDir** —— 因为 `stenoAssetDisplaySrc` 依赖 `setStenoAssetDataDir` 已被调用。`create-editor` 在 Phase 7 处理；image NodeView 直接调全局函数即可。

### Task 4.2 — task-list-item NodeView

- [ ] **Step 1：`prosemirror/nodeviews/task-list-item.ts`**：
  - DOM：`<li class="task-list-item">` + 前置 `<input type="checkbox">`
  - checkbox 监听 change → `view.dispatch(view.state.tr.setNodeAttribute(getPos(), 'checked', evt.target.checked))`
  - 同步更新源 Markdown 通过 serializer 自动完成（serializer 看 `attrs.checked` 输出 `[ ]` 或 `[x]`）

### Task 4.3 — html-block NodeView

- [ ] **Step 1：`prosemirror/nodeviews/html-block.ts`**：
  - DOM：`<div class="html-block">`
  - `update(node)`：`div.innerHTML = sanitizeHtml(node.attrs.html)`
  - 双击进入编辑态切换为 textarea 编辑 raw html（参考 PureMark）

### Task 4.4 — math-block NodeView

- [ ] **Step 1：`prosemirror/nodeviews/math-block.ts`**：

```ts
import katex from 'katex';
import 'katex/dist/katex.min.css';
import type { NodeView } from 'prosemirror-view';

export function createMathBlockNodeView(node, view, getPos): NodeView {
  const dom = document.createElement('div');
  dom.className = 'math-block';
  function render() {
    try {
      katex.render(node.attrs.tex ?? '', dom, { displayMode: true, throwOnError: false });
    } catch (err) {
      dom.textContent = String(err);
    }
  }
  render();
  return {
    dom,
    update(updated) {
      if (updated.type !== node.type) return false;
      node = updated;
      render();
      return true;
    },
  };
}
```

### Task 4.5 — mermaid-block NodeView

- [ ] **Step 1：`prosemirror/nodeviews/mermaid-block.ts`** —— 调既有 `src/utils/markdown/mermaid.ts` 中的渲染函数。处理 dark/light 主题切换（参考既有 mermaid.ts 的 `resetMermaidRendering`）。

### Task 4.6 — table NodeView

- [ ] **Step 1：使用 `prosemirror-tables` 内置的 `tableNodeViews()` 直接装配**，无需自写。在 Phase 7 `create-editor` 里启用即可。本 Task 仅占位，**核心工作落在 Phase 7**。

### Task 4.7 — nodeviews 测试

- [ ] **Step 1：`prosemirror/tests/nodeviews.test.ts`** —— 用 jsdom + 直接调 NodeView 工厂；不通过完整 EditorView：

```ts
import { describe, it, expect } from 'vitest';
import { createMathBlockNodeView } from '../nodeviews/math-block';
import { stenoSchema } from '../schema';

it('math-block 渲染 KaTeX', () => {
  const node = stenoSchema.nodes.math_block.create({ tex: 'E = mc^2' });
  const view = {} as any;
  const getPos = () => 0;
  const nv = createMathBlockNodeView(node, view, getPos);
  expect(nv.dom.querySelector('.katex')).not.toBeNull();
});
```

类似地写 image / task-list-item / html-block / mermaid-block 各 1-2 个用例。

- [ ] **Step 2：跑测试**

### Task 4.8 — 提交 Phase 4

- [ ] **Step 1：勾选 tasks.md §5.1 ~ §5.7**

```bash
pnpm typecheck && pnpm lint && pnpm test
git add src/components/markdown-editor/prosemirror/nodeviews src/components/markdown-editor/prosemirror/tests/nodeviews.test.ts openspec/changes/redesign-wysiwyg-editor-prosemirror/tasks.md
git commit -m "feat(editor): 移植基础 NodeView（image/task/html/math/mermaid）"
```

---

## Phase 5 — 代码块 NodeView（内嵌 CodeMirror 6）

**目标：** 移植 PureMark `nodeviews/code-block.ts`（1852 行）—— 最复杂的 NodeView，含 CM6 嵌入、内外光标同步、IME、语言动态加载、Shiki 主题、复制按钮。

**对应 tasks.md：** §6.1 ~ §6.6

### 参考映射

| PureMark | Steno |
|---|---|
| `src/core/nodeviews/code-block.ts` (1852 行) | `prosemirror/nodeviews/code-block.ts` |

### Task 5.1 — 整体移植

- [ ] **Step 1：阅读 PureMark code-block.ts 全文**，重点是：
  1. 内部 EditorView 创建
  2. `selectionBetweenViews`（光标在 PM ↔ CM 间跳转）
  3. `forwardUpdate`（CM 变更回灌 PM）
  4. IME 处理
  5. 语言加载 hook（`@codemirror/language-data`）
  6. 主题切换 hook

- [ ] **Step 2：复制到 `prosemirror/nodeviews/code-block.ts`**，按下表 diff 适配：

| PureMark | Steno 适配 |
|---|---|
| 主题切换源 | 改用 `useDark()` from `@vueuse/core` |
| 复制按钮 | 用现有 `MarkdownReadSurface.vue` 中的 `decodeCodeAttr`/`navigator.clipboard.writeText` 思路 |
| Shiki 调用 | 不在 NodeView 内做 Shiki 高亮（出口 HTML 才用）—— NodeView 用 CM6 内建高亮即可 |
| 语言列表 | 同 PureMark，用 `@codemirror/language-data` |

### Task 5.2 — code-block 单测

- [ ] **Step 1：`prosemirror/tests/nodeviews.test.ts` 中加 code-block 用例：**

```ts
it('code-block NodeView 内嵌 CodeMirror 容器', () => {
  // 用最简 EditorView 桥接
  const node = stenoSchema.nodes.code_block.create({ language: 'ts' }, stenoSchema.text('const a = 1'));
  // ... 创建 NodeView，断言 dom.querySelector('.cm-editor') 存在
});
```

### Task 5.3 — 提交 Phase 5

- [ ] **Step 1：勾选 tasks.md §6.1 ~ §6.6**

```bash
pnpm typecheck && pnpm lint && pnpm test
git add src/components/markdown-editor/prosemirror/nodeviews/code-block.ts src/components/markdown-editor/prosemirror/tests/nodeviews.test.ts openspec/changes/redesign-wysiwyg-editor-prosemirror/tasks.md
git commit -m "feat(editor): 代码块 NodeView 内嵌 CodeMirror 6"
```

---

## Phase 6 — Plugins

**目标：** 移植 PureMark plugins/，重点是 instant-render（核心 WYSIWYG）、input-rules、syntax-fixer、paste、placeholder、keymap、history、drop-cursor、gap-cursor。

**对应 tasks.md：** §7.1 ~ §7.9

### 参考映射

| PureMark plugin | Steno target |
|---|---|
| `plugins/instant-render.ts` (146) | `prosemirror/plugins/instant-render.ts`（**核心**，原样移植） |
| `plugins/input-rules.ts` (732) | `prosemirror/plugins/input-rules.ts` |
| `plugins/syntax-fixer.ts` (271) | `prosemirror/plugins/syntax-fixer.ts` |
| `plugins/paste.ts` (346) | `prosemirror/plugins/paste.ts`（粘贴图片改调 `useDb().savePastedImage` —— 通过 `create-editor` 注入） |
| `plugins/placeholder.ts` (64) | `prosemirror/plugins/placeholder.ts` |
| —— | `prosemirror/plugins/keymap.ts`（用 `prosemirror-keymap`，常见快捷键） |
| —— | `prosemirror/plugins/history.ts`（薄包装 `prosemirror-history`） |
| —— | `prosemirror/plugins/drop-cursor.ts`（薄包装 `prosemirror-dropcursor`） |
| —— | `prosemirror/plugins/gap-cursor.ts`（薄包装 `prosemirror-gapcursor`） |

### Task 6.1 — instant-render（核心）

- [ ] **Step 1：原样移植**到 `prosemirror/plugins/instant-render.ts`，包括：
  - 监听 selection 变化
  - 判断当前光标是否在含 `syntax_marker` mark 的文本节点行/段
  - 不在 → Decoration `widget` 隐藏（或 inline `class` 让 CSS `display:none`）
  - 在 → 不加 Decoration（重新显示）

- [ ] **Step 2：测试 `prosemirror/tests/instant-render.test.ts`**：
  - 给 EditorView 塞 `**bold**`
  - selection 移到 `bold` 范围外 → 断言 `**` 字符在 DOM 中隐藏（`offsetParent === null` 或对应 class 存在）
  - selection 移入 → 断言 `**` 重新显示

### Task 6.2 — input-rules

- [ ] **Step 1：移植 PureMark `input-rules.ts`** —— `# `、`> `、`- `、`* `、`+ `、`1. `、`- [ ] `、`> `、` ``` ` 等触发即时转换。
- [ ] **Step 2：测试 1-2 个常用 rule**（heading / bullet list）。

### Task 6.3 — syntax-fixer

- [ ] **Step 1：移植**至 `prosemirror/plugins/syntax-fixer.ts`。在 `ProseMirror.appendTransaction` 钩子里修复破损语法。

### Task 6.4 — paste

- [ ] **Step 1：移植** paste 流程。
- [ ] **Step 2：把图片粘贴回调改为参数注入**：

```ts
export interface PasteOptions {
  /** 调 useDb().savePastedImage 返回 markdownUrl */
  onPasteImage: (dataUrl: string) => Promise<string>;
}
export function createPastePlugin(opts: PasteOptions) { /* ... */ }
```

### Task 6.5 — placeholder / keymap / history / drop-cursor / gap-cursor

- [ ] **Step 1：placeholder.ts** —— 移植 PureMark。
- [ ] **Step 2：keymap.ts**：

```ts
import { keymap } from 'prosemirror-keymap';
import { toggleMark, setBlockType, chainCommands } from 'prosemirror-commands';
import { stenoSchema } from '../schema';

export function createKeymapPlugin() {
  return keymap({
    'Mod-b': toggleMark(stenoSchema.marks.strong),
    'Mod-i': toggleMark(stenoSchema.marks.em),
    'Mod-`': toggleMark(stenoSchema.marks.code),
    'Mod-k': /* 弹出链接输入 */ ,
    // ...
  });
}
```

- [ ] **Step 3：history.ts**：

```ts
import { history, undo, redo } from 'prosemirror-history';
import { keymap } from 'prosemirror-keymap';
export function createHistoryPlugins() {
  return [history(), keymap({ 'Mod-z': undo, 'Mod-y': redo, 'Mod-Shift-z': redo })];
}
```

- [ ] **Step 4：drop-cursor / gap-cursor** —— 一行包装。

### Task 6.6 — plugins/index.ts 装配

- [ ] **Step 1：`prosemirror/plugins/index.ts`：**

```ts
export { createInstantRenderPlugin } from './instant-render';
export { createInputRulesPlugin } from './input-rules';
export { createSyntaxFixerPlugin } from './syntax-fixer';
export { createPastePlugin } from './paste';
export { createPlaceholderPlugin } from './placeholder';
export { createKeymapPlugin } from './keymap';
export { createHistoryPlugins } from './history';
export { createDropCursorPlugin } from './drop-cursor';
export { createGapCursorPlugin } from './gap-cursor';
```

### Task 6.7 — 提交 Phase 6

- [ ] **Step 1：勾选 tasks.md §7.1 ~ §7.9**

```bash
pnpm typecheck && pnpm lint && pnpm test
git add src/components/markdown-editor/prosemirror/plugins src/components/markdown-editor/prosemirror/tests openspec/changes/redesign-wysiwyg-editor-prosemirror/tasks.md
git commit -m "feat(editor): 移植 instant-render / input-rules / paste 等 ProseMirror 插件"
```

---

## Phase 7 — 视图工厂与桥接

**目标：** 出一个统一工厂 `createEditor(options)` 与一套 `EditorBridge`，把 schema/parser/serializer/nodeviews/plugins 装配为可用的 EditorView，对外暴露 v-model / focus / scrollToLine / scrollToHeading。

**对应 tasks.md：** §8.1 ~ §8.3

### Task 7.1 — create-editor

- [ ] **Step 1：`prosemirror/view/create-editor.ts`：**

```ts
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { stenoSchema } from '../schema';
import { parseMarkdown } from '../parser';
import { serializeDoc } from '../serializer';
import {
  createInstantRenderPlugin,
  createInputRulesPlugin,
  createSyntaxFixerPlugin,
  createPastePlugin,
  createPlaceholderPlugin,
  createKeymapPlugin,
  createHistoryPlugins,
  createDropCursorPlugin,
  createGapCursorPlugin,
} from '../plugins';
import {
  imageNodeView,
  taskListItemNodeView,
  htmlBlockNodeView,
  mathBlockNodeView,
  mermaidBlockNodeView,
  codeBlockNodeView,
} from '../nodeviews';
import { tableEditing, columnResizing } from 'prosemirror-tables';

export interface CreateEditorOptions {
  parent: HTMLElement;
  initialValue: string;
  editable: boolean;
  placeholder?: string;
  onChange?: (markdown: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  onPasteImage?: (dataUrl: string) => Promise<string>;
}

export interface CreatedEditor {
  view: EditorView;
  /** 当前 Markdown 文本（同步 serialize） */
  getMarkdown: () => string;
  /** 外部更新 Markdown（避免循环） */
  setMarkdown: (md: string) => void;
  destroy: () => void;
}

export function createEditor(opts: CreateEditorOptions): CreatedEditor {
  const { doc } = parseMarkdown(opts.initialValue);
  const state = EditorState.create({
    schema: stenoSchema,
    doc,
    plugins: [
      ...createHistoryPlugins(),
      createKeymapPlugin(),
      createInputRulesPlugin(),
      createSyntaxFixerPlugin(),
      createInstantRenderPlugin(),
      createPastePlugin({ onPasteImage: opts.onPasteImage ?? (async () => '') }),
      createPlaceholderPlugin({ text: opts.placeholder ?? '' }),
      createDropCursorPlugin(),
      createGapCursorPlugin(),
      columnResizing(),
      tableEditing(),
    ],
  });

  let suppress = false;
  const view = new EditorView(opts.parent, {
    state,
    editable: () => opts.editable,
    nodeViews: {
      image: imageNodeView,
      task_list_item: taskListItemNodeView,
      html_block: htmlBlockNodeView,
      math_block: mathBlockNodeView,
      mermaid_block: mermaidBlockNodeView,
      code_block: codeBlockNodeView,
    },
    dispatchTransaction(tr) {
      const next = view.state.apply(tr);
      view.updateState(next);
      if (!suppress && tr.docChanged) {
        opts.onChange?.(serializeDoc(next.doc));
      }
    },
    handleDOMEvents: {
      focus: () => { opts.onFocus?.(); return false; },
      blur: () => { opts.onBlur?.(); return false; },
    },
  });

  return {
    view,
    getMarkdown: () => serializeDoc(view.state.doc),
    setMarkdown: (md: string) => {
      const current = serializeDoc(view.state.doc);
      if (current === md) return;
      suppress = true;
      try {
        const { doc } = parseMarkdown(md);
        const tr = view.state.tr.replaceWith(0, view.state.doc.content.size, doc.content);
        view.dispatch(tr);
      } finally {
        suppress = false;
      }
    },
    destroy: () => view.destroy(),
  };
}
```

### Task 7.2 — editor-bridge

- [ ] **Step 1：`prosemirror/view/editor-bridge.ts`：**

```ts
import type { CreatedEditor } from './create-editor';

export interface EditorBridge {
  focus(): void;
  scrollToLine(line: number): void;
  scrollToHeading(id: string): void;
}

export function createEditorBridge(editor: CreatedEditor): EditorBridge {
  return {
    focus() {
      editor.view.focus();
    },
    scrollToLine(line: number) {
      // 遍历 doc，找最近 startLine ≤ line 的块级节点
      let targetPos = 0;
      editor.view.state.doc.forEach((node, offset) => {
        if (typeof node.attrs.startLine === 'number' && node.attrs.startLine <= line) {
          targetPos = offset;
        }
      });
      const coords = editor.view.coordsAtPos(targetPos);
      editor.view.dom.parentElement?.scrollTo({ top: coords.top - 60, behavior: 'smooth' });
    },
    scrollToHeading(id: string) {
      const idx = Number.parseInt(id.replace('heading-', ''), 10);
      if (!Number.isFinite(idx)) return;
      let count = 0;
      let pos: number | null = null;
      editor.view.state.doc.forEach((node, offset) => {
        if (node.type.name === 'heading') {
          if (count === idx) pos = offset;
          count += 1;
        }
      });
      if (pos !== null) {
        const coords = editor.view.coordsAtPos(pos);
        editor.view.dom.parentElement?.scrollTo({ top: coords.top - 60, behavior: 'smooth' });
      }
    },
  };
}
```

### Task 7.3 — bridge 测试

- [ ] **Step 1：`prosemirror/tests/bridge.test.ts`** —— 用 jsdom 装配最小 EditorView，验证 v-model 同步、focus 调用、scrollToLine 不抛错。

### Task 7.4 — 提交 Phase 7

- [ ] **Step 1：勾选 tasks.md §8.1 ~ §8.3**

```bash
pnpm typecheck && pnpm lint && pnpm test
git add src/components/markdown-editor/prosemirror/view src/components/markdown-editor/prosemirror/tests/bridge.test.ts openspec/changes/redesign-wysiwyg-editor-prosemirror/tasks.md
git commit -m "feat(editor): 实现 ProseMirror 视图工厂与 v-model/scroll 桥接"
```

---

## Phase 8 — MarkdownEditor.vue 接入

**目标：** 重写 `MarkdownEditor.vue` 内核，对外 API 一致。删除旧 `live-render.ts`。验证图二样例。

**对应 tasks.md：** §9.1 ~ §9.7

### Task 8.1 — 重写组件

- [ ] **Step 1：备份旧文件**

```bash
git mv src/components/MarkdownEditor.vue src/components/MarkdownEditor.vue.bak
```

- [ ] **Step 2：写新 `src/components/MarkdownEditor.vue`：**

```vue
<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue';

import { createEditor, type CreatedEditor } from './markdown-editor/prosemirror/view/create-editor';
import { createEditorBridge, type EditorBridge } from './markdown-editor/prosemirror/view/editor-bridge';
import { useDb } from '@/composables/useDb';
import { setStenoAssetDataDir } from '@/utils/stenoAssets';
import './markdown-editor/prosemirror/styles/base.css';
import './markdown-editor/prosemirror/styles/typography.css';
import './markdown-editor/prosemirror/styles/table.css';
import './markdown-editor/prosemirror/styles/code-block.css';
import './markdown-editor/prosemirror/styles/syntax-marker.css';

interface Props {
  modelValue: string;
  autofocus?: boolean;
  placeholder?: string;
}
const props = withDefaults(defineProps<Props>(), {
  autofocus: false,
  placeholder: '此刻在想什么？支持 Markdown',
});
const emit = defineEmits<{
  'update:modelValue': [value: string];
  focus: [];
  blur: [];
}>();

const containerRef = useTemplateRef<HTMLDivElement>('container');
const editor = ref<CreatedEditor | null>(null);
const bridge = ref<EditorBridge | null>(null);
const db = useDb();

onMounted(async () => {
  if (!containerRef.value) return;
  try {
    const paths = await db.getDataPaths();
    setStenoAssetDataDir(paths.dataDir);
  } catch (err) {
    console.error('[markdown-editor] dataDir 解析失败', err);
  }
  editor.value = createEditor({
    parent: containerRef.value,
    initialValue: props.modelValue,
    editable: true,
    placeholder: props.placeholder,
    onChange: md => emit('update:modelValue', md),
    onFocus: () => emit('focus'),
    onBlur: () => emit('blur'),
    onPasteImage: async dataUrl => (await db.savePastedImage(dataUrl)).markdownUrl,
  });
  bridge.value = createEditorBridge(editor.value);
  if (props.autofocus) bridge.value.focus();
});

watch(() => props.modelValue, next => {
  editor.value?.setMarkdown(next);
});

defineExpose({
  focus: () => bridge.value?.focus(),
  scrollToLine: (line: number) => bridge.value?.scrollToLine(line),
});

onBeforeUnmount(() => {
  editor.value?.destroy();
  editor.value = null;
  bridge.value = null;
});
</script>

<template>
  <div ref="container" class="markdown-editor markdown-body" data-testid="markdown-editor" />
</template>

<style scoped>
.markdown-editor { width: 100%; height: 100%; overflow: auto; }
</style>
```

### Task 8.2 — 删除旧 live-render

- [ ] **Step 1：删除文件**

```bash
git rm src/components/markdown-editor/live-render.ts src/components/markdown-editor/live-render.test.ts src/components/MarkdownEditor.vue.bak
```

- [ ] **Step 2：搜残留**

```bash
# 用 Grep tool，pattern: liveRenderPlugin|live-render
```
Expected: 仅在 openspec/changes 文档与 git log 中出现，无 src/ 引用

- [ ] **Step 3：处理 `markdown-editor/extensions.ts` 与 `markdown-editor/keymap.ts`** —— 若只服务于旧 CodeMirror 编辑器主路径，删除；若 code-block NodeView 复用部分逻辑（如 stenoAssetDataDir effect），把这部分抽到 `prosemirror/nodeviews/code-block.ts` 内联或 `view/` 下小工具，然后删除老文件。

### Task 8.3 — 重写测试

- [ ] **Step 1：`src/components/MarkdownEditor.test.ts` 改写：**

```ts
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import MarkdownEditor from './MarkdownEditor.vue';

describe('MarkdownEditor', () => {
  it('挂载后渲染 ProseMirror 容器', async () => {
    const wrapper = mount(MarkdownEditor, { props: { modelValue: '# hi' } });
    await new Promise(r => setTimeout(r, 0));
    expect(wrapper.find('.ProseMirror').exists()).toBe(true);
  });

  it('外部更新 modelValue 同步到编辑器', async () => {
    const wrapper = mount(MarkdownEditor, { props: { modelValue: 'a' } });
    await new Promise(r => setTimeout(r, 0));
    await wrapper.setProps({ modelValue: '# heading' });
    await new Promise(r => setTimeout(r, 0));
    expect(wrapper.find('h1').exists()).toBe(true);
  });
});
```

### Task 8.4 — 图二端到端验证

- [ ] **Step 1：`prosemirror/tests/e2e-image-two.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import MarkdownEditor from '@/components/MarkdownEditor.vue';

const FIXTURE = `继续**推进** <u>Phase 4</u>

> 你好啊

- a
- v

| A | B |
| - | - |
| a | b |

\`buha\` 你

---

[a](hh)
`;

describe('图二样例 WYSIWYG', () => {
  it('编辑器渲染出 heading/blockquote/ul/table/hr/code/link/u', async () => {
    const wrapper = mount(MarkdownEditor, { props: { modelValue: FIXTURE } });
    await new Promise(r => setTimeout(r, 50));
    expect(wrapper.find('strong').exists()).toBe(true);  // **推进**
    expect(wrapper.find('u').exists()).toBe(true);       // <u>Phase 4</u>
    expect(wrapper.find('blockquote').exists()).toBe(true);
    expect(wrapper.find('ul').exists()).toBe(true);
    expect(wrapper.findAll('ul li').length).toBe(2);
    expect(wrapper.find('table').exists()).toBe(true);
    expect(wrapper.find('code').exists()).toBe(true);
    expect(wrapper.find('hr').exists()).toBe(true);
    expect(wrapper.find('a').attributes('href')).toBe('hh');
  });
});
```

- [ ] **Step 2：跑该测试**

```bash
pnpm test src/components/markdown-editor/prosemirror/tests/e2e-image-two.test.ts
```
Expected: PASS

### Task 8.5 — 提交 Phase 8

- [ ] **Step 1：勾选 tasks.md §9.1 ~ §9.7**

```bash
pnpm typecheck && pnpm lint && pnpm test
git add src/components/MarkdownEditor.vue src/components/MarkdownEditor.test.ts src/components/markdown-editor/ openspec/changes/redesign-wysiwyg-editor-prosemirror/tasks.md
git commit -m "refactor(editor): MarkdownEditor 内核迁移到 ProseMirror，删除 live-render"
```

---

## Phase 9 — MarkdownReadSurface.vue 接入

**目标：** 重写只读面板用同一个 `createEditor`，`editable: false`。删除 markdown-it + v-html 路径。

**对应 tasks.md：** §10.1 ~ §10.6

### Task 9.1 — 重写组件

- [ ] **Step 1：备份**

```bash
git mv src/components/MarkdownReadSurface.vue src/components/MarkdownReadSurface.vue.bak
```

- [ ] **Step 2：写新 `MarkdownReadSurface.vue`**：

```vue
<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, useTemplateRef, watch, computed } from 'vue';

import { createEditor, type CreatedEditor } from './markdown-editor/prosemirror/view/create-editor';
import { createEditorBridge, type EditorBridge } from './markdown-editor/prosemirror/view/editor-bridge';
import { useDb } from '@/composables/useDb';
import { setStenoAssetDataDir } from '@/utils/stenoAssets';

const props = defineProps<{ title: string; content: string }>();

const containerRef = useTemplateRef<HTMLDivElement>('container');
const editor = ref<CreatedEditor | null>(null);
const bridge = ref<EditorBridge | null>(null);
const db = useDb();
const displayTitle = computed(() => props.title.trim() || '无标题');

onMounted(async () => {
  if (!containerRef.value) return;
  try {
    const paths = await db.getDataPaths();
    setStenoAssetDataDir(paths.dataDir);
  } catch (err) {
    console.error('[markdown-read-surface] dataDir 解析失败', err);
  }
  editor.value = createEditor({
    parent: containerRef.value,
    initialValue: props.content,
    editable: false,
  });
  bridge.value = createEditorBridge(editor.value);
});

watch(() => props.content, next => editor.value?.setMarkdown(next));

defineExpose({
  scrollToHeading: (id: string) => bridge.value?.scrollToHeading(id),
});

onBeforeUnmount(() => {
  editor.value?.destroy();
  editor.value = null;
  bridge.value = null;
});
</script>

<template>
  <article class="markdown-read-surface markdown-body" data-testid="markdown-read-surface">
    <header class="markdown-read-surface__header">
      <h1 class="markdown-read-surface__title">{{ displayTitle }}</h1>
    </header>
    <div ref="container" class="markdown-read-surface__body" />
  </article>
</template>

<style scoped>
.markdown-read-surface { display: flex; flex-direction: column; min-height: 0; }
.markdown-read-surface__header { padding: 20px 22px 10px; }
.markdown-read-surface__title { margin: 0; font-size: 20px; font-weight: 700; line-height: 1.35; }
.markdown-read-surface__body { flex: 1; padding: 0 22px 22px; overflow: auto; line-height: 1.65; }
</style>
```

- [ ] **Step 3：删除 .bak 与 v-html 残留**

```bash
git rm src/components/MarkdownReadSurface.vue.bak
```

### Task 9.2 — heading 锚点

- [ ] **Step 1：在 `prosemirror/plugins/keymap.ts` 同目录新增 `prosemirror/plugins/heading-anchor.ts`** —— 用 ProseMirror Decoration 给每个 heading 节点的 DOM 加 `data-heading-id="heading-N"`。`create-editor` 装配进 plugins 列表。

### Task 9.3 — 重写测试

- [ ] **Step 1：`MarkdownReadSurface.test.ts` 改写：**

```ts
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import MarkdownReadSurface from './MarkdownReadSurface.vue';

it('只读面板渲染 markdown', async () => {
  const wrapper = mount(MarkdownReadSurface, {
    props: { title: 't', content: '# h\n\n- a' },
  });
  await new Promise(r => setTimeout(r, 50));
  expect(wrapper.find('h1').text()).toContain('h');
  expect(wrapper.findAll('ul li').length).toBe(1);
});

it('只读：尝试输入不改变内容', async () => {
  const wrapper = mount(MarkdownReadSurface, {
    props: { title: 't', content: '# h' },
  });
  await new Promise(r => setTimeout(r, 50));
  const dom = wrapper.find('.ProseMirror');
  expect(dom.attributes('contenteditable')).toBe('false');
});
```

### Task 9.4 — 提交 Phase 9

- [ ] **Step 1：勾选 tasks.md §10.1 ~ §10.6**

```bash
pnpm typecheck && pnpm lint && pnpm test
git add src/components/MarkdownReadSurface.vue src/components/MarkdownReadSurface.test.ts src/components/markdown-editor/prosemirror/plugins/heading-anchor.ts openspec/changes/redesign-wysiwyg-editor-prosemirror/tasks.md
git commit -m "refactor(reader): MarkdownReadSurface 共用 ProseMirror 内核"
```

---

## Phase 10 — 清理与依赖收敛

**对应 tasks.md：** §11.1 ~ §11.5

### Task 10.1 — 移除未使用依赖

- [ ] **Step 1：grep 各包的剩余引用**

```bash
# 用 Grep tool 分别查 '@codemirror/lang-markdown' '@codemirror/search' '@lezer/highlight'
```

- [ ] **Step 2：确认无 src/ 引用后移除**

```bash
pnpm remove @codemirror/lang-markdown @codemirror/search @lezer/highlight
```

### Task 10.2 — markdown-it 工具收敛

- [ ] **Step 1：核查 `src/utils/markdown/` 各文件还被谁引用**
- [ ] **Step 2：仅保留**：`sanitize.ts`（出口清洗）+ `renderer.ts` 中的 `renderMarkdown`（剪贴板 HTML 兜底，从 `mark` 选区到 HTML 字符串）。`mermaid.ts` 仅作为 NodeView 工具保留导出；`shiki.ts` / `images.ts` 若无人调用则删除。
- [ ] **Step 3：更新 `src/utils/markdown/index.ts` 的 exports**

### Task 10.3 — 验证 + 提交

- [ ] **Step 1：勾选 tasks.md §11.1 ~ §11.5**

```bash
pnpm install
pnpm typecheck && pnpm lint && pnpm test
git add package.json pnpm-lock.yaml src/utils/markdown openspec/changes/redesign-wysiwyg-editor-prosemirror/tasks.md
git commit -m "chore(editor): 移除 CodeMirror lang-markdown/search/lezer 与未用 markdown 工具"
```

---

## Phase 11 — 文档与归档

**对应 tasks.md：** §12.1 ~ §12.4

### Task 11.1 — 写迁移映射 README

- [ ] **Step 1：`src/components/markdown-editor/prosemirror/README.md`**：

```md
# Steno ProseMirror 内核

本目录是 Steno 的 Markdown WYSIWYG 内核，由 PureMark（D:\Markdown项目\PureMark\src\core）移植适配而来。

## 对照映射

| PureMark 文件 | Steno 文件 | 说明 |
| --- | --- | --- |
| schema/index.ts | schema/{nodes,marks,html-inline,index}.ts | 拆分；原样移植 |
| parser/index.ts | parser/{inline,block,types,index}.ts | 拆分；新增 startLine attr |
| serializer/index.ts | serializer/{node-serializers,mark-serializers,index}.ts | 新增 normalize |
| nodeviews/code-block.ts | nodeviews/code-block.ts | 主题改用 useDark |
| nodeviews/image.ts | nodeviews/image.ts | 路径解析改用 stenoAssetDisplaySrc |
| nodeviews/html-block.ts | nodeviews/html-block.ts | 注入前用 Steno sanitizeHtml |
| nodeviews/math-block.ts | nodeviews/math-block.ts | 原样 |
| nodeviews/list.ts | nodeviews/task-list-item.ts | 仅取 task-list 部分 |
| plugins/instant-render.ts | plugins/instant-render.ts | 原样 |
| plugins/input-rules.ts | plugins/input-rules.ts | 原样 |
| plugins/syntax-fixer.ts | plugins/syntax-fixer.ts | 原样 |
| plugins/paste.ts | plugins/paste.ts | onPasteImage 注入 |
| plugins/placeholder.ts | plugins/placeholder.ts | 原样 |
| —— | plugins/{keymap,history,drop-cursor,gap-cursor,heading-anchor}.ts | Steno 新增 |
| —— | view/create-editor.ts、view/editor-bridge.ts | Steno 桥接层 |

## 不移植的 PureMark 模块

- source-view-transform.ts、search.ts、syntax-detector.ts、heading-sync.ts、html-block-sync.ts、image-sync.ts、math-block-sync.ts、auto-pair.ts、line-numbers.ts、link-tooltip.ts —— 留作后续 change 处理
```

### Task 11.2 — 更新外部文档

- [ ] **Step 1：在 `docs/` 下找到编辑器相关说明，更新内核描述**

### Task 11.3 — OpenSpec 归档

- [ ] **Step 1：`openspec archive redesign-wysiwyg-editor-prosemirror`**
- [ ] **Step 2：core spec 文件落入 `openspec/specs/markdown-wysiwyg-editor/spec.md`**（归档时由 openspec 自动处理）

### Task 11.4 — 最终提交

- [ ] **Step 1：勾选 tasks.md §12.1 ~ §12.4**

```bash
pnpm typecheck && pnpm lint && pnpm test
git add docs/ src/components/markdown-editor/prosemirror/README.md openspec/
git commit -m "docs(openspec): 归档 redesign-wysiwyg-editor-prosemirror"
```

---

## Self-Review Checklist

执行者在每 Phase 末尾前自查：

- [ ] **Spec coverage** —— 该 Phase 关联的 spec requirement scenarios 是否全部有对应 task / 测试？没有的话回去补。
- [ ] **Placeholder scan** —— 本 Phase 提交的代码里 grep `TODO|FIXME|TBD|implement later`；如果有，给出原因或修掉。
- [ ] **Type consistency** —— 跨 Phase 的接口（`CreatedEditor` / `EditorBridge` / `CreateEditorOptions` / `PasteOptions`）字段名拼写是否前后一致？
- [ ] **回归** —— 完整跑 `pnpm typecheck && pnpm lint && pnpm test`，全绿才能 commit。
- [ ] **手测 Tauri 实机**（Phase 8、9 后必做）：`pnpm tauri:dev` 打开应用，编辑/只读切换，粘贴图片、IME 中英输入、长文档滚动。

---

## Execution Notes

- **跨 session**：本计划共 12 个 Phase，预计需要多个 session 完成。每个 session 开始时先看本计划的当前 Phase 与 `openspec/changes/redesign-wysiwyg-editor-prosemirror/tasks.md` 已勾选项，确定下一步入口。
- **遇阻**：若在某 Phase 卡住（如 instant-render Decoration 行为与预期不符），先回到对应 PureMark 文件用 diff 工具对比；不要在缺乏理解的情况下乱改 schema。
- **不修改参考项目**：PureMark / milkup 全程只读。任何看似的 bug fix 留作 Steno 这一侧的 patch，并加中文注释说明原因。
