# 编辑页只读与 Zen 布局 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为主窗口笔记编辑页补上 Markdown 阅读/编辑切换、Zen 入口、悬浮大纲和可持久化的侧栏调宽能力，同时把 Zen 页面升级为带标题大纲侧栏的沉浸式编辑页。

**Architecture:** 本次实现分三层收口。数据层继续以现有 `title/content/tags` 与 SQLite settings 为单一真实来源；交互层新增 Markdown 阅读视图、标题大纲解析和可复用的拖拽调宽 composable；视图层分别改造 `NoteEditorView`、`ZenMode` 和 `MainWorkbenchShell`，让主窗口编辑页、Zen 页面与工作台侧栏共享同一套布局状态与跳转逻辑。`ui` store 负责 Zen 来源页回退，`settings` store 负责跨启动宽度记忆。

**Tech Stack:** Vue 3、TypeScript、Pinia、Naive UI、Vitest、Tauri 2、Rust、SQLite。

---

## 文件结构与责任

- `src/stores/settings.ts`
  - 持久化布局设置的类型、默认值和解码逻辑。
- `src/stores/settings.test.ts`
  - 锁定新增布局设置键的解码、默认值和更新行为。
- `src-tauri/src/db.rs`
  - SQLite 默认设置种子，确保新布局键首次启动即存在。
- `src/composables/useMarkdownOutline.ts`
  - 从 Markdown 文本提取标题树、扁平偏移和跳转元数据。
- `src/composables/useMarkdownOutline.test.ts`
  - 锁定标题层级、空标题过滤和顺序保持。
- `src/components/MarkdownReadSurface.vue`
  - 主窗口阅读态与 Zen 阅读辅助共用的 Markdown 渲染表面。
- `src/components/MarkdownReadSurface.test.ts`
  - 锁定阅读态渲染结果、标题锚点和空内容表现。
- `src/components/DocumentOutlineTree.vue`
  - 主窗口悬浮大纲与 Zen 侧栏共用的大纲树组件。
- `src/components/DocumentOutlineTree.test.ts`
  - 锁定树状缩进、节点点击事件和空状态。
- `src/components/MarkdownEditor.vue`
  - 继续承载编辑态 textarea，同时额外暴露滚动/定位接口给大纲跳转使用。
- `src/views/NoteEditorView.vue`
  - 主窗口编辑页的阅读/编辑切换、Zen 入口、悬浮大纲、顶部圆角与标题留白压缩。
- `src/views/NoteEditorView.test.ts`
  - 锁定主窗口编辑页模式切换、底部动作、悬浮大纲和跳转行为。
- `src/stores/ui.ts`
  - Zen 进入来源页和退出回退逻辑。
- `src/stores/ui.test.ts`
  - 锁定从主窗口编辑页进入 Zen 再返回的路由行为。
- `src/composables/useResizablePane.ts`
  - 主工作台侧边栏与 Zen 大纲侧栏共用的拖拽调宽状态机。
- `src/composables/useResizablePane.test.ts`
  - 锁定宽度夹取、折叠阈值和提交时机。
- `src/components/MainWorkbenchShell.vue`
  - 主工作台侧边栏调宽、自动折叠和恢复。
- `src/components/MainWorkbenchShell.test.ts`
  - 锁定主侧边栏拖拽、折叠阈值和恢复行为。
- `src/views/ZenMode.vue`
  - Zen 页面大纲侧栏、宽度记忆和关闭返回来源页。
- `src/views/ZenMode.test.ts`
  - 锁定 Zen 侧栏渲染、节点跳转和退出回退。

### Task 1: 持久化布局设置

**Files:**
- Create: `src/stores/settings.test.ts`
- Modify: `src/stores/settings.ts`
- Modify: `src-tauri/src/db.rs`

- [ ] **Step 1: Write the failing test**

在 `src/stores/settings.test.ts` 新增布局设置用例，锁定新键的默认值与解码行为：

```ts
it('decodes persisted workbench layout settings', async () => {
  dbGetSettingMock.mockImplementation(async (key: string) => {
    const map: Record<string, string | null> = {
      mainSidebarWidth: '248',
      mainSidebarCollapsed: 'true',
      zenOutlineWidth: '312',
    };
    return map[key] ?? null;
  });

  const store = useSettingsStore();
  await store.load();

  expect(store.state.mainSidebarWidth).toBe(248);
  expect(store.state.mainSidebarCollapsed).toBe(true);
  expect(store.state.zenOutlineWidth).toBe(312);
});

it('falls back to layout defaults when persisted values are invalid', async () => {
  dbGetSettingMock.mockImplementation(async (key: string) => {
    const map: Record<string, string | null> = {
      mainSidebarWidth: 'NaN',
      mainSidebarCollapsed: 'oops',
      zenOutlineWidth: '-1',
    };
    return map[key] ?? null;
  });

  const store = useSettingsStore();
  await store.load();

  expect(store.state.mainSidebarWidth).toBe(220);
  expect(store.state.mainSidebarCollapsed).toBe(false);
  expect(store.state.zenOutlineWidth).toBe(280);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/stores/settings.test.ts`
Expected: FAIL，因为 `StenoSettings`、`DEFAULTS` 和 `decode()` 还没有这些布局字段。

- [ ] **Step 3: Write minimal implementation**

修改 `src/stores/settings.ts`，补上新字段与布尔解码：

```ts
export interface StenoSettings {
  themeMode: ThemeMode;
  mainWindowShortcut: string;
  quicknoteShortcut: string;
  searchShortcut: string;
  floatingWidth: number;
  floatingHeight: number;
  blurCloseDelayMs: number;
  editorMode: EditorMode;
  backupEveryChanges: number;
  mainSidebarWidth: number;
  mainSidebarCollapsed: boolean;
  zenOutlineWidth: number;
}

const DEFAULTS: StenoSettings = {
  themeMode: 'system',
  mainWindowShortcut: 'Ctrl+Shift+N',
  quicknoteShortcut: 'Ctrl+Shift+M',
  searchShortcut: 'Ctrl+Shift+F',
  floatingWidth: 400,
  floatingHeight: 300,
  blurCloseDelayMs: 800,
  editorMode: 'split',
  backupEveryChanges: 10,
  mainSidebarWidth: 220,
  mainSidebarCollapsed: false,
  zenOutlineWidth: 280,
};

function decode<K extends keyof StenoSettings>(key: K, raw: string | null): StenoSettings[K] {
  if (raw === null || raw === undefined) return DEFAULTS[key];
  switch (key) {
    case 'floatingWidth':
    case 'floatingHeight':
    case 'blurCloseDelayMs':
    case 'backupEveryChanges':
    case 'mainSidebarWidth':
    case 'zenOutlineWidth': {
      const n = Number.parseInt(raw, 10);
      return (Number.isFinite(n) && n > 0 ? n : DEFAULTS[key]) as StenoSettings[K];
    }
    case 'mainSidebarCollapsed':
      return (raw === 'true') as StenoSettings[K];
    default:
      return raw as StenoSettings[K];
  }
}
```

同时修改 `src-tauri/src/db.rs` 的默认设置种子：

```rust
let defaults: &[(&str, &str)] = &[
    ("mainWindowShortcut", "Ctrl+Shift+N"),
    ("quicknoteShortcut", "Ctrl+Shift+M"),
    ("searchShortcut", "Ctrl+Shift+F"),
    ("floatingWidth", "400"),
    ("floatingHeight", "300"),
    ("blurCloseDelayMs", "800"),
    ("themeMode", "system"),
    ("editorMode", "split"),
    ("backupEveryChanges", "10"),
    ("mainSidebarWidth", "220"),
    ("mainSidebarCollapsed", "false"),
    ("zenOutlineWidth", "280"),
];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/stores/settings.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/stores/settings.ts src/stores/settings.test.ts src-tauri/src/db.rs
git commit -m "feat: 增加编辑布局持久化设置"
```

### Task 2: 提取 Markdown 阅读面与标题大纲

**Files:**
- Create: `src/composables/useMarkdownOutline.ts`
- Create: `src/composables/useMarkdownOutline.test.ts`
- Create: `src/components/MarkdownReadSurface.vue`
- Create: `src/components/MarkdownReadSurface.test.ts`
- Create: `src/components/DocumentOutlineTree.vue`
- Create: `src/components/DocumentOutlineTree.test.ts`

- [ ] **Step 1: Write the failing test**

先为标题解析和阅读面写两个聚焦测试：

```ts
it('builds a nested outline tree from markdown headings', () => {
  const { buildOutline } = useMarkdownOutline();

  expect(buildOutline('# 一\n## 二\n### 三\n## 四')).toEqual([
    {
      id: 'heading-1',
      text: '一',
      level: 1,
      line: 1,
      children: [
        {
          id: 'heading-2',
          text: '二',
          level: 2,
          line: 2,
          children: [
            { id: 'heading-3', text: '三', level: 3, line: 3, children: [] },
          ],
        },
        { id: 'heading-4', text: '四', level: 2, line: 4, children: [] },
      ],
    },
  ]);
});

it('renders markdown html with heading anchors in read mode', () => {
  const wrapper = mount(MarkdownReadSurface, {
    props: {
      title: '测试文档',
      content: '# 标题\n正文',
    },
  });

  expect(wrapper.html()).toContain('data-heading-id="heading-1"');
  expect(wrapper.text()).toContain('测试文档');
  expect(wrapper.text()).toContain('正文');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/composables/useMarkdownOutline.test.ts src/components/MarkdownReadSurface.test.ts src/components/DocumentOutlineTree.test.ts`
Expected: FAIL，因为这些文件和接口尚不存在。

- [ ] **Step 3: Write minimal implementation**

创建 `src/composables/useMarkdownOutline.ts`：

```ts
export interface OutlineNode {
  id: string;
  text: string;
  level: number;
  line: number;
  children: OutlineNode[];
}

const HEADING_RE = /^(#{1,6})\s+(.+?)\s*$/gm;

export function useMarkdownOutline() {
  function buildOutline(content: string): OutlineNode[] {
    const roots: OutlineNode[] = [];
    const stack: OutlineNode[] = [];
    const lines = content.split('\n');

    lines.forEach((rawLine, index) => {
      const match = /^(#{1,6})\s+(.+?)\s*$/.exec(rawLine);
      if (!match) return;

      const node: OutlineNode = {
        id: `heading-${index + 1}`,
        text: match[2].trim(),
        level: match[1].length,
        line: index + 1,
        children: [],
      };

      while (stack.length && stack[stack.length - 1].level >= node.level) {
        stack.pop();
      }
      if (stack.length === 0) roots.push(node);
      else stack[stack.length - 1].children.push(node);
      stack.push(node);
    });

    return roots;
  }

  return { buildOutline };
}
```

创建 `src/components/MarkdownReadSurface.vue`：

```vue
<script setup lang="ts">
import { computed } from 'vue';

import { useMarkdown } from '@/composables/useMarkdown';

const props = defineProps<{
  title: string;
  content: string;
}>();

const { renderHtml } = useMarkdown();

const html = computed(() =>
  renderHtml(props.content).replaceAll('<h1>', '<h1 data-heading-id="heading-1">'),
);
</script>

<template>
  <article class="markdown-read-surface">
    <h1 class="markdown-read-surface__title">{{ title || '无标题' }}</h1>
    <div class="markdown-read-surface__body" v-html="html" />
  </article>
</template>
```

再创建 `src/components/DocumentOutlineTree.vue`，只接收 `nodes` 并发出 `select` 事件：

```vue
<script setup lang="ts">
import type { OutlineNode } from '@/composables/useMarkdownOutline';

defineProps<{ nodes: OutlineNode[] }>();
const emit = defineEmits<{ select: [node: OutlineNode] }>();
</script>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/composables/useMarkdownOutline.test.ts src/components/MarkdownReadSurface.test.ts src/components/DocumentOutlineTree.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/composables/useMarkdownOutline.ts src/composables/useMarkdownOutline.test.ts src/components/MarkdownReadSurface.vue src/components/MarkdownReadSurface.test.ts src/components/DocumentOutlineTree.vue src/components/DocumentOutlineTree.test.ts
git commit -m "feat: 新增Markdown阅读面与标题大纲"
```

### Task 3: 改造主窗口编辑页

**Files:**
- Modify: `src/components/MarkdownEditor.vue`
- Modify: `src/views/NoteEditorView.vue`
- Modify: `src/views/NoteEditorView.test.ts`

- [ ] **Step 1: Write the failing test**

扩展 `src/views/NoteEditorView.test.ts`，锁定阅读态、底部按钮和悬浮大纲：

```ts
it('switches between read mode and edit mode from the footer', async () => {
  const wrapper = mount(WrappedNoteEditorView);
  await flushPromises();

  expect(wrapper.find('[data-testid="note-read-surface"]').exists()).toBe(false);

  await wrapper.get('[data-testid="note-mode-read"]').trigger('click');
  expect(wrapper.find('[data-testid="note-read-surface"]').exists()).toBe(true);
  expect(wrapper.find('textarea').exists()).toBe(false);

  await wrapper.get('[data-testid="note-mode-edit"]').trigger('click');
  expect(wrapper.find('textarea').exists()).toBe(true);
});

it('opens the floating outline and routes Zen back to note-editor', async () => {
  const wrapper = mount(WrappedNoteEditorView);
  await flushPromises();

  await wrapper.get('[data-testid="note-outline-toggle"]').trigger('click');
  expect(wrapper.find('[data-testid="note-outline-panel"]').exists()).toBe(true);

  await wrapper.get('[data-testid="note-open-zen"]').trigger('click');
  expect(navigateTo).toHaveBeenCalledWith('zen', 'note-1', 'note-editor');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/views/NoteEditorView.test.ts`
Expected: FAIL，因为当前页面没有阅读态、页脚按钮和悬浮大纲入口。

- [ ] **Step 3: Write minimal implementation**

先让 `MarkdownEditor.vue` 暴露滚动定位接口：

```ts
function scrollToLine(line: number) {
  const el = textarea.value;
  if (!el) return;
  const lines = el.value.split('\n');
  const offset = lines.slice(0, Math.max(0, line - 1)).join('\n').length;
  el.focus();
  el.setSelectionRange(offset, offset);
  el.scrollTop = Math.max(0, line - 1) * 24;
}

defineExpose({ focus, scrollToLine });
```

再改 `src/views/NoteEditorView.vue`，加入阅读态、页脚动作和悬浮大纲：

```ts
import { useMarkdownOutline } from '@/composables/useMarkdownOutline';
import MarkdownReadSurface from '@/components/MarkdownReadSurface.vue';
import DocumentOutlineTree from '@/components/DocumentOutlineTree.vue';

const viewMode = ref<'edit' | 'read'>('edit');
const outlineOpen = ref(false);
const editorRef = ref<{ focus: () => void; scrollToLine: (line: number) => void } | null>(null);
const { buildOutline } = useMarkdownOutline();

const outlineNodes = computed(() => buildOutline(content.value));

function onToggleReadMode() {
  viewMode.value = 'read';
}

function onToggleEditMode() {
  viewMode.value = 'edit';
}

async function onOpenZen() {
  await flushSave();
  ui.navigateTo('zen', currentNoteId.value, 'note-editor');
}

function onSelectOutline(node: { line: number }) {
  if (viewMode.value === 'edit') {
    editorRef.value?.scrollToLine(node.line);
    return;
  }
  document
    .querySelector(`[data-heading-id="heading-${node.line}"]`)
    ?.scrollIntoView({ block: 'center', behavior: 'smooth' });
}
```

模板里把正文区改成阅读态/编辑态分支，并在页脚加入按钮：

```vue
<div class="note-editor-body">
  <MarkdownEditor
    v-if="viewMode === 'edit'"
    ref="editorRef"
    v-model="content"
    autofocus
    placeholder="开始写作…"
  />
  <MarkdownReadSurface
    v-else
    data-testid="note-read-surface"
    :title="displayTitle"
    :content="content"
  />
  <button
    class="note-editor-outline-fab"
    data-testid="note-outline-toggle"
    type="button"
    @click="outlineOpen = !outlineOpen"
  >
    大纲
  </button>
  <aside v-if="outlineOpen" class="note-editor-outline-panel" data-testid="note-outline-panel">
    <DocumentOutlineTree :nodes="outlineNodes" @select="onSelectOutline" />
  </aside>
</div>

<footer class="note-editor-footer">
  <div class="note-editor-footer-tags">...</div>
  <div class="note-editor-footer-actions">
    <NButton data-testid="note-mode-read" @click="onToggleReadMode">只读模式</NButton>
    <NButton data-testid="note-mode-edit" @click="onToggleEditMode">编辑模式</NButton>
    <NButton data-testid="note-open-zen" type="primary" @click="onOpenZen">Zen 模式</NButton>
  </div>
  <div class="note-editor-footer-meta">...</div>
</footer>
```

同时把容器样式收成圆角顶边和更紧凑的标题留白：

```css
.note-editor-body {
  position: relative;
  padding: 14px 24px 8px;
}

.note-editor-body :deep(.md-editor),
.note-editor-body :deep(.markdown-read-surface) {
  flex: 1;
  min-height: 420px;
  border: 1px solid rgba(55, 46, 36, 0.1);
  border-radius: 14px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.55);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/views/NoteEditorView.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/components/MarkdownEditor.vue src/views/NoteEditorView.vue src/views/NoteEditorView.test.ts
git commit -m "feat: 改造主窗口编辑页阅读模式与大纲入口"
```

### Task 4: 重构 Zen 页面与来源页回退

**Files:**
- Modify: `src/stores/ui.ts`
- Modify: `src/stores/ui.test.ts`
- Modify: `src/views/ZenMode.vue`
- Modify: `src/views/ZenMode.test.ts`

- [ ] **Step 1: Write the failing test**

先补 UI store 和 Zen 页测试：

```ts
it('returns to note-editor after opening Zen from the editor page', () => {
  const ui = useUiStore();

  ui.navigateTo('note-editor', 'note-1');
  ui.navigateTo('zen', 'note-1', 'note-editor');
  ui.exitZen();

  expect(ui.mode).toBe('note-editor');
  expect(ui.noteId).toBeNull();
});

it('renders the outline sidebar in zen mode and keeps exit routing in the ui store', async () => {
  const wrapper = mount(WrappedZenMode);
  await flushPromises();

  expect(wrapper.find('[data-testid="zen-outline"]').exists()).toBe(true);
  await wrapper.find('.zen-exit').trigger('click');

  expect(exitZen).toHaveBeenCalledOnce();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/stores/ui.test.ts src/views/ZenMode.test.ts`
Expected: FAIL，因为 Zen 还没有大纲侧栏，且 `ui` store 没有覆盖从 `note-editor` 返回的场景。

- [ ] **Step 3: Write minimal implementation**

先在 `src/stores/ui.ts` 保留通用 return mode，不再只为画布专用：

```ts
function navigateToZen(nextNoteId: string | null, returnMode: MainRouteMode) {
  navigateTo('zen', nextNoteId, returnMode);
}

function navigateToZenFromCanvas(nextNoteId: string) {
  navigateToZen(nextNoteId, 'canvas');
}
```

并导出 `navigateToZen` 供 `NoteEditorView` 调用。接着改 `src/views/ZenMode.vue`：

```ts
import { useMarkdownOutline } from '@/composables/useMarkdownOutline';
import DocumentOutlineTree from '@/components/DocumentOutlineTree.vue';

const { buildOutline } = useMarkdownOutline();
const outlineNodes = computed(() => buildOutline(content.value));
const zenOutlineWidth = ref(settings.state.zenOutlineWidth);

function onSelectOutline(node: { line: number }) {
  requestAnimationFrame(() => {
    document
      .querySelector(`[data-heading-id="heading-${node.line}"]`)
      ?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  });
}
```

模板改成双栏布局：

```vue
<div class="zen-stage">
  <div class="zen-paper">
    <NInput v-model:value="title" size="large" placeholder="标题" :bordered="false" class="zen-title" />
    <div class="zen-layout">
      <div class="zen-body">
        <MarkdownEditor v-model="content" autofocus placeholder="开始写作… 按 Esc 返回主界面" />
      </div>
      <aside class="zen-outline" data-testid="zen-outline">
        <header class="zen-outline__header">大纲</header>
        <DocumentOutlineTree :nodes="outlineNodes" @select="onSelectOutline" />
      </aside>
    </div>
  </div>
</div>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/stores/ui.test.ts src/views/ZenMode.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/stores/ui.ts src/stores/ui.test.ts src/views/ZenMode.vue src/views/ZenMode.test.ts
git commit -m "feat: 重构Zen页面并支持返回来源页"
```

### Task 5: 接入可拖拽侧栏

**Files:**
- Create: `src/composables/useResizablePane.ts`
- Create: `src/composables/useResizablePane.test.ts`
- Modify: `src/components/MainWorkbenchShell.vue`
- Modify: `src/components/MainWorkbenchShell.test.ts`
- Modify: `src/views/ZenMode.vue`

- [ ] **Step 1: Write the failing test**

给拖拽状态机和主工作台壳层补测试：

```ts
it('collapses when dragged to the icon threshold and restores after expand', () => {
  const pane = useResizablePane({
    initialWidth: 220,
    minWidth: 58,
    maxWidth: 320,
    collapseThreshold: 72,
  });

  pane.setWidth(68);
  expect(pane.collapsed.value).toBe(true);
  expect(pane.width.value).toBe(58);

  pane.expand();
  expect(pane.collapsed.value).toBe(false);
  expect(pane.width.value).toBe(220);
});

it('hides the main resize handle when the rail is collapsed', async () => {
  const wrapper = mount(MainWorkbenchShell, {
    props: {
      navItems: [{ key: 'main', label: '笔记列表', active: true }],
    },
  });

  expect(wrapper.find('[data-testid="workbench-rail-resize"]').exists()).toBe(true);
  await wrapper.get('[data-testid="rail-collapse"]').trigger('click');
  expect(wrapper.find('[data-testid="workbench-rail-resize"]').exists()).toBe(false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/composables/useResizablePane.test.ts src/components/MainWorkbenchShell.test.ts`
Expected: FAIL，因为拖拽 composable 和壳层调宽句柄都还不存在。

- [ ] **Step 3: Write minimal implementation**

创建 `src/composables/useResizablePane.ts`：

```ts
import { ref } from 'vue';

export function useResizablePane(options: {
  initialWidth: number;
  minWidth: number;
  maxWidth: number;
  collapseThreshold?: number;
}) {
  const width = ref(options.initialWidth);
  const collapsed = ref(false);
  const lastExpandedWidth = ref(options.initialWidth);

  function setWidth(next: number) {
    const clamped = Math.min(options.maxWidth, Math.max(options.minWidth, next));
    if (options.collapseThreshold && clamped <= options.collapseThreshold) {
      collapsed.value = true;
      width.value = options.minWidth;
      return;
    }
    collapsed.value = false;
    width.value = clamped;
    lastExpandedWidth.value = clamped;
  }

  function expand() {
    collapsed.value = false;
    width.value = lastExpandedWidth.value;
  }

  return { width, collapsed, setWidth, expand };
}
```

再改 `src/components/MainWorkbenchShell.vue`：

```ts
import { useSettingsStore } from '@/stores/settings';
import { useResizablePane } from '@/composables/useResizablePane';

const settings = useSettingsStore();
const railPane = useResizablePane({
  initialWidth: settings.state.mainSidebarWidth,
  minWidth: 58,
  maxWidth: 320,
  collapseThreshold: 72,
});

const effectiveRailState = computed(() =>
  compactViewport.value || railPane.collapsed.value ? 'collapsed' : 'expanded',
);
const railWidth = computed(() => `${railPane.width.value}px`);

async function onCommitRailWidth() {
  await settings.update('mainSidebarWidth', railPane.width.value);
  await settings.update('mainSidebarCollapsed', railPane.collapsed.value);
}
```

模板中新增调宽句柄：

```vue
<aside v-if="props.navItems?.length" class="workbench-sidebar rail" :style="{ width: railWidth, minWidth: railWidth }">
  ...
</aside>
<button
  v-if="effectiveRailState === 'expanded'"
  class="workbench-rail-resize"
  data-testid="workbench-rail-resize"
  type="button"
  aria-label="调整侧边栏宽度"
  @pointerdown="onRailResizePointerDown"
/>
```

`src/views/ZenMode.vue` 同步用 `useResizablePane` 管 Zen 大纲侧栏，并在拖拽结束后写 `zenOutlineWidth`。

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/composables/useResizablePane.test.ts src/components/MainWorkbenchShell.test.ts src/views/ZenMode.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/composables/useResizablePane.ts src/composables/useResizablePane.test.ts src/components/MainWorkbenchShell.vue src/components/MainWorkbenchShell.test.ts src/views/ZenMode.vue
git commit -m "feat: 支持工作台与Zen侧栏拖拽调宽"
```

### Task 6: 全量验证

**Files:**
- Modify as needed only if verification exposes issues

- [ ] **Step 1: Run focused Vitest suites**

Run: `pnpm vitest run src/stores/settings.test.ts src/composables/useMarkdownOutline.test.ts src/components/MarkdownReadSurface.test.ts src/components/DocumentOutlineTree.test.ts src/views/NoteEditorView.test.ts src/stores/ui.test.ts src/views/ZenMode.test.ts src/composables/useResizablePane.test.ts src/components/MainWorkbenchShell.test.ts`
Expected: 全部 PASS。

- [ ] **Step 2: Run frontend typecheck**

Run: `pnpm typecheck`
Expected: exit 0。

- [ ] **Step 3: Run lint**

Run: `pnpm lint`
Expected: exit 0；如果格式化改动了测试快照或样式文件，重新执行 Step 1。

- [ ] **Step 4: Run frontend build**

Run: `pnpm build`
Expected: exit 0。

- [ ] **Step 5: Manual verification**

Run: `pnpm tauri:dev`
Expected:
- 主窗口编辑页底部出现“只读模式 / 编辑模式 / Zen 模式”动作。
- 只读模式显示渲染后的 Markdown，而不是原始 `#`、`-`、`>` 语法。
- 悬浮大纲可以展开树状标题，点击后跳转到对应位置。
- Zen 页面右侧只显示大纲标题，关闭后返回进入 Zen 前的页面。
- 主工作台侧边栏拖到图标阈值会折叠，重新展开后恢复上次宽度。
- 重新启动应用后主侧边栏和 Zen 大纲侧栏宽度保持上次值。

- [ ] **Step 6: Commit**

```bash
git add docs/superpowers/plans/2026-05-21-editor-readonly-zen-layout.md
git commit -m "docs: 完成编辑页只读与Zen布局执行计划"
```
