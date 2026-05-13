# Settings Modal Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Steno 设置从独立整页改为主窗口内的 Naive UI 模态框，并按原型重组设置面板信息架构。

**Architecture:** `MainView.vue` 持有 `settingsVisible` 状态并用 `NModal` 承载 `SettingsView`；`SettingsView.vue` 只负责设置面板内容、分类状态和现有设置保存逻辑。独立 `ui.mode === 'settings'` 路径继续渲染同一个面板，作为直接设置窗口的兜底。

**Tech Stack:** Vue 3、TypeScript、Pinia、Naive UI、Vitest、@vue/test-utils、Tauri IPC 现有封装。

---

## 文件结构

- Modify: `src/views/SettingsView.vue`
  - 负责设置面板内容、分类标签、现有设置项自动保存、存储路径展示、关闭事件。
- Modify: `src/views/MainView.vue`
  - 负责主窗口设置入口、本地模态框状态、`NModal` 承载设置面板。
- Modify: `src/views/SettingsView.test.ts`
  - 覆盖分类切换、存储路径渲染、无 `highlight.js` 警告。
- Modify: `src/views/MainView.test.ts`
  - 覆盖点击设置入口后显示模态框，并确认不调用独立设置窗口。

## Task 1: 先补 SettingsView 行为测试

**Files:**
- Modify: `src/views/SettingsView.test.ts`

- [ ] **Step 1: 更新测试 mock 的设置状态**

把 `useSettingsStore` mock 补齐 `SettingsView` 新面板需要的字段：

```ts
state: {
  themeMode: 'system',
  mainWindowShortcut: 'Ctrl+Shift+N',
  quicknoteShortcut: 'Ctrl+Shift+M',
  searchShortcut: 'Ctrl+Shift+F',
  floatingWidth: 400,
  floatingHeight: 300,
  blurCloseDelayMs: 200,
  editorMode: 'split',
  backupEveryChanges: 10,
},
```

- [ ] **Step 2: 添加分类切换测试**

在 `SettingsView` describe 中新增测试：

```ts
it('switches between settings sections inside the panel', async () => {
  const wrapper = mount(WrappedSettingsView);
  await flushPromises();

  expect(wrapper.text()).toContain('常规');
  expect(wrapper.text()).toContain('启动与速记');

  await wrapper.get('[data-testid="settings-tab-storage"]').trigger('click');

  expect(wrapper.text()).toContain('存储位置');
  expect(wrapper.text()).toContain('D:\\Steno\\data\\steno.db');
});
```

- [ ] **Step 3: 保留 highlight.js 回归测试**

保留现有测试意图，断言路径渲染不会输出 `hljs is not set`：

```ts
expect(wrapper.text()).toContain('D:\\Steno\\data');
const messages = error.mock.calls.map(args => args.join(' '));
expect(messages.some(message => message.includes('hljs is not set'))).toBe(false);
```

- [ ] **Step 4: 运行测试确认失败**

Run: `pnpm vitest run src/views/SettingsView.test.ts`

Expected: FAIL，原因是当前 `SettingsView` 没有 `settings-tab-storage` 和新分类内容。

## Task 2: 重构 SettingsView 为可嵌入设置面板

**Files:**
- Modify: `src/views/SettingsView.vue`

- [ ] **Step 1: 增加 props、emit 和分类状态**

在 `<script setup>` 中加入：

```ts
const props = withDefaults(defineProps<{ embedded?: boolean }>(), {
  embedded: false,
});

const emit = defineEmits<{ close: [] }>();

type SettingsSection = 'general' | 'appearance' | 'shortcuts' | 'privacy' | 'storage' | 'about';

const activeSection = ref<SettingsSection>('general');

const sections: { key: SettingsSection; label: string; eyebrow: string }[] = [
  { key: 'general', label: '常规', eyebrow: '启动与速记' },
  { key: 'appearance', label: '外观', eyebrow: '主题与编辑' },
  { key: 'shortcuts', label: '快捷键', eyebrow: '全局入口' },
  { key: 'privacy', label: '隐私安全', eyebrow: '本地优先' },
  { key: 'storage', label: '存储', eyebrow: '路径与备份' },
  { key: 'about', label: '关于', eyebrow: '版本信息' },
];
```

- [ ] **Step 2: 增加关闭处理**

```ts
function closePanel() {
  if (props.embedded) {
    emit('close');
  } else {
    ui.navigateToMain();
  }
}
```

- [ ] **Step 3: 替换模板为面板结构**

使用以下结构替换整页卡片堆叠：

```vue
<div class="settings-shell" :class="{ 'settings-shell--embedded': embedded }">
  <section class="settings-panel" role="dialog" aria-labelledby="settingsTitle">
    <header class="settings-panel__header">
      <div class="settings-brand">
        <span class="settings-brand__mark">S</span>
        <div>
          <h1 id="settingsTitle">设置</h1>
          <p>{{ headerSub }}</p>
        </div>
      </div>
      <nav class="settings-tabs" aria-label="设置分类">
        <button
          v-for="section in sections"
          :key="section.key"
          class="settings-tab"
          :class="{ 'settings-tab--active': activeSection === section.key }"
          :data-testid="`settings-tab-${section.key}`"
          type="button"
          @click="activeSection = section.key"
        >
          <span>{{ section.label }}</span>
          <small>{{ section.eyebrow }}</small>
        </button>
      </nav>
      <NButton quaternary circle aria-label="关闭设置" @click="closePanel">×</NButton>
    </header>

    <main class="settings-panel__body">
      <section v-show="activeSection === 'general'" class="settings-section">...</section>
      <section v-show="activeSection === 'appearance'" class="settings-section">...</section>
      <section v-show="activeSection === 'shortcuts'" class="settings-section">...</section>
      <section v-show="activeSection === 'privacy'" class="settings-section">...</section>
      <section v-show="activeSection === 'storage'" class="settings-section">...</section>
      <section v-show="activeSection === 'about'" class="settings-section">...</section>
    </main>

    <footer class="settings-panel__footer">
      <NButton quaternary type="error" @click="closePanel">取消</NButton>
      <span class="settings-save-hint">所有更改自动保存到本地</span>
      <NButton secondary @click="message.info('当前版本暂不支持一键重置')">重置</NButton>
      <NButton type="primary" @click="closePanel">确认</NButton>
    </footer>
  </section>
</div>
```

- [ ] **Step 4: 迁移现有真实设置项**

把已有控件放入对应分类：

```vue
<!-- 外观 -->
<NRadioGroup :value="settings.state.themeMode" @update:value="onThemeChange">
  <NSpace>
    <NRadio value="light">浅色</NRadio>
    <NRadio value="dark">深色</NRadio>
    <NRadio value="system">跟随系统</NRadio>
  </NSpace>
</NRadioGroup>

<!-- 快捷键 -->
<NInput v-model:value="mainShortcut" @blur="commitShortcut('mainWindowShortcut', mainShortcut)" />

<!-- 常规 -->
<NInputNumber :value="settings.state.floatingWidth" @update:value="v => onUpdateNumber('floatingWidth', v)" />
```

- [ ] **Step 5: 添加规划中项目的禁用态**

隐私安全和外观补充禁用展示：

```vue
<div class="settings-row settings-row--disabled">
  <div>
    <strong>数据库加密</strong>
    <p>SQLCipher 加密入口规划中，当前版本不写入设置。</p>
  </div>
  <NButton size="tiny" disabled>规划中</NButton>
</div>
```

- [ ] **Step 6: 运行 SettingsView 测试确认通过**

Run: `pnpm vitest run src/views/SettingsView.test.ts`

Expected: PASS。

## Task 3: 主窗口接入 NModal 设置入口

**Files:**
- Modify: `src/views/MainView.vue`
- Modify: `src/views/MainView.test.ts`

- [ ] **Step 1: 先更新 MainView 测试**

在测试里把 `openSettings` 抽成可断言 mock，并 mock `SettingsView`：

```ts
const openSettings = vi.fn(() => Promise.resolve());

vi.mock('@/views/SettingsView.vue', () => ({
  default: defineComponent({
    emits: ['close'],
    setup(_, { emit }) {
      return () => h('div', { 'data-testid': 'settings-panel' }, [
        h('span', '设置面板'),
        h('button', { onClick: () => emit('close') }, '关闭'),
      ]);
    },
  }),
}));
```

- [ ] **Step 2: 添加打开模态框测试**

```ts
it('opens settings in a modal instead of opening a settings window', async () => {
  const wrapper = mount(WrappedMainView, { attachTo: document.body });
  await flushPromises();

  await wrapper.get('[data-testid="main-open-settings"]').trigger('click');
  await flushPromises();

  expect(document.body.textContent).toContain('设置面板');
  expect(openSettings).not.toHaveBeenCalled();

  wrapper.unmount();
});
```

- [ ] **Step 3: 运行 MainView 测试确认失败**

Run: `pnpm vitest run src/views/MainView.test.ts`

Expected: FAIL，原因是当前点击设置仍调用 `openSettings`，且没有 `data-testid="main-open-settings"`。

- [ ] **Step 4: 修改 MainView 脚本**

```ts
import { computed, onMounted, ref } from 'vue';
import { NButton, NCard, NEmpty, NModal, NText, useMessage } from 'naive-ui';
import SettingsView from '@/views/SettingsView.vue';

const settingsVisible = ref(false);

function onOpenSettings() {
  settingsVisible.value = true;
}
```

- [ ] **Step 5: 修改设置入口和模态框模板**

```vue
<NCard
  size="small"
  class="main-quick"
  hoverable
  data-testid="main-open-settings"
  @click="onOpenSettings"
>
  <div class="main-quick-title">设置</div>
  <NText depth="3" class="main-quick-hint">快捷键 / 主题 / 备份</NText>
</NCard>

<NModal
  v-model:show="settingsVisible"
  display-directive="if"
  :auto-focus="false"
  :trap-focus="true"
  class="settings-modal-host"
>
  <SettingsView embedded @close="settingsVisible = false" />
</NModal>
```

- [ ] **Step 6: 运行 MainView 测试确认通过**

Run: `pnpm vitest run src/views/MainView.test.ts`

Expected: PASS。

## Task 4: 样式、响应式和最终验证

**Files:**
- Modify: `src/views/SettingsView.vue`
- Modify: `src/views/MainView.vue`

- [ ] **Step 1: 添加设置面板 CSS**

在 `SettingsView.vue` scoped CSS 中定义固定面板尺寸、内容区滚动和深浅色兼容：

```css
.settings-panel {
  width: min(920px, calc(100vw - 32px));
  height: min(660px, calc(100vh - 48px));
  display: grid;
  grid-template-rows: auto 1fr auto;
  overflow: hidden;
  border: 1px solid rgba(120, 120, 120, 0.24);
  border-radius: 14px;
}

.settings-panel__body {
  min-height: 0;
  overflow: auto;
}
```

- [ ] **Step 2: 添加 MainView 模态框宿主样式**

```css
:deep(.settings-modal-host) {
  width: auto;
}
```

- [ ] **Step 3: 跑相关单测**

Run: `pnpm vitest run src/views/SettingsView.test.ts src/views/MainView.test.ts`

Expected: PASS。

- [ ] **Step 4: 跑类型检查**

Run: `pnpm typecheck`

Expected: PASS，无 Vue 模板类型错误。

- [ ] **Step 5: 查看 git diff**

Run: `git diff -- src/views/SettingsView.vue src/views/MainView.vue src/views/SettingsView.test.ts src/views/MainView.test.ts`

Expected: 只包含设置模态框、设置面板和相关测试修改。

- [ ] **Step 6: 提交实现**

```bash
git add src/views/SettingsView.vue src/views/MainView.vue src/views/SettingsView.test.ts src/views/MainView.test.ts
git commit -m "feat: 重设计设置模态框"
```

## 自检结果

- Spec coverage: 覆盖设置入口弹窗、关闭行为、分类信息架构、现有设置自动保存、存储路径展示、规划中设置项边界和关于信息展示。
- Placeholder scan: 未保留空占位或空泛实现步骤；规划中项目是产品状态文案，不是计划占位。
- Type consistency: `SettingsSection`、`settingsVisible`、`embedded`、`close` 事件、`settings-tab-storage` 和 `main-open-settings` 命名在测试与实现中保持一致。
