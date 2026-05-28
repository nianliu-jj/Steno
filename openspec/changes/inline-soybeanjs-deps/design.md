## Context

- `eslint.config.js` 是 ESM flat config 入口，调用 `await defineConfig({...})` 返回一个 `Config[]` 数组。defineConfig 内部聚合：①TS 推荐规则；②Vue essential/strongly-recommended/recommended 规则；③一组项目特有的微调（block-order、prop-name-casing、custom-event-name-casing 等）；④允许用户传入 overrides 覆盖最终 rules 对象。
- `src/scripts/commands/changelog.ts` 调用 `generateChangelog` / `generateTotalChangelog`；`src/scripts/types/index.ts` 用 `ChangelogOption` 做 CLI 配置类型。Release/changelog 命令实际在本项目仅作为占位（项目尚未发版），但 CLI 命令必须可被执行（`--help` / 帮助输出无报错）。
- `@soybeanjs/changelog` 的 dist/index.js 约 576 行（minified-ish ESM），从源码角度可拆为：①commit 解析（regex parse subject/scope/breaking、body 中的 BREAKING CHANGE 抓取、issue/PR 引用提取）；②git 工具（execa 调用 `git log` / `git tag` / `git rev-parse`）；③GitHub 作者解析（ofetch 调 GitHub API，按 commit SHA 查 login）；④Markdown 渲染（dayjs 格式化日期、convert-gitmoji 转换 emoji、按 type/scope 分组）；⑤总 changelog 模式（遍历所有 tag，cli-progress 显示进度条）；⑥写文件（fs/promises 与 existsSync）。
- `@soybeanjs/eslint-config-vue` 的 dist/index.js 仅 136 行，没有任何 `@soybeanjs/*` 运行时引用——它通过 `interopDefault(import(...))` 拉取 eslint-plugin-vue / vue-eslint-parser / @typescript-eslint/eslint-plugin 三个上游包并组装 flat config。
- `@soybeanjs/eslint-config@1.7.5` 出现在 lockfile 中是因为它被列为 `@soybeanjs/changelog` 的 dev/runtime dependency，但 `changelog/dist/index.js` 没有任何 `@soybeanjs/eslint-config` 引用 → 这只是 npm 包元数据噪音，删除 `@soybeanjs/changelog` 后自动消失。
- 项目当前 lint 规则的实际行为：会产出 9 个 warning（HTMLTextAreaElement undefined、custom-event-name-casing、HTMLSelectElement undefined），这是迁移基线，新内联实现必须保持该基线（不多不少）。

## Goals / Non-Goals

**Goals:**
- 用 `src/scripts/changelog/` 中的本地实现替代 `@soybeanjs/changelog`，对外 API（4 个 exports + ChangelogOption 类型）保持完全一致
- 用 `src/eslint/` 中的本地实现替代 `@soybeanjs/eslint-config-vue`，`defineConfig(overrides)` 接口签名与 rule 集合保持完全一致；运行 lint 后 9 个 warning 与改造前完全一致
- 删除 `package.json` 中 2 条 `@soybeanjs/*` 依赖；pnpm-lock.yaml 自动清理 `@soybeanjs/eslint-config@1.7.5` 子图
- 重命名 UnoCSS preset 与 c12 配置名为 `steno`
- 保证 `pnpm tsx src/scripts/bin.ts changelog` 至少能执行 `--help` 输出而不报错（实际生成 changelog 需要 git tag，不在本验证范围）

**Non-Goals:**
- 不重写或精简 changelog 内部算法（gitmoji 转换、GitHub 作者解析等"奇技淫巧"全部保留以确保行为一致）
- 不调整任何 lint 规则的取值（包括项目当前已有的 9 个 warning，必须维持原状）
- 不调整 commit-msg / pre-commit 钩子链路
- 不引入新的 changelog/lint 工具替代（如 changesets、antfu/eslint-config）
- 不处理 `agentignore/.worktrees/*` 中其它分支的同名问题

## Decisions

### 1. 从 dist 反推还原为可读 TS 源，而非直接复制 dist

- `@soybeanjs/eslint-config-vue/dist/index.js` 是 unminified ESM，可读性高 → 直接转换为 `src/eslint/index.ts` 并保留原结构（`interopDefault` 辅助 + `defineConfig` 主体）
- `@soybeanjs/changelog/dist/index.js` 也是 unminified（576 行），通过 `//#region src/xxx.ts` 注释保留了原模块边界 → 按 region 拆分为多个 TS 文件，恢复源码结构（types、commit 解析、git、github、markdown、changelog 主入口）

**理由**：保留可读性以便未来维护；按 region 拆分而不是一坨 600 行，符合 file-cohesion 原则；同时把 `// @ts-ignore` 等编译产物形式的代码恢复成正常 TS。

**替代方案**：直接 `cp dist/index.js src/scripts/changelog/index.js`。被否决：dist 是 build 产物，包含编译标记、未类型化，项目其余代码全部是 TS，混入 JS 破坏一致性。

### 2. `src/scripts/changelog/` 拆分粒度

按上游 region 注释还原拆分为：

| 文件 | 来源 region | 职责 |
|---|---|---|
| `src/scripts/changelog/types.ts` | `src/types.d.ts` | `ChangelogOption`、`GitCommit`、`Reference`、`ResolvedAuthor` 等接口 |
| `src/scripts/changelog/constants.ts` | `src/constants.ts` | 默认 types map（feat/fix/...）、默认 title 文案、默认 emoji 表 |
| `src/scripts/changelog/git.ts` | `src/git.ts` | 调 execa 跑 git log / tag / show 等命令的封装 |
| `src/scripts/changelog/parse.ts` | `src/parse.ts` | commit message 的 regex 解析（subject、scope、breaking、references） |
| `src/scripts/changelog/github.ts` | `src/github.ts` | 调 ofetch + GitHub REST API 解析作者 login |
| `src/scripts/changelog/markdown.ts` | `src/markdown.ts` | 按 type 分组、dayjs 格式化日期、convert-gitmoji 转换、emoji 标题渲染 |
| `src/scripts/changelog/options.ts` | `src/options.ts` | `loadOptions(partial)` 合并默认值 + 项目 cwd 探测 |
| `src/scripts/changelog/index.ts` | `src/index.ts` | 导出 `generateChangelog`、`generateTotalChangelog`、`getChangelogMarkdown`、`getTotalChangelogMarkdown` 4 个公开 API |

`src/scripts/commands/changelog.ts` 与 `src/scripts/types/index.ts` 的 import 路径改成 `'../changelog'`（相对路径）。

### 3. `src/eslint/` 拆分粒度

`@soybeanjs/eslint-config-vue` 只有 136 行，但 rules 块庞大。拆分为：

| 文件 | 职责 |
|---|---|
| `src/eslint/shared.ts` | `interopDefault` 辅助 |
| `src/eslint/ts-rules.ts` | TS 规则对象（about 50 条），从 `tsRules` 表达式提取为常量 |
| `src/eslint/vue-rules.ts` | Vue 规则对象（about 30 条），从 `vueRules` 与 pluginVue 内置 configs 合并的结果提取 |
| `src/eslint/index.ts` | `defineConfig(overrides)` 主入口，组合 plugins + parsers + rules |

`eslint.config.js` 顶部 `import { defineConfig } from '@soybeanjs/eslint-config-vue'` → 改为 `import { defineConfig } from './src/eslint/index.ts'`。注意 `eslint.config.js` 本身是 `.js` 文件（不是 TS），但 ESLint 10+ 支持 import TS 文件（通过 jiti loader），同时本项目根 tsconfig 包含 src/**，所以 `./src/eslint/index.ts` 路径合法。

### 4. 新增依赖的版本对齐

外部包版本直接对齐 SoybeanAdmin 源 package.json 中声明的版本（除非根项目已有更高版本则不降级）：

| 包 | 用于 | 版本 | 备注 |
|---|---|---|---|
| `cli-progress` | changelog 进度条 | `3.12.0` | 新增 |
| `convert-gitmoji` | changelog emoji 转换 | `0.1.5` | 新增 |
| `ofetch` | changelog GitHub API 调用 | `1.5.1` | 新增 |
| `semver` | changelog 版本号比较 | `7.7.3` | 新增 |
| `@typescript-eslint/eslint-plugin` | eslint TS 规则 | `^8.59.2` | 与 pnpm-lock 现有版本对齐 |
| `@typescript-eslint/parser` | eslint TS 解析器 | `^8.59.2` | 与 pnpm-lock 现有版本对齐 |
| `eslint-plugin-vue` | eslint Vue 规则 | `^10.9.1` | 与 pnpm-lock 现有版本对齐 |
| `@types/cli-progress` | TS 类型 | `^3.11.6` | devDep |
| `@types/semver` | TS 类型 | `^7.7.1` | devDep |

**理由**：与 `pnpm-lock.yaml` 中 `@soybeanjs/*` 现有传递解析版本一致 → 行为可复制；如果版本飘移，可能引发 lint warning 数量变化。

### 5. 重命名 `preset-soybean-admin` → `preset-steno`、`soybean` → `steno`

- `src/uno-preset/index.ts` 中 `Preset.name` 仅用于 UnoCSS 内部调试日志与 devtools 显示，无外部消费者，安全改名。
- `src/scripts/config/index.ts` 中 c12 的 `name: 'soybean'` 决定 c12 查找哪些用户配置文件（`soybean.config.{ts,js,mjs,json}`、`.soybeanrc.{ts,js,json}`、package.json 中 `soybean` 字段）。项目仓库不存在任何此类配置文件 → 改成 `name: 'steno'` 不会丢功能。

### 6. ESLint 测试策略：lint 基线对齐

不写新的 unit test。改用基线对齐：迁移前后两次 `pnpm lint` 输出对比，必须保持 "0 errors, 9 warnings" + 警告文件路径与行号完全一致。这是最直观的"行为等价"证明。

## Risks / Trade-offs

- **风险 1**：`@soybeanjs/eslint-config-vue` 通过动态 `import()` 拉取 plugin，自实现版本可能因为打包/解析差异导致部分规则未生效。
  → **缓解**：迁移后立即跑 `pnpm lint`，对比 9 个 warning 是否完全一致；若数量或位置变化，立刻定位差异规则并修补。

- **风险 2**：changelog 内部对 GitHub API 的依赖（`ofetch` + 鉴权 token）在没有 `GITHUB_TOKEN` 环境变量时会降级。
  → **缓解**：项目未真正用到此功能（CLI 仅作为骨架），`--help` 通过即可视为成功；后续如真正发版再补 GITHUB_TOKEN 文档。

- **风险 3**：`@soybeanjs/changelog` 源 README 显示部分内部代码（如 git tag 排序）有 SemVer 比较，依赖 `semver` 包；如果 `semver` 版本不匹配可能引发解析差异。
  → **缓解**：版本号锁定为上游 `7.7.3`（与 lockfile 现有保持一致）。

- **风险 4**：`eslint.config.js` 是 `.js` 文件，import `./src/eslint/index.ts` 在某些版本 ESLint 下会失败。
  → **缓解**：项目 ESLint 版本是 10.0.3，flat config 默认通过 `jiti` 解析；提交前用 `pnpm lint` 实测；若失败则把 `src/eslint/index.ts` 改名为 `.js`（保留 JSDoc 类型注释）。

- **权衡**：内联后 `src/scripts/changelog/` 与 `src/eslint/` 共增加 ~712 行代码，提升仓库行数。代价是仓库变"重"；收益是依赖图从两个 soybean 包及其传递 graph（几十个 transitive deps）瘦身为 7 个直接 deps，且代码完全可审计、可改写。
