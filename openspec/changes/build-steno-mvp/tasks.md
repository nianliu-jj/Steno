## 1. 工程依赖与应用配置

- [x] 1.1 更新 `package.json`，加入 Markdown 渲染、拖拽、类型检查和前端测试所需依赖。
- [x] 1.2 更新 `src-tauri/Cargo.toml`，加入 `tokio`、`rusqlite`、`uuid`、`chrono`、`dirs`、`pulldown-cmark` 和必要 Tauri 插件。
- [x] 1.3 更新 `src-tauri/tauri.conf.json`，配置无主窗口启动、多窗口安全策略、bundle 信息和开发 URL。
- [x] 1.4 更新 `src-tauri/capabilities/default.json`，允许核心窗口、事件、opener/shell、global-shortcut 和必要文件访问权限。

## 2. Rust 数据库与本地存储

- [x] 2.1 新建 `src-tauri/src/db.rs`，实现 `.steno/data.db` 路径解析、连接初始化和迁移。
- [x] 2.2 实现 `notes` 表 CRUD：创建/更新、读取、列表、搜索、删除、置顶状态、窗口配置和画布位置。
- [x] 2.3 实现 `settings` key-value CRUD，并在首次启动写入默认快捷键、浮窗尺寸、主题、保存延迟和备份策略。
- [x] 2.4 实现 Markdown HTML 缓存、标签解析、标题推导和字数统计。
- [x] 2.5 新建 `src-tauri/src/backup.rs`，实现每日或每 10 次修改的 SQLite 文件备份。
- [x] 2.6 新建 `src-tauri/src/sync.rs`，定义未来同步 trait，并提供不上传数据的本地 no-op 实现。

## 3. Rust 命令与窗口管理

- [x] 3.1 新建 `src-tauri/src/commands.rs`，暴露笔记、设置、导出和窗口操作的 Tauri commands。
- [x] 3.2 将 `src-tauri/src/window.rs` 演进为 `window_manager.rs`，实现速记、置顶便签、画布、Zen、搜索和设置窗口创建/聚焦。
- [x] 3.3 更新 `src-tauri/src/shortcut.rs`，按平台注册默认快捷键，并支持从设置重新注册和冲突反馈。
- [x] 3.4 更新 `src-tauri/src/tray.rs`，提供新建速记、显示置顶便签、打开画布、搜索、设置和退出菜单。
- [x] 3.5 更新 `src-tauri/src/lib.rs`，注册插件、state、commands、窗口事件和退出前保存逻辑。

## 4. 前端基础结构

- [x] 4.1 创建 `src/types`，定义 `Note`、`Settings`、`WindowConfig`、`CanvasPosition`、`SaveState` 等共享类型。
- [x] 4.2 创建 `src/composables/useDb.ts`，封装 Tauri `invoke` 调用和统一错误处理。
- [x] 4.3 创建 `src/composables/useWindow.ts`，封装当前窗口、失焦监听、窗口事件和关闭/聚焦操作。
- [x] 4.4 创建 `src/composables/useAutosave.ts`，提供 1 秒防抖保存、保存状态和失败重试入口。
- [x] 4.5 创建 Pinia stores：`notes`、`settings`、`ui`，缓存笔记列表、设置和当前窗口模式。
- [x] 4.6 改造 `src/main.ts` 与 `src/App.vue`，根据 hash/query 渲染不同视图，并挂载 Naive UI、Pinia 和全局主题。

## 5. 浮窗速记

- [x] 5.1 新建 `src/components/FloatingEditor.vue`，实现标题栏、关闭、置顶、Markdown textarea、预览、字数、保存时间和标签输入。
- [x] 5.2 实现速记浮窗自动聚焦、拖拽区域、默认尺寸、失焦延迟保存关闭和空内容丢弃。
- [x] 5.3 实现保存当前速记为置顶便签的前后端调用链。
- [x] 5.4 为速记浮窗补充组件级测试或手动验收脚本，覆盖自动保存、空内容丢弃和置顶。

## 6. 置顶便签

- [x] 6.1 新建 `src/components/StickyNote.vue`，实现阅读/编辑双模式、双击切换、实时保存和取消置顶。
- [x] 6.2 实现便签透明度、颜色、字体大小、窗口位置和尺寸持久化。
- [x] 6.3 在 Rust 启动流程中恢复已置顶笔记窗口。
- [x] 6.4 验证多便签同时存在且互不覆盖数据。

## 7. 无限画布

- [x] 7.1 新建 `src/components/Canvas.vue`，实现 DOM 卡片、transform 平移缩放和基础工具栏。
- [x] 7.2 实现卡片拖拽更新 `canvas_position`，并在重启后恢复。
- [x] 7.3 实现画布搜索、标签过滤、双击卡片编辑和钉住入口。
- [x] 7.4 实现视口裁剪渲染，保证大量卡片时交互流畅。

## 8. Zen、搜索、设置与导出

- [x] 8.1 新建 `src/views/ZenMode.vue`，实现全屏 Markdown 写作、自动保存、字数状态和 `Esc` 退出。
- [x] 8.2 新建 `src/views/SearchView.vue`，实现全局搜索、结果操作、打开编辑、钉住和进入 Zen。
- [x] 8.3 新建 `src/views/SettingsView.vue`，实现快捷键、浮窗、主题、编辑器、备份和数据目录配置。
- [x] 8.4 实现 Markdown 导出命令和前端入口，并提供 PDF 导出适配器失败提示。

## 9. 验证、文档与发布准备

- [x] 9.1 更新 README 和运行说明，描述完整目录结构、依赖、开发、构建和验收方式。
- [x] 9.2 运行 `pnpm typecheck`、`pnpm build`、`cargo test` 和 `cargo check`，修复发现的问题。
- [ ] 9.3 执行手动验收：托盘、快捷键、浮窗保存、置顶便签、画布、Zen、搜索、设置、导出和备份。
- [x] 9.4 记录跨平台差异和未完成事项，形成后续变更建议。
