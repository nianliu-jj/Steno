<p align="center">
  <img src="src-tauri/icons/128x128.png" alt="Steno Logo" width="96" height="96" />
</p>

<h1 align="center">Steno</h1>

<p align="center">
  <strong>A local-first desktop quick-note tool</strong><br />
  Built with Rust + Tauri 2 + Vue 3 · Capture first, organize later, ship as Markdown
</p>

<p align="center">
  <a href="#-quick-start">Quick Start</a> ·
  <a href="#-screenshots">Screenshots</a> ·
  <a href="#-features">Features</a> ·
  <a href="#-tech-stack">Tech Stack</a> ·
  <a href="#-support">Support</a>
</p>

<p align="center">
  <a href="./README.md">中文</a>
</p>

---

## 📖 What is Steno?

**Steno's core philosophy: capture first, organize later.**

When you're coding, watching a video, in a meeting, or chatting and a thought hits — press a global shortcut, and the quick-note window pops up over any app. It auto-saves after you stop typing. Later, organize everything on the infinite canvas or in Zen mode, then export as Markdown.

> It's the fast lane into your "second brain" — no context-switching, no friction.

The main window uses a unified workbench layout: custom titlebar, collapsible sidebar navigation, and content area in one shell. "New Note" opens the in-window editor; "New Quick Note" opens the floating window. Clipboard, Todo, Screenshot, OCR, and Translate modules are still on the roadmap.

---

## 🖼 Screenshots

### Main Window — Note List

> Unified note management: search, tag filtering, right-click actions, drag-to-reorder.

<p align="center">
  <img src="docs/screenshots/main-window.png" alt="Main Window" width="80%" />
</p>

### Quick-Note — Over Any App

> `Ctrl+Shift+M` to summon. Auto-saves 1s after you stop typing. Markdown shortcuts + `#tag` recognition.

<p align="center">
  <img src="docs/screenshots/quicknote-window.png" alt="Quick-Note Window" width="60%" />
</p>

### Infinite Canvas — Spatial Organization

> Freely drag, zoom, and pan note cards. Search and tag filtering. Double-click to edit in Zen.

<p align="center">
  <img src="docs/screenshots/canvas-view.png" alt="Infinite Canvas" width="80%" />
</p>

### Zen Mode — Distraction-Free Writing

> Fullscreen immersive writing environment with outline panel navigation. Esc to exit.

<p align="center">
  <img src="docs/screenshots/zen-mode.png" alt="Zen Mode" width="80%" />
</p>

### Settings Panel

> Theme switching, global shortcuts, floating window size, blur-close delay, data directory viewer.

<p align="center">
  <img src="docs/screenshots/settings-panel.png" alt="Settings Panel" width="80%" />
</p>

---

## ✨ Features

| | Feature | Description |
|---|---------|-------------|
| 🌌 | **Tray-Resident** | Only a tray icon after launch — no window clutter |
| ⚡ | **Global Shortcuts** | `Ctrl+Shift+N` toggle main window · `Ctrl+Shift+M` summon quick-note |
| 📝 | **Quick-Note** | Pops over any app, Markdown + `#tag` support, auto-save |
| 📌 | **Pinned Stickies** | Pin notes to desktop, multiple at once, adjustable opacity/color/font |
| 🗺 | **Infinite Canvas** | Drag, zoom, pan cards freely; tag filtering; double-click to edit |
| 🧘 | **Zen Mode** | Fullscreen distraction-free writing, outline navigation, Esc to exit |
| 🌗 | **Light/Dark/System Theme** | Follows OS preference, OKLCH uniform color space, instant switch |
| 🔒 | **Local-First** | All data in local SQLite (`~/.steno/data.db`), nothing uploaded |
| 📤 | **Markdown Export** | Single-note export with YAML frontmatter; HTML export with inline styles |

---

## 🚀 Quick Start

### Prerequisites

| Dependency | Minimum Version |
|------------|-----------------|
| Node.js | ≥ 20.19.0 |
| pnpm | ≥ 10.5.0 |
| Rust | ≥ 1.85 |

**Windows**: MSVC C++ Build Tools + Windows 10/11 SDK + WebView2 Runtime  
**macOS**: Xcode Command Line Tools  
**Linux**: See [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/#linux)

### Develop

```bash
# Install dependencies
pnpm install

# Start dev mode (first Rust compile takes ~1-3 min)
pnpm tauri:dev

# Frontend only (Vite dev server, no Tauri window)
pnpm dev
```

### Build

```bash
# Production build → src-tauri/target/release/bundle/
pnpm tauri:build
```

### Quality

```bash
pnpm typecheck   # vue-tsc --noEmit
pnpm lint        # oxlint + eslint --fix
pnpm fmt         # oxfmt
cd src-tauri && cargo test   # Rust unit tests
```

---

## 🧱 Tech Stack

| Layer | Tech |
|-------|------|
| Desktop Shell | [Tauri 2](https://tauri.app/) |
| Backend | Rust 2024 + tokio + rusqlite + pulldown-cmark |
| Frontend | Vue 3 (Composition API) + TypeScript + Vite 7 |
| UI | [Naive UI](https://www.naiveui.com/) + [UnoCSS](https://unocss.dev/) |
| Editor | [CodeMirror 6](https://codemirror.net/) + custom live-render decorations |
| State | [Pinia](https://pinia.vuejs.org/) |
| Tooling | pnpm monorepo + oxlint + oxfmt + simple-git-hooks |

---

## 📁 Project Structure

```
steno/
├── src/                          # Vue 3 frontend
│   ├── main.ts                   # App entry
│   ├── App.vue                   # Root: routes by WindowMode
│   ├── components/
│   │   ├── FloatingEditor.vue    # Quick-note / sticky dual-mode
│   │   ├── Canvas.vue            # Infinite canvas core
│   │   ├── MarkdownEditor.vue    # CodeMirror 6 + WYSIWYG
│   │   ├── MainWorkbenchShell.vue# Titlebar + sidebar + content shell
│   │   ├── DocumentOutlineTree.vue # Recursive outline tree
│   │   ├── MarkdownReadSurface.vue# Read-only MD render panel
│   │   └── markdown-editor/      # CM6 extensions, keymap, live-render
│   ├── views/
│   │   ├── MainView.vue          # Note card grid
│   │   ├── NoteEditorView.vue    # In-window note editor
│   │   ├── CanvasView.vue        # Canvas page container
│   │   ├── ZenMode.vue           # Fullscreen writing
│   │   ├── SettingsView.vue      # Settings panel
│   │   └── PlaceholderView.vue   # Coming-soon placeholder
│   ├── composables/              # Composition API hooks
│   ├── stores/                   # Pinia stores (ui, notes, settings)
│   └── types/steno.ts            # IPC DTO (aligned with Rust models)
│
├── src-tauri/                    # Rust backend
│   ├── src/
│   │   ├── lib.rs                # Tauri Builder entry
│   │   ├── db.rs                 # SQLite CRUD + migration
│   │   ├── models.rs             # IPC serialization DTOs
│   │   ├── commands.rs           # #[tauri::command] boundary
│   │   ├── window_manager.rs     # Multi-window management
│   │   ├── quicknote.rs          # Quick-note window toggle
│   │   ├── shortcut.rs           # Global shortcut registration
│   │   ├── tray.rs               # System tray + context menu
│   │   ├── export.rs             # Markdown / HTML / PDF export
│   │   ├── backup.rs             # SQLite file backup
│   │   └── sync.rs               # Sync trait (reserved)
│   └── Cargo.toml
│
├── packages/                     # pnpm workspace shared packages
├── docs/                         # Docs, prototypes, screenshots
└── openspec/                     # OpenSpec change tracking
```

---

## 📂 Data Directory

| Path | Description |
|------|-------------|
| `~/.steno/data.db` | SQLite database (`notes` + `settings` tables) |
| `~/.steno/backup/` | `.db` snapshots (every 10 mutations) |
| `~/.steno/exports/` | Exported Markdown / HTML files |

View and copy full paths under **Settings → Storage**.

---

## 🔧 Common Commands

| Command | Description |
|---------|-------------|
| `pnpm dev` | Vite dev server (port 21420) |
| `pnpm tauri:dev` | Tauri dev window |
| `pnpm tauri:build` | Production build |
| `pnpm typecheck` | `vue-tsc --noEmit` |
| `pnpm lint` | `oxlint + eslint --fix` |
| `pnpm fmt` | `oxfmt` |
| `cd src-tauri && cargo test` | Rust unit tests |

---

## 🗺 Roadmap

| Phase | Scope | Status |
|-------|-------|--------|
| 0 | Tauri shell + tooling | ✅ Done |
| 1 | Tray + global shortcuts + quick-note + local save | ✅ Done |
| 2 | Pinned stickies + infinite canvas | ✅ Done |
| 3 | Zen mode + search + light/dark theme | ✅ Done |
| 4 | Markdown export + settings + cross-platform packaging | 🚧 In Progress |

> **Out of MVP scope**: cloud sync, collaboration, AI, mobile, plugin marketplace. See [`openspec/changes/build-steno-mvp/follow-ups.md`](./openspec/changes/build-steno-mvp/follow-ups.md).

---

## 💙 Support

If Steno helps you, consider buying the developer a coffee ☕

<p align="center">
  <table align="center">
    <tr>
      <td align="center" width="50%">
        <img src="images/weichat.jpg" alt="WeChat" width="220" /><br />
        <strong>WeChat</strong>
      </td>
      <td align="center" width="50%">
        <img src="images/zhifubao.jpg" alt="Alipay" width="220" /><br />
        <strong>Alipay</strong>
      </td>
    </tr>
  </table>
</p>

---

## 📄 License

[MIT](./LICENSE) © Steno Contributors
