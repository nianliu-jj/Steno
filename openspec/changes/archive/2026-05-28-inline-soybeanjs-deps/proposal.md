## Why

项目 `package.json` 仍然依赖两个 SoybeanAdmin 生态的 npm 包：`@soybeanjs/eslint-config-vue`（ESLint 配置工厂，被 `eslint.config.js` 使用）与 `@soybeanjs/changelog`（changelog 生成器，被 `src/scripts/commands/changelog.ts` 使用）。这两个包以及它们的传递依赖 `@soybeanjs/eslint-config@1.7.5` 是项目从 SoybeanAdmin 模板继承而来的最后一处"上游耦合"——一旦 npm 上发生包名变更、维护停滞或不可访问，项目的 lint 与 release 流程会同时受影响。本次重构把这两个包的全部实现内联到 `src/`，让项目摆脱 `@soybeanjs/*` 命名空间，同时把 UnoCSS 预设与 c12 配置名中残留的 `soybean` 字样改为 `steno`，让品牌一致性彻底归一。

## What Changes

- 把 `@soybeanjs/changelog` 的实现（约 576 行，含 git tag 比较、commit 解析、GitHub 作者解析、changelog markdown 生成）内联到 `src/scripts/changelog/`，导出 `generateChangelog`、`generateTotalChangelog`、`getChangelogMarkdown`、`getTotalChangelogMarkdown` 与类型 `ChangelogOption`
- 把 `@soybeanjs/eslint-config-vue` 的实现（约 136 行，含 TS 规则 + Vue 规则的 flat config 工厂）内联到 `src/eslint/`，导出 `defineConfig`
- 重写 `src/scripts/commands/changelog.ts`、`src/scripts/types/index.ts`、`eslint.config.js`，全部改为从本地路径导入
- 在根 `package.json` 的 `devDependencies` 中补齐 changelog 运行时缺失的 4 个外部包（`cli-progress`、`convert-gitmoji`、`ofetch`、`semver`）与 eslint-config 缺失的 3 个外部包（`@typescript-eslint/eslint-plugin`、`@typescript-eslint/parser`、`eslint-plugin-vue`）
- **BREAKING**：从 `package.json` 删除 `@soybeanjs/changelog`、`@soybeanjs/eslint-config-vue` 两条依赖；`@soybeanjs/eslint-config@1.7.5` 作为传递依赖自动从 lockfile 移除
- 把 `src/uno-preset/index.ts` 中 UnoCSS preset 的 `name: 'preset-soybean-admin'` 改为 `name: 'preset-steno'`
- 把 `src/scripts/config/index.ts` 中 c12 的 `name: 'soybean'` 改为 `name: 'steno'`
- 验证：`pnpm install`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm lint`、`pnpm tsx src/scripts/bin.ts --help`、`pnpm tsx src/scripts/bin.ts changelog --help` 全部通过；全文搜索 `@soybeanjs/` 与 `soybeanjs` 命中为零（归档文档与 pnpm-lock.yaml 移除痕迹除外）

## Capabilities

### New Capabilities
<!-- 无：本次改动属于既有 capability 的扩展 -->

### Modified Capabilities
- `workspace-layout`: 在已有的"`src/scripts` 提供 CLI 工具"基础上追加"`src/scripts/changelog` 提供 changelog 生成器、`src/eslint` 提供 ESLint flat config 工厂"两项要求；同时新增"仓库不得保留 `@soybeanjs/*` 命名空间任何依赖"与"UnoCSS 预设与 c12 配置名禁止使用 soybean 字样"两条要求。

## Impact

- **源码**：`src/scripts/changelog/`（约 8 个新文件）、`src/eslint/`（约 3 个新文件）；`eslint.config.js`、`src/scripts/commands/changelog.ts`、`src/scripts/types/index.ts`、`src/uno-preset/index.ts`、`src/scripts/config/index.ts` 共 5 个文件改写
- **依赖**：删除 2 条 `@soybeanjs/*`；新增 7 条外部包；lockfile 整体瘦身（`@soybeanjs/eslint-config@1.7.5` 的庞大子图移除）
- **构建/工具链**：`eslint.config.js` 失去原 defineConfig 接口的所有 overrides 路径，需要确认现有 overrides（`vue/component-name-in-template-casing`）仍以同样语义工作
- **流水线**：`pnpm commit`、`pnpm tsx src/scripts/bin.ts changelog`、`pnpm tsx src/scripts/bin.ts release` 等命令行为不变；commit-msg 钩子链路不动
- **品牌**：UnoCSS preset 名、c12 配置名变为 `steno`，无外部消费者，向后不兼容风险为零
