# 主窗口工作台重构实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把主窗口重构为带自定义标题栏和侧边导航的统一工作台，并在主窗口内补上笔记编辑页、画布接入和未实现模块占位页，同时保留速记浮窗的独立工作流。

**Architecture:** 前端以“工作台壳层 + 内容页”重组主窗口：`App.vue` 继续根据窗口模式决定是否进入主窗口，但主窗口内部的页面切换收敛到 `ui` store 的工作台路由。壳层组件负责标题栏拖拽、窗口控制、侧边导航、标题区和页面操作区；笔记列表、主窗口编辑页、画布、搜索、设置、占位页只渲染业务内容。Tauri 端保持主窗口单实例，窗口控制优先复用 `@tauri-apps/api/window`，仅在 capability 不足时补最小权限。

**Tech Stack:** Vue 3、TypeScript、Pinia、Naive UI、Vitest、Tauri 2、Rust。

---

### Task 1: 扩展主窗口路由模型

**Files:**
- Modify: `src/types/steno.ts`
- Modify: `src/stores/ui.ts`
- Modify: `src/stores/ui.test.ts`

- [ ] **Step 1: Write the failing test**

在 `src/stores/ui.test.ts` 新增工作台路由测试，覆盖以下行为：

```ts
it('opens the note editor in the main window and keeps the note id', () => {
  const ui = useUiStore();

  ui.navigateTo('note-editor', 'note-1');

  expect(ui.mode).toBe('note-editor');
  expect(ui.noteId).toBe('note-1');
});

it('opens a blank note editor from the main window', () => {
  const ui = useUiStore();

  ui.navigateTo('note-editor');

  expect(ui.mode).toBe('note-editor');
  expect(ui.noteId).toBeNull();
});

it('navigates to placeholder pages in the main window', () => {
  const ui = useUiStore();

  ui.navigateTo('clipboard');

  expect(ui.mode).toBe('clipboard');
  expect(ui.noteId).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/stores/ui.test.ts`
Expected: FAIL，因为 `WindowMode` 和 `MainRouteMode` 里还没有 `note-editor` / `clipboard` 等工作台模式。

- [ ] **Step 3: Write minimal implementation**

修改 `src/types/steno.ts`，把主窗口新增模式加入 `WindowMode`：

```ts
export type WindowMode =
  | 'main'
  | 'floating'
  | 'sticky'
  | 'canvas'
  | 'zen'
  | 'search'
  | 'settings'
  | 'note-editor'
  | 'clipboard'
  | 'todo'
  | 'screenshot'
  | 'ocr'
  | 'translate';
```

修改 `src/stores/ui.ts`：

```ts
type MainRouteMode = Extract<
  WindowMode,
  'main' | 'canvas' | 'zen' | 'search' | 'settings' |
  'note-editor' | 'clipboard' | 'todo' | 'screenshot' | 'ocr' | 'translate'
>;
```

并把 `navigateTo()` 的 `noteId` 规则调整为：

```ts
noteId.value =
  nextMode === 'zen' || nextMode === 'note-editor'
    ? nextNoteId
    : null;
```

同时扩展 `parseFromHash()` / `parseFromLabel()` 的合法模式集合，只让主窗口消费这些新增工作台模式。

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/stores/ui.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/types/steno.ts src/stores/ui.ts src/stores/ui.test.ts
git commit -m "feat: 扩展主窗口工作台路由"
```

### Task 2: 补齐窗口控制封装

**Files:**
- Modify: `src/composables/useWindow.ts`
- Modify: `src-tauri/capabilities/default.json`
- Test: `src/stores/ui.test.ts`

- [ ] **Step 1: Write the failing test**

在 `src/stores/ui.test.ts` 或新增 `src/composables/useWindow.test.ts`，用 mock 验证主窗口控制 API 会调用 Tauri window 方法：

```ts
it('exposes main-window controls for custom title bars', async () => {
  const win = useWindow();

  await win.minimizeCurrent();
  await win.toggleMaximizeCurrent();

  expect(minimize).toHaveBeenCalledOnce();
  expect(toggleMaximize).toHaveBeenCalledOnce();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/stores/ui.test.ts`
Expected: FAIL，因为 `useWindow()` 还没有这些方法。

- [ ] **Step 3: Write minimal implementation**

修改 `src/composables/useWindow.ts`，增加：

```ts
function minimizeCurrent() {
  return getCurrentWindow().minimize();
}

function toggleMaximizeCurrent() {
  return getCurrentWindow().toggleMaximize();
}

function maximizeCurrent() {
  return getCurrentWindow().maximize();
}

function unmaximizeCurrent() {
  return getCurrentWindow().unmaximize();
}
```

并导出这些方法。更新 `src-tauri/capabilities/default.json`，为 `main` 窗口补充：

```json
"core:window:allow-minimize",
"core:window:allow-maximize",
"core:window:allow-toggle-maximize",
"core:window:allow-unmaximize"
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/stores/ui.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/composables/useWindow.ts src-tauri/capabilities/default.json src/stores/ui.test.ts
git commit -m "feat: 补充主窗口标题栏控制能力"
```

### Task 3: 建立主窗口工作台壳层

**Files:**
- Create: `src/components/MainWorkbenchShell.vue`
- Create: `src/components/MainWorkbenchShell.test.ts`
- Modify: `src/App.vue`

- [ ] **Step 1: Write the failing test**

新增 `src/components/MainWorkbenchShell.test.ts`，验证壳层能渲染导航、标题和插槽内容：

```ts
it('renders the workbench frame and slot content', () => {
  const wrapper = mount(MainWorkbenchShell, {
    props: {
      title: '笔记列表',
      description: '24 篇 · 本地存储',
      navItems: [{ key: 'main', label: '笔记列表', active: true }],
    },
    slots: {
      default: '<div class="page-body">body</div>',
    },
  });

  expect(wrapper.text()).toContain('笔记列表');
  expect(wrapper.find('.page-body').exists()).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/components/MainWorkbenchShell.test.ts`
Expected: FAIL，因为组件尚不存在。

- [ ] **Step 3: Write minimal implementation**

创建 `src/components/MainWorkbenchShell.vue`，最小结构包括：

```vue
<template>
  <div class="workbench-root">
    <header class="workbench-titlebar" @pointerdown="onDragBarPointerDown">
      <div class="workbench-brand">Steno</div>
      <div class="workbench-search"><slot name="search" /></div>
      <div class="workbench-window-controls">
        <button class="win-btn" @click.stop="onMinimize">_</button>
        <button class="win-btn" @click.stop="onToggleMaximize">[]</button>
        <button class="win-btn" @click.stop="onClose">x</button>
      </div>
    </header>
    <aside class="workbench-sidebar"><slot name="sidebar" /></aside>
    <main class="workbench-main">
      <header class="workbench-page-header">
        <h1>{{ title }}</h1>
        <p>{{ description }}</p>
        <div class="workbench-actions"><slot name="actions" /></div>
      </header>
      <section class="workbench-content"><slot /></section>
    </main>
  </div>
</template>
```

`App.vue` 中先不落完整业务，只把主窗口模式统一包到壳层之内，保证结构可复用。

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/components/MainWorkbenchShell.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/components/MainWorkbenchShell.vue src/components/MainWorkbenchShell.test.ts src/App.vue
git commit -m "feat: 新增主窗口工作台壳层"
```

### Task 4: 改造笔记列表页入口分流

**Files:**
- Modify: `src/views/MainView.vue`
- Modify: `src/views/MainView.test.ts`
- Modify: `src/stores/ui.ts`

- [ ] **Step 1: Write the failing test**

扩展 `src/views/MainView.test.ts`，明确“新建笔记”与“新建速记”分流：

```ts
it('opens the note editor in the main window when creating a note', async () => {
  const wrapper = mount(WrappedMainView);
  await flushPromises();

  await wrapper.find('[data-action=\"new-note\"]').trigger('click');

  expect(navigateTo).toHaveBeenCalledWith('note-editor', null, null);
  expect(openQuicknote).not.toHaveBeenCalled();
});

it('opens quicknote only from the quicknote action', async () => {
  const wrapper = mount(WrappedMainView);
  await flushPromises();

  await wrapper.find('[data-action=\"new-quicknote\"]').trigger('click');

  expect(openQuicknote).toHaveBeenCalledOnce();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/views/MainView.test.ts`
Expected: FAIL，因为 `MainView` 目前只有“新建速记”卡片，没有主窗口编辑入口。

- [ ] **Step 3: Write minimal implementation**

在 `src/views/MainView.vue` 中：

```ts
const ui = useUiStore();

function onNewNote() {
  ui.navigateTo('note-editor');
}
```

把原有快捷卡片重组为两个明确入口：

```vue
<NCard data-action="new-note" @click="onNewNote">新建笔记</NCard>
<NCard data-action="new-quicknote" @click="onNewQuickNote">新建速记</NCard>
```

并把列表项“编辑”按钮从 `win.openZen(note.id)` 改为：

```ts
function onOpenNoteEditor(note: Note) {
  ui.navigateTo('note-editor', note.id);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/views/MainView.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/views/MainView.vue src/views/MainView.test.ts src/stores/ui.ts
git commit -m "feat: 区分新建笔记与新建速记入口"
```

### Task 5: 新增主窗口笔记编辑页

**Files:**
- Create: `src/views/NoteEditorView.vue`
- Create: `src/views/NoteEditorView.test.ts`
- Modify: `src/App.vue`
- Modify: `src/stores/notes.ts`

- [ ] **Step 1: Write the failing test**

新增 `src/views/NoteEditorView.test.ts`，覆盖已有笔记加载和新建草稿两条路径：

```ts
it('loads the target note into the main-window editor', async () => {
  const wrapper = mount(WrappedNoteEditorView);
  await flushPromises();

  expect(getNote).toHaveBeenCalledWith('note-1');
  expect(wrapper.text()).toContain('Rust 生命周期笔记');
});

it('saves a new draft from the main-window editor', async () => {
  const wrapper = mount(WrappedNoteEditorView);
  await flushPromises();

  await wrapper.find('textarea').setValue('新内容');

  expect(scheduleSave).toHaveBeenCalled();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/views/NoteEditorView.test.ts`
Expected: FAIL，因为页面尚不存在。

- [ ] **Step 3: Write minimal implementation**

创建 `src/views/NoteEditorView.vue`，直接复用 `ZenMode` 的加载和自动保存思路，但保留普通工作台页头。核心逻辑：

```ts
const currentNoteId = ref<string | null>(ui.noteId);
const title = ref('');
const content = ref('');
const tags = ref<string[]>([]);

onMounted(async () => {
  if (currentNoteId.value) {
    const note = await db.getNote(currentNoteId.value);
    if (note) hydrateFromNote(note);
  }
});

watch([title, content], () => {
  if (!loaded.value) return;
  scheduleSave({
    id: currentNoteId.value ?? undefined,
    title: title.value || undefined,
    content: content.value,
    tags: tags.value,
  });
});
```

`App.vue` 加入：

```vue
<NoteEditorView v-else-if="ui.mode === 'note-editor'" />
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/views/NoteEditorView.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/views/NoteEditorView.vue src/views/NoteEditorView.test.ts src/App.vue src/stores/notes.ts
git commit -m "feat: 新增主窗口笔记编辑页"
```

### Task 6: 把画布、搜索、设置迁入工作台壳层

**Files:**
- Modify: `src/views/CanvasView.vue`
- Modify: `src/views/SearchView.vue`
- Modify: `src/views/SettingsView.vue`
- Modify: `src/App.vue`

- [ ] **Step 1: Write the failing test**

扩展视图测试，验证这三个页面不再渲染独立“返回”页头，而是只输出内容区主体。例如新增：

```ts
it('renders canvas inside the shared workbench without its own page header', async () => {
  const wrapper = mount(CanvasView);
  await flushPromises();

  expect(wrapper.find('.canvas-page-header').exists()).toBe(false);
  expect(wrapper.find('.canvas-page-body').exists()).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/components/Canvas.test.ts src/views/SettingsView.test.ts src/views/ZenMode.test.ts`
Expected: 至少一个 FAIL，因为当前页面仍自带独立页头。

- [ ] **Step 3: Write minimal implementation**

调整三个页面，只保留其业务内容，不再输出重复工作台页头：

```vue
<template>
  <div class="canvas-page-body">
    <Canvas />
  </div>
</template>
```

`SearchView` 保留搜索输入和结果区，但删除自己的“返回”按钮和顶层 header；`SettingsView` 删除独立标题头，只保留设置表单内容。

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/components/Canvas.test.ts src/views/SettingsView.test.ts src/views/ZenMode.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/views/CanvasView.vue src/views/SearchView.vue src/views/SettingsView.vue src/App.vue
git commit -m "refactor: 统一主窗口页面壳层"
```

### Task 7: 新增未实现模块占位页

**Files:**
- Create: `src/views/PlaceholderView.vue`
- Create: `src/views/PlaceholderView.test.ts`
- Modify: `src/App.vue`
- Modify: `src/components/MainWorkbenchShell.vue`

- [ ] **Step 1: Write the failing test**

新增 `src/views/PlaceholderView.test.ts`：

```ts
it('shows a clear coming-soon message for unfinished modules', () => {
  const wrapper = mount(PlaceholderView, {
    props: {
      title: 'OCR',
      description: '功能规划中',
    },
  });

  expect(wrapper.text()).toContain('OCR');
  expect(wrapper.text()).toContain('功能规划中');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/views/PlaceholderView.test.ts`
Expected: FAIL，因为组件尚不存在。

- [ ] **Step 3: Write minimal implementation**

创建 `src/views/PlaceholderView.vue`：

```vue
<template>
  <section class="placeholder-root">
    <div class="placeholder-card">
      <h2>{{ title }}</h2>
      <p>{{ description }}</p>
      <span>该模块将在后续版本中设计实现。</span>
    </div>
  </section>
</template>
```

在 `App.vue` 根据 `ui.mode` 把 `clipboard` / `todo` / `screenshot` / `ocr` / `translate` 都路由到这个组件，并传入对应文案。

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/views/PlaceholderView.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/views/PlaceholderView.vue src/views/PlaceholderView.test.ts src/App.vue src/components/MainWorkbenchShell.vue
git commit -m "feat: 新增工作台占位页面"
```

### Task 8: 组装完整工作台导航与标题元信息

**Files:**
- Modify: `src/App.vue`
- Modify: `src/components/MainWorkbenchShell.vue`
- Modify: `src/views/MainView.vue`
- Modify: `src/stores/ui.ts`

- [ ] **Step 1: Write the failing test**

为壳层增加导航切换测试：

```ts
it('switches workbench pages from the sidebar', async () => {
  const wrapper = mount(WrappedAppForMainWindow);
  await flushPromises();

  await wrapper.find('[data-nav=\"canvas\"]').trigger('click');

  expect(wrapper.text()).toContain('画布');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/components/MainWorkbenchShell.test.ts src/views/MainView.test.ts`
Expected: FAIL，因为侧边栏还没有真正驱动工作台路由。

- [ ] **Step 3: Write minimal implementation**

在 `App.vue` 中收敛主窗口元信息映射：

```ts
const workbenchMeta = computed(() => ({
  main: { title: '笔记列表', description: '...' },
  note-editor: { title: '编辑笔记', description: '...' },
  canvas: { title: '画布', description: '...' },
  clipboard: { title: '粘贴板', description: '功能规划中' },
  // ...
}));
```

把 `MainWorkbenchShell` 的 sidebar 改为消费带 `key/label/icon/count` 的数据结构，点击时调用：

```ts
ui.navigateTo(item.key as MainRouteMode);
```

并将 `MainView` 收缩为工作台内容页，不再自带整页根布局。

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/components/MainWorkbenchShell.test.ts src/views/MainView.test.ts src/stores/ui.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/App.vue src/components/MainWorkbenchShell.vue src/views/MainView.vue src/stores/ui.ts src/components/MainWorkbenchShell.test.ts src/views/MainView.test.ts
git commit -m "feat: 组装主窗口工作台导航"
```

### Task 9: 全量验证与文档

**Files:**
- Modify: `README.md`
- Modify as needed only if verification exposes issues

- [ ] **Step 1: Run focused frontend tests**

Run: `pnpm vitest run src/stores/ui.test.ts src/views/MainView.test.ts src/views/SettingsView.test.ts src/views/ZenMode.test.ts src/components/Canvas.test.ts src/components/MainWorkbenchShell.test.ts src/views/NoteEditorView.test.ts src/views/PlaceholderView.test.ts`
Expected: all PASS。

- [ ] **Step 2: Run frontend typecheck**

Run: `pnpm typecheck`
Expected: exit 0。

- [ ] **Step 3: Run frontend build**

Run: `pnpm build`
Expected: exit 0。

- [ ] **Step 4: Review capability changes**

Run: `git diff -- src-tauri/capabilities/default.json src/composables/useWindow.ts`
Expected: only titlebar-related permission and helper changes。

- [ ] **Step 5: Update user-facing documentation**

在 `README.md` 中更新主窗口结构说明，至少补充：

```md
- 主窗口采用统一工作台布局，包含侧边栏、自定义标题栏和内容区
- “新建笔记”进入主窗口编辑页，“新建速记”打开浮窗
- 粘贴板、待办、截图、OCR、翻译当前为占位页
```

- [ ] **Step 6: Commit**

```bash
git add README.md docs/superpowers/plans/2026-05-13-main-window-workbench-redesign.md
git commit -m "docs: 补充主窗口重构执行计划"
```
