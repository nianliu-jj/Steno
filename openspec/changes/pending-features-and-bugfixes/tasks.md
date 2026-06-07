# 实现任务清单

> 每个 `##` 阶段为一个独立可提交单元：完成后跑通验证并做一次 git 提交（中文描述）。

## 1. 设置项：保留天数（前后端）

- [ ] 1.1 后端 `db.rs::ensure_default_settings` 新增 `("unsavedNoteRetentionDays","30")`、`("clipboardRetentionDays","7")`
- [ ] 1.2 前端 `settings.ts`：`StenoSettings` 加 `unsavedNoteRetentionDays`/`clipboardRetentionDays`（number），`DEFAULTS` 加 30/7
- [ ] 1.3 `settings.ts::decode` 为两键加正整数解析（`>0` 否则回退默认）
- [ ] 1.4 `settings.test.ts` 增加两键默认值与非法值回退用例
- [ ] 1.5 `SettingsView.vue` 增加两项 NInputNumber 控件（含暗色对比度处理）
- [ ] 1.6 验证：`pnpm typecheck` + `pnpm test`（settings 相关）通过；`cargo test`（默认设置相关）通过

## 2. 后端文件日志系统

- [ ] 2.1 `Cargo.toml` 添加 `log` 依赖
- [ ] 2.2 新增 `src-tauri/src/logging.rs`：自定义 `log::Log`，写入 `~/.steno/data/logs/<YYYY-MM-DD>/steno-<n>.log`，同时 echo stderr
- [ ] 2.3 实现按日期目录切换、单文件 ≥10MB 滚动新序号文件
- [ ] 2.4 实现启动/跨天清理 >30 天日期目录，并记录清理日志
- [ ] 2.5 `lib.rs`：声明 `mod logging`，在 `setup` 最早期调用 `logging::init(...)`（用 `Db::data_dir()` 解析路径）
- [ ] 2.6 将启动/调度关键路径的 `eprintln!` 迁移为 `log::info!/warn!/error!`
- [ ] 2.7 单元测试：日期目录生成、10MB 滚动、30 天保留裁剪（用临时目录注入）
- [ ] 2.8 验证：`cargo test`（logging）通过；`cargo build` 通过

## 3. 后端定时清理调度器（草稿 + 粘贴板）

- [ ] 3.1 `db.rs` 新增 `cleanup_expired_drafts(cutoff_rfc3339) -> usize`（`is_draft=1 AND updated_at < cutoff`）
- [ ] 3.2 `db.rs` 新增 `cleanup_expired_clipboard(cutoff_rfc3339) -> usize`（`pinned_at IS NULL AND COALESCE(last_used_at, updated_at) < cutoff`）
- [ ] 3.3 新增 `src-tauri/src/cleanup_scheduler.rs`：仿 `reminder_scheduler` 周期任务（启动延迟 + 每 6 小时一轮）
- [ ] 3.4 调度器每轮读取设置保留天数、计算 cutoff、执行两清理、`log` 记录删除数量
- [ ] 3.5 `lib.rs`：声明 `mod cleanup_scheduler`，`setup` 中 `start_scheduler(handle, db_clone)`
- [ ] 3.6 单元测试：草稿/粘贴板过期删除、置顶豁免、正式笔记不受影响、保留期内不删
- [ ] 3.7 验证：`cargo test`（db + cleanup）通过；`cargo build` 通过

## 4. 编辑器：标题块级语法即时渲染

- [ ] 4.1 确认 schema 中 `heading` 节点的 `level` attr 命名
- [ ] 4.2 `input-rules.ts` 新增 ATX 标题 input rule（`/^(#{1,6})\s$/` → 设为对应 level 标题），并在 `createInputRulesPlugin` 装配（保留 sourceView 守卫）
- [ ] 4.3 `tests/parser.test.ts` 或新测试：输入 `# `~`###### ` 后段落转为对应级别标题
- [ ] 4.4 真实路径验证（systematic-debugging）：编辑页 + 速记浮窗输入即时渲染
- [ ] 4.5 验证：`pnpm typecheck` + `pnpm test`（prosemirror）通过

## 5. 编辑器：Ctrl+1~6 标题快捷键

- [ ] 5.1 `keymap.ts::createMarkKeymap` 增加 `Mod-1`~`Mod-6` → `setHeading(1..6)`、`Mod-0` → `setParagraph`（保留既有 `Mod-Alt-*`）
- [ ] 5.2 测试：快捷键命令将段落切换为对应级别标题
- [ ] 5.3 验证：`pnpm typecheck` + `pnpm test` 通过

## 6. 编辑器：粘贴图片后光标落点

- [ ] 6.1 确认 image 节点 inline/block 属性，确定"下一行"实现策略
- [ ] 6.2 `paste.ts::handleImagePaste`：插入图片后显式将选区设到图片之后；图片后无承载位时补空段落
- [ ] 6.3 测试：粘贴图片后光标在图片之后（行末场景 + 图片后有内容场景）
- [ ] 6.4 验证：`pnpm typecheck` + `pnpm test` 通过

## 7. 笔记编辑页布局：固定顶/底栏 + 内容滚动 + 大纲

- [ ] 7.1 `NoteEditorView.vue`：`.note-editor-root` 改 `height:100%`，header/footer 加 `flex-shrink:0`，`.note-editor-body` 设为唯一滚动容器（`overflow:auto`）
- [ ] 7.2 大纲 FAB 保持悬浮在内容区右下角且不随内容滚动；置于内容上层
- [ ] 7.3 大纲面板从文档开头改为锚定在 FAB 上方展开
- [ ] 7.4 `NoteEditorView.test.ts` 调整/新增断言（布局结构、面板存在性）
- [ ] 7.5 验证：`pnpm typecheck` + `pnpm test`（NoteEditorView）通过

## 8. Zen 模式内容回显

- [ ] 8.1 `ZenMode.vue`：删除本地 `title/content/tags` 空 ref，统一改用 `session.*`
- [ ] 8.2 `MarkdownEditor v-model`、`wordCount`、`outlineNodes`、`displayTitle`、`isEmpty`、标题编辑、退出 flush 全部基于 session
- [ ] 8.3 `ZenMode.test.ts`：进入 Zen 回显笔记内容、编辑写回同一笔记
- [ ] 8.4 验证：`pnpm typecheck` + `pnpm test`（ZenMode）通过

## 9. 笔记列表：进入 Zen 菜单 + 红色未保存徽章

- [ ] 9.1 `MainView.vue`：右键菜单"编辑"→"进入 Zen 模式"，`onContextEdit` 改为 `ui.navigateTo('zen', note.id, { mode:'main', noteId:null })`
- [ ] 9.2 `.note-card-draft-tag` 改红色底 + 浅色文字（含暗色模式对比度）
- [ ] 9.3 `MainView.test.ts`：菜单项文案/行为、徽章渲染断言
- [ ] 9.4 验证：`pnpm typecheck` + `pnpm test`（MainView）通过

## 10. 文档与归档准备

- [ ] 10.1 README 功能/设置说明更新（日志、清理保留天数、Zen 入口、快捷键）
- [ ] 10.2 全量回归：`pnpm typecheck` + `pnpm test` + `cargo test` 全绿（对照预存基线）
- [ ] 10.3 `openspec validate pending-features-and-bugfixes --strict` 通过
- [ ] 10.4 勾选 tasks 全部完成，准备归档
