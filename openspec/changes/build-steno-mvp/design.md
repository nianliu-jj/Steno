## Context

Steno 当前已经有 Tauri 2 + Vue 3 + TypeScript 的基础工程，Rust 端已有托盘、全局快捷键和主窗口显示/隐藏的早期模块。项目目标是把这个壳推进为跨平台桌面速记 MVP：启动后常驻后台，用户通过托盘或全局快捷键唤起轻量速记浮窗，内容自动保存到本地 SQLite，并可整理为置顶便签、无限画布卡片或 Zen 写作稿。

技术约束为 Rust 2024 stable、Tauri 2.x、tokio、SQLite、Vue 3 Composition API、TypeScript、Vite、Naive UI、UnoCSS 和 Pinia。MVP 必须本地优先，不需要账号和云同步，但要预留同步接口边界。所有文档和用户可见文本使用中文。

## Goals / Non-Goals

**Goals:**

- 建立可运行项目结构，覆盖 Rust 后端模块、Tauri 权限配置、Vue 多视图入口、核心组件、stores 和 composables。
- 实现完整捕获闭环：托盘/状态栏待命、全局快捷键呼出、速记浮窗编辑、自动保存、空内容丢弃、失焦关闭。
- 实现整理闭环：笔记列表、置顶便签窗口、无限画布、Zen 写作、全局搜索、标签过滤和导出。
- 使用 SQLite 作为本地事实源，保存笔记、设置、窗口配置、画布位置和备份状态。
- 保持跨平台窗口策略：macOS、Windows、Linux 使用同一业务模型，仅在快捷键和托盘细节上分支。

**Non-Goals:**

- 不实现云同步、账号系统、多人协作、移动端、插件市场和复杂媒体附件。
- 不在 MVP 中实现完整 WYSIWYG 富文本编辑器；优先使用 Markdown textarea + marked 渲染/预览。
- 不强制实现真实 PDF 排版引擎；PDF 导出可先用前端打印或 Tauri shell 调用作为可替换适配器。

## Decisions

### Decision 1: 使用 rusqlite + Tauri state 管理数据库

选择 `rusqlite` 而不是 `tauri-plugin-sql` 作为 MVP 数据库层。Rust 端统一暴露 typed commands，前端不直接拼 SQL，便于控制迁移、备份、标签解析和未来同步队列。

备选方案 `tauri-plugin-sql` 能减少 Rust CRUD 代码，但会让业务规则分散到前端，并提高后续迁移和备份的一致性风险。MVP 使用 `tokio::task::spawn_blocking` 包装 SQLite 阻塞操作，并通过 `Arc<Mutex<Connection>>` 或短连接池保证简单可靠。

### Decision 2: 多窗口共用前端入口，用路由参数区分模式

Tauri 窗口统一加载 Vite `index.html`，通过 hash 路由或 query 参数区分 `main`、`floating`、`sticky`、`canvas`、`zen`、`search` 和 `settings`。这样避免维护多个 HTML 入口，同时能共享 Pinia、主题和组件库。

浮窗和便签窗口使用唯一 label：`quick-capture` 作为速记单例，`sticky-{note_id}` 作为便签多实例，`canvas`、`zen-{note_id}`、`search` 和 `settings` 为独立窗口。窗口创建和定位由 Rust `window_manager.rs` 负责。

### Decision 3: Markdown textarea 作为 MVP 编辑器

MVP 使用 textarea + Markdown 快捷工具栏 + marked 渲染预览，不引入 tiptap/vditor 的复杂编辑模型。这样能快速覆盖粗体、斜体、列表、代码块和标签识别，保持浮窗轻量。

后续若需要块编辑、协同或复杂富文本，可在 `MarkdownEditor` 抽象下替换实现，不影响 SQLite 数据模型，因为数据库保存 Markdown 源码和可选 HTML 缓存。

### Decision 4: 笔记是唯一核心内容实体

MVP 只建 `notes` 和 `settings` 两张必要表。置顶便签、画布卡片、Zen 写作都引用 `notes.id`，通过 `is_pinned`、`pinned_window_config`、`canvas_position` 和 settings 中的工作区配置表达视图状态。

这个设计避免为便签、画布、草稿建立重复内容表。同步接口预留在 Rust trait 层，不改变本地数据模型。

### Decision 5: 自动保存与备份在后端集中执行

前端负责防抖触发保存，Rust 端负责最终空内容判断、字数统计、标签解析、更新时间、备份计数和备份文件创建。每天首次修改或累计 10 次修改触发一次 SQLite 文件备份到 `~/.steno/backup/`。

这样能确保浮窗、便签、画布和 Zen 模式的写入规则一致，也让未来同步或审计日志有统一入口。

## Risks / Trade-offs

- **全局快捷键跨平台差异** → 使用 Tauri global-shortcut 插件封装默认值，macOS 使用 `Cmd+Shift+N`，Windows/Linux 使用 `Ctrl+Shift+N`，设置页保存前尝试重新注册并反馈冲突。
- **失焦自动关闭可能误触** → 设置默认延迟 800ms，用户在设置中可调整或关闭；保存失败时窗口不关闭并显示错误。
- **textarea 编辑器能力有限** → MVP 优先可靠捕获；用组件边界隔离编辑器，后续可替换为 tiptap/vditor。
- **无限画布性能风险** → 使用 DOM 卡片 + transform 平移缩放 + 视口裁剪，先满足数千条笔记的交互，超大数据量后续再引入虚拟化索引。
- **SQLite 阻塞写入风险** → 后端把数据库操作放入 blocking 任务，前端防抖保存并显示“保存中/已保存/失败”状态。
- **PDF 导出跨平台一致性弱** → MVP 优先 Markdown 导出；PDF 作为适配器能力，允许用浏览器打印或外部工具，失败时明确提示。

## Migration Plan

1. 扩展 Rust 依赖：`rusqlite`、`tokio`、`uuid`、`chrono`、`dirs`、`pulldown-cmark` 或同类 Markdown 渲染库、`tauri-plugin-opener`/shell 能力。
2. 新增数据库初始化：应用启动时创建 `~/.steno/data.db`，执行 `notes`、`settings` 表迁移，并初始化默认设置。
3. 重构窗口管理：保留现有托盘与快捷键能力，把 `window.rs` 演进为 `window_manager.rs`，增加速记、便签、画布、Zen、搜索、设置窗口创建函数。
4. 引入前端目录结构：components、views、stores、composables、router 或轻量 hash mode。
5. 按捕获、便签、画布、Zen、搜索/设置/导出顺序增量实现并验证。
6. 回滚策略：每个任务以小提交推进；数据库迁移使用 `CREATE TABLE IF NOT EXISTS` 和兼容字段，不删除用户数据。

## Open Questions

- 默认失焦关闭延迟采用 800ms；如后续用户反馈误关闭，再在设置中提供更细粒度选项。
- PDF 导出的第一版实现采用前端打印还是外部工具适配器，可在实现阶段根据跨平台可用性选择。
- 是否需要在 MVP 中做窗口位置的多显示器 DPI 精准校正；第一版以 Tauri monitor API 的屏幕中心和鼠标所在屏为准。
