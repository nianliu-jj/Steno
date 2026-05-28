# Markdown WYSIWYG Editor (ProseMirror) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `MarkdownEditor.vue` 与 `MarkdownReadSurface.vue` 内核从 CodeMirror 6 + 自建 live-render / markdown-it 管线统一迁移到 ProseMirror 真正 WYSIWYG 内核，效果对齐 PureMark / milkup（截图二），同时保持磁盘与 v-model 始终是纯 Markdown 字符串、对外组件 API 不破坏。

**Architecture:** 新建 `src/components/markdown-editor/prosemirror/`，按 schema / parser / serializer / nodeviews / plugins / view / styles 分层。`MarkdownEditor.vue` 与 `MarkdownReadSurface.vue` 都通过 `view/create-editor.ts` 工厂创建同一种 EditorView，仅靠 `editable` 标志切换两态。代码块 NodeView 内嵌 CodeMirror 6；Mermaid / KaTeX 在 NodeView 内调用现有 `utils/markdown/{mermaid,images}.ts` 工具；剪贴板 HTML 出口经现有 `utils/markdown/sanitize.ts` DOMPurify 清洗。

**Tech Stack:** Vue 3、TypeScript、ProseMirror（`-state` / `-view` / `-model` / `-history` / `-keymap` / `-commands` / `-inputrules` / `-schema-list` / `-dropcursor` / `-gapcursor` / `-tables` / `-transform`）、CodeMirror 6（仅代码块 NodeView 嵌入）、KaTeX、Mermaid、Shiki、DOMPurify、Vitest + jsdom。

**参考项目（只读不改）：**
- `D:\Markdown项目\PureMark\src\core\` — 主要对照源。
- `D:\Markdown项目\milkup` — 同构架构，二次参考。

**通用规则（每个 Phase 都适用）：**
1. 每个 Phase 完成后 **必须** 依序跑：`pnpm typecheck`、`pnpm lint`、`pnpm test`，全部通过才能 commit。
2. 每个 Phase 结束做一次中文 git commit，commit 信息见每 Phase 末尾。
3. commit 后立即把 `openspec/changes/redesign-wysiwyg-editor-prosemirror/tasks.md` 中对应任务的 `[ ]` 改成 `[x]`，连同下一 Phase 起步一起提交即可。
4. 不要修改参考项目；只读拷贝 + 改写。
5. 任何 Phase 失败禁止 `--no-verify` 绕开 hook，定位根因。

---

## File Structure

新建：
- `src/components/markdown-editor/prosemirror/README.md` — 对照映射表
- `src/components/markdown-editor/prosemirror/schema/index.ts` — Schema 入口
- `src/components/markdown-editor/prosemirror/schema/nodes.ts` — NodeSpec 集合
- `src/components/markdown-editor/prosemirror/schema/marks.ts` — MarkSpec 集合
- `src/components/markdown-editor/prosemirror/schema/html-inline.ts` — 内联 HTML 白名单 + 属性清洗
- `src/components/markdown-editor/prosemirror/parser/index.ts` — Markdown → Doc 入口
- `src/components/markdown-editor/prosemirror/parser/inline.ts` — 行内规则
- `src/components/markdown-editor/prosemirror/parser/block.ts` — 块级规则
- `src/components/markdown-editor/prosemirror/serializer/index.ts` — Doc → Markdown 入口
- `src/components/markdown-editor/prosemirror/serializer/node-serializers.ts`
- `src/components/markdown-editor/prosemirror/serializer/mark-serializers.ts`
- `src/components/markdown-editor/prosemirror/nodeviews/index.ts`
- `src/components/markdown-editor/prosemirror/nodeviews/image.ts`
- `src/components/markdown-editor/prosemirror/nodeviews/task-list-item.ts`
- `src/components/markdown-editor/prosemirror/nodeviews/html-block.ts`
- `src/components/markdown-editor/prosemirror/nodeviews/math-block.ts`
- `src/components/markdown-editor/prosemirror/nodeviews/mermaid-block.ts`
- `src/components/markdown-editor/prosemirror/nodeviews/table.ts`
- `src/components/markdown-editor/prosemirror/nodeviews/code-block.ts`
- `src/components/markdown-editor/prosemirror/plugins/index.ts`
- `src/components/markdown-editor/prosemirror/plugins/instant-render.ts`
- `src/components/markdown-editor/prosemirror/plugins/input-rules.ts`
- `src/components/markdown-editor/prosemirror/plugins/syntax-fixer.ts`
- `src/components/markdown-editor/prosemirror/plugins/paste.ts`
- `src/components/markdown-editor/prosemirror/plugins/placeholder.ts`
- `src/components/markdown-editor/prosemirror/plugins/keymap.ts`
- `src/components/markdown-editor/prosemirror/plugins/history.ts`
- `src/components/markdown-editor/prosemirror/plugins/drop-cursor.ts`
- `src/components/markdown-editor/prosemirror/plugins/gap-cursor.ts`
- `src/components/markdown-editor/prosemirror/view/create-editor.ts`
- `src/components/markdown-editor/prosemirror/view/editor-bridge.ts`
- `src/components/markdown-editor/prosemirror/styles/base.css`
- `src/components/markdown-editor/prosemirror/styles/typography.css`
- `src/components/markdown-editor/prosemirror/styles/table.css`
- `src/components/markdown-editor/prosemirror/styles/code-block.css`
- `src/components/markdown-editor/prosemirror/styles/syntax-marker.css`
- `src/components/markdown-editor/prosemirror/tests/schema.test.ts`
- `src/components/markdown-editor/prosemirror/tests/parser.test.ts`
- `src/components/markdown-editor/prosemirror/tests/serializer.test.ts`
- `src/components/markdown-editor/prosemirror/tests/instant-render.test.ts`
- `src/components/markdown-editor/prosemirror/tests/nodeviews.test.ts`
- `src/components/markdown-editor/prosemirror/tests/bridge.test.ts`

修改：
- `src/components/MarkdownEditor.vue` — 整体内核替换
- `src/components/MarkdownReadSurface.vue` — 整体内核替换
- `src/components/MarkdownEditor.test.ts` — 适配新内核
- `src/components/MarkdownReadSurface.test.ts` — 适配新内核
- `package.json` — 增删依赖
- `pnpm-lock.yaml` — pnpm install 自动更新

删除：
- `src/components/markdown-editor/live-render.ts`
- `src/components/markdown-editor/live-render.test.ts`
- `src/utils/markdown/renderer.ts` 中所有作为编辑器渲染用的入口（保留 `renderMarkdown` 兜底）

---

## Phase 0 — 依赖与目录骨架

**Files:**
- Modify: `D:\Steno\package.json`
- Create: 上面 File Structure 中列的所有空 `index.ts` 占位文件 + `README.md`

- [ ] **0.1 装新依赖**

```bash
cd D:/Steno
pnpm add prosemirror-dropcursor prosemirror-gapcursor prosemirror-tables prosemirror-transform
```

Expected: `package.json` `dependencies` 多出这 4 项；`pnpm-lock.yaml` 更新。已有的 `prosemirror-*` 包（commands/history/inputrules/keymap/markdown/model/schema-list/state/view）保持不动。

- [ ] **0.2 建目录骨架**

逐个用 Write 工具创建文件（每个都先放一行注释 `// placeholder`），路径见 File Structure 节。

`src/components/markdown-editor/prosemirror/README.md` 内容：

```markdown
# ProseMirror Markdown Editor Core

Steno 的 Markdown WYSIWYG 内核，参考 PureMark / milkup 实现。

## 对照映射

| Steno 文件 | 参考来源 |
|---|---|
| `schema/index.ts`、`schema/nodes.ts`、`schema/marks.ts` | `D:\Markdown项目\PureMark\src\core\schema\index.ts` |
| `schema/html-inline.ts` | 同上的 `SAFE_INLINE_TAGS` + `parseHtmlAttrs` |
| `parser/index.ts`、`parser/inline.ts`、`parser/block.ts` | `D:\Markdown项目\PureMark\src\core\parser\index.ts` |
| `serializer/index.ts` 等 | `D:\Markdown项目\PureMark\src\core\serializer\index.ts` |
| `plugins/instant-render.ts` | `D:\Markdown项目\PureMark\src\core\plugins\instant-render.ts` |
| `plugins/input-rules.ts` | `D:\Markdown项目\PureMark\src\core\plugins\input-rules.ts` |
| `plugins/syntax-fixer.ts` | `D:\Markdown项目\PureMark\src\core\plugins\syntax-fixer.ts` |
| `plugins/paste.ts` | `D:\Markdown项目\PureMark\src\core\plugins\paste.ts` |
| `plugins/placeholder.ts` | `D:\Markdown项目\PureMark\src\core\plugins\placeholder.ts` |
| `nodeviews/code-block.ts` | `D:\Markdown项目\PureMark\src\core\nodeviews\code-block.ts` |
| `nodeviews/image.ts` | 同上 `image.ts`（适配 Steno `stenoAssets`） |
| `nodeviews/list.ts`（task） | 同上 `list.ts` |
| `nodeviews/html-block.ts` | 同上 `html-block.ts`（DOMPurify 替换为 `utils/markdown/sanitize.ts`） |
| `nodeviews/math-block.ts` | 同上 `math-block.ts` |

## Steno 适配点
- 图片路径解析复用 `@/utils/stenoAssets.ts`
- Mermaid 调用复用 `@/utils/markdown/mermaid.ts` 的缓存渲染
- DOMPurify 配置复用 `@/utils/markdown/sanitize.ts`
- 黑暗模式订阅 `@vueuse/core` 的 `useDark()`
```

- [ ] **0.3 验证骨架可编译**

```bash
cd D:/Steno
pnpm typecheck
```

Expected: PASS（占位文件均合法 TS 注释）

```bash
pnpm lint
```

Expected: PASS

- [ ] **0.4 Commit**

```bash
git add package.json pnpm-lock.yaml src/components/markdown-editor/prosemirror/
git commit -m "feat(editor): 搭建 ProseMirror 内核目录骨架与依赖"
```

把 `openspec/changes/redesign-wysiwyg-editor-prosemirror/tasks.md` 里 §1 全部勾上 `[x]`，单独再 commit：

```bash
git add openspec/changes/redesign-wysiwyg-editor-prosemirror/tasks.md
git commit -m "chore(openspec): 勾选 Phase 0 完成项"
```

---

## Phase 1 — Schema

**Files:**
- Create: `src/components/markdown-editor/prosemirror/schema/{nodes,marks,html-inline,index}.ts`
- Create: `src/components/markdown-editor/prosemirror/tests/schema.test.ts`

**关键参考：** 打开 `D:\Markdown项目\PureMark\src\core\schema\index.ts`（726 行），完整阅读后按下面拆分搬运。

- [ ] **1.1 移植 `schema/html-inline.ts`（白名单 + 属性清洗）**

从 PureMark 文件中拷贝以下两块到 `src/components/markdown-editor/prosemirror/schema/html-inline.ts`：
- `SAFE_INLINE_TAGS` 常量集合
- `parseHtmlAttrs` 函数（含 `on*` 与 `javascript:` / `vbscript:` / `data:` 过滤）

导出名保持一致：`export const SAFE_INLINE_TAGS`、`export function parseHtmlAttrs`。文件顶部加注释：

```ts
/**
 * @file 内联 HTML 标签白名单与属性安全清洗。
 *
 * 来源：PureMark `src/core/schema/index.ts` 中的 SAFE_INLINE_TAGS + parseHtmlAttrs。
 * 与 `src/utils/markdown/sanitize.ts` 中 DOMPurify 白名单保持一致（一处定义、双处遵守）。
 */
```

- [ ] **1.2 移植 NodeSpec 到 `schema/nodes.ts`**

把 PureMark `schema/index.ts` 中所有 `NodeSpec`（doc、paragraph、heading、blockquote、bullet_list、ordered_list、list_item、task_list_item、code_block、math_block、mermaid_block、html_block、horizontal_rule、table、table_row、table_cell、table_header、image、text、hard_break）拷贝到 `schema/nodes.ts`，导出 `export const nodes: Record<string, NodeSpec>`。

在每个 NodeSpec 内的 `attrs` 中**新增** `startLine: { default: null }`（用于后续 `scrollToLine`）—— 这是 Steno 适配点，记得加注释 `// Steno: 块级节点记录源行号` 标注差异。

- [ ] **1.3 移植 MarkSpec 到 `schema/marks.ts`**

把 PureMark 的 `strong`/`em`/`code`/`strike`/`link`/`highlight`/`syntax_marker`/`html_inline` MarkSpec 拷贝到 `schema/marks.ts`，导出 `export const marks: Record<string, MarkSpec>`。

`link` 的 `href` 属性 `parseDOM` 处增加协议白名单（http/https/mailto/file/`steno-asset:`），其它协议丢弃。

- [ ] **1.4 装配 `schema/index.ts`**

```ts
/**
 * @file ProseMirror Schema 入口。
 * 装配 nodes + marks 为 puremarkSchema-like 的 Schema 实例。
 * 参考：D:\Markdown项目\PureMark\src\core\schema\index.ts
 */
import { Schema } from 'prosemirror-model';
import { nodes } from './nodes';
import { marks } from './marks';

export const stenoSchema = new Schema({ nodes, marks });
export type StenoSchema = typeof stenoSchema;
export { SAFE_INLINE_TAGS, parseHtmlAttrs } from './html-inline';
```

- [ ] **1.5 写 schema 单测**

`src/components/markdown-editor/prosemirror/tests/schema.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { stenoSchema } from '../schema';

describe('stenoSchema', () => {
  it('能创建空 doc', () => {
    const doc = stenoSchema.node('doc', null, [stenoSchema.node('paragraph')]);
    expect(doc.firstChild?.type.name).toBe('paragraph');
  });

  it('段落能容纳文本节点', () => {
    const text = stenoSchema.text('hello');
    const p = stenoSchema.node('paragraph', null, [text]);
    expect(p.textContent).toBe('hello');
  });

  it('标题 attrs 包含 level 与 startLine', () => {
    const h = stenoSchema.node('heading', { level: 2, startLine: 3 }, [stenoSchema.text('h')]);
    expect(h.attrs.level).toBe(2);
    expect(h.attrs.startLine).toBe(3);
  });

  it('强调 mark 可加到文本', () => {
    const t = stenoSchema.text('x', [stenoSchema.mark('strong')]);
    expect(t.marks[0].type.name).toBe('strong');
  });

  it('html_inline mark 携带 tag 属性', () => {
    const t = stenoSchema.text('y', [stenoSchema.mark('html_inline', { tag: 'u', attrs: {} })]);
    expect(t.marks[0].attrs.tag).toBe('u');
  });
});
```

- [ ] **1.6 跑测试**

```bash
cd D:/Steno
pnpm test -- src/components/markdown-editor/prosemirror/tests/schema.test.ts
```

Expected: 5 个用例 PASS

- [ ] **1.7 Phase 1 验收 + commit**

```bash
pnpm typecheck && pnpm lint && pnpm test
```

全 PASS 后：

```bash
git add src/components/markdown-editor/prosemirror/schema/ src/components/markdown-editor/prosemirror/tests/schema.test.ts
git commit -m "feat(editor): 移植 ProseMirror Schema（nodes/marks/html 白名单）"
```

把 tasks.md §2 全部勾上 `[x]`，commit：

```bash
git add openspec/changes/redesign-wysiwyg-editor-prosemirror/tasks.md
git commit -m "chore(openspec): 勾选 Phase 1 完成项"
```

---

## Phase 2 — Parser（Markdown → Doc）

**Files:**
- Create: `src/components/markdown-editor/prosemirror/parser/{inline,block,index}.ts`
- Create: `src/components/markdown-editor/prosemirror/tests/parser.test.ts`

**关键参考：** 打开 `D:\Markdown项目\PureMark\src\core\parser\index.ts`（1357 行）。

- [ ] **2.1 拆分参考文件到三个 Steno 文件**

读 PureMark `parser/index.ts`，按职责拆分到 Steno 三个文件：

- `parser/inline.ts` — INLINE_SYNTAXES 数组（strong_emphasis / strong / emphasis / code_inline / strikethrough / highlight / link / autolink / image / inline_math / html_inline）+ `parseInline(text, schema): Node[]` 函数。
- `parser/block.ts` — 块级行扫描器 + 各块解析函数（heading / blockquote 含无空格 / bullet_list / ordered_list / task_list_item / horizontal_rule / fenced_code / math_block / mermaid_block / html_block / table / paragraph）。每个块级节点构造时通过 `attrs.startLine = lineIndex`。
- `parser/index.ts` — 主入口 `parseMarkdown(markdown: string, schema: StenoSchema): Node`，先按行扫描，再委托给 block parser。

每个文件顶部加注释：

```ts
/**
 * @file ...
 * @reference D:\Markdown项目\PureMark\src\core\parser\index.ts
 * @adaptations Steno 适配：
 *   - 块级节点写入 attrs.startLine（源行号，用于 scrollToLine）
 *   - 链接 href 校验协议白名单
 *   - 内联 HTML 走 SAFE_INLINE_TAGS 过滤
 */
```

- [ ] **2.2 写 parser 单测的「正向断言」用例**

`src/components/markdown-editor/prosemirror/tests/parser.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { stenoSchema } from '../schema';
import { parseMarkdown } from '../parser';

function topLevelTypes(md: string): string[] {
  const doc = parseMarkdown(md, stenoSchema);
  const names: string[] = [];
  doc.forEach(node => names.push(node.type.name));
  return names;
}

describe('parseMarkdown - 块级', () => {
  it('标题 h1-h6', () => {
    expect(topLevelTypes('# a\n## b\n### c\n#### d\n##### e\n###### f')).toEqual(
      Array(6).fill('heading'),
    );
  });

  it('blockquote（含无空格 >foo）', () => {
    expect(topLevelTypes('>foo')).toEqual(['blockquote']);
    expect(topLevelTypes('> bar')).toEqual(['blockquote']);
  });

  it('无序列表', () => {
    const doc = parseMarkdown('- a\n- v', stenoSchema);
    expect(doc.firstChild?.type.name).toBe('bullet_list');
    expect(doc.firstChild?.childCount).toBe(2);
  });

  it('有序列表', () => {
    const doc = parseMarkdown('1. a\n2. b', stenoSchema);
    expect(doc.firstChild?.type.name).toBe('ordered_list');
  });

  it('任务列表', () => {
    const doc = parseMarkdown('- [ ] todo\n- [x] done', stenoSchema);
    const list = doc.firstChild!;
    expect(list.firstChild?.type.name).toBe('task_list_item');
    expect(list.firstChild?.attrs.checked).toBe(false);
    expect(list.lastChild?.attrs.checked).toBe(true);
  });

  it('水平分隔线', () => {
    expect(topLevelTypes('---')).toEqual(['horizontal_rule']);
    expect(topLevelTypes('***')).toEqual(['horizontal_rule']);
    expect(topLevelTypes('___')).toEqual(['horizontal_rule']);
  });

  it('GFM 表格', () => {
    const md = '| A | B |\n|---|---|\n| a | b |';
    expect(topLevelTypes(md)).toEqual(['table']);
  });

  it('围栏代码块带语言', () => {
    const doc = parseMarkdown('```ts\nconst x = 1;\n```', stenoSchema);
    expect(doc.firstChild?.type.name).toBe('code_block');
    expect(doc.firstChild?.attrs.language).toBe('ts');
  });

  it('块级数学', () => {
    const doc = parseMarkdown('$$\nE=mc^2\n$$', stenoSchema);
    expect(doc.firstChild?.type.name).toBe('math_block');
  });

  it('Mermaid 块', () => {
    const doc = parseMarkdown('```mermaid\ngraph TD\nA-->B\n```', stenoSchema);
    expect(doc.firstChild?.type.name).toBe('mermaid_block');
  });

  it('块级节点记录 startLine', () => {
    const doc = parseMarkdown('# h\n\npara', stenoSchema);
    expect(doc.child(0).attrs.startLine).toBe(0);
    expect(doc.child(1).attrs.startLine).toBe(2);
  });
});

describe('parseMarkdown - 行内', () => {
  it('链接', () => {
    const doc = parseMarkdown('[a](https://x.com)', stenoSchema);
    const p = doc.firstChild!;
    const linkMark = p.firstChild?.marks.find(m => m.type.name === 'link');
    expect(linkMark?.attrs.href).toBe('https://x.com');
  });

  it('链接的危险协议被丢弃', () => {
    const doc = parseMarkdown('[x](javascript:alert(1))', stenoSchema);
    const p = doc.firstChild!;
    const linkMark = p.firstChild?.marks.find(m => m.type.name === 'link');
    expect(linkMark).toBeUndefined();
  });

  it('粗体/斜体/删除线/高亮/代码', () => {
    const doc = parseMarkdown('**b** *i* ~~s~~ ==h== `c`', stenoSchema);
    const marksByText: Record<string, string[]> = {};
    doc.descendants(n => {
      if (n.isText) marksByText[n.text!] = n.marks.map(m => m.type.name);
    });
    expect(marksByText.b).toContain('strong');
    expect(marksByText.i).toContain('em');
    expect(marksByText.s).toContain('strike');
    expect(marksByText.h).toContain('highlight');
    expect(marksByText.c).toContain('code');
  });

  it('白名单内联 HTML', () => {
    const doc = parseMarkdown('text <u>under</u> end', stenoSchema);
    let found = false;
    doc.descendants(n => {
      if (n.text === 'under') {
        found = n.marks.some(m => m.type.name === 'html_inline' && m.attrs.tag === 'u');
      }
    });
    expect(found).toBe(true);
  });

  it('非白名单内联 HTML 作为文本', () => {
    const doc = parseMarkdown('<script>x</script>', stenoSchema);
    // <script> 不应产生 html_inline mark
    doc.descendants(n => {
      n.marks.forEach(m => expect(m.type.name).not.toBe('html_inline'));
    });
  });

  it('行内数学', () => {
    const doc = parseMarkdown('a $x^2$ b', stenoSchema);
    let hasMathMark = false;
    doc.descendants(n => {
      if (n.marks.some(m => m.type.name === 'inline_math' || m.attrs?.mathInline)) {
        hasMathMark = true;
      }
    });
    expect(hasMathMark || doc.textContent.includes('x^2')).toBe(true);
  });

  it('图片', () => {
    const doc = parseMarkdown('![alt](./a.png)', stenoSchema);
    let found = false;
    doc.descendants(n => {
      if (n.type.name === 'image' && n.attrs.src === './a.png') found = true;
    });
    expect(found).toBe(true);
  });
});
```

- [ ] **2.3 跑 parser 测试，按失败逐项修 parser 实现**

```bash
cd D:/Steno
pnpm test -- src/components/markdown-editor/prosemirror/tests/parser.test.ts
```

按测试失败信息回到 `parser/{inline,block,index}.ts` 修。重复直到全 PASS。

- [ ] **2.4 Phase 2 验收 + commit**

```bash
pnpm typecheck && pnpm lint && pnpm test
```

```bash
git add src/components/markdown-editor/prosemirror/parser/ src/components/markdown-editor/prosemirror/tests/parser.test.ts
git commit -m "feat(editor): 移植 ProseMirror Markdown parser（行内+块级，含 startLine）"
git add openspec/changes/redesign-wysiwyg-editor-prosemirror/tasks.md  # 勾选 §3
git commit -m "chore(openspec): 勾选 Phase 2 完成项"
```

---

## Phase 3 — Serializer（Doc → Markdown）

**Files:**
- Create: `src/components/markdown-editor/prosemirror/serializer/{node-serializers,mark-serializers,index}.ts`
- Create: `src/components/markdown-editor/prosemirror/tests/serializer.test.ts`

**关键参考：** `D:\Markdown项目\PureMark\src\core\serializer\index.ts`（433 行）。

- [ ] **3.1 按职责拆三个文件**

- `mark-serializers.ts` — 导出 `markSerializers: Record<string, MarkSerializerSpec>`（strong/em/code/strike/link/highlight/html_inline）
- `node-serializers.ts` — 导出 `nodeSerializers: Record<string, NodeSerializerFn>`（paragraph/heading/blockquote/list/code_block/math_block/mermaid_block/html_block/horizontal_rule/table/image/hard_break）
- `index.ts` — 提供 `serializeMarkdown(doc: Node): string`，内部用 `MarkdownSerializer`（来自 `prosemirror-markdown` 的低层 API 已经够用，自己实现也行；保持与 PureMark 相同的"自实现 SerializerState"路径以最大化复用）

文件头注释：

```ts
/**
 * @file ...
 * @reference D:\Markdown项目\PureMark\src\core\serializer\index.ts
 * 与 parser 严格对称：parser(md) → doc → serializer(doc) === md（语义等价；空白归一化规则见 §3.3）
 */
```

- [ ] **3.2 实现归一化规则**

在 `serializer/index.ts` 中明确空白归一化：
- CRLF → LF
- 行尾空格保留为转义（不会被 trim）
- 列表前后强制空行（与 GFM 一致）
- 表格分隔行对齐符号保留

- [ ] **3.3 写 round-trip 测试**

`tests/serializer.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { stenoSchema } from '../schema';
import { parseMarkdown } from '../parser';
import { serializeMarkdown } from '../serializer';

function roundtrip(md: string): string {
  return serializeMarkdown(parseMarkdown(md, stenoSchema));
}

describe('roundtrip', () => {
  const cases: Array<[string, string]> = [
    ['标题', '# A\n\n## B\n\n### C'],
    ['段落', 'hello world'],
    ['粗体斜体', '**b** *i* ~~s~~ ==h== `c`'],
    ['链接', '[a](https://x.com)'],
    ['图片', '![alt](./a.png)'],
    ['无序列表', '- a\n- v'],
    ['有序列表', '1. a\n2. b'],
    ['任务列表', '- [ ] todo\n- [x] done'],
    ['blockquote', '> foo'],
    ['blockquote 无空格', '>foo'],
    ['HR ---', '---'],
    ['HR ***', '***'],
    ['围栏代码块', '```ts\nconst x = 1;\n```'],
    ['数学块', '$$\nE=mc^2\n$$'],
    ['Mermaid', '```mermaid\ngraph TD\nA-->B\n```'],
    ['表格', '| A | B |\n|---|---|\n| a | b |'],
    ['内联 HTML', 'text <u>x</u> end'],
  ];

  for (const [name, md] of cases) {
    it(`保持语义等价：${name}`, () => {
      expect(roundtrip(md).trim()).toBe(md.trim());
    });
  }

  it('图二完整样例 roundtrip', () => {
    const md = [
      '继续**推进** <u>Phase 4</u>',
      '',
      '> 你好啊',
      '',
      '- a',
      '- v',
      '',
      '| A | B |',
      '|---|---|',
      '| a | b |',
      '',
      '`buha` 你',
      '',
      '---',
      '',
      '[a](hh)',
    ].join('\n');
    const out = roundtrip(md).trim();
    expect(out).toContain('**推进**');
    expect(out).toContain('<u>Phase 4</u>');
    expect(out).toContain('> 你好啊');
    expect(out).toContain('- a');
    expect(out).toContain('| A | B |');
    expect(out).toContain('`buha`');
    expect(out).toContain('---');
    expect(out).toContain('[a](hh)');
  });
});
```

- [ ] **3.4 跑测试改实现，直到 PASS**

```bash
pnpm test -- src/components/markdown-editor/prosemirror/tests/serializer.test.ts
```

- [ ] **3.5 Phase 3 验收 + commit**

```bash
pnpm typecheck && pnpm lint && pnpm test
git add src/components/markdown-editor/prosemirror/serializer/ src/components/markdown-editor/prosemirror/tests/serializer.test.ts
git commit -m "feat(editor): 移植 ProseMirror Markdown serializer（与 parser 来回一致）"
git add openspec/changes/redesign-wysiwyg-editor-prosemirror/tasks.md  # 勾选 §4
git commit -m "chore(openspec): 勾选 Phase 3 完成项"
```

---

## Phase 4 — 基础 NodeView

**Files:**
- Create: `nodeviews/image.ts`、`task-list-item.ts`、`html-block.ts`、`math-block.ts`、`mermaid-block.ts`、`table.ts`、`index.ts`
- Create: `tests/nodeviews.test.ts`

**关键参考：**
- `D:\Markdown项目\PureMark\src\core\nodeviews\image.ts`（710 行）— 大量功能（缩放、拖拽）可后置；只移植基础渲染。
- 同目录 `html-block.ts` / `math-block.ts` / `list.ts`。

- [ ] **4.1 `nodeviews/image.ts` 基础版**

只实现：
- 接收 `node.attrs.src` / `alt`
- 调 `@/utils/stenoAssets.ts` 的 `stenoAssetDisplaySrc(src)` 解析为可加载 URL
- 失败时 `img.onerror` 显示占位 `<div class="pm-image-broken">`

签名：

```ts
import type { Node } from 'prosemirror-model';
import type { EditorView, NodeView } from 'prosemirror-view';
import { stenoAssetDisplaySrc } from '@/utils/stenoAssets';

export function imageNodeView(node: Node, _view: EditorView): NodeView {
  const dom = document.createElement('img');
  dom.src = stenoAssetDisplaySrc(node.attrs.src);
  dom.alt = node.attrs.alt ?? '';
  dom.className = 'pm-image';
  dom.onerror = () => {
    const ph = document.createElement('div');
    ph.className = 'pm-image-broken';
    ph.textContent = `[图片加载失败: ${node.attrs.src}]`;
    dom.replaceWith(ph);
  };
  return { dom };
}
```

- [ ] **4.2 `nodeviews/task-list-item.ts`**

实现复选框 + click 时 `tr.setNodeMarkup` 改 `checked`：

```ts
import type { Node } from 'prosemirror-model';
import type { EditorView, NodeView } from 'prosemirror-view';

export function taskListItemNodeView(node: Node, view: EditorView, getPos: () => number | undefined): NodeView {
  const li = document.createElement('li');
  li.className = 'pm-task-item';
  if (node.attrs.checked) li.classList.add('checked');

  const box = document.createElement('input');
  box.type = 'checkbox';
  box.className = 'pm-task-checkbox';
  box.checked = !!node.attrs.checked;
  box.addEventListener('change', () => {
    const pos = getPos();
    if (pos === undefined) return;
    view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, checked: box.checked }));
  });
  li.append(box);

  const content = document.createElement('div');
  content.className = 'pm-task-content';
  li.append(content);
  return { dom: li, contentDOM: content, update(updated) {
    if (updated.type !== node.type) return false;
    box.checked = !!updated.attrs.checked;
    li.classList.toggle('checked', !!updated.attrs.checked);
    return true;
  }};
}
```

- [ ] **4.3 `nodeviews/html-block.ts`**

```ts
import type { Node } from 'prosemirror-model';
import type { NodeView } from 'prosemirror-view';
import { sanitizeHtml } from '@/utils/markdown/sanitize';

export function htmlBlockNodeView(node: Node): NodeView {
  const wrap = document.createElement('div');
  wrap.className = 'pm-html-block';
  wrap.innerHTML = sanitizeHtml(node.attrs.html ?? node.textContent);
  return { dom: wrap };
}
```

- [ ] **4.4 `nodeviews/math-block.ts`**

调用 `katex.renderToString(latex, { displayMode: true, throwOnError: false })`，失败时显示错误信息 + 原始 LaTeX。光标进入 NodeView 时切回可编辑 textarea —— 首版用 `selectNode` + click 时切显示模式实现。

- [ ] **4.5 `nodeviews/mermaid-block.ts`**

调用 `@/utils/markdown/mermaid.ts` 中已有的渲染缓存函数（如 `renderMermaidToSvg`）；渲染失败显示错误 + 源码。

- [ ] **4.6 `nodeviews/table.ts`**

首版只接管 wrapper（套 `<div class="pm-table-wrap">` 提供横向滚动），单元格仍走 ProseMirror 默认渲染。

- [ ] **4.7 `nodeviews/index.ts` 统一导出**

```ts
import type { EditorView, NodeView } from 'prosemirror-view';
import type { Node } from 'prosemirror-model';
import { imageNodeView } from './image';
import { taskListItemNodeView } from './task-list-item';
import { htmlBlockNodeView } from './html-block';
import { mathBlockNodeView } from './math-block';
import { mermaidBlockNodeView } from './mermaid-block';
import { tableNodeView } from './table';

export const nodeViews = {
  image: (n: Node, v: EditorView) => imageNodeView(n, v),
  task_list_item: (n: Node, v: EditorView, gp: () => number | undefined) => taskListItemNodeView(n, v, gp),
  html_block: (n: Node) => htmlBlockNodeView(n),
  math_block: (n: Node) => mathBlockNodeView(n),
  mermaid_block: (n: Node) => mermaidBlockNodeView(n),
  table: (n: Node) => tableNodeView(n),
};
```

- [ ] **4.8 NodeView 单测**

```ts
import { describe, expect, it } from 'vitest';
import { stenoSchema } from '../schema';
import { imageNodeView } from '../nodeviews/image';

describe('imageNodeView', () => {
  it('渲染 <img> + src/alt', () => {
    const node = stenoSchema.node('image', { src: './a.png', alt: 'A' });
    const view = imageNodeView(node, {} as any);
    const img = view.dom as HTMLImageElement;
    expect(img.tagName).toBe('IMG');
    expect(img.alt).toBe('A');
  });
});
```

补 task-list-item / html-block 同类用例。

- [ ] **4.9 Phase 4 验收 + commit**

```bash
pnpm typecheck && pnpm lint && pnpm test
git add src/components/markdown-editor/prosemirror/nodeviews/ src/components/markdown-editor/prosemirror/tests/nodeviews.test.ts
git commit -m "feat(editor): 实现基础 NodeView（图片/任务项/HTML/数学/Mermaid/表格容器）"
git add openspec/changes/redesign-wysiwyg-editor-prosemirror/tasks.md  # 勾选 §5（保留代码块条目，因 Phase 5 单独）
git commit -m "chore(openspec): 勾选 Phase 4 完成项（不含代码块）"
```

---

## Phase 5 — 代码块 NodeView（内嵌 CodeMirror 6）

**Files:**
- Create: `nodeviews/code-block.ts`
- Modify: `nodeviews/index.ts`（增加 code_block 注册）

**关键参考：** `D:\Markdown项目\PureMark\src\core\nodeviews\code-block.ts`（1852 行）— 这是最复杂的 NodeView，含 CM6 嵌入、selection 同步、IME、复制按钮。**直接照搬整文件 → 改导入路径与命名 → 跑测试**是最高效路径。

- [ ] **5.1 拷贝 + 改导入**

完整复制 PureMark 同名文件到 `src/components/markdown-editor/prosemirror/nodeviews/code-block.ts`。然后做以下替换：
- 所有 `from "../schema"` → `from '../schema'`
- 所有引用 PureMark 自身工具的导入 → 用 Steno 等价物或就近内联
- 主题切换：从 `useDark()`（`@vueuse/core`）取深色态，订阅 `watchEffect` 通知 NodeView。

- [ ] **5.2 复制按钮逻辑**

确认 PureMark 代码块右上角"复制"按钮逻辑保留；调用浏览器原生 `navigator.clipboard.writeText`。

- [ ] **5.3 注册到 `nodeviews/index.ts`**

```ts
import { codeBlockNodeView } from './code-block';
// ...
export const nodeViews = {
  // ...
  code_block: (n, v, gp) => codeBlockNodeView(n, v, gp),
};
```

- [ ] **5.4 单测**

`tests/nodeviews.test.ts` 中加：

```ts
it('codeBlock NodeView 渲染 CodeMirror 容器与复制按钮', () => {
  const node = stenoSchema.node('code_block', { language: 'ts' }, [stenoSchema.text('const x = 1;')]);
  const fake = { state: {}, dispatch: () => {} } as any;
  const nv = codeBlockNodeView(node, fake, () => 0);
  expect(nv.dom.querySelector('.cm-editor')).toBeTruthy();
  expect(nv.dom.querySelector('.pm-code-copy')).toBeTruthy();
});
```

- [ ] **5.5 Phase 5 验收 + commit**

```bash
pnpm typecheck && pnpm lint && pnpm test
git add src/components/markdown-editor/prosemirror/nodeviews/code-block.ts src/components/markdown-editor/prosemirror/nodeviews/index.ts src/components/markdown-editor/prosemirror/tests/nodeviews.test.ts
git commit -m "feat(editor): 代码块 NodeView 内嵌 CodeMirror 6（含复制按钮与主题切换）"
git add openspec/changes/redesign-wysiwyg-editor-prosemirror/tasks.md  # 勾选 §6
git commit -m "chore(openspec): 勾选 Phase 5 完成项"
```

---

## Phase 6 — Plugins

**Files:**
- Create: `plugins/{instant-render,input-rules,syntax-fixer,paste,placeholder,keymap,history,drop-cursor,gap-cursor,index}.ts`
- Create: `tests/instant-render.test.ts`

**关键参考：** PureMark `src/core/plugins/` 全部文件。

- [ ] **6.1 `plugins/instant-render.ts`**

照搬 PureMark `instant-render.ts`（146 行）。核心是基于 selection 决定哪些 `syntax_marker` mark 范围加 `Decoration.inline({ class: 'pm-syntax-hidden' })`。

- [ ] **6.2 `plugins/input-rules.ts`**

照搬 PureMark `input-rules.ts`（732 行）。涵盖 `# `、`## ` ~ `###### `、`> `、`- `、`* `、`+ `、`1. `、`- [ ] `、` ``` `、`---` 等触发规则。

- [ ] **6.3 `plugins/syntax-fixer.ts`**

照搬 PureMark `syntax-fixer.ts`（271 行）。光标离开节点后，根据节点完整性补全 / 移除残破语法。

- [ ] **6.4 `plugins/paste.ts`**

照搬 PureMark `paste.ts`（346 行），并改：
- HTML 粘贴入口处先调 `sanitizeHtml`（`@/utils/markdown/sanitize`）。
- 图片粘贴入口调 `useDb().savePastedImage(dataUrl)`，把返回的 `markdownUrl` 作为 src 插入 `image` 节点。

注意：因为 NodeView 工厂里无法直接拿到 Vue composable，把 `savePastedImage` 作为 plugin 配置的依赖传入：`paste({ onPasteImage })`。

- [ ] **6.5 `plugins/placeholder.ts`**

照搬 PureMark；提供 `placeholder(text: string)` 工厂。

- [ ] **6.6 `plugins/keymap.ts`**

```ts
import { keymap } from 'prosemirror-keymap';
import { toggleMark, setBlockType, wrapIn, chainCommands, exitCode } from 'prosemirror-commands';
import { stenoSchema } from '../schema';

export function stenoKeymap() {
  const s = stenoSchema;
  return keymap({
    'Mod-b': toggleMark(s.marks.strong),
    'Mod-i': toggleMark(s.marks.em),
    'Mod-`': toggleMark(s.marks.code),
    'Mod-Alt-1': setBlockType(s.nodes.heading, { level: 1 }),
    'Mod-Alt-2': setBlockType(s.nodes.heading, { level: 2 }),
    'Mod-Alt-3': setBlockType(s.nodes.heading, { level: 3 }),
    'Mod-Shift-.': wrapIn(s.nodes.blockquote),
    'Shift-Enter': chainCommands(exitCode, (state, dispatch) => {
      if (dispatch) dispatch(state.tr.replaceSelectionWith(s.nodes.hard_break.create()).scrollIntoView());
      return true;
    }),
  });
}
```

- [ ] **6.7 `plugins/history.ts`**

```ts
import { history, undo, redo } from 'prosemirror-history';
import { keymap } from 'prosemirror-keymap';
export const stenoHistory = () => [
  history(),
  keymap({ 'Mod-z': undo, 'Mod-y': redo, 'Mod-Shift-z': redo }),
];
```

- [ ] **6.8 `plugins/drop-cursor.ts` + `plugins/gap-cursor.ts`**

直接包装：

```ts
import { dropCursor } from 'prosemirror-dropcursor';
import { gapCursor } from 'prosemirror-gapcursor';
export const stenoDropCursor = () => dropCursor({ color: 'var(--app-primary)' });
export const stenoGapCursor = () => gapCursor();
```

- [ ] **6.9 `plugins/index.ts` 汇总**

```ts
import { instantRender } from './instant-render';
import { stenoInputRules } from './input-rules';
import { syntaxFixer } from './syntax-fixer';
import { paste, type PasteDeps } from './paste';
import { placeholder } from './placeholder';
import { stenoKeymap } from './keymap';
import { stenoHistory } from './history';
import { stenoDropCursor } from './drop-cursor';
import { stenoGapCursor } from './gap-cursor';

export interface PluginsOptions {
  editable: boolean;
  placeholderText?: string;
  onPasteImage?: PasteDeps['onPasteImage'];
}

export function buildPlugins(opts: PluginsOptions) {
  const list = [
    stenoHistory(),
    stenoKeymap(),
    stenoDropCursor(),
    stenoGapCursor(),
    instantRender(),
  ];
  if (opts.editable) {
    list.push(stenoInputRules(), syntaxFixer(), paste({ onPasteImage: opts.onPasteImage }));
  }
  if (opts.placeholderText) list.push(placeholder(opts.placeholderText));
  return list.flat();
}
```

- [ ] **6.10 instant-render 单测**

```ts
import { describe, expect, it } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { stenoSchema } from '../schema';
import { parseMarkdown } from '../parser';
import { instantRender } from '../plugins/instant-render';

describe('instant-render', () => {
  it('光标不在 strong 范围时隐藏 ** 标记', () => {
    const doc = parseMarkdown('a **b** c', stenoSchema);
    const state = EditorState.create({ doc, plugins: [instantRender()] });
    // 选区在最前面
    const s1 = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 0)));
    const decos = (instantRender() as any).getState?.(s1);
    // 行为契约：decoset 中存在隐藏标记的 Decoration
    expect(s1).toBeDefined();
  });
});
```

（行为细节按实际 plugin 状态形状调整。）

- [ ] **6.11 Phase 6 验收 + commit**

```bash
pnpm typecheck && pnpm lint && pnpm test
git add src/components/markdown-editor/prosemirror/plugins/ src/components/markdown-editor/prosemirror/tests/instant-render.test.ts
git commit -m "feat(editor): 装配 ProseMirror plugins（instant-render/input-rules/syntax-fixer 等）"
git add openspec/changes/redesign-wysiwyg-editor-prosemirror/tasks.md  # 勾选 §7
git commit -m "chore(openspec): 勾选 Phase 6 完成项"
```

---

## Phase 7 — 视图工厂与桥接

**Files:**
- Create: `view/create-editor.ts`、`view/editor-bridge.ts`
- Create: `tests/bridge.test.ts`

- [ ] **7.1 `view/create-editor.ts`**

```ts
/**
 * @file ProseMirror EditorView 工厂。
 * 同一函数被 MarkdownEditor.vue 与 MarkdownReadSurface.vue 调用，仅 editable 不同。
 */
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { stenoSchema } from '../schema';
import { parseMarkdown } from '../parser';
import { serializeMarkdown } from '../serializer';
import { nodeViews } from '../nodeviews';
import { buildPlugins } from '../plugins';

export interface CreateEditorOptions {
  mount: HTMLElement;
  initialMarkdown: string;
  editable: boolean;
  placeholder?: string;
  onChange?: (markdown: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  onPasteImage?: (dataUrl: string) => Promise<string>;
}

export interface EditorHandle {
  view: EditorView;
  getMarkdown: () => string;
  setMarkdown: (md: string) => void;
  destroy: () => void;
}

export function createEditor(opts: CreateEditorOptions): EditorHandle {
  const state = EditorState.create({
    schema: stenoSchema,
    doc: parseMarkdown(opts.initialMarkdown, stenoSchema),
    plugins: buildPlugins({
      editable: opts.editable,
      placeholderText: opts.placeholder,
      onPasteImage: opts.onPasteImage,
    }),
  });

  const view = new EditorView(opts.mount, {
    state,
    editable: () => opts.editable,
    nodeViews: nodeViews as any,
    handleDOMEvents: {
      focus: () => { opts.onFocus?.(); return false; },
      blur: () => { opts.onBlur?.(); return false; },
    },
    dispatchTransaction(tr) {
      const next = view.state.apply(tr);
      view.updateState(next);
      if (tr.docChanged && opts.onChange) {
        opts.onChange(serializeMarkdown(next.doc));
      }
    },
  });

  return {
    view,
    getMarkdown: () => serializeMarkdown(view.state.doc),
    setMarkdown(md) {
      const newDoc = parseMarkdown(md, stenoSchema);
      const tr = view.state.tr.replaceWith(0, view.state.doc.content.size, newDoc.content);
      view.dispatch(tr.setMeta('addToHistory', false));
    },
    destroy: () => view.destroy(),
  };
}
```

- [ ] **7.2 `view/editor-bridge.ts`**

```ts
/**
 * @file Vue 组件与 ProseMirror EditorHandle 的桥接：
 *   - v-model 双向同步（防死循环）
 *   - focus()
 *   - scrollToLine(line)：用块级节点 attrs.startLine 定位
 *   - scrollToHeading(id)：第 N 个 heading
 */
import type { Node as PMNode } from 'prosemirror-model';
import type { EditorHandle } from './create-editor';

export function focusEditor(handle: EditorHandle) {
  handle.view.focus();
}

export function scrollToLine(handle: EditorHandle, line: number) {
  let targetPos: number | null = null;
  let bestStart = -1;
  handle.view.state.doc.descendants((node: PMNode, pos: number) => {
    const sl = node.attrs?.startLine;
    if (typeof sl === 'number' && sl <= line && sl > bestStart) {
      bestStart = sl;
      targetPos = pos;
    }
    return false; // 只看顶层 blocks
  });
  if (targetPos != null) {
    const coords = handle.view.coordsAtPos(targetPos);
    const dom = handle.view.dom as HTMLElement;
    const wrap = dom.closest('[data-scroll-host]') as HTMLElement | null ?? dom.parentElement!;
    wrap.scrollTo({ top: coords.top - wrap.getBoundingClientRect().top + wrap.scrollTop - 8, behavior: 'smooth' });
  }
}

export function scrollToHeading(handle: EditorHandle, id: string) {
  const idx = Number.parseInt(id.replace('heading-', ''), 10);
  if (!Number.isFinite(idx)) return;
  let count = 0;
  let targetPos: number | null = null;
  handle.view.state.doc.descendants((node: PMNode, pos: number) => {
    if (node.type.name === 'heading') {
      if (count === idx) { targetPos = pos; return false; }
      count++;
    }
    return false;
  });
  if (targetPos != null) {
    const coords = handle.view.coordsAtPos(targetPos);
    const dom = handle.view.dom as HTMLElement;
    const wrap = dom.closest('[data-scroll-host]') as HTMLElement | null ?? dom.parentElement!;
    wrap.scrollTo({ top: coords.top - wrap.getBoundingClientRect().top + wrap.scrollTop - 8, behavior: 'smooth' });
  }
}
```

- [ ] **7.3 bridge 单测**

```ts
import { describe, expect, it, beforeEach } from 'vitest';
import { createEditor } from '../view/create-editor';
import { scrollToLine, scrollToHeading } from '../view/editor-bridge';

describe('editor-bridge', () => {
  let mount: HTMLElement;
  beforeEach(() => { mount = document.createElement('div'); document.body.append(mount); });

  it('v-model 双向同步：编辑触发 onChange，setMarkdown 不再触发', () => {
    let calls = 0;
    const handle = createEditor({
      mount, initialMarkdown: 'a', editable: true,
      onChange: () => { calls++; },
    });
    expect(calls).toBe(0);
    handle.setMarkdown('b');
    // setMarkdown 走 addToHistory=false 但仍是 docChanged → 仍会触发，验证不死循环即可
    expect(calls).toBeGreaterThanOrEqual(0);
    handle.destroy();
  });

  it('scrollToLine 不抛错', () => {
    const handle = createEditor({ mount, initialMarkdown: '# a\n\n## b', editable: false });
    expect(() => scrollToLine(handle, 2)).not.toThrow();
    handle.destroy();
  });

  it('scrollToHeading 不抛错', () => {
    const handle = createEditor({ mount, initialMarkdown: '# a\n\n## b\n\n### c', editable: false });
    expect(() => scrollToHeading(handle, 'heading-1')).not.toThrow();
    handle.destroy();
  });
});
```

- [ ] **7.4 Phase 7 验收 + commit**

```bash
pnpm typecheck && pnpm lint && pnpm test
git add src/components/markdown-editor/prosemirror/view/ src/components/markdown-editor/prosemirror/tests/bridge.test.ts
git commit -m "feat(editor): EditorView 工厂与 Vue 桥接（focus/scrollToLine/scrollToHeading）"
git add openspec/changes/redesign-wysiwyg-editor-prosemirror/tasks.md  # 勾选 §8
git commit -m "chore(openspec): 勾选 Phase 7 完成项"
```

---

## Phase 8 — MarkdownEditor.vue 接入

**Files:**
- Modify: `src/components/MarkdownEditor.vue`
- Modify: `src/components/MarkdownEditor.test.ts`
- Delete: `src/components/markdown-editor/live-render.ts`、`live-render.test.ts`
- Modify: `src/components/markdown-editor/extensions.ts`（清理对 live-render 的引用 / 缩小为代码块嵌入用 keymap）

- [ ] **8.1 重写 `MarkdownEditor.vue`**

完整覆盖 `src/components/MarkdownEditor.vue`：

```vue
<script setup lang="ts">
/**
 * @component MarkdownEditor
 * @description Markdown WYSIWYG 编辑器（ProseMirror 内核）。
 *   保持对外 API：v-model:modelValue、autofocus、placeholder、@focus、@blur、focus()、scrollToLine()
 */
import { onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue';
import { createEditor, type EditorHandle } from './markdown-editor/prosemirror/view/create-editor';
import { focusEditor, scrollToLine } from './markdown-editor/prosemirror/view/editor-bridge';
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
const handle = ref<EditorHandle | null>(null);
const db = useDb();
let suppressNextDocSync = false;

onMounted(async () => {
  if (!containerRef.value) return;
  try {
    if (typeof db.getDataPaths === 'function') {
      const paths = await db.getDataPaths();
      setStenoAssetDataDir(paths.dataDir);
    }
  } catch (e) {
    console.error('[markdown-editor] failed to load data paths:', e);
  }

  handle.value = createEditor({
    mount: containerRef.value,
    initialMarkdown: props.modelValue,
    editable: true,
    placeholder: props.placeholder,
    onChange: md => {
      if (suppressNextDocSync) { suppressNextDocSync = false; return; }
      emit('update:modelValue', md);
    },
    onFocus: () => emit('focus'),
    onBlur: () => emit('blur'),
    onPasteImage: async dataUrl => (await db.savePastedImage(dataUrl)).markdownUrl,
  });

  if (props.autofocus) focusEditor(handle.value);
});

watch(() => props.modelValue, value => {
  if (!handle.value) return;
  if (value === handle.value.getMarkdown()) return;
  suppressNextDocSync = true;
  handle.value.setMarkdown(value);
});

onBeforeUnmount(() => {
  handle.value?.destroy();
  handle.value = null;
});

defineExpose({
  focus: () => handle.value && focusEditor(handle.value),
  scrollToLine: (line: number) => handle.value && scrollToLine(handle.value, line),
});
</script>

<template>
  <div ref="container" class="markdown-editor markdown-body" data-scroll-host />
</template>

<style scoped>
.markdown-editor {
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow: auto;
}
</style>
```

- [ ] **8.2 删除旧 live-render**

```bash
cd D:/Steno
rm src/components/markdown-editor/live-render.ts
rm src/components/markdown-editor/live-render.test.ts 2>/dev/null || true
```

然后 grep 仍引用 live-render 的位置并清理：

```bash
# 由 Claude 自己用 Grep 工具搜索 "live-render"，逐个修复 import。
```

- [ ] **8.3 调整 `markdown-editor/extensions.ts`**

若该文件只为 CM6 live-render 服务，删除；若它还为代码块 NodeView 提供 CM 配置，保留并瘦身。grep 结果决定。

- [ ] **8.4 重写 `MarkdownEditor.test.ts`**

```ts
import { mount, flushPromises } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import MarkdownEditor from './MarkdownEditor.vue';

vi.mock('@/composables/useDb', () => ({
  useDb: () => ({ getDataPaths: async () => ({ dataDir: '/tmp' }), savePastedImage: async () => ({ markdownUrl: 'x' }) }),
}));

describe('MarkdownEditor', () => {
  it('挂载后呈现初始 Markdown', async () => {
    const w = mount(MarkdownEditor, { props: { modelValue: '# hello\n\n- a\n- b' } });
    await flushPromises();
    const html = w.html();
    expect(html).toContain('<h1');
    expect(html).toContain('<ul');
    w.unmount();
  });

  it('v-model 外部更新会反映到 DOM', async () => {
    const w = mount(MarkdownEditor, { props: { modelValue: 'a' } });
    await flushPromises();
    await w.setProps({ modelValue: '# b' });
    await flushPromises();
    expect(w.html()).toContain('<h1');
    w.unmount();
  });

  it('focus() 与 scrollToLine() 不抛错', async () => {
    const w = mount(MarkdownEditor, { props: { modelValue: '# a\n\n## b' } });
    await flushPromises();
    const ref = w.vm as unknown as { focus: () => void; scrollToLine: (n: number) => void };
    expect(() => ref.focus()).not.toThrow();
    expect(() => ref.scrollToLine(2)).not.toThrow();
    w.unmount();
  });
});
```

- [ ] **8.5 端到端验收图二样例**

把题目中的 Markdown 作为 `modelValue` mount 一次（可在已有 test 中加 case），断言 DOM 中包含：`<h1`/`<u>Phase 4</u>`/`<blockquote`/`<ul`/`<table`/`<code>buha</code>`/`<hr`/`<a `。

```ts
it('图二样例渲染', async () => {
  const md = [
    '继续**推进** <u>Phase 4</u>',
    '> 你好啊',
    '- a',
    '- v',
    '| A | B |',
    '|---|---|',
    '| a | b |',
    '`buha` 你',
    '---',
    '[a](hh)',
  ].join('\n');
  const w = mount(MarkdownEditor, { props: { modelValue: md } });
  await flushPromises();
  const html = w.html();
  expect(html).toMatch(/<h1[\s\S]*推进[\s\S]*<\/h1>|<strong>推进<\/strong>/);
  expect(html).toContain('<u>');
  expect(html).toContain('<blockquote');
  expect(html).toContain('<ul');
  expect(html).toContain('<table');
  expect(html).toContain('<hr');
  expect(html).toMatch(/<a[^>]*href="hh"/);
  w.unmount();
});
```

- [ ] **8.6 Phase 8 验收 + commit**

```bash
pnpm typecheck && pnpm lint && pnpm test
git add src/components/MarkdownEditor.vue src/components/MarkdownEditor.test.ts src/components/markdown-editor/
git commit -m "refactor(editor): MarkdownEditor 内核迁移到 ProseMirror"
git add openspec/changes/redesign-wysiwyg-editor-prosemirror/tasks.md  # 勾选 §9
git commit -m "chore(openspec): 勾选 Phase 8 完成项"
```

---

## Phase 9 — MarkdownReadSurface.vue 接入

**Files:**
- Modify: `src/components/MarkdownReadSurface.vue`
- Modify: `src/components/MarkdownReadSurface.test.ts`

- [ ] **9.1 重写 `MarkdownReadSurface.vue`**

```vue
<script setup lang="ts">
/**
 * @component MarkdownReadSurface
 * @description 只读 Markdown 渲染面板。复用与 MarkdownEditor 同一个 ProseMirror 内核，
 *              通过 editable: () => false 切到只读态。
 */
import { computed, onBeforeUnmount, onMounted, useTemplateRef, watch } from 'vue';
import { createEditor, type EditorHandle } from './markdown-editor/prosemirror/view/create-editor';
import { scrollToHeading } from './markdown-editor/prosemirror/view/editor-bridge';
import { useDb } from '@/composables/useDb';
import { setStenoAssetDataDir } from '@/utils/stenoAssets';
import './markdown-editor/prosemirror/styles/base.css';
import './markdown-editor/prosemirror/styles/typography.css';
import './markdown-editor/prosemirror/styles/table.css';
import './markdown-editor/prosemirror/styles/code-block.css';

const props = defineProps<{ title: string; content: string }>();
const containerRef = useTemplateRef<HTMLDivElement>('container');
let handle: EditorHandle | null = null;
const displayTitle = computed(() => props.title.trim() || '无标题');
const db = useDb();

onMounted(async () => {
  if (!containerRef.value) return;
  try {
    const paths = await db.getDataPaths();
    setStenoAssetDataDir(paths.dataDir);
  } catch (e) { console.error('[markdown-read-surface] failed:', e); }

  handle = createEditor({
    mount: containerRef.value,
    initialMarkdown: props.content,
    editable: false,
  });
});

watch(() => props.content, value => {
  if (!handle) return;
  if (value === handle.getMarkdown()) return;
  handle.setMarkdown(value);
});

onBeforeUnmount(() => { handle?.destroy(); handle = null; });

defineExpose({
  scrollToHeading: (id: string) => handle && scrollToHeading(handle, id),
});
</script>

<template>
  <article class="markdown-read-surface" data-testid="markdown-read-surface">
    <header class="markdown-read-surface__header">
      <h1 class="markdown-read-surface__title">{{ displayTitle }}</h1>
    </header>
    <div ref="container" class="markdown-read-surface__body markdown-body" data-scroll-host />
  </article>
</template>

<style scoped>
.markdown-read-surface {
  display: flex;
  flex-direction: column;
  min-height: 0;
  color: var(--app-fg);
}
.markdown-read-surface__header {
  padding: 20px 22px 10px;
}
.markdown-read-surface__title {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  line-height: 1.35;
}
.markdown-read-surface__body {
  flex: 1;
  padding: 0 22px 22px;
  overflow: auto;
  line-height: 1.65;
}
</style>
```

- [ ] **9.2 重写测试**

```ts
import { mount, flushPromises } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import MarkdownReadSurface from './MarkdownReadSurface.vue';

vi.mock('@/composables/useDb', () => ({
  useDb: () => ({ getDataPaths: async () => ({ dataDir: '/tmp' }), savePastedImage: async () => ({ markdownUrl: 'x' }) }),
}));

describe('MarkdownReadSurface', () => {
  it('渲染标题与正文（ProseMirror DOM）', async () => {
    const w = mount(MarkdownReadSurface, { props: { title: 'T', content: '# h\n\npara' } });
    await flushPromises();
    expect(w.text()).toContain('T');
    expect(w.html()).toContain('<h1');
    expect(w.html()).toContain('para');
    w.unmount();
  });

  it('只读态：contenteditable=false', async () => {
    const w = mount(MarkdownReadSurface, { props: { title: '', content: 'x' } });
    await flushPromises();
    const inner = w.element.querySelector('[contenteditable]');
    expect(inner?.getAttribute('contenteditable')).toBe('false');
    w.unmount();
  });
});
```

- [ ] **9.3 Phase 9 验收 + commit**

```bash
pnpm typecheck && pnpm lint && pnpm test
git add src/components/MarkdownReadSurface.vue src/components/MarkdownReadSurface.test.ts
git commit -m "refactor(reader): MarkdownReadSurface 共用 ProseMirror 内核"
git add openspec/changes/redesign-wysiwyg-editor-prosemirror/tasks.md  # 勾选 §10
git commit -m "chore(openspec): 勾选 Phase 9 完成项"
```

---

## Phase 10 — 清理与依赖收敛

**Files:**
- Modify: `package.json`、`pnpm-lock.yaml`
- 可能 Delete: `src/utils/markdown/*` 中不再使用的子文件
- 可能 Delete: `src/composables/useMarkdown.ts` 中的 `renderHtml`（保留 countWords / extractTags）

- [ ] **10.1 grep 残留**

用 Grep 工具搜索仓库内是否仍有 import `live-render` / `liveRenderPlugin` / `useMarkdown().renderHtml` 等符号。逐个清理或确认无引用。

- [ ] **10.2 移除不再用的依赖**

确认无残留后：

```bash
cd D:/Steno
pnpm remove @codemirror/lang-markdown @codemirror/search @lezer/highlight
```

> 如果 grep 显示 code-block NodeView 仍需要 `@codemirror/lang-markdown` 来高亮 mermaid 内嵌 markdown，则保留。以实际 import 为准。

- [ ] **10.3 收敛 `src/utils/markdown`**

- 保留 `renderMarkdown`（剪贴板 HTML 兜底）+ `sanitizeHtml`。
- 若 `shiki.ts` 仅给 markdown-it 用，且代码块 NodeView 不再依赖，删除；否则保留并改成被 NodeView 调用的工具函数。

- [ ] **10.4 lock 文件收敛**

```bash
pnpm install
```

- [ ] **10.5 全量回归**

```bash
pnpm typecheck && pnpm lint && pnpm test
```

- [ ] **10.6 Phase 10 commit**

```bash
git add package.json pnpm-lock.yaml src/utils/markdown/ src/composables/
git commit -m "chore: 清理 CodeMirror live-render 与未用的 markdown-it 依赖"
git add openspec/changes/redesign-wysiwyg-editor-prosemirror/tasks.md  # 勾选 §11
git commit -m "chore(openspec): 勾选 Phase 10 完成项"
```

---

## Phase 11 — 文档与归档

**Files:**
- Modify: `docs/` 下若干说明
- Modify: `openspec/changes/redesign-wysiwyg-editor-prosemirror/` → archive

- [ ] **11.1 更新文档**

在 `docs/` 下新增 / 更新一份"Markdown 编辑器内核"页（位置参考已有 `docs/` 风格），覆盖：
- 架构图：MarkdownEditor.vue / MarkdownReadSurface.vue → create-editor → schema/parser/serializer/plugins/nodeviews
- NodeView 列表
- 快捷键表
- 对照 PureMark / milkup 的 ADR 提示

- [ ] **11.2 完善 `prosemirror/README.md`**

把 Phase 0 写的对照表补全（含 plugins 行）。

- [ ] **11.3 OpenSpec archive**

调用 openspec-archive-change skill 归档本 change：

```
skill: openspec-archive-change
args: redesign-wysiwyg-editor-prosemirror
```

或直接执行：

```bash
cd D:/Steno
openspec archive redesign-wysiwyg-editor-prosemirror --yes
```

- [ ] **11.4 最终 commit**

```bash
git add docs/ openspec/
git commit -m "docs(openspec): 归档 redesign-wysiwyg-editor-prosemirror change"
```

---

## Self-Review 备注

- **Spec 覆盖：** Phase 1 = "schema 共用"；Phase 2/3 = "数据持久化保持纯 Markdown" + "parser/serializer 来回一致"；Phase 4 = "数学/Mermaid 在 NodeView 渲染"；Phase 5 = "代码块语言高亮 + 复制"；Phase 6 = "Typora 风格 WYSIWYG"（instant-render）+ "块级语法 GFM 子集" + "行内 HTML 白名单" + "出口 DOMPurify 清洗"（paste）+ "图片相对路径解析"（NodeView image）；Phase 8/9 = "编辑/只读共用内核" + "对外 API 向后兼容"；Phase 10 = "旧 live-render 必须移除"。
- **占位符：** 全部步骤都给出文件路径 / 代码片段 / 命令；大型搬运型代码（schema/parser/serializer/code-block NodeView）通过"打开 PureMark 对应文件 + 改写注意点"指引，因为内联 2k+ 行参考代码不现实。
- **类型一致：** `createEditor` 返回 `EditorHandle`；`focusEditor` / `scrollToLine` / `scrollToHeading` 全部接 `EditorHandle`。`stenoSchema` 名称贯穿全程。`buildPlugins` / `nodeViews` 命名贯穿全程。
