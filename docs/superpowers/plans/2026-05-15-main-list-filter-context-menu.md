# Main List Filter Context Menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在主窗口笔记列表中实现标签多选筛选、自定义右键菜单、标签编辑、重命名，以及 HTML 导出。

**Architecture:** 前端交互集中在 `src/views/MainView.vue`，通过现有 `notes` store 保存标签、标题和删除操作。导出能力通过 `src/composables/useDb.ts` 调用 Tauri commands；后端只新增 HTML 导出，复用现有导出文件命名和输出目录策略。

**Tech Stack:** Vue 3、Pinia、Naive UI、Vitest、Tauri 2、Rust、rusqlite。

---

## 文件结构

- 修改 `src/views/MainView.test.ts`：先补失败测试，覆盖筛选菜单、右键菜单、标签弹框、重命名弹框和导出命令调用。
- 修改 `src/views/MainView.vue`：实现筛选派生状态、自定义菜单、弹框和保存/导出动作。
- 修改 `src/composables/useDb.ts`：新增 `exportNoteHtml(id)` typed wrapper。
- 修改 `src-tauri/src/export.rs`：新增 `export_html()` 和 HTML 渲染测试。
- 修改 `src-tauri/src/commands.rs`：新增 `export_note_html` command。
- 修改 `src-tauri/src/lib.rs`：注册 `export_note_html` command。

## Task 1: 主列表前端失败测试

**Files:**
- Modify: `src/views/MainView.test.ts`

- [ ] **Step 1: 写筛选菜单失败测试**

在 `describe('MainView', () => { ... })` 内新增测试：

```ts
it('filters notes by multiple tag checkboxes including untagged notes', async () => {
  notesState = [
    makeNote({ id: 'a', title: 'Alpha', tags: ['work'] }),
    makeNote({ id: 'b', title: 'Beta', tags: ['life', 'work'] }),
    makeNote({ id: 'c', title: 'Gamma', tags: [] }),
  ];

  const wrapper = mount(WrappedMainView);
  await flushPromises();

  await wrapper.get('[data-testid="main-filter"]').trigger('click');
  expect(wrapper.get('[data-testid="filter-option-work"]').text()).toContain('work');
  expect(wrapper.get('[data-testid="filter-option-life"]').text()).toContain('life');
  expect(wrapper.get('[data-testid="filter-option-untagged"]').text()).toContain('无标签');

  await wrapper.get('[data-testid="filter-option-life"] input').setValue(true);
  expect(wrapper.findAll('.note-card').map(card => card.text())).toEqual([
    expect.stringContaining('Beta'),
  ]);

  await wrapper.get('[data-testid="filter-option-untagged"] input').setValue(true);
  const cardTexts = wrapper.findAll('.note-card').map(card => card.text());
  expect(cardTexts).toEqual([
    expect.stringContaining('Beta'),
    expect.stringContaining('Gamma'),
  ]);

  await wrapper.get('[data-testid="filter-select-all"] input').setValue(true);
  expect(wrapper.findAll('.note-card')).toHaveLength(3);
});
```

- [ ] **Step 2: 写右键菜单失败测试**

新增测试：

```ts
it('prevents the default context menu and disables document actions on blank area', async () => {
  notesState = [makeNote({ id: 'note-ctx', title: '右键文档', tags: ['ctx'] })];
  const preventDefault = vi.fn();
  const wrapper = mount(WrappedMainView);
  await flushPromises();

  await wrapper.get('.main-root').trigger('contextmenu', { preventDefault, clientX: 80, clientY: 90 });

  expect(preventDefault).toHaveBeenCalledOnce();
  expect(wrapper.get('[data-testid="note-context-menu"]').exists()).toBe(true);
  expect(wrapper.get('[data-testid="context-new"]').attributes('aria-disabled')).toBe('false');
  expect(wrapper.get('[data-testid="context-edit"]').attributes('aria-disabled')).toBe('true');
  expect(wrapper.get('[data-testid="context-tags"]').attributes('aria-disabled')).toBe('true');
  expect(wrapper.get('[data-testid="context-export"]').attributes('aria-disabled')).toBe('true');
  expect(wrapper.get('[data-testid="context-rename"]').attributes('aria-disabled')).toBe('true');
  expect(wrapper.get('[data-testid="context-delete"]').attributes('aria-disabled')).toBe('true');
});
```

- [ ] **Step 3: 写文档右键菜单动作失败测试**

新增测试：

```ts
it('enables note context actions and calls edit, export, rename, tag, print, and delete handlers', async () => {
  const saveDraft = vi.fn((input) => Promise.resolve(makeNote({
    id: input.id,
    title: input.title ?? '右键文档',
    content: input.content,
    tags: input.tags,
  })));
  const removeNote = vi.fn(() => Promise.resolve());
  const exportNoteMarkdown = vi.fn(() => Promise.resolve('D:/exports/note.md'));
  const exportNoteHtml = vi.fn(() => Promise.resolve('D:/exports/note.html'));
  const exportNotePdf = vi.fn(() => Promise.reject(new Error('PDF 不可用')));
  installNotesStoreOverrides({ saveDraft, removeNote });
  installDbOverrides({ exportNoteMarkdown, exportNoteHtml, exportNotePdf });
  vi.spyOn(window, 'print').mockImplementation(() => undefined);
  notesState = [makeNote({ id: 'note-ctx', title: '右键文档', tags: ['old'], content: '正文' })];

  const wrapper = mount(WrappedMainView);
  await flushPromises();
  await wrapper.get('.note-card').trigger('contextmenu', { preventDefault: vi.fn(), clientX: 120, clientY: 140 });

  expect(wrapper.get('[data-testid="context-edit"]').attributes('aria-disabled')).toBe('false');
  await wrapper.get('[data-testid="context-edit"]').trigger('click');
  expect(navigateTo).toHaveBeenCalledWith('note-editor', 'note-ctx');

  await wrapper.get('.note-card').trigger('contextmenu', { preventDefault: vi.fn(), clientX: 120, clientY: 140 });
  await wrapper.get('[data-testid="context-tags"]').trigger('click');
  await wrapper.get('[data-testid="main-tag-input-0"] input').setValue('updated');
  await wrapper.get('[data-testid="main-tag-add"]').trigger('click');
  await wrapper.get('[data-testid="main-tag-input-1"] input').setValue('new');
  await wrapper.get('[data-testid="main-tags-confirm"]').trigger('click');
  expect(saveDraft).toHaveBeenLastCalledWith(expect.objectContaining({
    id: 'note-ctx',
    title: '右键文档',
    content: '正文',
    tags: ['updated', 'new'],
  }));

  await wrapper.get('.note-card').trigger('contextmenu', { preventDefault: vi.fn(), clientX: 120, clientY: 140 });
  await wrapper.get('[data-testid="context-rename"]').trigger('click');
  await wrapper.get('[data-testid="main-rename-input"] input').setValue('新标题');
  await wrapper.get('[data-testid="main-rename-confirm"]').trigger('click');
  expect(saveDraft).toHaveBeenLastCalledWith(expect.objectContaining({
    id: 'note-ctx',
    title: '新标题',
  }));

  await wrapper.get('.note-card').trigger('contextmenu', { preventDefault: vi.fn(), clientX: 120, clientY: 140 });
  await wrapper.get('[data-testid="context-export"]').trigger('click');
  await wrapper.get('[data-testid="context-export-markdown"]').trigger('click');
  await wrapper.get('[data-testid="context-export-html"]').trigger('click');
  await wrapper.get('[data-testid="context-export-pdf"]').trigger('click');
  expect(exportNoteMarkdown).toHaveBeenCalledWith('note-ctx');
  expect(exportNoteHtml).toHaveBeenCalledWith('note-ctx');
  expect(exportNotePdf).toHaveBeenCalledWith('note-ctx');

  await wrapper.get('[data-testid="context-print"]').trigger('click');
  expect(window.print).toHaveBeenCalledOnce();

  await wrapper.get('.note-card').trigger('contextmenu', { preventDefault: vi.fn(), clientX: 120, clientY: 140 });
  await wrapper.get('[data-testid="context-delete"]').trigger('click');
  expect(removeNote).toHaveBeenCalledWith('note-ctx');
});
```

- [ ] **Step 4: 运行前端失败测试**

Run:

```bash
pnpm vitest run src/views/MainView.test.ts
```

Expected: FAIL，失败原因是缺少筛选菜单、右键菜单、测试辅助函数和 `exportNoteHtml` wrapper。

## Task 2: HTML 导出后端失败测试

**Files:**
- Modify: `src-tauri/src/export.rs`

- [ ] **Step 1: 写 HTML 导出失败测试**

在 `src-tauri/src/export.rs` 的 tests 内新增：

```rust
#[test]
fn export_html_writes_full_html_document() {
    let tmp = std::env::temp_dir().join(format!("steno-export-{}.html", uuid::Uuid::new_v4()));
    export_html(&make_note(), &tmp).expect("write html");
    let content = std::fs::read_to_string(&tmp).expect("read html");
    assert!(content.contains("<!doctype html>"));
    assert!(content.contains("<title>笔记标题</title>"));
    assert!(content.contains("<main>"));
    assert!(content.contains("<p>...</p>"));
    assert!(content.contains("</html>"));
    let _ = std::fs::remove_file(&tmp);
}
```

- [ ] **Step 2: 运行 Rust 失败测试**

Run:

```bash
cd src-tauri
cargo test export_html_writes_full_html_document
```

Expected: FAIL，失败原因是 `export_html` 函数未定义。

## Task 3: 实现 HTML 导出

**Files:**
- Modify: `src-tauri/src/export.rs`
- Modify: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src/composables/useDb.ts`

- [ ] **Step 1: 实现 `export_html`**

在 `src-tauri/src/export.rs` 添加：

```rust
pub fn export_html(note: &Note, output_path: &Path) -> Result<(), ExportError> {
    let body = render_html(note);
    if let Some(parent) = output_path.parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(parent)?;
        }
    }
    std::fs::write(output_path, body)?;
    Ok(())
}
```

并添加私有渲染函数：

```rust
fn render_html(note: &Note) -> String {
    format!(
        "<!doctype html>\n<html lang=\"zh-CN\">\n<head>\n<meta charset=\"utf-8\">\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n<title>{}</title>\n<style>body{{font-family:-apple-system,BlinkMacSystemFont,\"Segoe UI\",sans-serif;line-height:1.65;max-width:760px;margin:40px auto;padding:0 20px;color:#242424;}}main{{display:block;}}</style>\n</head>\n<body>\n<main>\n<h1>{}</h1>\n{}\n</main>\n</body>\n</html>\n",
        html_escape(&note.title),
        html_escape(&note.title),
        note.html_content
    )
}
```

并添加：

```rust
fn html_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}
```

- [ ] **Step 2: 注册后端 command**

在 `src-tauri/src/commands.rs` 添加 `export_note_html`，结构与 `export_note_markdown` 一致，扩展名为 `html` 并调用 `export::export_html()`。

- [ ] **Step 3: 注册 invoke handler**

在 `src-tauri/src/lib.rs` 的 `invoke_handler!` 列表加入 `commands::export_note_html`。

- [ ] **Step 4: 前端 DB wrapper**

在 `src/composables/useDb.ts` 添加：

```ts
function exportNoteHtml(id: string) {
  return invoke<string>('export_note_html', { id });
}
```

并在 return 对象中暴露 `exportNoteHtml`。

- [ ] **Step 5: 运行 HTML 导出测试**

Run:

```bash
cd src-tauri
cargo test export_html_writes_full_html_document
```

Expected: PASS。

## Task 4: 实现主列表前端交互

**Files:**
- Modify: `src/views/MainView.vue`
- Modify: `src/views/MainView.test.ts`

- [ ] **Step 1: 测试辅助函数补齐**

在 `src/views/MainView.test.ts` 添加 `makeNote()`、`installNotesStoreOverrides()`、`installDbOverrides()`，让 Task 1 测试能控制 store 和 DB wrapper。

- [ ] **Step 2: 实现筛选状态**

在 `MainView.vue` 中添加：

```ts
const filterOpen = ref(false);
const selectedFilterValues = ref<string[]>([]);
const untaggedFilterValue = '__untagged__';

const filterOptions = computed(() => {
  const tags = new Set<string>();
  for (const note of notes.notes) {
    for (const tag of note.tags) {
      const trimmed = tag.trim();
      if (trimmed) tags.add(trimmed);
    }
  }
  return [...Array.from(tags).sort((a, b) => a.localeCompare(b, 'zh-CN')), untaggedFilterValue];
});
```

`visibleNotes` 替换 `recentNotes` 作为模板循环数据。无筛选或全选时返回最近笔记；部分选择时按“任一标签命中或无标签命中”过滤。

- [ ] **Step 3: 实现筛选菜单模板**

筛选按钮外层包裹 `filter-wrap`，按钮点击切换菜单。菜单提供 `data-testid="filter-select-all"`、`filter-option-${tag}`、`filter-option-untagged`。

- [ ] **Step 4: 实现右键菜单状态与动作**

添加 `contextMenu` ref，记录 `visible`、`x`、`y`、`note`。主根节点监听 `@contextmenu="onContextMenuBlank"`，文档卡片监听 `@contextmenu.stop="event => onContextMenuNote(event, note)"`。所有菜单动作在无目标文档时直接返回。

- [ ] **Step 5: 实现标签弹框和重命名弹框**

添加 `tagDialogVisible`、`tagDraftRows`、`renameDialogVisible`、`renameDraft`。确认时调用 `notes.saveDraft()`，保留原文档 `id/content/tags/isPinned/pinnedWindowConfig/canvasPosition` 等字段，只更新目标字段。

- [ ] **Step 6: 实现导出与打印**

通过 `useDb()` 调用 `exportNoteMarkdown()`、`exportNoteHtml()`、`exportNotePdf()`，成功后 `message.success()`，失败后 `message.error()`。打印调用 `window.print()`。

- [ ] **Step 7: 添加样式**

为筛选菜单、右键菜单、子菜单、弹框和禁用态添加 scoped CSS。菜单用固定定位和高 z-index；禁用项使用低透明度、`cursor: not-allowed`、`aria-disabled="true"`。

- [ ] **Step 8: 运行前端测试**

Run:

```bash
pnpm vitest run src/views/MainView.test.ts
```

Expected: PASS。

## Task 5: 全量验证

**Files:**
- Verify only

- [ ] **Step 1: 类型检查**

Run:

```bash
pnpm typecheck
```

Expected: PASS。

- [ ] **Step 2: 前端相关测试**

Run:

```bash
pnpm vitest run src/views/MainView.test.ts
```

Expected: PASS。

- [ ] **Step 3: Rust 导出测试**

Run:

```bash
cd src-tauri
cargo test export_html_writes_full_html_document
```

Expected: PASS。

- [ ] **Step 4: 工作区检查**

Run:

```bash
git status --short
```

Expected: 只出现本功能相关文件，以及进入本轮前已经存在的 `src/views/NoteEditorView.vue`、`src/views/NoteEditorView.test.ts` 修改。
