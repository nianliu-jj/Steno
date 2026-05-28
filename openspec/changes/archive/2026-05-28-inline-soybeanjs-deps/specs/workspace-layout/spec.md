## MODIFIED Requirements

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

## ADDED Requirements

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
