## Context

- 项目使用 pnpm workspace，`packages/` 下保留了 SoybeanAdmin 模板时期的 6 个子包，结构为 `axios`、`color`、`hooks`、`utils`、`scripts`、`uno-preset`。
- 通过全局搜索发现：`src/` 下没有任何 `.ts/.vue/.tsx` 文件 `import` 任何 `@sa/*` 包；唯一的实运行时引用来自仓库根目录的 `uno.config.ts`（`from '@sa/uno-preset'`）。
- `@sa/scripts` 没有被 import，但通过 `package.json` 的 npm scripts 以 CLI（`sa` 命令）形式被调用（`commit`、`commit:zh`、`cleanup`、`release`、`update-pkg`），并由 `simple-git-hooks` 的 `commit-msg` 钩子调用 `pnpm sa git-commit-verify`。
- `@sa/axios` / `@sa/color` / `@sa/hooks` / `@sa/utils` 完全没有被引用，属于死代码。
- 现有根 `tsconfig.json` 的 `include` 为 `./**/*.ts`，会把 `packages/**` 也纳入类型检查，删除后 typecheck 速度会变快。
- 根 `tsconfig.json` 已有路径别名 `@/*` → `./src/*`，新模块可以直接复用此别名。
- `scripts` 子包私有 devDependencies 有：`@soybeanjs/changelog`、`bumpp`、`c12`、`cac`、`consola`、`enquirer`、`execa`、`kolorist`、`npm-check-updates`、`picomatch`、`rimraf`。删除子包后，凡是 CLI 仍要用到的需要提升到根 `devDependencies`。

## Goals / Non-Goals

**Goals:**
- 让真实被引用的两个包（`uno-preset`、`scripts`）原地"内联"到 `src/` 下成为项目自身代码的一部分。
- 彻底删除 `packages/` 目录（包括其内部 `node_modules`）。
- 删除 `package.json` / `pnpm-workspace.yaml` 中所有 `@sa/*` workspace 协议依赖。
- 保留对外接口稳定：所有 `pnpm <script>` 的命令行为不变。
- 验证手段：`pnpm install` 成功、`pnpm typecheck` 通过、`pnpm test` 通过、`pnpm build` 成功、`pnpm sa --help` 输出 6 个子命令、`pnpm sa git-commit-verify` 在 commit-msg 钩子下正常运作。

**Non-Goals:**
- 不打算重写或精简 `sa` CLI 的内部命令实现，只是搬位置。
- 不改动 `src/` 下任何业务代码。
- 不调整其它 worktree（`agentignore/.worktrees/*`）中的相同问题。
- 不引入新的工具链（如 turborepo、nx）替代 pnpm workspace。

## Decisions

### 1. 迁移目录位置：`src/uno-preset/` 与 `src/scripts/`

- `packages/uno-preset/src/index.ts` → `src/uno-preset/index.ts`
- `packages/scripts/src/**` → `src/scripts/**`
- `packages/scripts/bin.ts` → `src/scripts/bin.ts`

**理由**：用户明确要求"迁移到 `src/` 目录下"。`src/` 已被 `tsconfig` `include`，无需额外配置。CLI 脚本与构建预设虽然不是 Vue 运行时代码，但放在 `src/` 命名空间下符合用户指令，且通过 `tsx` 直接执行，不会被 Vite 打入前端 bundle（Vite 仅打包 `import.meta` 入口能追溯到的文件）。

**替代方案**：把 `scripts` 放到顶层 `scripts/` 目录、`uno-preset` 内联到 `uno.config.ts`。此方案更"传统"，但偏离用户指令，被放弃。

### 2. `uno.config.ts` 改写为相对路径导入

```ts
// 旧
import { presetSoybeanAdmin } from '@sa/uno-preset';
// 新
import { presetSoybeanAdmin } from './src/uno-preset';
```

**理由**：保留命名与函数签名一致，最小改动，避免影响 `presets:[presetSoybeanAdmin()]` 调用方式。命名 `presetSoybeanAdmin` 虽然保留了"Soybean"字样，但本次任务范围仅做位置迁移，不做品牌改名。

### 3. `sa` CLI 入口改为 `tsx src/scripts/bin.ts`

`package.json` 当前的 `scripts` 都通过 `sa` 调用（它来自 `@sa/scripts` 的 `bin` 字段）。删除 workspace 包后，`sa` 二进制丢失。两种方案：

| 选项 | 方式 | 评价 |
|---|---|---|
| A | 在根 `package.json` 加 `"bin": { "sa": "./src/scripts/bin.ts" }` 并保留 `sa` 别名 | 需要本项目自己被 `npm link`/`pnpm install` 时生成 `.bin/sa`，对 monorepo 自身不友好 |
| B | 直接修改 npm scripts，例如 `"commit": "tsx src/scripts/bin.ts git-commit"` | 简单显式，所有调用路径都收敛在 `package.json` |

**选 B**。它避免了 self-link 的边界问题，且 `simple-git-hooks` 的 `commit-msg` 已经是 `pnpm sa git-commit-verify` 之类的 npm-scripts 间接调用模式，我们改成 `pnpm tsx src/scripts/bin.ts git-commit-verify` 即可。

### 4. 依赖提升：将 `scripts` 子包的 devDependencies 合并到根

需要并入根 `devDependencies` 的包：`@soybeanjs/changelog`、`bumpp`、`c12`、`cac`、`enquirer`、`execa`、`npm-check-updates`、`picomatch`、`rimraf`。
（`consola`、`kolorist`、`tsx` 已存在于根 devDependencies。）

**理由**：CLI 现在由根目录的 `tsx` 执行，模块解析会从根 `node_modules` 查找，所以这些依赖必须在根 `package.json` 声明。`@unocss/core`、`@unocss/preset-mini`（`uno-preset` 用的）可以从 `unocss` 主包二级依赖中拿到类型，但保险起见显式声明为 `devDependencies`，避免 type 解析丢失。

### 5. 移除 `pnpm-workspace.yaml` 中 `packages/*`

直接删除该行。如果删除后 yaml 中 `packages` 字段为空数组，可以保留空文件（pnpm 接受），或彻底删除 `pnpm-workspace.yaml`。考虑到 `allowBuilds` 字段仍然在用（`esbuild`、`unrs-resolver`），保留该文件并把 `packages:` 字段清空即可。

### 6. 删除策略 = 先迁移再删除

迁移和删除分两次提交：先在新位置建好并把所有引用切换过去（旧位置仍在但不再被引用），运行验证；通过后再删除 `packages/`。如果中途出错，可以快速回滚到 packages 仍在的中间状态。

## Risks / Trade-offs

- **风险 1**：scripts CLI 隐式依赖 `../package.json` 路径（用于读 version）。
  → **缓解**：迁移后 `src/scripts/index.ts` 中的 `import { version } from '../package.json'` 需要改为 `'../../package.json'`（指向根 package.json），并验证 `--version` 输出无误。

- **风险 2**：`tsconfig.json` 的 `include: ['./**/*.ts']` 在删除 packages 后不再扫描这些路径，但 `tsx` 运行时模块解析独立。
  → **缓解**：迁移过程中保持 `noUnusedLocals: false`（已是如此），新增 `src/scripts/` 入 `include` 已天然命中，无需额外配置。

- **风险 3**：commit-msg 钩子在迁移过程中失败导致无法提交。
  → **缓解**：迁移 `scripts` 完成、调试通过之前不删除 `packages/scripts`；并把"`sa` CLI 链路验证"作为切换 npm scripts 同一次提交内的硬性检查。如失败可临时 `--no-verify`（用户明确认可的紧急通道）。

- **风险 4**：`pnpm install` 在删除 workspace 包后会瘦身 lockfile，可能因为 ESM/CJS 解析差异引入新版本子依赖。
  → **缓解**：在删除前先 `pnpm install --frozen-lockfile` 跑一次，确保起点稳定；删除后再 `pnpm install`，对比 `pnpm-lock.yaml` diff 是否合理。

- **权衡**：把 CLI 脚本放在 `src/` 让前端代码与构建工具代码混在一个目录树。代价是目录纯净度下降；收益是 100% 满足用户指令、无需额外构建配置。如果未来需要分离，可以再做一次重命名重构。
