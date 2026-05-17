# 编辑页与 Zen 三态写作模式 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把主编辑页和 Zen 页升级为“排版编辑态 / 只读态 / 代码态”的 Markdown-first 写作体验，补齐底部模式按钮、Zen 入口、大纲侧栏拖拽折叠与跨重启恢复，同时保持 Steno 现有 Markdown 存储、自动保存和导出链路不变。

**Architecture:** 这次实现分四层推进。第一层先补设置键、Zen 返回路由和依赖，为共享编辑体验打底；第二层新增 `writing/` 组件目录和共享 composables，把富编辑、源码编辑、大纲抽取和侧栏状态收成可复用模块；第三层替换 `NoteEditorView`，接入新的卡片布局、底部按钮和悬浮大纲；第四层替换 `ZenMode`，让 Zen 只保留正文与大纲侧栏，并用同一套状态机完成返回来源与持久化恢复。

**Tech Stack:** Vue 3、TypeScript、Pinia、Vitest、Naive UI、Tauri 2、Rust、ProseMirror 官方模块、`prosemirror-markdown`、`markdown-it`。

---

## 文件结构与责任

- `package.json`
  - 新增主编辑器所需的 ProseMirror / Markdown 依赖。
- `src-tauri/src/db.rs`
  - 为普通编辑页与 Zen 页补充大纲宽度 / 展开状态默认设置。
- `src/stores/settings.ts`
  - 把新设置键接入前端 typed store，并补布尔值解码。
- `src/stores/settings.test.ts`
  - 新增 settings store 的数字 / 布尔设置解码与更新测试。
- `src/stores/ui.ts`
  - 把 Zen 返回上下文从“只记 mode”提升为“记 mode + noteId”，并新增从主编辑页进入 Zen 的 helper。
- `src/stores/ui.test.ts`
  - 锁定从主编辑页和画布进入 Zen 后的返回行为。
- `src/utils/extractHeadings.ts`
  - 从 Markdown 文本抽取标题树，作为普通编辑页与 Zen 页共享的大纲数据源。
- `src/utils/extractHeadings.test.ts`
  - 锁定标题层级、空标题和重复标题的抽取结果。
- `src/composables/useOutlineSidebarState.ts`
  - 读取 / 写回编辑页与 Zen 页各自的大纲宽度、展开状态和折叠阈值逻辑。
- `src/composables/useOutlineSidebarState.test.ts`
  - 锁定拖拽阈值、自动折叠和重新展开恢复。
- `src/composables/useWritingSession.ts`
  - 抽取 `NoteEditorView` / `ZenMode` 当前重复的 note 加载、autosave、三态切换、headings 计算。
- `src/components/writing/MarkdownRichEditor.vue`
  - 富编辑态主视图，基于 ProseMirror + `prosemirror-markdown` 在排版内容上直接编辑。
- `src/components/writing/MarkdownSourceEditor.vue`
  - 代码态原始 Markdown 文本视图。
- `src/components/writing/WritingSurface.vue`
  - 包装富编辑 / 代码态切换、底部模式按钮、悬浮大纲入口和右侧大纲栏。
- `src/components/writing/WritingSurface.test.ts`
  - 锁定三态按钮行为、代码态回退和大纲入口显隐。
- `src/views/NoteEditorView.vue`
  - 接入共享写作组件，完成顶部圆角卡片、悬浮大纲和底部 Zen 入口。
- `src/views/NoteEditorView.test.ts`
  - 锁定主编辑页底部按钮、进入 Zen、大纲入口和只读转代码行为。
- `src/views/ZenMode.vue`
  - 接入共享写作组件，保留沉浸式头部和仅大纲侧栏布局。
- `src/views/ZenMode.test.ts`
  - 锁定 Zen 退出返回来源、侧栏接线和共享写作组件事件。

### Task 1: 打好设置、路由与依赖基础

**Files:**
- Modify: `package.json`
- Modify: `src-tauri/src/db.rs`
- Modify: `src/stores/settings.ts`
- Create: `src/stores/settings.test.ts`
- Modify: `src/stores/ui.ts`
- Modify: `src/stores/ui.test.ts`

- [ ] **Step 1: Write the failing tests**

先为设置存储和 Zen 返回路由补测试，锁定这次实现最容易漏掉的两个基础合同。

创建 `src/stores/settings.test.ts`：

```ts
// @vitest-environment jsdom

import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useSettingsStore } from './settings';

const getSetting = vi.fn(async (key: string) => ({
  noteEditorOutlineWidth: '312',
  noteEditorOutlineOpen: 'true',
  zenOutlineWidth: '280',
  zenOutlineOpen: 'false',
}[key] ?? null));

const setSetting = vi.fn(() => Promise.resolve());

vi.mock('@/composables/useDb', () => ({
  useDb: () => ({ getSetting, setSetting }),
}));

describe('settings store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    getSetting.mockClear();
    setSetting.mockClear();
  });

  it('decodes outline width and open state from settings rows', async () => {
    const settings = useSettingsStore();
    await settings.load();

    expect(settings.state.noteEditorOutlineWidth).toBe(312);
    expect(settings.state.noteEditorOutlineOpen).toBe(true);
    expect(settings.state.zenOutlineWidth).toBe(280);
    expect(settings.state.zenOutlineOpen).toBe(false);
  });
});
```

把 `src/stores/ui.test.ts` 增加“从主编辑页进入 Zen 后返回到同一条笔记”的断言：

```ts
it('returns to the same note editor after opening Zen from the editor page', () => {
  const ui = useUiStore();

  ui.navigateTo('note-editor', 'note-1');
  ui.navigateToZenFromEditor('note-1');
  ui.exitZen();

  expect(ui.mode).toBe('note-editor');
  expect(ui.noteId).toBe('note-1');
});
```

同时在 `src-tauri/src/db.rs` 现有测试模块里新增一条默认值测试：

```rust
#[test]
fn default_settings_seed_includes_editor_outline_keys() {
    let db = test_db();
    assert_eq!(db.get_setting("noteEditorOutlineWidth").unwrap().as_deref(), Some("280"));
    assert_eq!(db.get_setting("noteEditorOutlineOpen").unwrap().as_deref(), Some("false"));
    assert_eq!(db.get_setting("zenOutlineWidth").unwrap().as_deref(), Some("300"));
    assert_eq!(db.get_setting("zenOutlineOpen").unwrap().as_deref(), Some("true"));
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/stores/settings.test.ts src/stores/ui.test.ts`

Expected: FAIL，因为 `StenoSettings` 还没有新的 outline 字段，`useUiStore()` 也没有 `navigateToZenFromEditor()`。

Run: `cargo test default_settings_seed_includes_editor_outline_keys --manifest-path src-tauri/Cargo.toml`

Expected: FAIL，因为 `ensure_default_settings()` 还没写入这些 key。

- [ ] **Step 3: Write minimal implementation**

先装主编辑器依赖：

```bash
pnpm add markdown-it prosemirror-commands prosemirror-history prosemirror-inputrules prosemirror-keymap prosemirror-markdown prosemirror-model prosemirror-schema-list prosemirror-state prosemirror-view
```

然后补前端设置键和布尔解码：

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
  noteEditorOutlineWidth: number;
  noteEditorOutlineOpen: boolean;
  zenOutlineWidth: number;
  zenOutlineOpen: boolean;
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
  noteEditorOutlineWidth: 280,
  noteEditorOutlineOpen: false,
  zenOutlineWidth: 300,
  zenOutlineOpen: true,
};

case 'noteEditorOutlineWidth':
case 'zenOutlineWidth':
  return (Number.isFinite(n) ? n : DEFAULTS[key]) as StenoSettings[K];

case 'noteEditorOutlineOpen':
case 'zenOutlineOpen':
  return ((raw === 'true') ? true : (raw === 'false' ? false : DEFAULTS[key])) as StenoSettings[K];
```

再把 `ui` store 的 Zen 返回上下文改成 route 对象：

```ts
const zenReturnRoute = ref<{ mode: MainRouteMode; noteId: string | null } | null>(null);

function navigateTo(
  nextMode: MainRouteMode,
  nextNoteId: string | null = null,
  returnRoute: { mode: MainRouteMode; noteId: string | null } | null = null,
) {
  settingsOpen.value = false;
  mode.value = nextMode;
  noteId.value = nextMode === 'zen' || nextMode === 'note-editor' ? nextNoteId : null;
  zenReturnRoute.value = nextMode === 'zen' ? returnRoute : null;
}

function navigateToZenFromCanvas(nextNoteId: string) {
  navigateTo('zen', nextNoteId, { mode: 'canvas', noteId: null });
}

function navigateToZenFromEditor(nextNoteId: string | null) {
  navigateTo('zen', nextNoteId, { mode: 'note-editor', noteId: nextNoteId });
}

function exitZen() {
  const target = zenReturnRoute.value;
  if (target) {
    navigateTo(target.mode, target.noteId);
    return;
  }
  navigateTo('main');
}
```

最后补 Rust 默认值：

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
    ("noteEditorOutlineWidth", "280"),
    ("noteEditorOutlineOpen", "false"),
    ("zenOutlineWidth", "300"),
    ("zenOutlineOpen", "true"),
];
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/stores/settings.test.ts src/stores/ui.test.ts`

Expected: PASS，且 `navigateToZenFromEditor()` 与 outline 设置解码全部通过。

Run: `cargo test default_settings_seed_includes_editor_outline_keys --manifest-path src-tauri/Cargo.toml`

Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add package.json src-tauri/src/db.rs src/stores/settings.ts src/stores/settings.test.ts src/stores/ui.ts src/stores/ui.test.ts
git commit -m "feat: 补齐写作模式设置与Zen返回上下文"
```

### Task 2: 创建共享写作组件与大纲状态层

**Files:**
- Create: `src/utils/extractHeadings.ts`
- Create: `src/utils/extractHeadings.test.ts`
- Create: `src/composables/useOutlineSidebarState.ts`
- Create: `src/composables/useOutlineSidebarState.test.ts`
- Create: `src/composables/useWritingSession.ts`
- Create: `src/components/writing/MarkdownRichEditor.vue`
- Create: `src/components/writing/MarkdownSourceEditor.vue`
- Create: `src/components/writing/WritingSurface.vue`
- Create: `src/components/writing/WritingSurface.test.ts`

- [ ] **Step 1: Write the failing tests**

先从最稳定的逻辑层开始补测试。

`src/utils/extractHeadings.test.ts`：

```ts
import { describe, expect, it } from 'vitest';

import { extractHeadings } from './extractHeadings';

describe('extractHeadings', () => {
  it('extracts heading level and visible text from markdown', () => {
    expect(extractHeadings('# 标题\n\n## 第二节\n内容')).toEqual([
      { id: 'heading-0', level: 1, text: '标题' },
      { id: 'heading-1', level: 2, text: '第二节' },
    ]);
  });

  it('ignores empty heading markers', () => {
    expect(extractHeadings('# \n\n###   \n正文')).toEqual([]);
  });
});
```

`src/composables/useOutlineSidebarState.test.ts`：

```ts
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useOutlineSidebarState } from './useOutlineSidebarState';

const update = vi.fn(() => Promise.resolve());

vi.mock('@/stores/settings', () => ({
  useSettingsStore: () => ({
    state: {
      noteEditorOutlineWidth: 280,
      noteEditorOutlineOpen: false,
      zenOutlineWidth: 300,
      zenOutlineOpen: true,
    },
    update,
  }),
}));

describe('useOutlineSidebarState', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    update.mockClear();
  });

  it('collapses when dragged below the threshold', async () => {
    const state = useOutlineSidebarState('note-editor');
    state.setWidth(72);

    expect(state.open.value).toBe(false);
    expect(state.canResize.value).toBe(false);
  });
});
```

`src/components/writing/WritingSurface.test.ts`：

```ts
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import WritingSurface from './WritingSurface.vue';

describe('WritingSurface', () => {
  it('renders the mode controls and emits source-mode transitions', async () => {
    const wrapper = mount(WritingSurface, {
      props: {
        modelValue: '# 标题',
        mode: 'rich-readonly',
        headings: [{ id: 'heading-0', level: 1, text: '标题' }],
        outlineOpen: false,
        outlineWidth: 280,
        showFloatingOutline: true,
        showZenEntry: true,
      },
    });

    await wrapper.get('[data-testid="writing-open-source"]').trigger('click');
    expect(wrapper.emitted('open-source')).toBeTruthy();
    expect(wrapper.find('[data-testid="writing-outline-fab"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="writing-open-zen"]').exists()).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/utils/extractHeadings.test.ts src/composables/useOutlineSidebarState.test.ts src/components/writing/WritingSurface.test.ts`

Expected: FAIL，因为这些文件和导出目前都还不存在。

- [ ] **Step 3: Write minimal implementation**

先写标题抽取工具：

```ts
export interface OutlineHeading {
  id: string;
  level: number;
  text: string;
}

const HEADING_RE = /^(#{1,6})[ \t]+(.+)$/gm;

export function extractHeadings(markdown: string): OutlineHeading[] {
  const out: OutlineHeading[] = [];
  let index = 0;
  for (const match of markdown.matchAll(HEADING_RE)) {
    const text = match[2].trim();
    if (!text) continue;
    out.push({
      id: `heading-${index++}`,
      level: match[1].length,
      text,
    });
  }
  return out;
}
```

再写大纲状态 composable：

```ts
import { computed, ref } from 'vue';

import { useSettingsStore } from '@/stores/settings';

const COLLAPSE_THRESHOLD = 96;
const MIN_EXPANDED_WIDTH = 240;
const MAX_WIDTH = 420;

export function useOutlineSidebarState(scope: 'note-editor' | 'zen') {
  const settings = useSettingsStore();
  const open = ref(scope === 'note-editor' ? settings.state.noteEditorOutlineOpen : settings.state.zenOutlineOpen);
  const width = ref(scope === 'note-editor' ? settings.state.noteEditorOutlineWidth : settings.state.zenOutlineWidth);

  const canResize = computed(() => open.value);

  async function persist() {
    await settings.update(scope === 'note-editor' ? 'noteEditorOutlineOpen' : 'zenOutlineOpen', open.value);
    await settings.update(scope === 'note-editor' ? 'noteEditorOutlineWidth' : 'zenOutlineWidth', width.value);
  }

  function setWidth(next: number) {
    if (next < COLLAPSE_THRESHOLD) {
      open.value = false;
      void persist();
      return;
    }
    open.value = true;
    width.value = Math.max(MIN_EXPANDED_WIDTH, Math.min(MAX_WIDTH, Math.round(next)));
    void persist();
  }

  function reopen() {
    open.value = true;
    width.value = Math.max(width.value, MIN_EXPANDED_WIDTH);
    void persist();
  }

  function toggle() {
    if (open.value) {
      open.value = false;
      void persist();
      return;
    }
    reopen();
  }

  return { open, width, canResize, setWidth, reopen, toggle, persist };
}
```

共享写作会话：

```ts
export type WritingMode = 'rich-edit' | 'rich-readonly' | 'source-edit';

export function useWritingSession(initialNoteId: Ref<string | null>) {
  const db = useDb();
  const notes = useNotesStore();
  const { countWords } = useMarkdown();
  const { status, savedAt, error, scheduleSave, flushSave } = useAutosave(
    async (payload: SaveNoteRequest) => {
      const saved = await notes.saveDraft(payload);
      if (saved && !currentNoteId.value) {
        currentNoteId.value = saved.id;
      }
    },
  );

  const currentNoteId = ref<string | null>(initialNoteId.value);
  const title = ref('');
  const content = ref('');
  const tags = ref<string[]>([]);
  const loaded = ref(false);
  const mode = ref<WritingMode>('rich-edit');
  const headings = computed(() => extractHeadings(content.value));
  const wordCount = computed(() => countWords(content.value));

  function hydrateFromNote(note: Note) {
    currentNoteId.value = note.id;
    title.value = note.title;
    content.value = note.content;
    tags.value = [...note.tags];
  }

  onMounted(async () => {
    if (currentNoteId.value) {
      const note = await db.getNote(currentNoteId.value);
      if (note) {
        hydrateFromNote(note);
      }
    }
    loaded.value = true;
  });

  watch([title, content, tags], () => {
    if (!loaded.value) return;
    scheduleSave({
      id: currentNoteId.value ?? undefined,
      title: title.value || undefined,
      content: content.value,
      tags: tags.value,
    });
  });

  function toggleReadonly() {
    mode.value = mode.value === 'rich-readonly' ? 'rich-edit' : 'rich-readonly';
  }

  function openSource() {
    mode.value = 'source-edit';
  }

  function closeSource() {
    mode.value = 'rich-edit';
  }

  return {
    currentNoteId,
    title,
    content,
    tags,
    loaded,
    mode,
    headings,
    wordCount,
    status,
    savedAt,
    error,
    flushSave,
    toggleReadonly,
    openSource,
    closeSource,
  };
}
```

富编辑组件使用 `prosemirror-markdown` 官方 parser / serializer：

```ts
import MarkdownIt from 'markdown-it';
import { baseKeymap } from 'prosemirror-commands';
import { history } from 'prosemirror-history';
import { keymap } from 'prosemirror-keymap';
import { defaultMarkdownParser, defaultMarkdownSerializer } from 'prosemirror-markdown';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';

const md = MarkdownIt('commonmark', { html: false, linkify: true });

view = new EditorView(root.value!, {
  state: EditorState.create({
    doc: defaultMarkdownParser.parse(props.modelValue || ''),
    plugins: [history(), keymap(baseKeymap)],
  }),
  editable: () => props.mode === 'rich-edit',
  dispatchTransaction(tr) {
    const nextState = view!.state.apply(tr);
    view!.updateState(nextState);
    emit('update:modelValue', defaultMarkdownSerializer.serialize(nextState.doc));
  },
});
```

源码态保持简单文本视图：

```vue
<template>
  <textarea
    class="writing-source"
    :value="modelValue"
    :readonly="false"
    spellcheck="false"
    @input="$emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
  />
</template>
```

`WritingSurface.vue` 负责底部按钮和大纲壳：

```vue
<template>
  <section class="writing-surface">
    <button
      v-if="showFloatingOutline && !outlineOpen"
      class="writing-outline-fab"
      data-testid="writing-outline-fab"
      type="button"
      @click="$emit('toggle-outline')"
    >
      大纲
    </button>

    <div class="writing-surface__card">
      <MarkdownRichEditor
        v-if="mode !== 'source-edit'"
        :model-value="modelValue"
        :mode="mode"
        @update:model-value="$emit('update:modelValue', $event)"
      />
      <MarkdownSourceEditor
        v-else
        :model-value="modelValue"
        @update:model-value="$emit('update:modelValue', $event)"
      />
    </div>

    <aside
      v-if="outlineOpen"
      class="writing-outline-pane"
      :style="{ width: `${outlineWidth}px` }"
    >
      <button
        v-for="heading in headings"
        :key="heading.id"
        class="writing-outline-item"
        type="button"
        @click="$emit('select-heading', heading.id)"
      >
        {{ heading.text }}
      </button>
    </aside>

    <footer class="writing-surface__footer">
      <button data-testid="writing-toggle-readonly" type="button" @click="$emit('toggle-readonly')">
        {{ mode === 'rich-readonly' ? '编辑模式' : '只读模式' }}
      </button>
      <button
        v-if="mode !== 'source-edit'"
        data-testid="writing-open-source"
        type="button"
        @click="$emit('open-source')"
      >
        代码模式
      </button>
      <button
        v-else
        data-testid="writing-close-source"
        type="button"
        @click="$emit('close-source')"
      >
        排版编辑
      </button>
      <button
        v-if="showZenEntry"
        data-testid="writing-open-zen"
        type="button"
        @click="$emit('open-zen')"
      >
        Zen 模式
      </button>
    </footer>
  </section>
</template>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/utils/extractHeadings.test.ts src/composables/useOutlineSidebarState.test.ts src/components/writing/WritingSurface.test.ts`

Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/utils/extractHeadings.ts src/utils/extractHeadings.test.ts src/composables/useOutlineSidebarState.ts src/composables/useOutlineSidebarState.test.ts src/composables/useWritingSession.ts src/components/writing/MarkdownRichEditor.vue src/components/writing/MarkdownSourceEditor.vue src/components/writing/WritingSurface.vue src/components/writing/WritingSurface.test.ts
git commit -m "feat: 新增共享写作组件与大纲状态层"
```

### Task 3: 用共享写作层重做主编辑页

**Files:**
- Modify: `src/views/NoteEditorView.vue`
- Modify: `src/views/NoteEditorView.test.ts`

- [ ] **Step 1: Write the failing tests**

先把 `NoteEditorView` 的集成断言改成围绕新底部按钮和 Zen 入口展开。

更新 `src/views/NoteEditorView.test.ts` 的 UI mock：

```ts
const navigateToZenFromEditor = vi.fn();

vi.mock('@/stores/ui', () => ({
  useUiStore: () => ({
    noteId: 'note-1',
    navigateToMain: vi.fn(),
    navigateToZenFromEditor,
  }),
}));
```

把 `MarkdownEditor.vue` mock 替换成 `WritingSurface.vue` mock：

```ts
vi.mock('@/components/writing/WritingSurface.vue', () => ({
  default: {
    props: ['modelValue', 'mode', 'outlineOpen'],
    emits: ['update:modelValue', 'toggle-readonly', 'open-source', 'close-source', 'open-zen', 'toggle-outline'],
    template: `
      <div data-testid="writing-surface">
        <button data-testid="surface-open-zen" @click="$emit('open-zen')">zen</button>
        <button data-testid="surface-open-source" @click="$emit('open-source')">source</button>
        <button data-testid="surface-toggle-outline" @click="$emit('toggle-outline')">outline</button>
      </div>
    `,
  },
}));
```

新增断言：

```ts
it('routes the editor footer Zen action through the ui store', async () => {
  const wrapper = mount(WrappedNoteEditorView);
  await flushPromises();

  await wrapper.get('[data-testid="surface-open-zen"]').trigger('click');

  expect(navigateToZenFromEditor).toHaveBeenCalledWith('note-1');
});

it('renders the lifted rounded editor card shell for the main editor', async () => {
  const wrapper = mount(WrappedNoteEditorView);
  await flushPromises();

  expect(NoteEditorViewSource).toContain('data-testid="note-editor-shell"');
  expect(NoteEditorViewSource).toContain('border-radius: 18px 18px 14px 14px;');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/views/NoteEditorView.test.ts`

Expected: FAIL，因为当前 `NoteEditorView.vue` 仍直接使用 `MarkdownEditor.vue`，也没有 `navigateToZenFromEditor()`。

- [ ] **Step 3: Write minimal implementation**

把 `NoteEditorView.vue` 改成基于共享写作会话：

```ts
import WritingSurface from '@/components/writing/WritingSurface.vue';
import { useOutlineSidebarState } from '@/composables/useOutlineSidebarState';
import { useWritingSession } from '@/composables/useWritingSession';

const ui = useUiStore();
const session = useWritingSession(ref(ui.noteId ?? null));
const outline = useOutlineSidebarState('note-editor');

async function onOpenZen() {
  await session.flushSave();
  ui.navigateToZenFromEditor(session.currentNoteId.value);
}
```

正文区域替换成新壳：

```vue
<div class="note-editor-body">
  <div class="note-editor-shell" data-testid="note-editor-shell">
    <WritingSurface
      v-model="session.content.value"
      :mode="session.mode.value"
      :headings="session.headings.value"
      :outline-open="outline.open.value"
      :outline-width="outline.width.value"
      show-floating-outline
      show-zen-entry
      @toggle-readonly="session.toggleReadonly"
      @open-source="session.openSource"
      @close-source="session.closeSource"
      @toggle-outline="outline.toggle()"
      @open-zen="onOpenZen"
    />
  </div>
</div>
```

把主编辑页上移和圆角落到新容器样式：

```css
.note-editor-header {
  padding: 8px 24px 6px;
}

.note-editor-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 10px 24px 8px;
}

.note-editor-shell {
  flex: 1;
  min-height: 0;
  margin-top: -4px;
  border: 1px solid rgba(55, 46, 36, 0.1);
  border-radius: 18px 18px 14px 14px;
  background: rgba(255, 255, 255, 0.55);
  overflow: hidden;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/views/NoteEditorView.test.ts`

Expected: PASS，且 `surface-open-zen` 会调用 `navigateToZenFromEditor('note-1')`。

- [ ] **Step 5: Commit**

```bash
git add src/views/NoteEditorView.vue src/views/NoteEditorView.test.ts
git commit -m "feat: 重做主编辑页三态写作体验"
```

### Task 4: 用共享写作层重做 Zen 与最终回归

**Files:**
- Modify: `src/views/ZenMode.vue`
- Modify: `src/views/ZenMode.test.ts`

- [ ] **Step 1: Write the failing tests**

把 `ZenMode.test.ts` 从“只断言 exitZen 被调用”升级成“同时断言共享写作层接线和大纲侧栏约束”。

Mock `WritingSurface.vue`：

```ts
vi.mock('@/components/writing/WritingSurface.vue', () => ({
  default: {
    props: ['mode', 'headings', 'outlineOpen', 'outlineWidth'],
    emits: ['open-source', 'close-source', 'toggle-readonly', 'toggle-outline'],
    template: '<div data-testid="zen-writing-surface">{{ mode }}</div>',
  },
}));
```

新增断言：

```ts
it('renders the shared writing surface with the Zen outline sidebar enabled', async () => {
  const wrapper = mount(WrappedZenMode);
  await flushPromises();

  expect(wrapper.get('[data-testid="zen-writing-surface"]').text()).toBe('rich-edit');
  expect(ZenModeSource).toContain('data-testid="zen-outline-shell"');
});

it('delegates exit routing to the ui store and keeps the note-editor return context in the store', async () => {
  const wrapper = mount(WrappedZenMode);
  await flushPromises();

  await wrapper.find('.zen-exit').trigger('click');

  expect(exitZen).toHaveBeenCalledOnce();
  expect(navigateToMain).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/views/ZenMode.test.ts`

Expected: FAIL，因为当前 `ZenMode.vue` 仍然直接挂 `MarkdownEditor.vue`，也没有 `zen-outline-shell`。

- [ ] **Step 3: Write minimal implementation**

把 `ZenMode.vue` 也切到共享会话和大纲状态：

```ts
import WritingSurface from '@/components/writing/WritingSurface.vue';
import { useOutlineSidebarState } from '@/composables/useOutlineSidebarState';
import { useWritingSession } from '@/composables/useWritingSession';

const ui = useUiStore();
const session = useWritingSession(ref(ui.noteId ?? readIdFromUrl()));
const outline = useOutlineSidebarState('zen');
```

模板改成“正文 + 仅大纲侧栏”的结构：

```vue
<div class="zen-stage">
  <div class="zen-paper">
    <NInput
      v-model:value="session.title.value"
      size="large"
      placeholder="标题"
      :bordered="false"
      class="zen-title"
    />
    <div class="zen-outline-shell" data-testid="zen-outline-shell">
      <WritingSurface
        v-model="session.content.value"
        :mode="session.mode.value"
        :headings="session.headings.value"
        :outline-open="outline.open.value"
        :outline-width="outline.width.value"
        :show-floating-outline="false"
        :show-zen-entry="false"
        @toggle-readonly="session.toggleReadonly"
        @open-source="session.openSource"
        @close-source="session.closeSource"
      />
    </div>
  </div>
</div>
```

保持 Zen 只留大纲侧栏的样式约束：

```css
.zen-outline-shell {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
}

.zen-outline-shell :deep(.writing-outline-pane) {
  border-left: 1px solid rgba(255, 255, 255, 0.06);
}
```

- [ ] **Step 4: Run focused tests to verify they pass**

Run: `pnpm vitest run src/stores/settings.test.ts src/stores/ui.test.ts src/utils/extractHeadings.test.ts src/composables/useOutlineSidebarState.test.ts src/components/writing/WritingSurface.test.ts src/views/NoteEditorView.test.ts src/views/ZenMode.test.ts`

Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/views/ZenMode.vue src/views/ZenMode.test.ts
git commit -m "feat: 重做Zen写作页与大纲侧栏"
```

## Final Verification

- [ ] Run: `pnpm vitest run src/stores/settings.test.ts src/stores/ui.test.ts src/utils/extractHeadings.test.ts src/composables/useOutlineSidebarState.test.ts src/components/writing/WritingSurface.test.ts src/views/NoteEditorView.test.ts src/views/ZenMode.test.ts`
  - Expected: PASS。
- [ ] Run: `cargo test --manifest-path src-tauri/Cargo.toml`
  - Expected: PASS，尤其是 settings 默认值相关测试通过。
- [ ] Run: `pnpm typecheck`
  - Expected: exit 0，没有新增 Vue 模板或 store 类型错误。
- [ ] Run: `pnpm lint`
  - Expected: exit 0；如果自动改动文件，再回跑上面的聚焦测试命令。
- [ ] Run: `pnpm build`
  - Expected: `vite build` 成功，富编辑组件没有 SSR / 模板编译错误。
- [ ] Run: `pnpm tauri:dev`
  - Manual check:
    - 主编辑页默认进入排版编辑态。
    - 只读按钮可在只读与编辑间切换。
    - 从只读态点代码模式会直接进入可编辑源码。
    - 主编辑页底部能进入 Zen，并且关闭 Zen 后回到同一条主编辑笔记。
    - 普通编辑页大纲通过悬浮按钮展开；Zen 仅保留大纲侧栏。
    - 大纲拖到阈值以下会直接折叠，重新展开后才允许继续拖。
    - 重启应用后，普通编辑页与 Zen 各自恢复上次大纲宽度和展开状态。

## 自检结果

- Spec coverage: 覆盖三态编辑、代码态回退、主编辑页底部 Zen 入口、Zen 返回来源、大纲侧栏拖拽折叠和跨重启恢复。
- Placeholder scan: 计划没有保留 TBD / TODO 占位；所有新增文件、测试命令和提交点都已指向具体路径。
- Type consistency: `WritingMode`、`navigateToZenFromEditor`、`noteEditorOutlineWidth`、`zenOutlineWidth`、`noteEditorOutlineOpen`、`zenOutlineOpen` 在 settings / ui / 视图 / 测试中保持同名。
