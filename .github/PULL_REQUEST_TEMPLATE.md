## 变更描述

<!-- 简要说明本次 PR 做了什么，解决了什么问题。一两句话即可。 -->


## 关联 Issue

<!-- 写 "Closes #123" 或 "Refs #123"；没有关联可写 N/A -->
Closes #

## 变更类型

- [ ] feat — 新功能
- [ ] fix — bug 修复
- [ ] docs — 文档变动
- [ ] style — 格式调整（不影响逻辑）
- [ ] refactor — 重构
- [ ] perf — 性能优化
- [ ] test — 测试相关
- [ ] chore — 构建 / 依赖 / 辅助工具

## 影响范围

- [ ] 后端 (`src-tauri/`)
- [ ] 前端 (`src/`)
- [ ] 数据库
- [ ] 窗口管理
- [ ] 全局快捷键 / 托盘
- [ ] 工程化 (vite / tsconfig / packages 等)
- [ ] 文档

## 测试方法

<!-- 列出复现 / 验证步骤，让 reviewer 能在本地走一遍 -->

- [ ] `pnpm tauri:dev` 启动应用，验证 ...
- [ ] 在浮窗中执行 ... 操作，预期 ...
- [ ] 关闭再打开应用，验证 ...

## 截图 / 录屏

<!-- UI 改动必填；纯后端可省 -->


## Checklist

- [ ] 我的 commit 遵循 Conventional Commits 规范，并通过了 `pnpm sa git-commit-verify`
- [ ] 我跑过了 `pnpm typecheck` 与 `pnpm lint`，没有新增警告或错误
- [ ] 涉及 Rust 改动时，我跑过了 `cargo fmt` 和 `cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings`
- [ ] 我已添加 / 更新必要的注释（解释 *为什么*，不是 *做了什么*）
- [ ] 我已更新 README、CONTRIBUTING 或相关文档（如有需要）
- [ ] 我没有 commit 任何敏感信息（凭据、token、本地路径等）
- [ ] 这是一个聚焦的 PR：没有夹带无关的格式化或依赖升级

## 给 Reviewer 的提示

<!-- 哪些地方需要重点看？哪些是已知妥协？哪些后续 PR 会跟进？ -->
