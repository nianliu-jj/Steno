# 主工作台布局精简 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 移除主工作台的大标题区和底部置顶栏，把主界面收敛为“顶栏 + 侧栏 + 内容区工具条 + 笔记网格”的更直接结构，同时去掉侧栏重复的搜索入口。

**Architecture:** 这次改动分三层收口。`MainWorkbenchShell.vue` 从“带页头和底栏的全局壳”收成“只负责标题栏、侧栏和内容容器”的轻壳；`App.vue` 去掉 `#actions` 槽位注入和重复的 `search` 导航项；`MainView.vue` 自己负责渲染内容区首行工具条，并让笔记网格和空状态直接承接在下面。测试层同步把旧页头、旧底栏和旧 `compactActions` 注入路径替换成新结构断言。

**Tech Stack:** Vue 3、TypeScript、Pinia、Vitest、Naive UI、Vite。

---

## 文件结构与责任

- `src/components/MainWorkbenchShell.vue`
  - 主工作台壳层。
  - 本次改动后只负责标题栏、侧栏、主内容滚动容器。
- `src/components/MainWorkbenchShell.test.ts`
  - 锁定壳层结构、导航动作和响应式回归。
  - 本次改动后不再允许渲染 `workbench-page-header` 和 `bottombar`。
- `src/App.vue`
  - 决定主窗口哪些 mode 进入工作台壳。
  - 本次改动后移除 `search` 侧栏入口，且不再通过 `#actions` 额外渲染第二个 `MainView`。
- `src/App.test.ts`
  - 锁定 `App.vue` 的工作台接线。
  - 本次改动后验证主页面只有一个 `MainView`，且侧栏导航数量从 8 收成 7。
- `src/views/MainView.vue`
  - 主页面内容本体。
  - 本次改动后自己渲染首行工具条，不再依赖 `compactActions` 入口。
- `src/views/MainView.test.ts`
  - 锁定工具条位置、空状态、动作按钮和 store 调用。
  - 本次改动后验证默认渲染就能看到工具条，且不再触发 `loadPinned()`。

### Task 1: 精简 MainWorkbenchShell 壳层

**Files:**
- Modify: `src/components/MainWorkbenchShell.test.ts`
- Modify: `src/components/MainWorkbenchShell.vue`

- [ ] **Step 1: Write the failing test**

把 `src/components/MainWorkbenchShell.test.ts` 改成直接锁定“旧页头和旧底栏必须消失”的行为；保留 `loadPinned` mock，但把预期改成“绝不能被调用”。

```ts
it('renders the simplified shell body without the legacy page header or pinned footer', () => {
  const wrapper = mount(MainWorkbenchShell, {
    props: {
      navItems: [{ key: 'main', label: '笔记列表', active: true }],
    },
    slots: {
      default: '<div class="page-body">body</div>',
    },
  });

  expect(wrapper.find('.page-body').exists()).toBe(true);
  expect(wrapper.find('.workbench-page-header').exists()).toBe(false);
  expect(wrapper.find('.bottombar').exists()).toBe(false);
  expect(loadPinned).not.toHaveBeenCalled();
});

it('keeps the responsive shell rules but drops the legacy header/footer CSS hooks', async () => {
  const wrapper = mount(MainWorkbenchShell, {
    props: {
      navItems: [
        { key: 'main', label: '笔记列表', active: true, count: '24' },
        { key: 'canvas', label: '画布', active: false, count: '3' },
      ],
    },
  });

  expect(wrapper.get('.workbench-root').attributes('data-compact')).toBe('false');
  expect(MainWorkbenchShellSource).toContain('@media (max-width: 720px)');
  expect(MainWorkbenchShellSource).toContain('.workbench-content');
  expect(MainWorkbenchShellSource).toContain('padding: 18px 20px 20px;');
  expect(MainWorkbenchShellSource).not.toContain('.workbench-page-header');
  expect(MainWorkbenchShellSource).not.toContain('.pin-chip');
});
```

同时把这个测试文件里所有同时传了 `title`、`description`、`navItems` 的 `mount(MainWorkbenchShell, { props: { ... } })` 调用都删掉 `title` 和 `description`，只保留 `navItems`，因为壳层不再接收标题和描述。

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/components/MainWorkbenchShell.test.ts`

Expected: FAIL，因为当前组件仍会渲染 `.workbench-page-header` 和 `.bottombar`，并且 `onMounted()` 里会触发一次 `loadPinned()`。

- [ ] **Step 3: Write minimal implementation**

先删掉 `src/components/MainWorkbenchShell.vue` 里只为旧底栏服务的依赖和逻辑，把 props 收成只保留 `navItems`：

```ts
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

import { useWindow } from '@/composables/useWindow';
import { useUiStore } from '@/stores/ui';

interface NavItem {
  key: WindowMode;
  label: string;
  count?: string;
  active?: boolean;
}

const props = defineProps<{
  navItems?: NavItem[];
}>();

onMounted(() => {
  syncCompactViewport();
  window.addEventListener('resize', syncCompactViewport);
});
```

保持当前 `aside.workbench-sidebar` 侧栏代码块原样，只替换主内容块为：

```vue
<main class="workbench-main">
  <section class="workbench-content">
    <slot />
  </section>
</main>
```

最后替换旧样式，确保内容区直接起始但仍有留白：

```css
.workbench-main {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.workbench-content {
  flex: 1;
  min-height: 0;
  padding: 18px 20px 20px;
  overflow: auto;
}

@media (max-width: 720px) {
  .workbench-content {
    padding: 14px 14px 16px;
  }
}
```

删除整段旧结构和样式：

- `header.workbench-page-header`
- `footer.bottombar`
- `pinnedChips`
- `summarizePinnedNote()`
- `useNotesStore()` / `loadPinned()`

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/components/MainWorkbenchShell.test.ts`

Expected: PASS，且输出里不再出现关于 `.workbench-page-header`、`.pin-chip`、`loadPinned` 的旧断言失败。

- [ ] **Step 5: Commit**

```bash
git add src/components/MainWorkbenchShell.vue src/components/MainWorkbenchShell.test.ts
git commit -m "refactor: simplify main workbench shell frame"
```

### Task 2: 收口 App 的壳层接线和重复搜索入口

**Files:**
- Modify: `src/App.test.ts`
- Modify: `src/App.vue`

- [ ] **Step 1: Write the failing test**

先把 `src/App.test.ts` 里的 `MainWorkbenchShell` mock 改成只暴露默认插槽和导航数量，不再暴露 `actions` 槽位；再增加一条断言，锁定“主页面只有一个 `MainView`，并且侧栏没有重复 `搜索` 项”。

```ts
vi.mock('@/components/MainWorkbenchShell.vue', async () => {
  const { defineComponent, h } = await import('vue');

  return {
    default: defineComponent({
      props: {
        navItems: {
          type: Array,
          default: () => [],
        },
      },
      setup(props, { slots }) {
        return () =>
          h(
            'div',
            {
              'data-testid': 'shell',
              'data-nav-count': String((props.navItems as Array<unknown>).length),
            },
            [
              h(
                'div',
                { 'data-testid': 'shell-nav-labels' },
                (props.navItems as Array<{ label: string }>).map(item => h('span', item.label)),
              ),
              h('div', { 'data-testid': 'shell-default' }, slots.default?.()),
            ],
          );
      },
    }),
  };
});
```

把 `MainView` mock 改成不再接受 `compactActions`：

```ts
vi.mock('@/views/MainView.vue', async () => {
  const { defineComponent, h } = await import('vue');

  return {
    default: defineComponent({
      setup() {
        return () => h('div', { 'data-testid': 'main-view' }, 'main-view');
      },
    }),
  };
});
```

新增断言：

```ts
it('renders the main page with a single content view and no duplicate search nav item', () => {
  uiState.mode = 'main';

  const wrapper = mount(App);

  expect(wrapper.get('[data-testid="shell"]').attributes('data-nav-count')).toBe('7');
  expect(wrapper.get('[data-testid="shell-nav-labels"]').text()).not.toContain('搜索');
  expect(wrapper.findAll('[data-testid="main-view"]')).toHaveLength(1);
  expect(wrapper.find('[data-testid="main-actions"]').exists()).toBe(false);
});
```

并把现有 “embedded settings modal” 测试里的 `main-actions` 断言改掉，保留 `shell`、`main-view`、`settings-modal` 和 `settings-view-embedded` 四个核心断言。

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/App.test.ts`

Expected: FAIL，因为当前 `App.vue` 仍会：

- 向 `MainWorkbenchShell` 传 `title` / `description`
- 通过 `#actions` 额外注入一个 `MainView compact-actions`
- 在 `shellNavItems` 里保留 `search`

- [ ] **Step 3: Write minimal implementation**

删掉 `src/App.vue` 里只为壳层页头服务的 `shellMeta` 计算；把侧栏导航收成 7 项：

```ts
const shellNavItems = computed<{ key: WindowMode; label: string; active: boolean }[]>(() => [
  { key: 'main', label: '笔记列表', active: ui.mode === 'main' },
  { key: 'canvas', label: '画布', active: ui.mode === 'canvas' },
  { key: 'clipboard', label: '粘贴板', active: ui.mode === 'clipboard' },
  { key: 'todo', label: '待办', active: ui.mode === 'todo' },
  { key: 'screenshot', label: '截图', active: ui.mode === 'screenshot' },
  { key: 'ocr', label: 'OCR', active: ui.mode === 'ocr' },
  { key: 'translate', label: '翻译', active: ui.mode === 'translate' },
]);
```

把模板改成只渲染一个 `MainView`，不再使用 `#actions`：

```vue
<template v-if="shellModes.has(ui.mode)">
  <MainWorkbenchShell :nav-items="shellNavItems">
    <MainView v-if="ui.mode === 'main'" />
    <NoteEditorView v-else-if="ui.mode === 'note-editor'" />
    <CanvasView v-else-if="ui.mode === 'canvas'" />
    <SearchView v-else-if="ui.mode === 'search'" />
    <PlaceholderView
      v-else-if="placeholderMeta"
      :title="placeholderMeta.title"
      :description="placeholderMeta.description"
    />
  </MainWorkbenchShell>
</template>
```

保留 `placeholderMeta`，因为 `PlaceholderView` 仍需要自己的标题和描述；只删除壳层页头需要的那份 `shellMeta`。

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/App.test.ts`

Expected: PASS，且主页面场景里只有一个 `[data-testid="main-view"]`。

- [ ] **Step 5: Commit**

```bash
git add src/App.vue src/App.test.ts
git commit -m "refactor: remove duplicate workbench search and actions slot"
```

### Task 3: 让 MainView 自己渲染内容区工具条

**Files:**
- Modify: `src/views/MainView.test.ts`
- Modify: `src/views/MainView.vue`

- [ ] **Step 1: Write the failing test**

删掉 `src/views/MainView.test.ts` 里通过 `MainWorkbenchShell` 包一层并传 `compactActions` 的 `WrappedMainViewWithShell`。改成默认挂载 `WrappedMainView` 就必须能看到工具条，而且 `loadPinned()` 不能再被调用。

```ts
it('renders the toolbar as the first row inside the main content', async () => {
  notesState = [
    {
      id: 'note-3',
      title: '带操作区的笔记',
      content: '用于验证内容区工具条已经内聚到 MainView 自身。',
      htmlContent: '<p>用于验证内容区工具条已经内聚到 MainView 自身。</p>',
      tags: ['ui'],
      isPinned: false,
      pinnedWindowConfig: null,
      canvasPosition: null,
      createdAt: '2026-05-14T09:00:00.000Z',
      updatedAt: '2026-05-14T10:30:00.000Z',
      wordCount: 18,
    },
  ];

  const wrapper = mount(WrappedMainView);
  await flushPromises();

  expect(wrapper.get('.main-toolbar').exists()).toBe(true);
  expect(wrapper.get('[data-testid="main-filter"]').text()).toContain('筛选');
  expect(wrapper.get('[data-testid="main-new-note"]').text()).toContain('新建笔记');
  expect(wrapper.get('[data-testid="main-new-quicknote"]').text()).toContain('速记');
  expect((wrapper.get('.main-root').element.firstElementChild as HTMLElement).className).toContain(
    'main-toolbar',
  );
  expect(loadPinned).not.toHaveBeenCalled();
});
```

把空状态测试补强，要求默认也能看到工具条：

```ts
it('renders the empty state under the toolbar when there are no notes', async () => {
  const wrapper = mount(WrappedMainView);
  await flushPromises();

  expect(wrapper.find('.main-toolbar').exists()).toBe(true);
  expect(wrapper.find('.empty-state').exists()).toBe(true);
  expect(wrapper.find('.notes-grid').exists()).toBe(false);
});
```

点击行为仍然直接在默认挂载上验证：

```ts
await wrapper.get('[data-testid="main-new-note"]').trigger('click');
await wrapper.get('[data-testid="main-new-quicknote"]').trigger('click');

expect(navigateTo).toHaveBeenCalledWith('note-editor');
expect(openQuicknote).toHaveBeenCalledOnce();
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/views/MainView.test.ts`

Expected: FAIL，因为当前 `MainView.vue` 只有在 `compactActions` 为真时才会渲染 `.main-toolbar`，并且 `onMounted()` 还会调用一次 `loadPinned()`。

- [ ] **Step 3: Write minimal implementation**

先删除 `compactActions` props 和条件分支，让默认渲染就包含工具条；同时去掉 `loadPinned()`：

```ts
import { computed, onMounted } from 'vue';
import { NButton, useMessage } from 'naive-ui';

import { useWindow } from '@/composables/useWindow';
import { useNotesStore } from '@/stores/notes';
import { useUiStore } from '@/stores/ui';

const notes = useNotesStore();
const ui = useUiStore();
const win = useWindow();
const message = useMessage();

onMounted(() => {
  void notes.loadNotes(50);
});
```

把模板改成“工具条永远在前，后面接列表或空状态”：

```vue
<template>
  <div class="main-root">
    <div class="main-toolbar" data-testid="main-toolbar">
      <button class="toolbar-btn" type="button" data-testid="main-filter">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path d="M3 5h18M6 12h12M10 19h4" />
        </svg>
        筛选
      </button>
      <button
        class="toolbar-btn toolbar-btn--ghost"
        type="button"
        data-testid="main-new-quicknote"
        @click="onNewQuickNote"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4Z" />
        </svg>
        速记
      </button>
      <button
        class="toolbar-btn toolbar-btn--primary"
        type="button"
        data-testid="main-new-note"
        @click="onNewNote"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
        新建笔记
      </button>
    </div>

    <section v-if="recentNotes.length > 0" class="notes-grid">
      <article
        v-for="note in recentNotes"
        :key="note.id"
        class="note-card"
        :class="{ 'paper-1': note.isPinned }"
        @dblclick="onOpenNoteEditor(note)"
      >
        <div class="note-head">
          <span v-if="note.isPinned" class="note-pin"></span>
          <h3>{{ note.title || '无标题' }}</h3>
        </div>
        <p>{{ previewText(note.content) }}</p>
        <div class="note-foot">
          <div class="note-tags">
            <span v-for="tag in note.tags.slice(0, 2)" :key="tag">#{{ tag }}</span>
          </div>
          <span>{{ formatUpdatedAt(note.updatedAt) }}</span>
        </div>
        <div class="note-actions">
          <NButton tertiary size="tiny" @click="onOpenNoteEditor(note)">编辑</NButton>
          <NButton tertiary size="tiny" @click="onTogglePin(note)">
            {{ note.isPinned ? '取消置顶' : '置顶' }}
          </NButton>
          <NButton tertiary size="tiny" @click="onDelete(note)">删除</NButton>
        </div>
      </article>
    </section>

    <section v-else-if="!notes.loading" class="empty-state">
      <div class="empty-inner">
        <div class="empty-illus" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M5 4h11l3 3v13H5z" />
            <path d="M9 11h6M9 15h4" />
          </svg>
        </div>
        <h2>这里还空着</h2>
        <p>第一条笔记从一次复制开始。按下快捷键呼出浮窗，或直接新建。</p>
        <div class="empty-actions">
          <button class="empty-primary" type="button" data-action="new-note" @click="onNewNote">
            新建笔记
          </button>
        </div>
        <div class="empty-tips">
          <div><span class="empty-kbd">⌥ S</span> 呼出浮窗速记</div>
          <div><span class="empty-kbd">⌘ N</span> 新建一篇笔记</div>
          <div><span class="empty-kbd">⌘ K</span> 搜索任意内容</div>
        </div>
      </div>
    </section>
  </div>
</template>
```

用更稳定的内容区间距替换旧的“只有内容没有工具条”布局：

```css
.main-root {
  min-height: 100%;
  display: flex;
  flex-direction: column;
  gap: 16px;
  color: #2a2a2a;
  font-family: -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
}

.main-toolbar {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  align-self: flex-start;
}

.empty-state {
  flex: 1;
  min-height: 360px;
  display: grid;
  place-items: center;
  padding: 16px 24px 40px;
}
```

不改 `.note-card`、`.note-card:hover`、`.note-head`、`.note-actions`、`.empty-inner`、`.empty-kbd` 这些已有视觉规则；只新增上面的 `.main-root` / `.main-toolbar` / `.empty-state` 布局规则，并删除旧的 `v-if="props.compactActions"` 分支。

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/views/MainView.test.ts`

Expected: PASS，且默认挂载的 `MainView` 会同时通过工具条、空状态和点击动作断言。

- [ ] **Step 5: Commit**

```bash
git add src/views/MainView.vue src/views/MainView.test.ts
git commit -m "refactor: move main toolbar into content area"
```

## Final Verification

- [ ] Run: `pnpm vitest run src/components/MainWorkbenchShell.test.ts src/App.test.ts src/views/MainView.test.ts`
  - Expected: PASS，三个聚焦测试文件全部通过。
- [ ] Run: `pnpm typecheck`
  - Expected: exit 0，没有新的 TypeScript 报错。
- [ ] Run: `pnpm lint`
  - Expected: exit 0；如果 lint 自动改了文件，重新执行上一条聚焦测试命令确认仍然通过。
- [ ] Run: `pnpm build`
  - Expected: `vite build` 完成，没有模板类型错误或样式引用错误。
- [ ] Run: `pnpm tauri:dev`
  - Manual check:
    - 主界面不再显示壳层页头和底部置顶栏。
    - 左侧导航不再出现“搜索”项。
    - 顶栏搜索仍能进入搜索页。
    - `筛选 / 速记 / 新建笔记` 位于内容区第一行。
    - 窄屏宽度下工具条换行后不遮挡笔记卡片。
