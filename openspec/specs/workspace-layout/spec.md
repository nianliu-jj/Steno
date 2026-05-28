# workspace-layout Specification

## Purpose
TBD - created by archiving change migrate-packages-to-src. Update Purpose after archive.
## Requirements
### Requirement: 仓库不得保留 `packages/` workspace 子目录

仓库根目录 MUST 不存在 `packages/` 文件夹。所有原先以 `@sa/*` workspace 协议发布的源码 MUST 已被迁移到 `src/` 下相应模块，或在确认未被引用后删除。

#### Scenario: 仓库根目录不存在 packages

- **WHEN** 执行 `Test-Path D:/Steno/packages`
- **THEN** 返回 `False`

#### Scenario: pnpm workspace 不再声明 packages 通配

- **WHEN** 读取 `pnpm-workspace.yaml`
- **THEN** 文件中不再出现 `'packages/*'` 这一行（`packages:` 字段为空数组或整字段删除）

### Requirement: `package.json` 不得保留 `@sa/*` workspace 依赖

`package.json` 的 `dependencies` 与 `devDependencies` MUST 不含任何 `@sa/axios`、`@sa/color`、`@sa/hooks`、`@sa/utils`、`@sa/scripts`、`@sa/uno-preset` 等以 `workspace:*` 协议声明的字段。同时 MUST 不含任何 `@soybeanjs/*` 命名空间的 npm 包（包括但不限于 `@soybeanjs/changelog`、`@soybeanjs/eslint-config-vue`、`@soybeanjs/eslint-config`、`@soybeanjs/cli`）。

#### Scenario: 检查 package.json 不再依赖 @sa 包

- **WHEN** 在 `package.json` 中搜索字符串 `"@sa/"`
- **THEN** 没有任何匹配

#### Scenario: 检查 package.json 不再依赖 @soybeanjs 包

- **WHEN** 在 `package.json` 中搜索字符串 `"@soybeanjs/"`
- **THEN** 没有任何匹配

#### Scenario: pnpm-lock.yaml 同步刷新

- **WHEN** 执行 `pnpm install`
- **THEN** `pnpm-lock.yaml` 中不再出现 `@sa/` 命名的本地 workspace 项目导入，也不再出现 `@soybeanjs/` 顶层依赖入口

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

### Requirement: `src/scripts/changelog` 提供 changelog 生成器

项目的 changelog 生成能力 MUST 由 `src/scripts/changelog/index.ts` 导出，并由 `src/scripts/commands/changelog.ts` 与 `src/scripts/types/index.ts` 通过相对路径引用，不得再依赖任何 `@soybeanjs/changelog` 包。

#### Scenario: changelog 模块入口文件存在

- **WHEN** 执行 `Test-Path D:/Steno/src/scripts/changelog/index.ts`
- **THEN** 返回 `True`

#### Scenario: 公开 API 完整

- **WHEN** 读取 `src/scripts/changelog/index.ts`
- **THEN** 文件以 `export` 形式提供 `generateChangelog`、`generateTotalChangelog`、`getChangelogMarkdown`、`getTotalChangelogMarkdown` 四个函数，并导出 `ChangelogOption` 类型

#### Scenario: 消费者使用本地引用

- **WHEN** 在 `src/scripts/commands/changelog.ts` 与 `src/scripts/types/index.ts` 中搜索 `@soybeanjs/changelog`
- **THEN** 没有任何匹配

#### Scenario: changelog CLI 命令可执行

- **WHEN** 执行 `pnpm tsx src/scripts/bin.ts changelog --help`
- **THEN** 命令以退出码 0 终止，输出包含 `generate changelog` 描述

### Requirement: `src/eslint` 提供 ESLint flat config 工厂

项目的 ESLint 配置 MUST 由 `src/eslint/index.ts` 导出 `defineConfig(overrides?)` 函数，由仓库根目录的 `eslint.config.js` 通过相对路径导入。

#### Scenario: eslint 模块入口文件存在

- **WHEN** 执行 `Test-Path D:/Steno/src/eslint/index.ts`
- **THEN** 返回 `True`

#### Scenario: defineConfig 接口签名稳定

- **WHEN** 读取 `src/eslint/index.ts`
- **THEN** 文件导出名为 `defineConfig`、接收可选 `overrides` 参数、返回 `Promise<Config[]>` 类型的异步函数

#### Scenario: eslint.config.js 走本地引用

- **WHEN** 读取 `eslint.config.js`
- **THEN** 文件中 `defineConfig` 由相对路径（如 `./src/eslint`）导入，不再出现 `@soybeanjs/eslint-config-vue`

#### Scenario: lint 行为零变化

- **WHEN** 执行 `pnpm lint`
- **THEN** 命令以退出码 0 终止；warning 总数与改造前完全一致；每个 warning 的文件路径、行号、规则名与改造前完全一致

### Requirement: UnoCSS 预设与 c12 配置名禁止使用 soybean 字样

`src/uno-preset/index.ts` 中 UnoCSS Preset 的 `name` 字段 MUST 为 `'preset-steno'`；`src/scripts/config/index.ts` 中 c12 `loadConfig` 调用的 `name` 字段 MUST 为 `'steno'`。

#### Scenario: UnoCSS preset 名为 steno

- **WHEN** 在 `src/uno-preset/index.ts` 中搜索 `preset-soybean-admin`
- **THEN** 没有任何匹配；且文件中包含 `name: 'preset-steno'`

#### Scenario: c12 配置名为 steno

- **WHEN** 在 `src/scripts/config/index.ts` 中搜索字符串 `'soybean'`
- **THEN** 没有任何匹配；且文件中包含 `name: 'steno'`

### Requirement: 历史 `@soybeanjs/*` 命名空间彻底废弃

迁移完成后，仓库源文件 MUST 不存在任何 `from '@soybeanjs/...'` 或 `require('@soybeanjs/...')` 形式的引用（`agentignore/`、`pnpm-lock.yaml` 与 `openspec/changes/archive/` 下的归档文档除外）。

#### Scenario: 主仓库源代码不再引用 @soybeanjs

- **WHEN** 在仓库根目录（排除 `node_modules`、`agentignore`、`pnpm-lock.yaml`、`openspec/changes/archive/`）执行全文搜索 `@soybeanjs/`
- **THEN** 命中数为 0

