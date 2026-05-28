## 1. 准备与基线快照

- [x] 1.1 运行 `pnpm install --frozen-lockfile`，确认起点稳定
- [x] 1.2 运行 `pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm lint` 并记录基线：typecheck 0 error；test 3 failed / 214 passed / 11 skipped（pre-existing）；build 成功；lint 0 errors / 9 warnings + 警告清单文件名+行号
- [x] 1.3 复制 `node_modules/@soybeanjs/changelog/dist/index.js` 与 `node_modules/@soybeanjs/eslint-config-vue/dist/index.js` 全文到本地，作为内联还原的源真相

## 2. 内联 `@soybeanjs/changelog` 到 `src/scripts/changelog/`

- [x] 2.1 在根 `package.json` 的 `devDependencies` 中追加 `cli-progress` (3.12.0)、`convert-gitmoji` (0.1.5)、`ofetch` (1.5.1)、`semver` (7.7.3)、`@types/cli-progress` (^3.11.6)、`@types/semver` (^7.7.1)
- [x] 2.2 运行 `pnpm install` 同步 lockfile，验证 6 个包安装成功
- [x] 2.3 创建 `src/scripts/changelog/` 目录与 8 个文件骨架：`types.ts`、`constants.ts`、`git.ts`、`parse.ts`、`github.ts`、`markdown.ts`、`options.ts`、`index.ts`
- [x] 2.4 把 changelog dist 中 `src/types.d.ts` region 反推为 `types.ts`，导出 `ChangelogOption`、`GitCommit`、`Reference`、`ResolvedAuthor`、`RawGitCommit`、`GitCommitAuthor`、`GithubConfig` 接口
- [x] 2.5 把 dist 中常量（默认 types map、默认 titles、emoji map）抽到 `constants.ts`
- [x] 2.6 把 dist 中 git 工具函数（execa 包装 `git log` / `git tag` / `git rev-parse`）抽到 `git.ts`
- [x] 2.7 把 dist 中 commit 解析逻辑（regex parse、references 提取、breaking 检测）抽到 `parse.ts`
- [x] 2.8 把 dist 中 GitHub API 调用（ofetch + token + 作者 login 解析）抽到 `github.ts`
- [x] 2.9 把 dist 中 markdown 渲染（dayjs 日期、convert-gitmoji 转换、按 type 分组、emoji 标题）抽到 `markdown.ts`
- [x] 2.10 把 dist 中默认 options 合并逻辑抽到 `options.ts`
- [x] 2.11 在 `index.ts` 装配并导出 4 个公开函数：`getChangelogMarkdown`、`getTotalChangelogMarkdown`、`generateChangelog`、`generateTotalChangelog`
- [x] 2.12 修改 `src/scripts/commands/changelog.ts`：`from '@soybeanjs/changelog'` → `from '../changelog'`
- [x] 2.13 修改 `src/scripts/types/index.ts`：`from '@soybeanjs/changelog'` → `from '../changelog'`（或 `'../changelog/types'`）
- [x] 2.14 运行 `pnpm typecheck`：必须 0 error
- [x] 2.15 运行 `pnpm tsx src/scripts/bin.ts changelog --help`：必须输出 `generate changelog` 描述，退出码 0
- [x] 2.16 git 提交（中文）：`refactor(changelog): 内联 @soybeanjs/changelog 实现到 src/scripts/changelog`

## 3. 内联 `@soybeanjs/eslint-config-vue` 到 `src/eslint/`

- [x] 3.1 在根 `package.json` 的 `devDependencies` 中追加 `@typescript-eslint/eslint-plugin` (^8.59.2)、`@typescript-eslint/parser` (^8.59.2)、`eslint-plugin-vue` (^10.9.1)
- [x] 3.2 运行 `pnpm install`：验证 3 个包安装；注意 `pnpm-lock.yaml` 中 @soybeanjs/eslint-config-vue 仍会出现（先内联代码、最后 Phase 4 才删依赖）
- [x] 3.3 创建 `src/eslint/` 目录与 4 个文件骨架：`shared.ts`、`ts-rules.ts`、`vue-rules.ts`、`index.ts`
- [x] 3.4 把 `interopDefault` 函数抽到 `shared.ts`
- [x] 3.5 把 dist 中 `tsRules` 对象（约 50 条 @typescript-eslint/* 规则配置）抽到 `ts-rules.ts`，导出为 `tsRules` 常量
- [x] 3.6 把 dist 中 vue 规则（vue/* 系列约 30 条规则）抽到 `vue-rules.ts`，导出为构造函数 `buildVueRules(pluginVue)`（因为需要 pluginVue.configs 在运行时合并）
- [x] 3.7 在 `src/eslint/index.ts` 装配并导出 `defineConfig(overrides?: Record<string, any>): Promise<Config[]>`
- [x] 3.8 修改 `eslint.config.js`：`from '@soybeanjs/eslint-config-vue'` → `from './src/eslint'`（或 `./src/eslint/index.ts`）
- [x] 3.9 运行 `pnpm lint`：对比基线，warning 数量与位置必须完全一致（0 errors, 9 warnings，三个文件同位置同规则）
- [x] 3.10 如有规则飘移：定位差异规则，对照 dist 修正 `src/eslint/*.ts`
- [x] 3.11 git 提交（中文）：`refactor(eslint): 内联 @soybeanjs/eslint-config-vue 实现到 src/eslint`

## 4. 重命名 soybean 字样为 steno

- [x] 4.1 修改 `src/uno-preset/index.ts`：`name: 'preset-soybean-admin'` → `name: 'preset-steno'`
- [x] 4.2 修改 `src/scripts/config/index.ts`：`name: 'soybean'` → `name: 'steno'`
- [x] 4.3 运行 `pnpm build`：验证 UnoCSS 仍生效（产物 CSS 仍含 `ellipsis` 等 shortcut 派生类）
- [x] 4.4 运行 `pnpm typecheck`、`pnpm lint`：0 error / warning 数量不变
- [x] 4.5 git 提交（中文）：`refactor(brand): 重命名 UnoCSS preset 与 c12 配置为 steno`

## 5. 删除 `@soybeanjs/*` 依赖

- [x] 5.1 从 `package.json` 的 `devDependencies` 中删除 `"@soybeanjs/changelog"` 与 `"@soybeanjs/eslint-config-vue"` 两行
- [x] 5.2 运行 `pnpm install`：lockfile 自动移除 `@soybeanjs/changelog`、`@soybeanjs/eslint-config-vue`、`@soybeanjs/eslint-config@1.7.5` 三个 entry
- [x] 5.3 全文搜索仓库（排除 `node_modules`、`agentignore`、`pnpm-lock.yaml`、`openspec/changes/archive/`）中 `@soybeanjs/` 命中数为 0；`soybeanjs` 与 `soybean` 命中也仅出现在归档文档中
- [x] 5.4 运行 `pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm lint`、`pnpm tsx src/scripts/bin.ts --help`、`pnpm tsx src/scripts/bin.ts changelog --help` 全部通过
- [x] 5.5 git 提交（中文）：`refactor(deps): 删除 @soybeanjs/* 依赖并完成内联`

## 6. openspec 归档

- [x] 6.1 勾选 `openspec/changes/inline-soybeanjs-deps/tasks.md` 全部任务
- [x] 6.2 运行 `openspec validate inline-soybeanjs-deps`
- [x] 6.3 运行 `openspec archive inline-soybeanjs-deps --yes`
- [x] 6.4 git 提交（中文）：`docs(openspec): 归档 inline-soybeanjs-deps`
