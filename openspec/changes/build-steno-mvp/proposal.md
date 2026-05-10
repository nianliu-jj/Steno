## Why

Steno 需要从当前的 Tauri/Vue 应用壳推进到一个可运行的跨平台速记 MVP：用户在任何工作流中按下全局快捷键，即可快速写下想法、自动保存，并在便签、画布和 Zen 写作模式中继续整理。

这次变更把产品需求、桌面窗口模型、本地数据模型和前端关键体验统一成可实施规格，作为后续 Rust/Tauri、Vue 3、SQLite 开发与验收的依据。

## What Changes

- 建立 Steno 的桌面应用壳：默认无可见主窗口，常驻系统托盘/状态栏，提供菜单入口。
- 支持默认全局快捷键 `Cmd+Shift+N`（macOS）/ `Ctrl+Shift+N`（Windows/Linux）呼出速记浮窗，并预留可配置能力。
- 实现速记浮窗：单例窗口、始终置顶、可拖拽调整、Markdown 文本编辑、字数与保存状态、失焦自动保存并关闭。
- 实现置顶便签：每条笔记可钉到桌面成为独立置顶窗口，支持位置、尺寸、透明度、颜色和字体大小配置。
- 实现无限画布：用卡片组织笔记，支持拖拽、缩放、平移、搜索、标签过滤和视口内渲染。
- 实现 Zen 写作模式：全屏无干扰 Markdown 编辑，`Esc` 自动保存并返回上下文。
- 实现本地 SQLite 数据存储：`notes` 与 `settings` 表、CRUD 命令、标签解析、字数统计、自动备份。
- 实现全局搜索、设置界面、Markdown/PDF 导出入口。
- 补齐 Vue 3 + TypeScript + Pinia + Naive UI + UnoCSS 前端结构，以及 Rust 2024 + Tauri 2 后端模块边界。
- 不实现云同步、账号系统、多人协作、移动端和复杂富媒体附件；仅预留同步接口。

## Capabilities

### New Capabilities

- `app-shell`: 应用启动、托盘/状态栏菜单、全局快捷键、多窗口生命周期和跨平台窗口行为。
- `local-data`: SQLite 本地存储、笔记/设置数据模型、CRUD、标签解析、字数统计、备份和同步接口预留。
- `quick-capture`: 速记浮窗的 Markdown 编辑、自动保存、失焦关闭、空内容丢弃和单例策略。
- `sticky-notes`: 置顶便签窗口、实时同步、编辑模式、样式配置和窗口状态持久化。
- `infinite-canvas`: 无限画布的笔记卡片、拖拽排列、缩放平移、搜索过滤和视口渲染。
- `zen-writing`: 全屏 Zen 写作窗口、Markdown 编辑、退出保存和上下文恢复。
- `search-export-settings`: 全局搜索、设置管理、主题跟随、Markdown/PDF 导出和用户偏好配置。

### Modified Capabilities

- 无。当前 `openspec/specs/` 没有已生效规格，本次以新增能力建立 Steno MVP 合同。

## Impact

- Rust/Tauri：新增或重构 `src-tauri/src/db.rs`、`window_manager.rs`、`shortcut.rs`、`tray.rs`、`backup.rs`、`commands.rs`，并扩展 `Cargo.toml` 依赖。
- Tauri 配置：更新 `src-tauri/tauri.conf.json`、capabilities 权限、插件初始化与窗口 URL 路由。
- 前端：新增多入口/路由视图、核心组件、Pinia stores、Tauri API composables 和样式体系。
- 数据库：新增 `~/.steno/data.db` 与 `backup/` 目录，包含 `notes`、`settings` 表和迁移逻辑。
- 开发流程：新增可执行任务计划、测试策略、构建运行说明和 MVP 验收标准。
