## 1. 准备与基线验证

- [ ] 1.1 运行 `pnpm install --frozen-lockfile`，确认当前 lockfile 与依赖结构稳定（基线快照）
- [ ] 1.2 运行 `pnpm typecheck` 与 `pnpm test`，记录基线绿色状态，作为后续回归对比
- [ ] 1.3 全文确认 `src/`、`uno.config.ts`、`package.json`、`pnpm-workspace.yaml`、`simple-git-hooks` 字段内所有 `@sa/*` 引用清单（写入 design 或保存到 PR 描述）

## 2. 迁移 `@sa/uno-preset` 到 `src/uno-preset/`

- [ ] 2.1 创建目录 `src/uno-preset/`，将 `packages/uno-preset/src/index.ts` 复制为 `src/uno-preset/index.ts`，保留 `// @unocss-include` 注释和 `presetSoybeanAdmin` 函数签名
- [ ] 2.2 修改 `uno.config.ts`：将 `import { presetSoybeanAdmin } from '@sa/uno-preset'` 改为 `import { presetSoybeanAdmin } from './src/uno-preset'`
- [ ] 2.3 运行 `pnpm typecheck` 与 `pnpm build`（仅 vite build 部分），确保 UnoCSS 预设仍然生效；如需要把 `@unocss/core`、`@unocss/preset-mini` 提升到根 devDependencies，则在 `package.json` 增补
- [ ] 2.4 git 提交：中文描述，例如 `refactor(uno): 迁移 uno-preset 到 src 目录`

## 3. 迁移 `@sa/scripts` 到 `src/scripts/`

- [ ] 3.1 在根 `package.json` 中追加 scripts 子包私有的 devDependencies：`@soybeanjs/changelog`、`bumpp`、`c12`、`cac`、`enquirer`、`execa`、`npm-check-updates`、`picomatch`、`rimraf`（`consola`、`kolorist`、`tsx` 已有可跳过）
- [ ] 3.2 创建目录 `src/scripts/`，复制 `packages/scripts/src/**` 全量到 `src/scripts/**`，复制 `packages/scripts/bin.ts` 到 `src/scripts/bin.ts`
- [ ] 3.3 修改 `src/scripts/index.ts` 中 `import { version } from '../package.json'` → `'../../package.json'`，并校对任何相对路径
- [ ] 3.4 修改根 `package.json` 的 npm scripts：`commit` / `commit:zh` / `cleanup` / `release` / `update-pkg` 改为 `tsx src/scripts/bin.ts <command>` 形式；同时把 `simple-git-hooks.commit-msg` 改为 `pnpm tsx src/scripts/bin.ts git-commit-verify`
- [ ] 3.5 运行 `pnpm install` 同步新依赖；运行 `pnpm tsx src/scripts/bin.ts --help` 验证输出 6 个子命令
- [ ] 3.6 运行 `pnpm tsx src/scripts/bin.ts git-commit-verify --help`（或等价空跑）验证子命令链路
- [ ] 3.7 git 提交：中文描述，例如 `refactor(scripts): 迁移 sa CLI 到 src/scripts 并接入 tsx 调用`

## 4. 删除未使用的子包

- [ ] 4.1 删除目录 `packages/axios`、`packages/color`、`packages/hooks`、`packages/utils`（含其内部 node_modules）
- [ ] 4.2 从根 `package.json` 的 `dependencies` 删除 `@sa/axios`、`@sa/color`、`@sa/hooks`、`@sa/utils` 四条 workspace 引用
- [ ] 4.3 运行 `pnpm install` 同步 lockfile，确认无报错；运行 `pnpm typecheck` + `pnpm test`，确保零回归
- [ ] 4.4 git 提交：中文描述，例如 `refactor(packages): 删除未使用的 axios/color/hooks/utils 子包`

## 5. 删除 `packages/` 目录与 workspace 配置

- [ ] 5.1 删除 `packages/uno-preset`、`packages/scripts` 两个子包目录（含其内部 node_modules）
- [ ] 5.2 从根 `package.json` 的 `devDependencies` 删除 `@sa/scripts`、`@sa/uno-preset`
- [ ] 5.3 修改 `pnpm-workspace.yaml`：删除 `packages: - 'packages/*'`，仅保留 `allowBuilds` 字段；若 `packages:` 字段必须存在则置为空数组
- [ ] 5.4 执行 `Remove-Item -Recurse -Force D:/Steno/packages`，验证目录已彻底消失
- [ ] 5.5 运行 `pnpm install`、`pnpm typecheck`、`pnpm test`、`pnpm build` 全量验证
- [ ] 5.6 全文搜索仓库（排除 `node_modules`、`agentignore`、`pnpm-lock.yaml`）中 `@sa/` 命中数为 0
- [ ] 5.7 git 提交：中文描述，例如 `refactor(workspace): 删除 packages 目录并清理 workspace 声明`

## 6. 文档与归档

- [ ] 6.1 检查 README、其它 docs 是否提及 `@sa/*` 或 `packages/`；如有，同步更新
- [ ] 6.2 运行 `openspec validate migrate-packages-to-src` 确认 change 文档自洽
- [ ] 6.3 用 openspec-archive-change skill 归档本次 change
- [ ] 6.4 git 提交：中文描述，例如 `docs(openspec): 归档 migrate-packages-to-src`
