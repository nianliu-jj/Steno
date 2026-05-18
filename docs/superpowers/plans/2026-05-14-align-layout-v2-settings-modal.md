# Layout V2 与 Settings Modal 对齐 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将主窗口和设置弹窗严格对齐 `docs/steno-layout-v2.html` 与 `docs/steno-settings-modal.html` 的布局、密度和交互结构。

**Architecture:** `MainWorkbenchShell.vue` 承载完整工作台外壳、rail、标题栏、设置模态框和底部置顶内容条；`MainView.vue` 收缩为笔记卡片网格内容页；`SettingsView.vue` 只负责设置面板内部结构和现有设置读写。`App.vue` 继续负责按 `ui.mode` 选择工作台内容页面，并把导航元数据传入外壳。

**Tech Stack:** Vue 3、TypeScript、Pinia、Naive UI、Vitest、@vue/test-utils、Tauri 2 现有窗口封装。

---

## 文件结构

- Modify: `src/components/MainWorkbenchShell.vue`
  - 负责 v2 工作台 grid、标题栏、rail、设置模态框、底部置顶内容条、响应式和窗口控制。
- Modify: `src/components/MainWorkbenchShell.test.ts`
  - 覆盖 v2 区域渲染、rail 导航、rail 折叠、设置弹窗和窗口控制。
- Modify: `src/views/MainView.vue`
  - 负责笔记卡片网格、空状态、新建笔记、编辑/置顶/删除操作。
- Modify: `src/views/MainView.test.ts`
  - 覆盖卡片网格、空状态、新建笔记、速记入口不混用。
- Modify: `src/views/SettingsView.vue`
  - 负责 v2 设置面板 header、tabs、body、footer、分类内容和现有设置保存。
- Modify: `src/views/SettingsView.test.ts`
  - 覆盖设置分类、底部操作栏、关闭事件、路径渲染和 highlight.js 回归。
- Modify: `src/App.vue`
  - 传入导航 count，并移除旧设置页面作为普通工作台页的误用。

## Task 1: 工作台外壳 v2 结构

**Files:**
- Modify: `src/components/MainWorkbenchShell.test.ts`
- Modify: `src/components/MainWorkbenchShell.vue`
- Modify: `src/App.vue`

- [ ] **Step 1: 写失败测试**

在 `src/components/MainWorkbenchShell.test.ts` 增加 v2 结构、折叠和设置弹窗测试：

```ts
it('renders layout v2 regions with rail and bottom pinned strip', () => {
  const wrapper = mount(MainWorkbenchShell, {
    props: {
      title: '笔记列表',
      description: '24 篇 · 本地存储',
      navItems: [
        { key: 'main', label: '笔记列表', count: '24', active: true },
        { key: 'canvas', label: '画布', count: '3', active: false },
      ],
    },
    slots: { default: '<div data-testid="page-body">body</div>' },
  });

  expect(wrapper.find('.app').exists()).toBe(true);
  expect(wrapper.find('.topbar').exists()).toBe(true);
  expect(wrapper.find('.rail').exists()).toBe(true);
  expect(wrapper.find('.main').exists()).toBe(true);
  expect(wrapper.find('.bottombar').exists()).toBe(true);
  expect(wrapper.text()).toContain('Steno');
  expect(wrapper.text()).toContain('置顶内容');
  expect(wrapper.get('[data-testid="page-body"]').text()).toBe('body');
});

it('collapses and expands the rail without changing the active page', async () => {
  const wrapper = mount(MainWorkbenchShell, {
    props: {
      title: '笔记列表',
      description: '24 篇 · 本地存储',
      navItems: [{ key: 'main', label: '笔记列表', count: '24', active: true }],
    },
  });

  await wrapper.get('[data-testid="rail-collapse"]').trigger('click');
  expect(wrapper.get('.app').attributes('data-rail')).toBe('collapsed');

  await wrapper.get('[data-testid="rail-collapse"]').trigger('click');
  expect(wrapper.get('.app').attributes('data-rail')).toBe('expanded');
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm vitest run src/components/MainWorkbenchShell.test.ts`

Expected: FAIL，原因是当前组件没有 `.app`、`.topbar`、`.rail`、`.bottombar` 和 `data-testid="rail-collapse"`。

- [ ] **Step 3: 实现外壳脚本接口**

在 `MainWorkbenchShell.vue` 中扩展 props、局部状态和设置弹窗：

```ts
import { computed, onMounted, ref } from 'vue';
import { NModal } from 'naive-ui';
import { useNotesStore } from '@/stores/notes';
import SettingsView from '@/views/SettingsView.vue';

interface NavItem {
  key: WindowMode;
  label: string;
  count?: string;
  active?: boolean;
}

const railState = ref<'expanded' | 'collapsed'>('expanded');
const settingsVisible = ref(false);
const notes = useNotesStore();

const pinnedChips = computed(() =>
  notes.pinned.slice(0, 5).map(note => ({
    id: note.id,
    type: note.isPinned ? 'pin' : 'note',
    text: note.title || note.content.slice(0, 60) || '无标题',
  })),
);

onMounted(() => {
  void notes.loadPinned();
});
```

- [ ] **Step 4: 替换模板为 v2 grid**

将模板改为原型区域结构，保留默认 slot 作为主内容区：

```vue
<div class="app" :data-rail="railState">
  <header class="topbar" @pointerdown="onDragBarPointerDown">
    <div class="topbar-brand">
      <div class="brand-mark">S</div>
      <span class="brand-name">Steno</span>
    </div>
    <div class="topbar-center" data-no-drag="true">
      <button class="back-btn" type="button" aria-label="返回" @click="ui.navigateToMain()">‹</button>
      <button class="search-bar" type="button" @click="ui.navigateTo('search')">
        <span>搜索笔记、画布、剪贴板、待办…</span>
        <span class="kbd">⌘K</span>
      </button>
    </div>
    <div class="window-controls" data-no-drag="true">
      <button class="wc-btn" type="button" aria-label="最小化" @click.stop="onMinimize">−</button>
      <button class="wc-btn" type="button" aria-label="最大化" @click.stop="onToggleMaximize">□</button>
      <button class="wc-btn" type="button" aria-label="关闭" data-act="close" @click.stop="onClose">×</button>
    </div>
  </header>

  <aside class="rail">
    <nav class="rail-menu" aria-label="主菜单">
      <button
        v-for="item in navItems"
        :key="item.key"
        class="rail-item"
        :class="{ active: item.active }"
        type="button"
        :data-nav="item.key"
        @click="onNavigate(item.key)"
      >
        <span class="nav-icon" aria-hidden="true">{{ iconFor(item.key) }}</span>
        <span class="label">{{ item.label }}</span>
        <span v-if="item.count" class="count">{{ item.count }}</span>
      </button>
    </nav>
    <div class="rail-footer">
      <button class="rail-foot-btn" type="button" title="设置" @click="settingsVisible = true">⚙</button>
      <button class="rail-foot-btn" type="button" title="语言"><span class="lang-badge">ZH</span></button>
      <button
        class="rail-foot-btn"
        data-testid="rail-collapse"
        type="button"
        title="折叠侧边栏"
        @click="railState = railState === 'collapsed' ? 'expanded' : 'collapsed'"
      >
        {{ railState === 'collapsed' ? '›' : '‹' }}
      </button>
    </div>
  </aside>

  <main class="main">
    <header class="main-header">
      <div class="main-title">
        <h1>{{ title }}</h1>
        <p>{{ description }}</p>
      </div>
      <div class="main-actions"><slot name="actions" /></div>
    </header>
    <section class="notes-area"><slot /></section>
  </main>

  <footer class="bottombar">
    <div class="pin-label">置顶内容</div>
    <div class="pin-strip">
      <button v-for="chip in pinnedChips" :key="chip.id" class="pin-chip" type="button">
        <span class="type">{{ chip.type }}</span>
        <span class="text">{{ chip.text }}</span>
      </button>
      <span v-if="pinnedChips.length === 0" class="pin-chip pin-chip--empty">暂无置顶内容</span>
    </div>
  </footer>

  <NModal v-model:show="settingsVisible" display-directive="if" :auto-focus="false" :trap-focus="true">
    <SettingsView embedded @close="settingsVisible = false" />
  </NModal>
</div>
```

- [ ] **Step 5: 迁移原型样式**

将 `steno-layout-v2.html` 的变量和关键 class 迁入 scoped CSS，保留这些核心尺寸：

```css
.app {
  --rail-w: 220px;
  --rail-w-collapsed: 58px;
  --topbar-h: 44px;
  --bottombar-h: 40px;
  height: 100vh;
  display: grid;
  grid-template-columns: var(--rail-w) 1fr;
  grid-template-rows: var(--topbar-h) 1fr var(--bottombar-h);
}
.app[data-rail='collapsed'] {
  --rail-w: var(--rail-w-collapsed);
}
.topbar {
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: var(--rail-w) 1fr auto;
}
.rail { grid-row: 2 / 3; }
.main { grid-row: 2 / 3; min-width: 0; overflow: hidden; }
.bottombar { grid-column: 1 / -1; }
```

- [ ] **Step 6: 运行测试确认通过**

Run: `pnpm vitest run src/components/MainWorkbenchShell.test.ts`

Expected: PASS。

- [ ] **Step 7: 提交**

```bash
git add src/components/MainWorkbenchShell.vue src/components/MainWorkbenchShell.test.ts src/App.vue
git commit -m "feat: 对齐主窗口v2外壳"
```

## Task 2: 笔记列表 v2 卡片网格

**Files:**
- Modify: `src/views/MainView.test.ts`
- Modify: `src/views/MainView.vue`

- [ ] **Step 1: 写失败测试**

在 `MainView.test.ts` 中把 notes mock 改为可变数组，并新增卡片网格和空状态断言：

```ts
const mockNotes = ref<Note[]>([]);

vi.mock('@/stores/notes', () => ({
  useNotesStore: () => ({
    notes: mockNotes.value,
    loading: false,
    loadNotes,
    loadPinned,
    pinNote: vi.fn(() => Promise.resolve()),
    unpinNote: vi.fn(() => Promise.resolve()),
    removeNote: vi.fn(() => Promise.resolve()),
  }),
}));

it('renders notes as layout v2 cards', async () => {
  mockNotes.value = [{
    id: 'note-1',
    title: 'Rust 生命周期笔记',
    content: '函数中的生命周期标注影响返回值的存活范围。',
    tags: ['rust', '学习'],
    isPinned: true,
    createdAt: '2026-05-14T10:00:00.000Z',
    updatedAt: '2026-05-14T10:03:00.000Z',
    pinnedWindowConfig: null,
    canvasPosition: null,
  }];
  const wrapper = mount(WrappedMainView);
  await flushPromises();

  expect(wrapper.find('.notes-grid').exists()).toBe(true);
  expect(wrapper.find('.note-card').text()).toContain('Rust 生命周期笔记');
  expect(wrapper.find('.note-card').text()).toContain('#rust');
});

it('renders the layout v2 empty state when there are no notes', async () => {
  mockNotes.value = [];
  const wrapper = mount(WrappedMainView);
  await flushPromises();

  expect(wrapper.find('.empty-state').exists()).toBe(true);
  expect(wrapper.text()).toContain('这里还空着');
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm vitest run src/views/MainView.test.ts`

Expected: FAIL，原因是当前 `MainView` 仍是快捷卡片和纵向列表。

- [ ] **Step 3: 改造模板**

用原型卡片网格替换 quickbar/list，保留按钮行为：

```vue
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
      <button type="button" @click.stop="onOpenNoteEditor(note)">编辑</button>
      <button type="button" @click.stop="onTogglePin(note)">{{ note.isPinned ? '取消置顶' : '置顶' }}</button>
      <button type="button" @click.stop="onDelete(note)">删除</button>
    </div>
  </article>
</section>

<section v-else-if="!notes.loading" class="empty-state">
  <div class="empty-inner">
    <div class="empty-illus">□</div>
    <h2>这里还空着</h2>
    <p>第一条笔记从一次复制开始。按下快捷键呼出浮窗，或直接新建。</p>
    <div class="empty-tips">
      <button type="button" data-action="new-note" @click="onNewNote">新建笔记</button>
      <button type="button" data-action="new-quicknote" @click="onNewQuickNote">新建速记</button>
    </div>
  </div>
</section>
```

- [ ] **Step 4: 删除旧设置弹窗入口**

`MainView.vue` 不再导入 `NModal` 和 `SettingsView`，设置弹窗由 `MainWorkbenchShell.vue` 的 rail 统一打开：

```ts
import { computed, onMounted } from 'vue';
import { NButton, useMessage } from 'naive-ui';
```

- [ ] **Step 5: 添加卡片网格样式**

迁移原型 `.notes-grid`、`.note-card`、`.empty-state` 关键样式，确保卡片最小宽度 260px：

```css
.main-root { min-height: 100%; }
.notes-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 14px;
}
.note-card {
  min-height: 168px;
  display: flex;
  flex-direction: column;
  padding: 16px;
  border: 1px solid var(--border, rgba(128, 117, 105, 0.25));
  border-radius: 11px;
}
.note-card p {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
```

- [ ] **Step 6: 运行测试确认通过**

Run: `pnpm vitest run src/views/MainView.test.ts`

Expected: PASS。

- [ ] **Step 7: 提交**

```bash
git add src/views/MainView.vue src/views/MainView.test.ts
git commit -m "feat: 对齐笔记列表v2卡片布局"
```

## Task 3: 设置弹窗 v2 面板

**Files:**
- Modify: `src/views/SettingsView.test.ts`
- Modify: `src/views/SettingsView.vue`

- [ ] **Step 1: 写失败测试**

更新 `SettingsView.test.ts`，断言原型面板区域、底部按钮和关闭事件：

```ts
it('renders the settings modal v2 frame and footer actions', async () => {
  const wrapper = mount(WrappedSettingsView, {
    slots: {},
  });
  await flushPromises();

  expect(wrapper.find('.modal').exists()).toBe(true);
  expect(wrapper.find('.modal-header').exists()).toBe(true);
  expect(wrapper.find('.tab-strip').exists()).toBe(true);
  expect(wrapper.find('.modal-body').exists()).toBe(true);
  expect(wrapper.find('.modal-footer').exists()).toBe(true);
  expect(wrapper.text()).toContain('确认');
  expect(wrapper.text()).toContain('重置');
});

it('emits close from embedded confirm button', async () => {
  const wrapper = mount(SettingsView, {
    props: { embedded: true },
    global: {
      plugins: [createPinia()],
      stubs: { NButton: false },
    },
  });
  await flushPromises();

  await wrapper.get('[data-testid="settings-confirm"]').trigger('click');
  expect(wrapper.emitted('close')).toHaveLength(1);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm vitest run src/views/SettingsView.test.ts`

Expected: FAIL，原因是当前 class 名仍是 `settings-panel` 系列，不是原型 `.modal` 结构。

- [ ] **Step 3: 重构模板骨架**

将外层结构改为原型命名，保留分类状态和现有事件：

```vue
<div class="settings-shell" :class="{ 'settings-shell--embedded': props.embedded }">
  <section class="modal" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
    <header class="modal-header">
      <div class="modal-title-mark">
        <div class="brand-mark">S</div>
        <div>
          <strong id="modalTitle">{{ modalTitle }}</strong><br />
          <span>preferences.local</span>
        </div>
      </div>
      <nav class="tab-strip" role="tablist" aria-label="设置分类">
        <button
          v-for="section in sections"
          :key="section.key"
          class="tab"
          :class="{ active: activeSection === section.key }"
          :data-testid="`settings-tab-${section.key}`"
          type="button"
          role="tab"
          @click="activeSection = section.key"
        >
          {{ section.label }}
        </button>
      </nav>
      <button class="close-btn" type="button" aria-label="关闭设置" @click="closePanel">×</button>
    </header>

    <div class="modal-body">
      <section v-if="activeSection === 'general'" class="tab-panel active" data-panel="general">
        <div class="panel-intro"><h2>常规</h2><p>启动与速记相关行为。</p></div>
      </section>
      <section v-else-if="activeSection === 'appearance'" class="tab-panel active" data-panel="appearance">
        <div class="panel-intro"><h2>外观</h2><p>主题、编辑器模式和纸张偏好。</p></div>
      </section>
      <section v-else-if="activeSection === 'shortcuts'" class="tab-panel active" data-panel="shortcuts">
        <div class="panel-intro"><h2>快捷键</h2><p>全局入口与应用内搜索快捷键。</p></div>
      </section>
      <section v-else-if="activeSection === 'privacy'" class="tab-panel active" data-panel="privacy">
        <div class="panel-intro"><h2>隐私安全</h2><p>本地优先和规划中的隐私增强项。</p></div>
      </section>
      <section v-else-if="activeSection === 'storage'" class="tab-panel active" data-panel="storage">
        <div class="panel-intro"><h2>存储位置</h2><p>数据目录、数据库文件和备份目录。</p></div>
      </section>
      <section v-else class="tab-panel active" data-panel="about">
        <div class="panel-intro"><h2>关于 Steno</h2><p>Tauri、Rust 和 Vue 构建的本地优先速记工具。</p></div>
      </section>
    </div>

    <footer class="modal-footer">
      <NButton quaternary type="error" @click="closePanel">取消</NButton>
      <NButton type="primary" data-testid="settings-confirm" @click="closePanel">确认</NButton>
      <NButton secondary @click="resetPlanned">重置</NButton>
      <div class="footer-hint">设置面板 · 自动本地保存</div>
    </footer>
  </section>
</div>
```

- [ ] **Step 4: 保留真实设置项**

把当前真实控件迁入原型 `.setting-row`：

```vue
<div class="setting-row">
  <div class="setting-meta">
    <strong>颜色模式</strong>
    <p>跟随系统会响应操作系统浅色或深色模式。</p>
  </div>
  <NRadioGroup :value="settings.state.themeMode" @update:value="value => onThemeChange(value as ThemeMode)">
    <NSpace>
      <NRadio value="light">浅色</NRadio>
      <NRadio value="dark">深色</NRadio>
      <NRadio value="system">跟随系统</NRadio>
    </NSpace>
  </NRadioGroup>
</div>
```

- [ ] **Step 5: 迁移设置原型样式**

把 `steno-settings-modal.html` 的关键尺寸和滚动规则迁入 scoped CSS：

```css
.modal {
  width: min(920px, calc(100vw - 32px));
  height: min(660px, calc(100vh - 48px));
  display: grid;
  grid-template-rows: 56px 1fr 60px;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 14px;
}
.modal-body {
  min-height: 0;
  overflow-y: auto;
  padding: 22px 28px 28px;
}
.setting-row {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  gap: 18px;
  padding: 11px 0;
}
```

- [ ] **Step 6: 运行测试确认通过**

Run: `pnpm vitest run src/views/SettingsView.test.ts`

Expected: PASS，并且 `hljs is not set` 回归测试仍通过。

- [ ] **Step 7: 提交**

```bash
git add src/views/SettingsView.vue src/views/SettingsView.test.ts
git commit -m "feat: 对齐设置弹窗v2面板"
```

## Task 4: 集成验证与修正

**Files:**
- Modify as needed: `src/App.vue`
- Modify as needed: `src/components/MainWorkbenchShell.vue`
- Modify as needed: `src/views/MainView.vue`
- Modify as needed: `src/views/SettingsView.vue`

- [ ] **Step 1: 运行聚焦单测**

Run:

```bash
pnpm vitest run src/components/MainWorkbenchShell.test.ts src/views/MainView.test.ts src/views/SettingsView.test.ts
```

Expected: PASS。

- [ ] **Step 2: 修正测试发现的问题**

如果测试暴露 `data-testid`、mock、DOM class 或事件名不一致，按实现真实结构修正，保留这些稳定选择器：

```ts
const stableSelectors = [
  'data-testid="rail-collapse"',
  'data-testid="settings-confirm"',
  'data-testid="settings-tab-storage"',
  'data-action="new-note"',
  'data-action="new-quicknote"',
];
```

- [ ] **Step 3: 运行类型检查**

Run: `pnpm typecheck`

Expected: PASS，无 Vue 模板类型错误。

- [ ] **Step 4: 运行构建**

Run: `pnpm build`

Expected: PASS，Vite 正常输出生产构建。

- [ ] **Step 5: 检查变更范围**

Run:

```bash
git diff -- src/components/MainWorkbenchShell.vue src/components/MainWorkbenchShell.test.ts src/views/MainView.vue src/views/MainView.test.ts src/views/SettingsView.vue src/views/SettingsView.test.ts src/App.vue
```

Expected: diff 只包含 v2 布局、设置弹窗和相关测试修改。

- [ ] **Step 6: 提交最终验证修正**

```bash
git add src/components/MainWorkbenchShell.vue src/components/MainWorkbenchShell.test.ts src/views/MainView.vue src/views/MainView.test.ts src/views/SettingsView.vue src/views/SettingsView.test.ts src/App.vue
git commit -m "test: 验证布局与设置弹窗v2对齐"
```

## 自检结果

- Spec coverage: 覆盖 OpenSpec 中 `workbench-layout-v2-alignment` 的工作台 grid、标题栏、rail 折叠、笔记卡片、空状态、底部条、响应式要求；覆盖 `settings-modal-v2-alignment` 的设置模态框、分类、真实设置保存、未持久化项边界、路径渲染和小窗口约束。
- Placeholder scan: 未保留 TBD、TODO 或空泛步骤；每个任务都有目标文件、测试、实现片段、验证命令和中文提交信息。
- Type consistency: `WindowMode`、`NavItem`、`railState`、`settingsVisible`、`settings-tab-storage`、`settings-confirm`、`new-note` 与测试选择器保持一致。
