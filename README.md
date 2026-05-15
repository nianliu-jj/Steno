# Steno

> 一款使用 Rust + Tauri + Vue 3 构建的跨平台桌面速记应用。
> Capture first, organize later, ship as Markdown.

中文 ｜ [English](./README.en_US.md)

## 简介

Steno 是一款本地优先的"桌面速记层"。它具有"随处书写"体验，但更侧重桌面效率——常驻系统状态栏，按下全局快捷键即可在任何应用之上弹出浮窗记录想法，完成后自动保存，可后续整理到无限画布或固定为桌面便签。

**核心定位：** 你写代码、看视频、开会、聊天时突然想记一笔，Steno 让你不切换应用就能完成捕获，事后再用画布、Zen 模式整理成可读的 Markdown 文档。

当前主窗口采用统一工作台布局：自定义标题栏、侧边导航和内容区共用一个壳层。"新建笔记"进入主窗口编辑页，"新建速记"继续打开速记浮窗；粘贴板、待办、截图、OCR、翻译目前为占位页。

## 特性

- 🌌 **常驻状态栏** —— 启动后无主窗口，仅托盘图标待命，不打扰当前工作
- ⚡ **全局快捷键呼出** —— 任何应用中按下即可弹出浮窗（默认呼出延迟 < 150ms）
- 📝 **浮窗速记** —— 轻量编辑器，支持 Markdown 快捷语法，自动保存
- 📌 **置顶便签** —— 任意笔记可"钉"在桌面，多窗口、可调透明度
- 🗺 **无限画布** —— 自由排列、缩放、平移卡片，支持智能排列与标签过滤
- 🧘 **Zen 写作** —— 全屏无干扰模式，把零散素材整理成长文
- 🌗 **Light / Dark / System 主题** —— 跟随系统，可配置强调色
- 🔒 **本地优先** —— 所有数据保存在本机 SQLite，默认不上传任何内容
- 📤 **Markdown 导出** —— 单条、画布分组或全部数据一键导出

## 技术栈

| 层 | 技术 |
|---|---|
| 桌面壳 | [Tauri 2](https://tauri.app/) |
| 后端 | Rust 2024 + tokio + rusqlite |
| 前端 | Vue 3 (Composition API) + TypeScript + Vite 7 |
| UI | [Naive UI](https://www.naiveui.com/) + [UnoCSS](https://unocss.dev/) |
| 状态 | [Pinia](https://pinia.vuejs.org/) |
| 工具 | pnpm monorepo + oxlint + oxfmt + simple-git-hooks |

## 快速开始

### 环境要求

- Node.js >= 20.19.0
- pnpm >= 10.5.0
- Rust >= 1.85（含 cargo、rustc）
- Windows 用户：MSVC C++ Build Tools + Windows 10/11 SDK + WebView2 Runtime
- macOS 用户：Xcode Command Line Tools
- Linux 用户：参考 [Tauri 系统依赖](https://v2.tauri.app/start/prerequisites/#linux)

### 开发

```bash
# 安装依赖（已配置 npmmirror 加速）
pnpm install

# 启动开发模式（首次约 1-3 分钟编译 Rust 依赖）
pnpm tauri:dev

# 仅启动前端（不打开 Tauri 窗口）
pnpm dev
```

### 构建

```bash
# 生产构建（产物在 src-tauri/target/release/bundle/）
pnpm tauri:build
```

### 质量检查

```bash
pnpm typecheck   # vue-tsc 类型检查
pnpm lint        # oxlint + eslint
pnpm fmt         # oxfmt 代码格式化
```

## 项目结构

```
steno/
├── src/                       # Vue 3 前端
│   ├── main.ts                # 应用入口（挂 Pinia + Naive UI）
│   ├── App.vue                # 根组件：按 ui.mode 路由到各视图
│   ├── env.d.ts
│   ├── components/
│   │   ├── FloatingEditor.vue # 速记浮窗（label=quicknote）
│   │   ├── StickyNote.vue     # 置顶便签（label=sticky-{id}）
│   │   ├── Canvas.vue         # 无限画布核心
│   │   ├── MainWorkbenchShell.vue # 主窗口工作台壳层
│   │   └── MarkdownEditor.vue # textarea + 工具栏 + 预览
│   ├── views/
│   │   ├── MainView.vue       # 主窗口笔记列表内容页
│   │   ├── NoteEditorView.vue # 主窗口内笔记编辑页
│   │   ├── CanvasView.vue     # canvas 入口容器
│   │   ├── ZenMode.vue        # 全屏写作
│   │   ├── SearchView.vue     # 全局搜索
│   │   ├── SettingsView.vue   # 主题/快捷键/浮窗/备份/数据目录
│   │   └── PlaceholderView.vue # 粘贴板/待办/截图/OCR/翻译占位页
│   ├── composables/
│   │   ├── useDb.ts           # Tauri invoke 类型化封装
│   │   ├── useWindow.ts       # 窗口控制 + 失焦监听
│   │   ├── useAutosave.ts     # 1s 防抖保存调度
│   │   └── useMarkdown.ts     # marked 渲染 + CJK 字数 + #tag 提取
│   ├── stores/
│   │   ├── ui.ts              # 当前窗口承担的 WindowMode
│   │   ├── notes.ts           # 笔记缓存 + CRUD
│   │   └── settings.ts        # 设置 reactive view-model
│   ├── types/steno.ts         # 与 Rust models 对齐的 DTO
│   ├── theme/ · styles/
├── src-tauri/                 # Rust 后端
│   ├── Cargo.toml
│   ├── tauri.conf.json        # 窗口、bundle、CSP
│   ├── capabilities/          # 权限白名单（窗口 label 通配 + core 权限）
│   ├── src/
│   │   ├── main.rs            # 薄入口，调 lib::run()
│   │   ├── lib.rs             # 注册插件、commands、tray、setup
│   │   ├── db.rs              # SQLite 连接 + notes/settings CRUD + 派生
│   │   ├── models.rs          # DTO（serde camelCase）
│   │   ├── commands.rs        # 所有 #[tauri::command] 边界
│   │   ├── window_manager.rs  # 多窗口创建/聚焦
│   │   ├── quicknote.rs       # 速记浮窗 toggle 逻辑
│   │   ├── shortcut.rs        # 全局快捷键注册 + 重载
│   │   ├── tray.rs            # 系统托盘 + 菜单
│   │   ├── export.rs          # Markdown 导出 + PDF 适配器
│   │   ├── backup.rs          # SQLite 文件备份触发
│   │   └── sync.rs            # 同步 trait + 本地 no-op
│   └── icons/
├── packages/                  # pnpm workspace 内部包（保留自模板）
├── build/                     # Vite 构建辅助
├── docs/                      # 需求文档与原型
├── openspec/                  # OpenSpec 变更跟踪
└── public/
```

## 数据目录

启动后 Steno 把所有数据放在用户主目录下：

| 路径 | 说明 |
|---|---|
| `~/.steno/data.db` | SQLite 数据库，`notes` 和 `settings` 两张表 |
| `~/.steno/backup/` | 每累计 N 次修改（默认 10）触发一次的 `.db` 副本 |
| `~/.steno/exports/` | Markdown 导出文件落点（`<title>-<short_id>.md`） |

数据目录可在「设置 → 存储区域」查看并复制完整路径。MVP 不提供"迁移到自定义目录"，未来可在设置中补充。

## 开发命令一览

| 命令 | 说明 |
|---|---|
| `pnpm dev` | 启动 Vite dev server（端口 21420） |
| `pnpm build` | `vue-tsc --noEmit` + 构建前端到 `dist/` |
| `pnpm tauri:dev` | 启动 Tauri 开发窗口（含 cargo build） |
| `pnpm tauri:build` | 生产打包应用 |
| `pnpm typecheck` | vue-tsc 类型检查 |
| `pnpm lint` | oxlint + eslint 检查与自动修复 |
| `pnpm fmt` | oxfmt 代码格式化 |
| `cargo check` | （在 `src-tauri/`）Rust 编译检查 |
| `cargo test` | （在 `src-tauri/`）db / shortcut / export / backup 单元测试 |
| `pnpm commit` | 交互式 Conventional Commits 提交 |
| `pnpm commit:zh` | 同上，中文提示 |
| `pnpm release` | 版本号 bump + changelog + commit + tag |
| `pnpm cleanup` | 清理 dist / node_modules |
| `pnpm update-pkg` | 更新依赖版本 |

## 手动验收清单

参考 `openspec/changes/build-steno-mvp/tasks.md` Task 9.3。逐项试一遍即可覆盖 MVP 所有 user-facing 行为：

1. 托盘：左键单击呼出主窗口；右键看到「新建速记 / 显示主窗口 / 显示置顶便签 / 打开画布 / 搜索笔记 / 设置 / 退出 Steno」。
2. 全局快捷键：`Ctrl+Shift+N` 显示/隐藏主窗口；`Ctrl+Shift+M` 呼出速记浮窗（在其他应用全屏下也生效）。
3. 浮窗速记：输入内容停手 1 秒看到「已保存 HH:MM:SS」；空白内容关闭不写库；置顶按钮把当前内容固定为便签。
4. 置顶便签：双击切阅读/编辑；改透明度/颜色/字号；拖动改位置；重启 app 后便签按原位置/外观恢复。
5. 主窗口工作台：自定义标题栏可拖动窗口；侧边导航可切到笔记列表、画布、搜索、设置，以及粘贴板/待办/截图/OCR/翻译占位页。
6. 主窗口编辑页：点击"新建笔记"进入主窗口编辑页；点击列表中的"编辑"也进入主窗口编辑页；点击"新建速记"仍只打开浮窗。
7. 画布：拖背景平移、滚轮缩放、拖卡片改位置并落库；搜索/标签过滤生效；双击卡片内联编辑。
8. Zen：从搜索进入 Zen；写作 1 秒自动保存；Esc 退出；导出菜单拿到 `.md` 路径。
9. 搜索：自动 focus；标签 chips 多选 AND 过滤；编辑/置顶/导出/删除按钮可用。
10. 设置：主题切换立即生效；快捷键改后输入框失焦立即重新注册到 OS；浮窗尺寸/失焦延迟改完下次浮窗生效；存储区域显示三条路径并可复制。
11. 导出：Markdown 落到 `~/.steno/exports/<title>-<short_id>.md`；PDF 弹"PDF 适配器不可用"提示而不崩。
12. 备份：累计 10 次保存后 `~/.steno/backup/` 出现 `data-<timestamp>.db`。

## 文档

- 产品需求：[`docs/docs_requirements_steno-requirements.md`](./docs/docs_requirements_steno-requirements.md)
- OpenSpec 规范：[`docs/openspec_changes_define-steno-mvp_*.md`](./docs/)
- 高保真原型：`docs/steno-functional-prototype.html`、`docs/quicknote-*.html`
- 开发贡献指南：[CONTRIBUTING.md](./CONTRIBUTING.md)

## 路线图

| Phase | 内容 | 状态 |
|---|---|---|
| 0 | Tauri 壳 + 工程化骨架 | ✅ 已完成 |
| 0.5 | 文档与分支策略 | ✅ 已完成 |
| 1 | 状态栏 + 全局快捷键 + 浮窗速记 + 本地保存 + Inbox | ✅ 已完成 |
| 2 | 置顶便签 + 无限画布 + 智能排列 | ✅ 已完成（智能排列：网格初始 + 拖动落库） |
| 3 | Zen 模式 + 全局搜索 + 主题完善 | ✅ 已完成 |
| 4 | Markdown 导出 + 隐私设置 + 跨平台打包 | 🚧 Markdown ✅ ／ PDF 适配器待选型 ／ 打包验证待做 |

> **MVP 不含**：剪贴板历史、多人协作、云同步、AI 自动总结、移动端、复杂媒体笔记、插件市场。
> **MVP 留白**：见 `openspec/changes/build-steno-mvp/follow-ups.md`。
