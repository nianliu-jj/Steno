## Why

《待实现功能》清单（笔记 `待实现功能-e137a002`）汇总了一批来自实际使用的诉求：缺少可排查问题的持久化日志；未保存草稿与粘贴板条目会无限堆积、占用空间；笔记编辑体验上还有若干明显的渲染与布局缺陷。这些问题都直接影响日常速记的可用性与可维护性，需要一次性补齐。

## What Changes

**待实现功能（新增能力）**

- **文件日志系统**：后端落地按日期 + 大小分文件的持久化日志，默认目录 `~/.steno/data/logs`，每天一个子目录，单文件上限 10MB（超出新建文件），最多保留 30 天。
- **未保存草稿定时清理**：`is_draft=1` 的笔记最后修改时间超过保留天数（默认 30 天、设置中可配）后自动清除，清理动作写日志。
- **粘贴板条目定时清理**：粘贴板复制项超过保留天数（默认 7 天、设置中可配）后自动清除（置顶项豁免），清理动作写日志。
- **设置项**：新增"未保存笔记保留天数""粘贴板保留天数"两个可配置项。
- **笔记列表右键"进入 Zen 模式"**：右键菜单的"编辑"项替换为"进入 Zen 模式"，点击后打开 Zen 页面并回显该笔记内容。

**功能优化**

- **红色"未保存"徽章**：笔记卡片左上角"未保存"标记改用红色底色，更醒目。
- **Markdown 编辑快捷键**：新增 `Ctrl+1`~`Ctrl+6` 直接切换标题 H1~H6（保留既有 `Ctrl+Alt+1` 等绑定）。

**Bug 修复**

- **Markdown 块级语法即时渲染**：编辑时输入 `# ` 等块级标题语法应即时渲染（补 input rule），不再需要重新进入笔记才生效（笔记编辑页与速记浮窗同时修复）。
- **粘贴图片后光标位置**：粘贴图片后光标应落在图片下一行（必要时补换行），不再把换行加在图片前面。
- **编辑页顶/底栏固定 + 内容区滚动**：标题栏、底部栏固定不随滚动条移动；滚动条只作用于内容编辑区；"展示大纲"图标按钮悬浮在编辑区右下角并置于上层。
- **大纲面板锚定按钮上方**：悬浮/点击"展示大纲"按钮时，大纲列表在按钮正上方展开，而非文档开头。
- **切换 Zen 模式回显内容**：从编辑页底部栏切到 Zen 模式时，Zen 编辑区回显当前笔记内容（修复 ZenMode 本地 ref 与 writing session 脱节的缺陷）。

## Capabilities

### New Capabilities

- `application-logging`: 后端文件日志系统（按日期目录 + 大小切分 + 30 天保留）。
- `data-retention-cleanup`: 未保存草稿与粘贴板条目的定时清理及其可配置保留天数。
- `note-editor-layout`: 笔记编辑页与 Zen 页的布局行为（固定顶/底栏、内容区滚动、大纲按钮悬浮与面板定位、Zen 内容回显）。
- `note-list-management`: 笔记列表交互（右键"进入 Zen 模式"、红色"未保存"徽章）。

### Modified Capabilities

- `markdown-wysiwyg-editor`: 块级标题语法即时渲染（input rule）、`Ctrl+1`~`Ctrl+6` 标题快捷键、粘贴图片后光标落点。

## Impact

- **前端**：`src/views/MainView.vue`（右键菜单、徽章）、`src/views/NoteEditorView.vue` 与 `src/views/ZenMode.vue`（布局、滚动、大纲、Zen 回显）、`src/components/markdown-editor/prosemirror/plugins/{input-rules,keymap,paste}.ts`（即时渲染、快捷键、图片光标）、`src/stores/settings.ts`（新增设置项）。
- **后端**：新增 `src-tauri/src/logging.rs`（日志）、`src-tauri/src/cleanup_scheduler.rs`（清理调度）；`src-tauri/src/db.rs`（草稿/粘贴板清理查询、默认设置）、`src-tauri/src/lib.rs`（启动初始化日志与调度器）、`src-tauri/Cargo.toml`（日志依赖 `log`）。
- **数据/路径**：新增 `~/.steno/data/logs/<YYYY-MM-DD>/` 日志目录；不改动数据库 schema（复用现有列），仅新增清理 SQL 与设置键。
- **无破坏性变更**：仅新增设置键与文件目录，既有数据与 IPC 接口保持兼容。
