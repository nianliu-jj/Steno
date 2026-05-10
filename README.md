# Steno

> 一款使用 Rust + Tauri + Vue 3 构建的跨平台桌面速记应用。
> Capture first, organize later, ship as Markdown.

中文 ｜ [English](./README.en_US.md)

## 简介

Steno 是一款本地优先的"桌面速记层"。它参考 FloatMemo 的"随处书写"体验，但更侧重桌面效率——常驻系统状态栏，按下全局快捷键即可在任何应用之上弹出浮窗记录想法，完成后自动保存，可后续整理到无限画布或固定为桌面便签。

**核心定位：** 你写代码、看视频、开会、聊天时突然想记一笔，Steno 让你不切换应用就能完成捕获，事后再用画布、Zen 模式整理成可读的 Markdown 文档。

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
├── src/                      # Vue 3 前端
│   ├── main.ts               # 应用入口
│   ├── App.vue               # 根组件
│   ├── env.d.ts              # 类型声明
│   ├── theme/                # 主题定义
│   └── styles/               # 全局样式
├── src-tauri/                # Rust 后端
│   ├── Cargo.toml            # Rust 依赖
│   ├── tauri.conf.json       # Tauri 配置（窗口、bundle、权限）
│   ├── build.rs              # 构建脚本
│   ├── src/
│   │   ├── main.rs           # 应用入口
│   │   └── lib.rs            # 业务库（暴露 run()）
│   └── icons/                # 应用图标
├── packages/                 # pnpm workspace 内部包
│   ├── utils/                # 通用工具
│   ├── hooks/                # 通用 hooks
│   ├── color/                # 颜色处理
│   ├── axios/                # HTTP 封装（保留）
│   ├── uno-preset/           # UnoCSS preset
│   └── scripts/              # sa CLI（commit/release/changelog）
├── build/                    # Vite 构建辅助
├── docs/                     # 需求文档与原型
└── public/                   # 静态资源
```

## 开发命令一览

| 命令 | 说明 |
|---|---|
| `pnpm dev` | 启动 Vite dev server（端口 1420） |
| `pnpm build` | 构建前端到 `dist/` |
| `pnpm tauri:dev` | 启动 Tauri 开发窗口（含 cargo build） |
| `pnpm tauri:build` | 生产打包应用 |
| `pnpm typecheck` | vue-tsc 类型检查 |
| `pnpm lint` | oxlint + eslint 检查与自动修复 |
| `pnpm fmt` | oxfmt 代码格式化 |
| `pnpm commit` | 交互式 Conventional Commits 提交 |
| `pnpm commit:zh` | 同上，中文提示 |
| `pnpm release` | 版本号 bump + changelog + commit + tag |
| `pnpm cleanup` | 清理 dist / node_modules |
| `pnpm update-pkg` | 更新依赖版本 |

## 文档

- 产品需求：[`docs/docs_requirements_steno-requirements.md`](./docs/docs_requirements_steno-requirements.md)
- OpenSpec 规范：[`docs/openspec_changes_define-steno-mvp_*.md`](./docs/)
- 高保真原型：`docs/steno-functional-prototype.html`、`docs/quicknote-*.html`
- 开发贡献指南：[CONTRIBUTING.md](./CONTRIBUTING.md)

## 路线图

| Phase | 内容 | 状态 |
|---|---|---|
| 0 | Tauri 壳 + 工程化骨架 | ✅ 已完成 |
| 0.5 | 文档与分支策略 | 🚧 进行中 |
| 1 | 状态栏 + 全局快捷键 + 浮窗速记 + 本地保存 + Inbox | ⏳ 计划中 |
| 2 | 置顶便签 + 无限画布 + 智能排列 | ⏳ |
| 3 | Zen 模式 + 全局搜索 + 主题完善 | ⏳ |
| 4 | Markdown 导出 + 隐私设置 + 跨平台打包 | ⏳ |

> **MVP 不含**：剪贴板历史、多人协作、云同步、AI 自动总结、移动端、复杂媒体笔记、插件市场。

## 许可证

[MIT](./LICENSE)
