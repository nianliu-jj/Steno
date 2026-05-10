# 贡献指南

欢迎参与 Steno 开发。本文档说明仓库的分支策略、提交规范、PR 流程和代码审查要求。所有贡献者（包括 maintainer）都应遵守这些约定。

> 配套文档：[README.md](./README.md) 介绍项目本身；[PR 模板](./.github/PULL_REQUEST_TEMPLATE.md) 是发 PR 时自动填充的草稿。

---

## 1. 分支策略（GitFlow 简化版）

| 分支 | 角色 |
|---|---|
| `main` | 稳定生产分支，每次发布打 tag（`v0.1.0` 等） |
| `develop` | 主开发分支，所有 feature 合并于此 |
| `feature/<topic>` | 新功能分支，例：`feature/global-shortcut` |
| `fix/<topic>` | Bug 修复分支 |
| `release/<version>` | 发布准备分支（版本号 bump、文档定稿等） |
| `hotfix/<topic>` | 紧急修复，从 `main` 拉出，修完同时合入 `main` 和 `develop` |

**硬性规则：**

- 禁止直接向 `main` 或 `develop` push，必须通过 PR 合入
- PR 合入前需通过 CI（如有）+ 至少一名其他开发者审查
- 不允许 force-push 到 `main` / `develop`

---

## 2. Commit Message 规范（Conventional Commits）

格式：

```
<type>(<scope>): <subject>

[optional body]

[optional footer]
```

仓库已在 `commit-msg` 钩子中接入 `pnpm sa git-commit-verify` 自动校验，不规范的提交会被拒绝。

### type

| type | 含义 |
|---|---|
| `feat` | 新功能 |
| `fix` | bug 修复 |
| `docs` | 仅文档变动 |
| `style` | 格式调整（空格、分号、缩进），不影响逻辑 |
| `refactor` | 重构（既不是新功能也不是修复） |
| `perf` | 性能优化 |
| `test` | 添加或修正测试 |
| `chore` | 构建过程、依赖更新、辅助工具变动 |

### scope（建议但非强制）

| scope | 适用范围 |
|---|---|
| `tauri` | Rust 端 / `src-tauri/*` |
| `frontend` | Vue 端 / `src/*` |
| `db` | SQLite / 数据库相关 |
| `window` | 窗口管理（浮窗、便签、画布等） |
| `shortcut` | 全局快捷键 |
| `tray` | 系统托盘 |
| `store` | Pinia 状态管理 |
| `ui` | 样式 / 组件 UI |
| `scaffold` | 工程脚手架（vite/uno/tsconfig 等） |
| `deps` | 依赖更新 |

### subject

- 不超过 72 字符
- 使用祈使句（"add" 而不是 "added"）
- 首字母小写，结尾不加句号
- 中英文皆可，团队内部建议英文以便检索

### 示例

```
feat(window): implement floating editor auto-save on blur

Add 1s debounce to avoid excessive disk writes; persist via the
save_note tauri command.

Closes #12
```

```
fix(shortcut): release windows ctrl modifier on alt-tab

Reproduces only on Windows 11 build 26100+.
```

---

## 3. 提交频率

- 每个独立逻辑单元至少一次 commit
- 不允许提交未完成的半成品（除非在私有分支上 WIP；合入 PR 前应 squash 或 rebase 整理）
- 每个 commit 应保持仓库可编译、可运行（不破坏 main 路径）
- 大重构 / 删除模板等"骨架级"改动可分批 commit，方便回滚

---

## 4. Pull Request 流程

### 4.1 发起 PR

1. 从 `develop` 拉一个 `feature/*` 分支
2. 完成开发，本地通过 `pnpm typecheck` + `pnpm lint` + `pnpm tauri:dev` 验证
3. push 到自己 fork（或仓库的 feature 分支）
4. 在 GitHub 发起 PR，**目标分支选 `develop`**（hotfix 才选 `main`）
5. 按 [PR 模板](./.github/PULL_REQUEST_TEMPLATE.md) 填写：变更摘要、测试方法、关联 issue、影响范围、checklist

### 4.2 自动检查（CI 阶段）

| 类型 | 命令 |
|---|---|
| Rust 格式 | `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check` |
| Rust lint | `cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings` |
| Rust 测试 | `cargo test --manifest-path src-tauri/Cargo.toml` |
| 前端类型 | `pnpm typecheck` |
| 前端 lint | `pnpm lint` |
| 构建 | `pnpm tauri:build`（至少 dev 模式成功）|

> 当前 Phase 0.5 尚未配置 GitHub Actions；这些检查暂时通过本地 pre-commit hook 触发（`pnpm typecheck && pnpm lint`）。CI 配置作为后续提案。

### 4.3 人工审查

- 至少一名 **其他** 开发者批准
- 涉及核心模块（窗口管理 / 全局快捷键 / 数据库 / 安全）建议主要维护者审查
- 评审者提出意见 → 开发者修改并 push 新 commit → 评审者重审
- 所有对话解决后由审查者合入（squash merge 优先，保持 main / develop 历史线性）

---

## 5. 代码审查关注点

### 5.1 Rust 后端

- **错误处理**：使用 `Result` / `Option`，避免裸 `unwrap()` / `expect()`（除非明确不会出错并附注释）
- **线程安全**：tauri command 中是否需要 `Send + Sync`，是否合理使用 `tokio::spawn`
- **资源管理**：SQLite 连接池、窗口句柄、事件 listener 是否在 drop 时清理
- **跨平台**：路径用 `std::path::Path` 拼接，避免硬编码 `/` 或 `\`；托盘图标格式区分 macOS（.icns）/ Win/Linux（.ico/.png）
- **性能**：高频命令（如 auto-save）必须异步且不阻塞 UI 线程
- **`unsafe` 禁止**：除非来自 `std` 或底层库且充分论证

### 5.2 Vue 前端

- **组件设计**：单一职责，props/emits 类型清晰
- **响应式**：`ref` / `reactive` 使用是否正确，避免破坏响应性
- **类型安全**：所有 props/emits/store 使用 TypeScript，禁止 `any`（unknown 优先）
- **样式**：UnoCSS 原子类避免重复，深色模式用 `dark:` 前缀，颜色走 themeVars
- **生命周期**：`onUnmounted` 中清理事件监听、定时器、Tauri 事件回调
- **性能**：大列表（如画布卡片）使用虚拟滚动，避免一次性渲染过多 DOM

### 5.3 通用

- **安全**：Markdown 渲染必须配置 sanitize（防 XSS）；用户输入在写入 SQLite 前清理；窗口避免暴露危险权限
- **可维护**：复杂逻辑必须有注释说明 *为什么*（不是"做了什么"）；命名要语义化
- **测试覆盖**：核心路径（CRUD、快捷键触发、窗口创建）需要单元或 e2e 测试

---

## 6. 评审评论标记

| 标记 | 含义 |
|---|---|
| `[blocking]` | 必须修改，否则不应合并 |
| `[question]` | 请求澄清，可能需要讨论 |
| `[nitpick]` | 非强制建议，可后续优化 |
| `[praise]` | 亮点，鼓励 |

---

## 7. 禁止事项

- ❌ 未经审查直接合入（hotfix 紧急情况可事后补审，但需在 PR 中记录）
- ❌ PR 中混入与主题无关的格式化或依赖更新（应单独提 PR）
- ❌ 跳过 git hook（`--no-verify`）—— 钩子失败要修根因，不要绕过
- ❌ 强制推送到 `main` / `develop`
- ❌ 在仓库中提交 `.env*` 真实凭据、AI agent 本地配置（`.claude/` / `.codex/` 已 gitignore）

---

## 8. 辅助工具

| 工具 | 用途 |
|---|---|
| `simple-git-hooks` | pre-commit + commit-msg 钩子（已在 `pnpm install` 时自动注册）|
| `pnpm sa git-commit` | 交互式生成 Conventional Commits 提交（中英文可选） |
| `pnpm sa git-commit-verify` | commit-msg 钩子调用，校验提交格式 |
| `pnpm sa cleanup` | 清理 `dist/` 和 `node_modules/` |
| `pnpm sa release` | bump 版本号 + 生成 changelog + commit + tag |
| `pnpm sa update-pkg` | 升级 package.json 中的依赖版本 |
| `oxlint` + `eslint` | 前端 lint |
| `oxfmt` | 前端格式化 |
| `vue-tsc` | Vue + TS 类型检查 |
| `cargo fmt` + `cargo clippy` | Rust 格式与 lint |

---

## 9. 初次贡献流程示例

```bash
# 1. clone
git clone https://github.com/<owner>/steno.git
cd steno

# 2. 安装依赖（自动注册 git hooks）
pnpm install

# 3. 验证本地环境
pnpm tauri:dev   # 应弹出 Steno 窗口

# 4. 拉 feature 分支
git checkout develop && git pull
git checkout -b feature/my-awesome-thing

# 5. 开发 + 提交（hooks 会自动跑 typecheck + lint）
# ... 编码 ...
pnpm commit:zh   # 中文交互式提交（或直接 git commit -m "feat(...): ..."）

# 6. push + PR
git push -u origin feature/my-awesome-thing
gh pr create --base develop  # 或在 web 上发 PR
```

---

## 10. 联系与反馈

- Bug / Feature Request → GitHub Issues
- 设计与产品讨论 → Discussions（如启用）

感谢你的贡献 🍵
