## ADDED Requirements

### Requirement: 仓库不得保留 `packages/` workspace 子目录

仓库根目录 MUST 不存在 `packages/` 文件夹。所有原先以 `@sa/*` workspace 协议发布的源码 MUST 已被迁移到 `src/` 下相应模块，或在确认未被引用后删除。

#### Scenario: 仓库根目录不存在 packages

- **WHEN** 执行 `Test-Path D:/Steno/packages`
- **THEN** 返回 `False`

#### Scenario: pnpm workspace 不再声明 packages 通配

- **WHEN** 读取 `pnpm-workspace.yaml`
- **THEN** 文件中不再出现 `'packages/*'` 这一行（`packages:` 字段为空数组或整字段删除）

### Requirement: `package.json` 不得保留 `@sa/*` workspace 依赖

`package.json` 的 `dependencies` 与 `devDependencies` MUST 不含任何 `@sa/axios`、`@sa/color`、`@sa/hooks`、`@sa/utils`、`@sa/scripts`、`@sa/uno-preset` 等以 `workspace:*` 协议声明的字段。

#### Scenario: 检查 package.json 不再依赖 @sa 包

- **WHEN** 在 `package.json` 中搜索字符串 `"@sa/"`
- **THEN** 没有任何匹配

#### Scenario: pnpm-lock.yaml 同步刷新

- **WHEN** 执行 `pnpm install`
- **THEN** `pnpm-lock.yaml` 中不再出现 `@sa/` 命名的本地 workspace 项目导入

### Requirement: UnoCSS 预设由 `src/uno-preset` 模块提供

UnoCSS 的 `presetSoybeanAdmin` 函数 MUST 由 `src/uno-preset/index.ts`（或同等 `src/uno-preset` 子目录下的入口文件）导出，并被 `uno.config.ts` 通过相对路径或 `@/uno-preset` 别名导入。

#### Scenario: uno-preset 源文件位置

- **WHEN** 执行 `Test-Path D:/Steno/src/uno-preset/index.ts`
- **THEN** 返回 `True`

#### Scenario: uno.config.ts 引用本地预设

- **WHEN** 读取 `uno.config.ts`
- **THEN** 出现一行类似 `import { presetSoybeanAdmin } from './src/uno-preset'` 的引用，且不出现 `@sa/uno-preset`

#### Scenario: UnoCSS 在构建期成功载入预设

- **WHEN** 执行 `pnpm build`
- **THEN** 构建退出码为 0，且产出的 CSS 包含 `flex-center`、`absolute-center`、`ellipsis-text` 等预设 shortcut 类（通过抽样产物或专门测试验证）

### Requirement: CLI 工具 `sa` 由 `src/scripts` 模块提供

项目用于发版、提交校验、清理、changelog 的命令行入口 MUST 由 `src/scripts/bin.ts` 提供，并通过 `tsx` 在根 `package.json` 的 npm scripts 中显式调用，不得再依赖任何 `@sa/scripts` 包。

#### Scenario: scripts 入口文件存在

- **WHEN** 执行 `Test-Path D:/Steno/src/scripts/bin.ts`
- **THEN** 返回 `True`

#### Scenario: npm scripts 通过 tsx 直接调用本地入口

- **WHEN** 读取 `package.json` 的 `scripts` 字段
- **THEN** `commit` / `commit:zh` / `cleanup` / `release` / `update-pkg` 均以 `tsx src/scripts/bin.ts <command>` 形式调用，不再出现裸 `sa <command>`

#### Scenario: commit-msg 钩子链路

- **WHEN** 读取 `package.json` 的 `simple-git-hooks.commit-msg` 字段
- **THEN** 钩子命令使用 `pnpm tsx src/scripts/bin.ts git-commit-verify`（或等价的、不再依赖全局 `sa` bin 的调用形式）

#### Scenario: CLI 帮助输出 6 个子命令

- **WHEN** 执行 `pnpm tsx src/scripts/bin.ts --help`
- **THEN** 输出列表中至少包含 `cleanup`、`update-pkg`、`git-commit`、`git-commit-verify`、`changelog`、`release` 六个命令

### Requirement: 类型检查与测试套件迁移后无回归

迁移完成后，`pnpm typecheck`、`pnpm test`、`pnpm build` 三个命令 MUST 全部以退出码 0 终止，且终端不输出来自 `src/uno-preset` / `src/scripts` 的新错误或类型告警。

#### Scenario: typecheck 通过

- **WHEN** 执行 `pnpm typecheck`
- **THEN** 命令以退出码 0 退出，无 error 输出

#### Scenario: 单元测试通过

- **WHEN** 执行 `pnpm test`
- **THEN** 所有原本绿色的测试用例仍然通过；新增或迁移的代码若已有测试也通过

#### Scenario: 构建通过

- **WHEN** 执行 `pnpm build`
- **THEN** 构建以退出码 0 完成，产物目录正常生成

### Requirement: 历史 `@sa/*` 命名空间彻底废弃

迁移完成后，仓库源文件 MUST 不存在任何 `from '@sa/...'` 或 `require('@sa/...')` 形式的引用（agentignore 下的 worktree 副本除外）。

#### Scenario: 主仓库源代码不再引用 @sa

- **WHEN** 在仓库根目录（排除 `node_modules`、`agentignore`、`pnpm-lock.yaml`）执行全文搜索 `@sa/`
- **THEN** 命中数为 0
