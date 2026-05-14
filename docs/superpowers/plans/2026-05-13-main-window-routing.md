# 主窗口路由实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 打开设置、画布、搜索和 Zen 写作时不再创建独立页面窗口，而是在主窗口内切换视图。

**Architecture:** Rust 端保留现有 `open_*_window` 命令名以兼容前端和托盘入口，但内部改为显示主窗口并向 `main` webview 发送导航事件。前端 `ui` store 接收事件并切换 `mode`/`noteId`；页面视图提供返回主界面的轻量能力。`quicknote` 和 `sticky-*` 保持独立窗口。

**Tech Stack:** Tauri 2、Rust、Vue 3、Pinia、Vitest。

---

### Task 1: 前端主窗口导航状态

**Files:**
- Create: `src/stores/ui.test.ts`
- Modify: `src/stores/ui.ts`

- [ ] **Step 1: Write the failing test**

新增 `src/stores/ui.test.ts`，mock Tauri window/event API，断言主窗口收到 `steno:navigate` 后切换页面，并且 Zen 会带上 `noteId`。

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/stores/ui.test.ts`
Expected: FAIL，因为 `ui` store 还没有监听 `steno:navigate`，也没有暴露 `navigateToMain`。

- [ ] **Step 3: Write minimal implementation**

在 `src/stores/ui.ts` 增加 `MainRouteMode`、`NavigationPayload`、`navigateTo()`、`navigateToMain()` 和 Tauri `listen('steno:navigate')` 监听；保留 label/hash 解析兜底。

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/stores/ui.test.ts`
Expected: PASS。

### Task 2: Rust 页面入口改为主窗口导航

**Files:**
- Modify: `src-tauri/src/window_manager.rs`
- Modify: `src-tauri/src/tray.rs`
- Modify: `src-tauri/capabilities/default.json`

- [ ] **Step 1: Write the failing test**

在 `src-tauri/src/window_manager.rs` 的单元测试中验证 `main_route_url("zen", Some("abc 123"))` 会得到 `index.html#zen?id=abc+123`，并验证 `main_route_url("canvas", None)` 得到 `index.html#canvas`。

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test --manifest-path src-tauri/Cargo.toml window_manager`
Expected: FAIL，因为 helper 尚不存在。

- [ ] **Step 3: Write minimal implementation**

删除 `ensure_single_window` 的创建页面窗口路径，新增 `navigate_main(app, mode, note_id)`：如果主窗口存在，显示、聚焦并 emit `steno:navigate`；如果主窗口不存在，使用 hash URL 创建 `main` 窗口。`open_canvas/open_search/open_settings/open_zen` 调用该 helper。更新托盘注释和 capability window 列表，移除 `canvas/search/settings/zen` 独立窗口标签。

- [ ] **Step 4: Run test to verify it passes**

Run: `cargo test --manifest-path src-tauri/Cargo.toml window_manager`
Expected: PASS。

### Task 3: 页面返回主视图

**Files:**
- Modify: `src/views/CanvasView.vue`
- Modify: `src/views/SearchView.vue`
- Modify: `src/views/SettingsView.vue`
- Modify: `src/views/ZenMode.vue`

- [ ] **Step 1: Write the failing test**

扩展 `src/stores/ui.test.ts`，验证调用 `navigateToMain()` 后 `mode` 回到 `main` 且 `noteId` 清空。

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/stores/ui.test.ts`
Expected: FAIL，因为返回方法尚未实现或未暴露。

- [ ] **Step 3: Write minimal implementation**

在四个页面的 header/toolbar 中引入 `useUiStore()`，用已有按钮风格增加“返回”按钮并调用 `ui.navigateToMain()`。Canvas 作为纯透传页时包一层容器，避免改动 `Canvas.vue` 内部逻辑。

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/stores/ui.test.ts`
Expected: PASS。

### Task 4: 全量验证

**Files:**
- Modify as needed only if verification exposes类型或格式问题。

- [ ] **Step 1: Run frontend typecheck**

Run: `pnpm typecheck`
Expected: exit 0。

- [ ] **Step 2: Run frontend build**

Run: `pnpm build`
Expected: exit 0。

- [ ] **Step 3: Run Rust tests**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: exit 0。

- [ ] **Step 4: Review git diff**

Run: `git diff --stat` and inspect touched files.
Expected: only routing-related files and this plan changed.
