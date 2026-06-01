# Clipboard Image Preview Implementation Plan

> **For agentic workers:** 按步骤执行，每完成一个步骤后使用中文提交信息提交相关变更。

**Goal:** 在 Steno 粘贴板页中稳定预览系统剪贴板图片，并保证图片条目可复制回系统剪贴板。

**Architecture:** 沿用现有粘贴板模块：Rust 后端通过 `arboard` 读取系统剪贴板，文本无有效条目时读取图片 RGBA 数据，编码为 PNG data URL 存入 SQLite；前端 `ClipboardView` 根据 `contentType === "image"` 渲染 `<img>` 缩略图。参考 PicViewer `simp/src/app/clipboard.rs` 的 arboard RGBA 读写模式，但不引入图片查看器的缩放、编辑和多格式加载管线。

**Tech Stack:** Tauri 2、Rust 2024、arboard、image、base64、Vue 3、Pinia、Vitest。

---

## File Structure

- Modify `openspec/changes/add-clipboard-image-preview/tasks.md`
  - 跟踪执行计划、实现和验证状态。
- Modify `src-tauri/src/clipboard.rs`
  - 补齐图片 data URL 条目的测试覆盖。
- Modify `src/views/ClipboardView.test.ts`
  - 补齐图片条目渲染为 `<img>` 的测试覆盖。

---

## Task 1: OpenSpec Requirement

- [x] 创建 `openspec/changes/add-clipboard-image-preview/`。
- [x] 编写 `proposal.md`、`design.md`、`tasks.md`。
- [x] 提交：`docs: 添加剪贴板图片预览需求文档`。

## Task 2: Superpowers Execution Plan

- [x] 创建本文档，记录实现边界、文件结构和分步计划。
- [x] 更新 OpenSpec tasks 中执行计划状态。
- [x] 提交计划文档。

## Task 3: Backend Verification

- [x] 检查 `src-tauri/src/clipboard.rs` 现有实现：
  - `entry_from_system_clipboard()` 能读取图片。
  - `image_data_url()` 能把 RGBA 编码为 PNG data URL。
  - `write_entry_to_system_clipboard()` 能把 data URL 解码并写回系统剪贴板。
- [x] 补充或调整 Rust 单元测试，明确图片条目必须保存 data URL、`preview`、`image:` hash 和 `size_bytes`。
- [x] 运行 `cargo test --manifest-path src-tauri/Cargo.toml clipboard::tests --lib`。
- [x] 提交后端测试/实现变更。

## Task 4: Frontend Preview Test

- [x] 在 `src/views/ClipboardView.test.ts` 增加图片条目用例。
- [x] 断言图片条目渲染 `<img alt="剪贴板图片预览">`，`src` 等于 data URL，且不渲染普通文本 `<pre>`。
- [x] 运行 `pnpm vitest run src/views/ClipboardView.test.ts`。
- [x] 提交前端测试/实现变更。

## Task 5: Final Verification

- [x] 运行前端相关测试。
- [x] 运行 Rust 相关测试。
- [x] 检查 `git status --short`，确认只剩用户既有未跟踪参考文档。
- [x] 更新 OpenSpec tasks 为完成状态并提交。
