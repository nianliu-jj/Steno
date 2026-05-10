# Steno MVP 设计说明

## 背景

Steno 是一款跨平台桌面速记笔记软件，技术栈为 Rust 2024 + Tauri 2、Vue 3 + TypeScript、SQLite、Naive UI、UnoCSS 和 Pinia。当前仓库已有 Tauri/Vue 基础壳、托盘入口、全局快捷键和主窗口隐藏/显示逻辑。本轮目标不是继续停留在原型，而是把产品需求固定为可执行的 MVP 规格，并生成能逐步落地的工程计划。

需求合同来自 `openspec/changes/build-steno-mvp/`：

- `proposal.md`：说明为什么要做 Steno MVP，以及新增能力边界。
- `design.md`：说明 Rust/Tauri、SQLite、多窗口和 Vue 前端的核心技术决策。
- `specs/**/*.md`：把应用壳、本地数据、速记浮窗、置顶便签、无限画布、Zen 写作、搜索/导出/设置拆成可验收场景。
- `tasks.md`：OpenSpec 粒度的实现任务清单。

## 目标

- 建立完整可运行的 Steno MVP 项目结构。
- 用 SQLite 作为本地事实源，保存笔记、设置、便签窗口配置、画布位置和备份状态。
- 用 Tauri 多窗口承载速记浮窗、置顶便签、画布、Zen、搜索和设置。
- 用 Vue 3 组件和 Pinia stores 实现轻量 Markdown 编辑、自动保存、搜索过滤和画布交互。
- 保持本地优先，不实现账号、云同步、协作和复杂媒体附件。

## 推荐方案

采用“Rust 端集中业务规则 + Vue 端负责交互体验”的方案。

Rust 端负责：

- 数据库初始化、迁移、CRUD、标签解析、字数统计、Markdown HTML 缓存。
- 备份策略、导出适配器、未来同步 trait 的 no-op 实现。
- 托盘菜单、全局快捷键、多窗口创建、定位、聚焦和退出流程。

Vue 端负责：

- 根据 hash/query 渲染 `main`、`floating`、`sticky`、`canvas`、`zen`、`search`、`settings` 视图。
- 封装 Tauri commands、窗口事件、自动保存、主题和 UI 状态。
- 提供 `FloatingEditor.vue`、`StickyNote.vue`、`Canvas.vue` 等关键组件。

## 取舍

- 编辑器先用 textarea + Markdown 工具栏 + marked 预览，降低浮窗复杂度；后续可替换为 tiptap/vditor。
- 数据库先用 `rusqlite` 而不是前端 SQL 插件，避免 SQL 和业务规则散落在 UI 中。
- 无限画布先用 DOM + transform + 视口裁剪，优先可用和易调试；后续再引入更重的渲染引擎。
- PDF 导出作为适配器入口，MVP 先保证 Markdown 导出可靠，PDF 失败时给明确提示。

## 验收方式

- OpenSpec 校验：`openspec validate build-steno-mvp --strict`。
- Rust 校验：`cargo fmt --check`、`cargo test`、`cargo check`。
- 前端校验：`pnpm typecheck`、`pnpm build`。
- 手动验收：托盘待命、快捷键呼出、浮窗自动保存、置顶便签、多窗口状态、画布拖拽缩放、Zen 自动保存、搜索、设置、导出和备份。

## 自检结果

- 没有未决空项。
- 与 OpenSpec 能力拆分一致。
- MVP 范围不包含云同步、账号、协作、移动端和复杂媒体附件。
- 与当前仓库已有 Tauri/Vue 壳兼容。
