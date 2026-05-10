# Steno

> A cross-platform desktop quick-note app built with Rust + Tauri + Vue 3.
> Capture first, organize later, ship as Markdown.

[中文](./README.md) ｜ English

## What is Steno?

Steno is a local-first "desktop capture layer". Inspired by FloatMemo's "write anywhere" experience but tuned for desktop efficiency: it lives in the system tray, summons a floating editor on a global shortcut, and saves whatever you type so you can keep working in the app you were already in.

**Core idea:** when you're coding, watching a video, in a meeting or chatting and a thought hits, Steno lets you capture it without context-switching. You organize the captures later — on the infinite canvas, as sticky notes, or in Zen mode — and export to Markdown when you're done.

## Features

- 🌌 **Tray-resident** — no main window, just a tray icon waiting quietly
- ⚡ **Global shortcut** — pop a floating editor over any app (target latency < 150ms)
- 📝 **Floating quick-note** — lightweight editor, Markdown shortcuts, autosave
- 📌 **Pinned sticky notes** — pin any note to the desktop, multiple at once, adjustable opacity
- 🗺 **Infinite canvas** — drag, zoom, pan cards; smart-arrange by tag/pin/time
- 🧘 **Zen writing mode** — distraction-free fullscreen for shaping notes into long-form content
- 🌗 **Light / Dark / System** themes with configurable accent color
- 🔒 **Local-first** — all data lives in a local SQLite, nothing uploaded by default
- 📤 **Markdown export** — single note, canvas group, or full archive

## Stack

| Layer | Tech |
|---|---|
| Desktop shell | [Tauri 2](https://tauri.app/) |
| Backend | Rust 2024 + tokio + rusqlite |
| Frontend | Vue 3 (Composition API) + TypeScript + Vite 7 |
| UI | [Naive UI](https://www.naiveui.com/) + [UnoCSS](https://unocss.dev/) |
| State | [Pinia](https://pinia.vuejs.org/) |
| Tooling | pnpm monorepo + oxlint + oxfmt + simple-git-hooks |

## Quick start

### Prerequisites

- Node.js >= 20.19.0
- pnpm >= 10.5.0
- Rust >= 1.85 (cargo, rustc)
- Windows: MSVC C++ Build Tools + Windows 10/11 SDK + WebView2 Runtime
- macOS: Xcode Command Line Tools
- Linux: see [Tauri Linux prerequisites](https://v2.tauri.app/start/prerequisites/#linux)

### Develop

```bash
pnpm install
pnpm tauri:dev    # first run takes 1-3 min to compile rust deps
```

### Build

```bash
pnpm tauri:build  # output in src-tauri/target/release/bundle/
```

### Quality

```bash
pnpm typecheck
pnpm lint
pnpm fmt
```

## Documentation

- Product requirements (zh): [`docs/docs_requirements_steno-requirements.md`](./docs/docs_requirements_steno-requirements.md)
- OpenSpec MVP definition: `docs/openspec_changes_define-steno-mvp_*.md`
- High-fidelity prototypes: `docs/steno-functional-prototype.html`, `docs/quicknote-*.html`
- Contributor guide: [CONTRIBUTING.md](./CONTRIBUTING.md)

## Roadmap

| Phase | Scope | Status |
|---|---|---|
| 0 | Tauri shell + tooling baseline | ✅ done |
| 0.5 | Docs + branch strategy | 🚧 in progress |
| 1 | Tray + global shortcut + floating editor + local save + Inbox | ⏳ |
| 2 | Pinned sticky notes + infinite canvas + smart arrange | ⏳ |
| 3 | Zen mode + global search + theme polish | ⏳ |
| 4 | Markdown export + privacy settings + cross-platform packaging | ⏳ |

> **Out of MVP scope:** clipboard history, real-time collaboration, cloud sync, AI summarization, mobile, rich media notes, plugin marketplace.

## License

[MIT](./LICENSE)

---

> Translation of the Chinese README is intentionally lean. Open an issue if a section is unclear or under-translated.
