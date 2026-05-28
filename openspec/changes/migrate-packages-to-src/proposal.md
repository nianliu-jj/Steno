## Why

项目当前 `packages/` 目录下保留了 SoybeanAdmin 模板遗留的 6 个 workspace 子包（`@sa/axios`、`@sa/color`、`@sa/hooks`、`@sa/utils`、`@sa/scripts`、`@sa/uno-preset`），其中只有 2 个被实际引用，其余 4 个的源码在 `src/` 中没有任何 import，属于死代码。维护一个庞大却不被使用的 workspace 子目录会增加心智负担、拖慢安装与类型检查、并误导后续贡献者去引用不应使用的工具函数。本次重构清理这部分残留，使依赖关系真实、目录结构与项目定位（单体 Tauri 桌面应用）保持一致。

## What Changes

- 将真实被引用的 2 个子包源码迁入 `src/` 体系：
  - `@sa/uno-preset` → `src/uno-preset/`（被 `uno.config.ts` 引用）
  - `@sa/scripts` → `src/scripts/`（被 `package.json` 的 `sa` CLI 命令引用，包含 `cleanup` / `git-commit` / `git-commit-verify` / `release` / `changelog` / `update-pkg`）
- 删除 4 个无引用的子包：`packages/axios`、`packages/color`、`packages/hooks`、`packages/utils`
- 更新所有引用者：
  - `uno.config.ts`：将 `from '@sa/uno-preset'` 改为新的相对/别名路径
  - `package.json`：移除 `@sa/*` workspace 依赖声明，重写 `sa` CLI 入口（由 `tsx src/scripts/bin.ts` 之类的本地路径执行）
  - `pnpm-workspace.yaml`：移除 `packages/*` workspace 通配
- **BREAKING**：删除整个 `packages/` 目录及其下所有 `node_modules`；`@sa/*` 命名空间彻底废弃，后续不可再 import
- 保留 `sa` CLI 命令对外形为不变（`pnpm commit` / `pnpm release` / `pnpm cleanup` 等接口不动），仅替换内部实现位置
- 验证：`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm commit -h` 等命令在删除后仍正常工作

## Capabilities

### New Capabilities
- `workspace-layout`: 描述项目目录拓扑的契约——禁止 `packages/` workspace、所有源代码与构建脚本归属 `src/`、CLI 工具入口通过 `src/scripts/bin.ts` 暴露、UnoCSS 预设由 `src/uno-preset` 提供。

### Modified Capabilities
<!-- 无 -->

## Impact

- **目录结构**：移除顶层 `packages/`；新增 `src/uno-preset/`、`src/scripts/`
- **依赖声明**：`package.json` 删除 6 个 `workspace:*` 依赖；`pnpm-workspace.yaml` 移除 `packages/*` 通配
- **构建配置**：`uno.config.ts` 改导入路径；`package.json` 的 `bin` / `scripts` 中 `sa` 命令重写为本地 `tsx` 入口
- **类型检查**：`tsconfig.json` 若有 `paths` 指向 `@sa/*` 需同步更新或移除
- **CI/Git Hooks**：`simple-git-hooks` 中 `pnpm sa git-commit-verify` 调用链不变，但底层文件位置变化，需要回归测试 commit-msg 流程
- **下游影响**：当前 `agentignore/.worktrees/*` 中其它分支仍然引用 `@sa/*`，不在本次范围（独立 worktree 不影响主分支构建）
