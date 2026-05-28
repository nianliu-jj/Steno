# Migrate Packages to Src Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `D:/Steno/packages/` 下被实际引用的两个 workspace 包（`@sa/uno-preset`、`@sa/scripts`）就地迁移到 `src/` 体系；删除四个无引用子包（`axios`、`color`、`hooks`、`utils`）；最终彻底删除 `packages/` 目录，并清理 `package.json` / `pnpm-workspace.yaml` 中相应声明，保证 `pnpm typecheck` / `pnpm test` / `pnpm build` 全部通过、CLI 入口 `pnpm tsx src/scripts/bin.ts --help` 仍然展示六个子命令。

**Architecture:** 用相对路径替代 `@sa/*` workspace 协议依赖。`uno-preset` 内联到 `src/uno-preset/index.ts`，由 `uno.config.ts` 用相对路径导入；`scripts` CLI 移到 `src/scripts/`，原先以 `sa` bin 暴露的命令改成在根 `package.json` 的 npm scripts 与 `simple-git-hooks` 中直接调用 `tsx src/scripts/bin.ts <command>`。其私有 devDependencies 提升到根 `package.json`，避免子包消失后模块解析失败。删除采用"先迁移、跑通验证、再删除"两步走，最大化可回滚性。

**Tech Stack:** pnpm workspace、TypeScript（ESM、`moduleResolution: bundler`）、tsx（运行时执行 TS）、UnoCSS、Vue 3 + Vite、simple-git-hooks、Vitest、PowerShell（Windows）。

---

## File Structure

将要被创建、修改或删除的文件清单（路径相对 `D:/Steno/`）：

| 操作 | 路径 | 作用 |
|---|---|---|
| 创建 | `src/uno-preset/index.ts` | `presetSoybeanAdmin()` UnoCSS 预设，迁移自 `packages/uno-preset/src/index.ts` |
| 创建 | `src/scripts/bin.ts` | tsx 入口，等价于 `packages/scripts/bin.ts` |
| 创建 | `src/scripts/index.ts` | CLI 装配函数 `setupCli()` 与命令注册，迁移自 `packages/scripts/src/index.ts`，并把 `import { version } from '../package.json'` 改为 `'../../package.json'` |
| 创建 | `src/scripts/commands/index.ts` | 重新导出 6 个命令 |
| 创建 | `src/scripts/commands/cleanup.ts` | `cleanup()` 实现，原样迁移 |
| 创建 | `src/scripts/commands/git-commit.ts` | `gitCommit()` 与 `gitCommitVerify()` 实现，原样迁移 |
| 创建 | `src/scripts/commands/changelog.ts` | `genChangelog()` 实现，原样迁移 |
| 创建 | `src/scripts/commands/release.ts` | `release()` 实现，原样迁移；其内部默认 execute `'pnpm sa changelog'` 改为 `'pnpm tsx src/scripts/bin.ts changelog'` |
| 创建 | `src/scripts/commands/update-pkg.ts` | `updatePkg()` 实现，原样迁移 |
| 创建 | `src/scripts/config/index.ts` | `loadCliOptions()` 与默认选项，原样迁移 |
| 创建 | `src/scripts/locales/index.ts` | 中英文文案，原样迁移 |
| 创建 | `src/scripts/shared/index.ts` | `execCommand()` 工具，原样迁移 |
| 创建 | `src/scripts/types/index.ts` | `CliOption` 类型，原样迁移 |
| 修改 | `uno.config.ts` | 把 `import { presetSoybeanAdmin } from '@sa/uno-preset'` 改为 `from './src/uno-preset'` |
| 修改 | `package.json` | 删除 6 条 `@sa/*` workspace 依赖；将 scripts 子包的 devDependencies 提升到根；改写 `commit/commit:zh/cleanup/release/update-pkg` 与 `simple-git-hooks.commit-msg` |
| 修改 | `pnpm-workspace.yaml` | 删除 `packages: - 'packages/*'`，保留 `allowBuilds` 字段 |
| 删除 | `packages/axios/` | 完全无引用 |
| 删除 | `packages/color/` | 完全无引用 |
| 删除 | `packages/hooks/` | 完全无引用 |
| 删除 | `packages/utils/` | 完全无引用 |
| 删除 | `packages/uno-preset/` | 已迁到 `src/uno-preset/` |
| 删除 | `packages/scripts/` | 已迁到 `src/scripts/` |
| 删除 | `packages/` | 顶层目录最终消失 |

---

## Phase 0: 基线验证

确认起点干净，把当前 `main` 上的 typecheck / test 状态作为基线。

### Task 0.1: 跑通基线 install + typecheck + test

**Files:** 无改动，仅验证

- [ ] **Step 1: 安装依赖（冻结 lockfile）**

Run:
```powershell
pnpm install --frozen-lockfile
```
Expected: 退出码 0，无 `ERR_PNPM_OUTDATED_LOCKFILE` 报错。

- [ ] **Step 2: 跑类型检查**

Run:
```powershell
pnpm typecheck
```
Expected: 退出码 0，无 `error TS` 输出。

- [ ] **Step 3: 跑单元测试**

Run:
```powershell
pnpm test
```
Expected: 退出码 0，全部测试通过（用以下命令对比，记录测试数量作为基线）：
```
Test Files  N passed (N)
Tests       M passed (M)
```

- [ ] **Step 4: 跑构建（可选但推荐）**

Run:
```powershell
pnpm build
```
Expected: 退出码 0，`dist/` 目录生成。

- [ ] **Step 5: 列出当前对 @sa 的所有引用**

Run:
```powershell
Select-String -Path "uno.config.ts","package.json","pnpm-workspace.yaml" -Pattern "@sa/" -SimpleMatch
```
Expected: 至少命中 `uno.config.ts` 的 `@sa/uno-preset` 和 `package.json` 的 6 条 workspace 依赖。把输出留作后续 diff 对照。

**Phase 0 无 git commit**（无改动）。

---

## Phase 1: 迁移 `@sa/uno-preset` 到 `src/uno-preset/`

把 UnoCSS 预设从 workspace 包内联进项目 `src/` 目录，最小改动单元，独立验证。

### Task 1.1: 复制 uno-preset 源文件

**Files:**
- Create: `src/uno-preset/index.ts`

- [ ] **Step 1: 创建目标目录并写入 index.ts**

Run:
```powershell
New-Item -ItemType Directory -Force "src/uno-preset" | Out-Null
```
Expected: 目录创建成功，无报错。

然后写入 `src/uno-preset/index.ts`，**完整内容**（与 `packages/uno-preset/src/index.ts` 完全相同）：

```ts
/**
 * @file 项目内置 UnoCSS 预设
 *
 * 提供一组常用的 UnoCSS shortcuts，包括：
 * - **Flex 布局**：`flex-center`、`flex-x-center`、`flex-col-center` 等
 * - **绝对/固定定位**：`absolute-center`、`fixed-lt`、`absolute-rt` 等
 * - **文本溢出**：`ellipsis-text`（`overflow-hidden + whitespace-nowrap + text-ellipsis`）
 *
 * `// @unocss-include` 注释确保 UnoCSS 在构建时扫描此文件中的 class。
 */

// @unocss-include

import type { Preset } from '@unocss/core';
import type { Theme } from '@unocss/preset-mini';

export function presetSoybeanAdmin(): Preset<Theme> {
  const preset: Preset<Theme> = {
    name: 'preset-soybean-admin',
    shortcuts: [
      {
        'flex-center': 'flex justify-center items-center',
        'flex-x-center': 'flex justify-center',
        'flex-y-center': 'flex items-center',
        'flex-col': 'flex flex-col',
        'flex-col-center': 'flex-center flex-col',
        'flex-col-stretch': 'flex-col items-stretch',
        'i-flex-center': 'inline-flex justify-center items-center',
        'i-flex-x-center': 'inline-flex justify-center',
        'i-flex-y-center': 'inline-flex items-center',
        'i-flex-col': 'flex-col inline-flex',
        'i-flex-col-center': 'flex-col i-flex-center',
        'i-flex-col-stretch': 'i-flex-col items-stretch',
        'flex-1-hidden': 'flex-1 overflow-hidden'
      },
      {
        'absolute-lt': 'absolute left-0 top-0',
        'absolute-lb': 'absolute left-0 bottom-0',
        'absolute-rt': 'absolute right-0 top-0',
        'absolute-rb': 'absolute right-0 bottom-0',
        'absolute-tl': 'absolute-lt',
        'absolute-tr': 'absolute-rt',
        'absolute-bl': 'absolute-lb',
        'absolute-br': 'absolute-rb',
        'absolute-center': 'absolute-lt flex-center size-full',
        'fixed-lt': 'fixed left-0 top-0',
        'fixed-lb': 'fixed left-0 bottom-0',
        'fixed-rt': 'fixed right-0 top-0',
        'fixed-rb': 'fixed right-0 bottom-0',
        'fixed-tl': 'fixed-lt',
        'fixed-tr': 'fixed-rt',
        'fixed-bl': 'fixed-lb',
        'fixed-br': 'fixed-rb',
        'fixed-center': 'fixed-lt flex-center size-full'
      },
      {
        'nowrap-hidden': 'overflow-hidden whitespace-nowrap',
        'ellipsis-text': 'nowrap-hidden text-ellipsis'
      }
    ]
  };

  return preset;
}

export default presetSoybeanAdmin;
```

- [ ] **Step 2: 校验文件已创建**

Run:
```powershell
Test-Path "src/uno-preset/index.ts"
```
Expected: 输出 `True`。

### Task 1.2: 切换 uno.config.ts 引用

**Files:**
- Modify: `uno.config.ts:2`

- [ ] **Step 1: 用 Edit 工具替换 import 语句**

将 `uno.config.ts` 中：
```ts
import { presetSoybeanAdmin } from '@sa/uno-preset';
```
改为：
```ts
import { presetSoybeanAdmin } from './src/uno-preset';
```
其他行保持不变。

- [ ] **Step 2: 校验文件中已无 `@sa/uno-preset`**

Run:
```powershell
Select-String -Path "uno.config.ts" -Pattern "@sa/" -SimpleMatch
```
Expected: 无输出（表示已不再引用 `@sa/` 任何包）。

### Task 1.3: 验证迁移成功

- [ ] **Step 1: typecheck**

Run:
```powershell
pnpm typecheck
```
Expected: 退出码 0。

- [ ] **Step 2: build（验证 UnoCSS 预设载入）**

Run:
```powershell
pnpm build
```
Expected: 退出码 0，`dist/assets/*.css` 生成成功。

- [ ] **Step 3: 验证预设确实生效**

Run:
```powershell
Get-ChildItem dist/assets -Filter "*.css" | ForEach-Object { Select-String -Path $_.FullName -Pattern "flex-center|absolute-center|ellipsis-text" -SimpleMatch | Select-Object -First 1 }
```
Expected: 至少输出一行匹配（说明预设 shortcut 被打入产物）。

### Task 1.4: 提交 Phase 1

- [ ] **Step 1: 暂存改动**

Run:
```powershell
git add src/uno-preset uno.config.ts
git status --short
```
Expected: `A  src/uno-preset/index.ts` 和 `M  uno.config.ts` 出现在输出中。

- [ ] **Step 2: 提交（中文）**

Run:
```powershell
git commit -m @'
refactor(uno): 迁移 uno-preset 到 src/uno-preset

将 packages/uno-preset 的 presetSoybeanAdmin 函数迁移到 src/uno-preset/index.ts，
uno.config.ts 改为相对路径导入，为后续删除 packages 目录做准备。
'@
```
Expected: 提交成功；pre-commit 钩子（`pnpm typecheck && pnpm lint`）通过。

---

## Phase 2: 迁移 `@sa/scripts` 到 `src/scripts/`

把 CLI 工具搬到 `src/scripts/` 并通过 `tsx` 直接调用，去掉对 workspace `sa` bin 的依赖。

### Task 2.1: 把 scripts 子包的 devDependencies 提升到根

**Files:**
- Modify: `package.json`（`devDependencies` 字段）

- [ ] **Step 1: 在根 `package.json` 的 `devDependencies` 中新增 9 个依赖**

打开 `package.json`，把下列项**逐条插入** `devDependencies`（保持字母序）。已有的 `consola`、`kolorist`、`tsx` **不要重复添加**。

需要新增（版本号与 `packages/scripts/package.json` 一致）：
```json
"@soybeanjs/changelog": "0.4.3",
"bumpp": "10.4.1",
"c12": "3.3.3",
"cac": "6.7.14",
"enquirer": "2.4.1",
"execa": "9.6.1",
"npm-check-updates": "19.6.3",
"picomatch": "4.0.3",
"rimraf": "6.1.3",
```

具体 Edit 操作：在 `devDependencies` 中的 `"consola": "3.4.2",` 行**之前**插入 `"@soybeanjs/changelog": "0.4.3",`；在 `"@vue/test-utils": "^2.4.6",` 行**之后**、在 `"consola": "3.4.2",` 行**之前**插入 `"bumpp": "10.4.1",` 和 `"c12": "3.3.3",` 和 `"cac": "6.7.14",`；等等。

（执行时按字典序排好即可，pnpm 不强制顺序。）

- [ ] **Step 2: 安装新依赖**

Run:
```powershell
pnpm install
```
Expected: 退出码 0；`pnpm-lock.yaml` 新增上述 9 个包的解析条目。

- [ ] **Step 3: 抽样验证依赖可解析**

Run:
```powershell
pnpm exec node -e "import('cac').then(m => console.log(typeof m.cac))"
pnpm exec node -e "import('execa').then(m => console.log(typeof m.execa))"
pnpm exec node -e "import('rimraf').then(m => console.log(typeof m.rimraf))"
```
Expected: 每个命令输出 `function`。

### Task 2.2: 创建 `src/scripts/` 目录骨架并复制 7 个非命令文件

**Files:**
- Create: `src/scripts/bin.ts`
- Create: `src/scripts/index.ts`
- Create: `src/scripts/config/index.ts`
- Create: `src/scripts/locales/index.ts`
- Create: `src/scripts/shared/index.ts`
- Create: `src/scripts/types/index.ts`

- [ ] **Step 1: 创建目录骨架**

Run:
```powershell
New-Item -ItemType Directory -Force "src/scripts","src/scripts/commands","src/scripts/config","src/scripts/locales","src/scripts/shared","src/scripts/types" | Out-Null
```
Expected: 全部目录创建成功。

- [ ] **Step 2: 写 `src/scripts/bin.ts`**

完整内容（保留 shebang，便于将来如果需要也可以单独 `tsx src/scripts/bin.ts`）：

```ts
#!/usr/bin/env tsx

import './index.ts';
```

> 注：原文件是 `import './src/index.ts'`，因为旧位置 `bin.ts` 与 `src/` 平级。新位置 `bin.ts` 与 `index.ts` 同级，所以改为 `'./index.ts'`。

- [ ] **Step 3: 写 `src/scripts/types/index.ts`**

完整内容（与 `packages/scripts/src/types/index.ts` 完全一致）：

```ts
import type { ChangelogOption } from '@soybeanjs/changelog';

export interface CliOption {
  /** The project root directory */
  cwd: string;
  /**
   * Cleanup dirs
   *
   * Glob pattern syntax {@link https://github.com/isaacs/minimatch}
   *
   * @default
   * ```json
   * ["** /dist", "** /pnpm-lock.yaml", "** /node_modules", "!node_modules/**"]
   * ```
   */
  cleanupDirs: string[];
  /**
   * Npm-check-updates command args
   *
   * @default ['--deep', '-u']
   */
  ncuCommandArgs: string[];
  /**
   * Options of generate changelog
   *
   * @link https://github.com/soybeanjs/changelog
   */
  changelogOptions: Partial<ChangelogOption>;
  /** The ignore pattern list of git commit verify */
  gitCommitVerifyIgnores: RegExp[];
}
```

- [ ] **Step 4: 写 `src/scripts/shared/index.ts`**

完整内容：

```ts
import type { Options } from 'execa';

export async function execCommand(cmd: string, args: string[], options?: Options) {
  const { execa } = await import('execa');
  const res = await execa(cmd, args, options);
  return (res?.stdout as string)?.trim() || '';
}
```

- [ ] **Step 5: 写 `src/scripts/config/index.ts`**

完整内容（与 `packages/scripts/src/config/index.ts` 一致）：

```ts
import process from 'node:process';
import { loadConfig } from 'c12';
import type { CliOption } from '../types';

const defaultOptions: CliOption = {
  cwd: process.cwd(),
  cleanupDirs: [
    '**/dist',
    '**/package-lock.json',
    '**/yarn.lock',
    '**/pnpm-lock.yaml',
    '**/node_modules',
    '!node_modules/**'
  ],
  ncuCommandArgs: ['--deep', '-u'],
  changelogOptions: {},
  gitCommitVerifyIgnores: [
    /^((Merge pull request)|(Merge (.*?) into (.*?)|(Merge branch (.*?)))(?:\r?\n)*$)/m,
    /^(Merge tag (.*?))(?:\r?\n)*$/m,
    /^(R|r)evert (.*)/,
    /^(amend|fixup|squash)!/,
    /^(Merged (.*?)(in|into) (.*)|Merged PR (.*): (.*))/,
    /^Merge remote-tracking branch(\s*)(.*)/,
    /^Automatic merge(.*)/,
    /^Auto-merged (.*?) into (.*)/
  ]
};

export async function loadCliOptions(overrides?: Partial<CliOption>, cwd = process.cwd()) {
  const { config } = await loadConfig<Partial<CliOption>>({
    name: 'soybean',
    defaults: defaultOptions,
    overrides,
    cwd,
    packageJson: true
  });

  return config as CliOption;
}
```

- [ ] **Step 6: 写 `src/scripts/locales/index.ts`**

完整内容（与 `packages/scripts/src/locales/index.ts` 一致）：

```ts
import { bgRed, green, red, yellow } from 'kolorist';

export type Lang = 'zh-cn' | 'en-us';

export const locales = {
  'zh-cn': {
    gitCommitMessages: {
      types: '请选择提交类型',
      scopes: '请选择提交范围',
      description: `请输入描述信息（${yellow('!')}开头表示破坏性改动`
    },
    gitCommitTypes: [
      ['feat', '新功能'],
      ['feat-wip', '开发中的功能，比如某功能的部分代码'],
      ['fix', '修复Bug'],
      ['docs', '只涉及文档更新'],
      ['typo', '代码或文档勘误，比如错误拼写'],
      ['style', '修改代码风格，不影响代码含义的变更'],
      ['refactor', '代码重构，既不修复 bug 也不添加功能的代码变更'],
      ['perf', '可提高性能的代码更改'],
      ['optimize', '优化代码质量的代码更改'],
      ['test', '添加缺失的测试或更正现有测试'],
      ['build', '影响构建系统或外部依赖项的更改'],
      ['ci', '对 CI 配置文件和脚本的更改'],
      ['chore', '没有修改src或测试文件的其他变更'],
      ['revert', '还原先前的提交']
    ] as [string, string][],
    gitCommitScopes: [
      ['projects', '项目'],
      ['packages', '包'],
      ['components', '组件'],
      ['hooks', '钩子函数'],
      ['utils', '工具函数'],
      ['types', 'TS类型声明'],
      ['styles', '代码风格'],
      ['deps', '项目依赖'],
      ['release', '发布项目新版本'],
      ['other', '其他的变更']
    ] as [string, string][],
    gitCommitVerify: `${bgRed(' 错误 ')} ${red('git 提交信息必须符合 Conventional Commits 标准!')}\n\n${green(
      '推荐使用命令 `pnpm commit` 生成符合 Conventional Commits 标准的提交信息。\n获取有关 Conventional Commits 的更多信息，请访问此链接: https://conventionalcommits.org'
    )}`
  },
  'en-us': {
    gitCommitMessages: {
      types: 'Please select a type',
      scopes: 'Please select a scope',
      description: `Please enter a description (add prefix ${yellow('!')} to indicate breaking change)`
    },
    gitCommitTypes: [
      ['feat', 'A new feature'],
      ['feat-wip', 'Features in development, such as partial code for a certain feature'],
      ['fix', 'A bug fix'],
      ['docs', 'Documentation only changes'],
      ['typo', 'Code or document corrections, such as spelling errors'],
      ['style', 'Changes that do not affect the meaning of the code'],
      ['refactor', 'A code change that neither fixes a bug nor adds a feature'],
      ['perf', 'A code change that improves performance'],
      ['optimize', 'A code change that optimizes code quality'],
      ['test', 'Adding missing tests or correcting existing tests'],
      ['build', 'Changes that affect the build system or external dependencies'],
      ['ci', 'Changes to our CI configuration files and scripts'],
      ['chore', "Other changes that don't modify src or test files"],
      ['revert', 'Reverts a previous commit']
    ] as [string, string][],
    gitCommitScopes: [
      ['projects', 'project'],
      ['packages', 'packages'],
      ['components', 'components'],
      ['hooks', 'hook functions'],
      ['utils', 'utils functions'],
      ['types', 'TS declaration'],
      ['styles', 'style'],
      ['deps', 'project dependencies'],
      ['release', 'release project'],
      ['other', 'other changes']
    ] as [string, string][],
    gitCommitVerify: `${bgRed(' ERROR ')} ${red('git commit message must match the Conventional Commits standard!')}\n\n${green(
      'Recommended to use the command `pnpm commit` to generate Conventional Commits compliant commit information.\nGet more info about Conventional Commits, follow this link: https://conventionalcommits.org'
    )}`
  }
} satisfies Record<Lang, Record<string, unknown>>;
```

### Task 2.3: 复制 6 个命令实现文件

**Files:**
- Create: `src/scripts/commands/cleanup.ts`
- Create: `src/scripts/commands/git-commit.ts`
- Create: `src/scripts/commands/changelog.ts`
- Create: `src/scripts/commands/release.ts`
- Create: `src/scripts/commands/update-pkg.ts`
- Create: `src/scripts/commands/index.ts`

- [ ] **Step 1: 写 `src/scripts/commands/cleanup.ts`**

```ts
import { rimraf } from 'rimraf';

export async function cleanup(paths: string[]) {
  await rimraf(paths, { glob: true });
}
```

- [ ] **Step 2: 写 `src/scripts/commands/git-commit.ts`**

完整内容（原样迁移，包含 `gitCommit` 和 `gitCommitVerify` 两个导出）：

```ts
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { prompt } from 'enquirer';
import { execCommand } from '../shared';
import { locales } from '../locales';
import type { Lang } from '../locales';

interface PromptObject {
  types: string;
  scopes: string;
  description: string;
}

/**
 * Git commit with Conventional Commits standard
 *
 * @param lang
 */
export async function gitCommit(lang: Lang = 'en-us') {
  const { gitCommitMessages, gitCommitTypes, gitCommitScopes } = locales[lang];

  const typesChoices = gitCommitTypes.map(([value, msg]) => {
    const nameWithSuffix = `${value}:`;

    const message = `${nameWithSuffix.padEnd(12)}${msg}`;

    return {
      name: value,
      message
    };
  });

  const scopesChoices = gitCommitScopes.map(([value, msg]) => ({
    name: value,
    message: `${value.padEnd(30)} (${msg})`
  }));

  const result = await prompt<PromptObject>([
    {
      name: 'types',
      type: 'select',
      message: gitCommitMessages.types,
      choices: typesChoices
    },
    {
      name: 'scopes',
      type: 'select',
      message: gitCommitMessages.scopes,
      choices: scopesChoices
    },
    {
      name: 'description',
      type: 'text',
      message: gitCommitMessages.description
    }
  ]);

  const breaking = result.description.startsWith('!') ? '!' : '';

  const description = result.description.replace(/^!/, '').trim();

  const commitMsg = `${result.types}(${result.scopes})${breaking}: ${description}`;

  await execCommand('git', ['commit', '-m', commitMsg], { stdio: 'inherit' });
}

/** Git commit message verify */
export async function gitCommitVerify(lang: Lang = 'en-us', ignores: RegExp[] = []) {
  const gitPath = await execCommand('git', ['rev-parse', '--show-toplevel']);

  const gitMsgPath = path.join(gitPath, '.git', 'COMMIT_EDITMSG');

  const commitMsg = readFileSync(gitMsgPath, 'utf8').trim();

  if (ignores.some(regExp => regExp.test(commitMsg))) return;

  const REG_EXP = /(?<type>[a-z]+)(?:\((?<scope>.+)\))?(?<breaking>!)?: (?<description>.+)/i;

  if (!REG_EXP.test(commitMsg)) {
    const errorMsg = locales[lang].gitCommitVerify;

    throw new Error(errorMsg);
  }
}
```

- [ ] **Step 3: 写 `src/scripts/commands/changelog.ts`**

```ts
import { generateChangelog, generateTotalChangelog } from '@soybeanjs/changelog';
import type { ChangelogOption } from '@soybeanjs/changelog';

export async function genChangelog(options?: Partial<ChangelogOption>, total = false) {
  if (total) {
    await generateTotalChangelog(options);
  } else {
    await generateChangelog(options);
  }
}
```

- [ ] **Step 4: 写 `src/scripts/commands/release.ts`**

把 `execute` 默认值由 `'pnpm sa changelog'` 改为 `'pnpm tsx src/scripts/bin.ts changelog'`：

```ts
import { versionBump } from 'bumpp';

export async function release(execute = 'pnpm tsx src/scripts/bin.ts changelog', push = true) {
  await versionBump({
    files: ['**/package.json', '!**/node_modules'],
    execute,
    all: true,
    tag: true,
    commit: 'chore(projects): release v%s',
    push
  });
}
```

- [ ] **Step 5: 写 `src/scripts/commands/update-pkg.ts`**

```ts
import { execCommand } from '../shared';

export async function updatePkg(args: string[] = ['--deep', '-u']) {
  execCommand('npx', ['npm-check-updates', ...args], { stdio: 'inherit' });
}
```

- [ ] **Step 6: 写 `src/scripts/commands/index.ts`**

```ts
export * from './git-commit';
export * from './cleanup';
export * from './update-pkg';
export * from './changelog';
export * from './release';
```

### Task 2.4: 写 `src/scripts/index.ts`（CLI 装配主入口）

**Files:**
- Create: `src/scripts/index.ts`

- [ ] **Step 1: 写入完整文件**

注意三处与原版的差异：①顶部注释路径表述；②`import { version } from '../package.json'` 改为 `'../../package.json'`（新位置距离根 package.json 多了一层）；③CLI 名称保留 `'steno'`。

```ts
/**
 * @file 项目 CLI 工具脚本
 *
 * 基于 cac 的命令行工具，提供：
 * - `cleanup` — 清理 node_modules / dist 等构建产物
 * - `update-pkg` — 更新 package.json 依赖版本
 * - `git-commit` — 生成符合 Conventional Commits 规范的提交信息
 * - `git-commit-verify` — 校验提交信息格式
 * - `changelog` — 生成 CHANGELOG
 * - `release` — 自动化发版（更新版本号 → 生成 changelog → 提交代码）
 */

import { cac } from 'cac';
import { blue, lightGreen } from 'kolorist';
import { version } from '../../package.json';
import { cleanup, genChangelog, gitCommit, gitCommitVerify, release, updatePkg } from './commands';
import { loadCliOptions } from './config';
import type { Lang } from './locales';

type Command = 'cleanup' | 'update-pkg' | 'git-commit' | 'git-commit-verify' | 'changelog' | 'release';

type CommandAction<A extends object> = (args?: A) => Promise<void> | void;

type CommandWithAction<A extends object = object> = Record<Command, { desc: string; action: CommandAction<A> }>;

interface CommandArg {
  execute?: string;
  push?: boolean;
  total?: boolean;
  cleanupDir?: string;
  lang?: Lang;
}

export async function setupCli() {
  const cliOptions = await loadCliOptions();

  const cli = cac(blue('steno'));

  cli
    .version(lightGreen(version))
    .option(
      '-e, --execute [command]',
      "Execute additional command after bumping and before git commit. Defaults to 'pnpm tsx src/scripts/bin.ts changelog'"
    )
    .option('-p, --push', 'Indicates whether to push the git commit and tag')
    .option('-t, --total', 'Generate changelog by total tags')
    .option(
      '-c, --cleanupDir <dir>',
      'The glob pattern of dirs to cleanup, If not set, it will use the default value, Multiple values use "," to separate them'
    )
    .option('-l, --lang <lang>', 'display lang of cli', { default: 'en-us', type: [String] })
    .help();

  const commands: CommandWithAction<CommandArg> = {
    cleanup: {
      desc: 'delete dirs: node_modules, dist, etc.',
      action: async () => {
        await cleanup(cliOptions.cleanupDirs);
      }
    },
    'update-pkg': {
      desc: 'update package.json dependencies versions',
      action: async () => {
        await updatePkg(cliOptions.ncuCommandArgs);
      }
    },
    'git-commit': {
      desc: 'git commit, generate commit message which match Conventional Commits standard',
      action: async args => {
        await gitCommit(args?.lang);
      }
    },
    'git-commit-verify': {
      desc: 'verify git commit message, make sure it match Conventional Commits standard',
      action: async args => {
        await gitCommitVerify(args?.lang, cliOptions.gitCommitVerifyIgnores);
      }
    },
    changelog: {
      desc: 'generate changelog',
      action: async args => {
        await genChangelog(cliOptions.changelogOptions, args?.total);
      }
    },
    release: {
      desc: 'release: update version, generate changelog, commit code',
      action: async args => {
        await release(args?.execute, args?.push);
      }
    }
  };

  for (const [command, { desc, action }] of Object.entries(commands)) {
    cli.command(command, lightGreen(desc)).action(action);
  }

  cli.parse();
}

setupCli();
```

### Task 2.5: 切换 npm scripts 与 commit-msg 钩子

**Files:**
- Modify: `package.json`（`scripts` 与 `simple-git-hooks` 字段）

- [ ] **Step 1: 修改 `scripts` 字段**

把原来的：
```json
"commit": "sa git-commit",
"commit:zh": "sa git-commit -l=zh-cn",
"cleanup": "sa cleanup",
"release": "sa release",
"update-pkg": "sa update-pkg",
```
**逐条替换**为：
```json
"commit": "tsx src/scripts/bin.ts git-commit",
"commit:zh": "tsx src/scripts/bin.ts git-commit -l=zh-cn",
"cleanup": "tsx src/scripts/bin.ts cleanup",
"release": "tsx src/scripts/bin.ts release",
"update-pkg": "tsx src/scripts/bin.ts update-pkg",
```

- [ ] **Step 2: 修改 `simple-git-hooks.commit-msg`**

把：
```json
"commit-msg": "pnpm sa git-commit-verify",
```
改为：
```json
"commit-msg": "pnpm tsx src/scripts/bin.ts git-commit-verify",
```

`pre-commit` 字段保持不变。

- [ ] **Step 3: 重新安装 git hooks**

Run:
```powershell
pnpm exec simple-git-hooks
```
Expected: 输出 `[INFO] Installed all git hooks`，无报错。

### Task 2.6: 验证 CLI 可正常运行

- [ ] **Step 1: 帮助输出包含 6 个子命令**

Run:
```powershell
pnpm tsx src/scripts/bin.ts --help
```
Expected: 输出含 `cleanup`、`update-pkg`、`git-commit`、`git-commit-verify`、`changelog`、`release` 六行。

- [ ] **Step 2: 版本号正确读出**

Run:
```powershell
pnpm tsx src/scripts/bin.ts --version
```
Expected: 输出 `0.0.0`（来自根 `package.json`）。

- [ ] **Step 3: typecheck 通过**

Run:
```powershell
pnpm typecheck
```
Expected: 退出码 0，无 `error TS` 输出。

- [ ] **Step 4: 单元测试不回归**

Run:
```powershell
pnpm test
```
Expected: 退出码 0，测试数量与 Phase 0 一致。

### Task 2.7: 提交 Phase 2

- [ ] **Step 1: 暂存改动**

Run:
```powershell
git add src/scripts package.json pnpm-lock.yaml
git status --short
```
Expected: 包含 13 个新文件（`src/scripts/**`）+ 2 个 modified（`package.json`、`pnpm-lock.yaml`）。

- [ ] **Step 2: 提交（中文）**

Run:
```powershell
git commit -m @'
refactor(scripts): 迁移 sa CLI 到 src/scripts 并改用 tsx 调用

- 将 packages/scripts 的全部源文件复制到 src/scripts/，并修正 package.json 相对路径与 release 的默认 execute 参数
- 把私有 devDependencies（cac、execa、bumpp、c12、@soybeanjs/changelog、enquirer、rimraf、picomatch、npm-check-updates）提升到根 package.json
- 重写 commit / commit:zh / cleanup / release / update-pkg 以及 simple-git-hooks.commit-msg，全部改为 tsx src/scripts/bin.ts <command>
'@
```
Expected: 提交成功，pre-commit + commit-msg 钩子（已经用新链路）通过。

---

## Phase 3: 删除四个无引用子包

`packages/axios`、`packages/color`、`packages/hooks`、`packages/utils` 在 `src/` 全无 import，安全删除。

### Task 3.1: 二次确认无引用

- [ ] **Step 1: 在 src 与根配置中扫描**

Run:
```powershell
Select-String -Path "src/**/*.ts","src/**/*.tsx","src/**/*.vue","uno.config.ts","vite.config.ts","vitest.config.ts" -Pattern "@sa/(axios|color|hooks|utils)" -SimpleMatch -ErrorAction SilentlyContinue
```
Expected: 无任何输出。（如果有输出，停止并重新评估迁移范围。）

### Task 3.2: 删除子包目录

**Files:**
- Delete: `packages/axios/`、`packages/color/`、`packages/hooks/`、`packages/utils/`

- [ ] **Step 1: 删除 4 个目录**

Run:
```powershell
Remove-Item -Recurse -Force packages/axios, packages/color, packages/hooks, packages/utils
```
Expected: 命令无报错；`Test-Path packages/axios` 应返回 `False`。

- [ ] **Step 2: 验证目录已消失**

Run:
```powershell
Get-ChildItem packages
```
Expected: 输出仅剩 `scripts`、`uno-preset` 两个子目录。

### Task 3.3: 从 package.json 移除四条 dependencies

**Files:**
- Modify: `package.json:37-40`

- [ ] **Step 1: 删除 4 行**

把 `dependencies` 中以下四行整段删掉（注意保持上下逗号合法）：
```json
"@sa/axios": "workspace:*",
"@sa/color": "workspace:*",
"@sa/hooks": "workspace:*",
"@sa/utils": "workspace:*",
```

- [ ] **Step 2: 校验**

Run:
```powershell
Select-String -Path "package.json" -Pattern "@sa/(axios|color|hooks|utils)" -SimpleMatch
```
Expected: 无输出。

### Task 3.4: 同步 lockfile 并验证

- [ ] **Step 1: pnpm install**

Run:
```powershell
pnpm install
```
Expected: 退出码 0；`pnpm-lock.yaml` 移除对应 workspace import 节点。

- [ ] **Step 2: typecheck**

Run:
```powershell
pnpm typecheck
```
Expected: 退出码 0。

- [ ] **Step 3: 单元测试**

Run:
```powershell
pnpm test
```
Expected: 退出码 0，测试数量与基线一致。

### Task 3.5: 提交 Phase 3

- [ ] **Step 1: 暂存改动**

Run:
```powershell
git add -A packages package.json pnpm-lock.yaml
git status --short
```
Expected: 出现大量 `D packages/axios/...` 等删除记录，以及 `M package.json`、`M pnpm-lock.yaml`。

- [ ] **Step 2: 提交（中文）**

Run:
```powershell
git commit -m @'
refactor(packages): 删除无引用的 axios/color/hooks/utils 子包

src/ 下没有任何文件 import 这四个子包，确认死代码后从 packages/ 目录及
根 package.json 的 workspace 依赖中删除，pnpm-lock.yaml 同步刷新。
'@
```
Expected: 提交成功。

---

## Phase 4: 删除 `packages/` 目录与 workspace 声明

完成最后一公里：删除 `packages/scripts`、`packages/uno-preset`，再删除整个 `packages/` 目录与 workspace 通配。

### Task 4.1: 删除剩余两个子包目录与 packages 根目录

**Files:**
- Delete: `packages/scripts/`、`packages/uno-preset/`、`packages/`

- [ ] **Step 1: 删除两个子包**

Run:
```powershell
Remove-Item -Recurse -Force packages/scripts, packages/uno-preset
```
Expected: 无报错。

- [ ] **Step 2: 删除 `packages/` 顶层目录**

Run:
```powershell
Remove-Item -Recurse -Force packages
```
Expected: 无报错。

- [ ] **Step 3: 校验已消失**

Run:
```powershell
Test-Path packages
```
Expected: 输出 `False`。

### Task 4.2: 从 package.json 移除最后两条 workspace devDependencies

**Files:**
- Modify: `package.json`（`devDependencies` 字段）

- [ ] **Step 1: 删除两行**

把 `devDependencies` 中：
```json
"@sa/scripts": "workspace:*",
"@sa/uno-preset": "workspace:*",
```
**删除**。

- [ ] **Step 2: 校验 package.json 不再有 `@sa/`**

Run:
```powershell
Select-String -Path "package.json" -Pattern "@sa/" -SimpleMatch
```
Expected: 无输出。

### Task 4.3: 清理 pnpm-workspace.yaml

**Files:**
- Modify: `pnpm-workspace.yaml`

- [ ] **Step 1: 删除 `packages:` 段**

修改前内容：
```yaml
packages:
  - 'packages/*'
allowBuilds:
  esbuild: true
  simple-git-hooks: false
  unrs-resolver: true
```
修改后内容（直接删除前两行，保留 `allowBuilds`）：
```yaml
allowBuilds:
  esbuild: true
  simple-git-hooks: false
  unrs-resolver: true
```

- [ ] **Step 2: 校验**

Run:
```powershell
Select-String -Path "pnpm-workspace.yaml" -Pattern "packages" -SimpleMatch
```
Expected: 无输出。

### Task 4.4: 同步 lockfile 并全量验证

- [ ] **Step 1: pnpm install**

Run:
```powershell
pnpm install
```
Expected: 退出码 0；`pnpm-lock.yaml` 中 `importers` 节点不再出现以 `packages/` 开头的 key（只剩 `.`）。

- [ ] **Step 2: typecheck**

Run:
```powershell
pnpm typecheck
```
Expected: 退出码 0。

- [ ] **Step 3: 单元测试**

Run:
```powershell
pnpm test
```
Expected: 退出码 0，数量与基线一致。

- [ ] **Step 4: 构建**

Run:
```powershell
pnpm build
```
Expected: 退出码 0；产物 CSS 仍含 `flex-center` 等 shortcut。

- [ ] **Step 5: CLI 帮助 6 个子命令仍在**

Run:
```powershell
pnpm tsx src/scripts/bin.ts --help
```
Expected: 输出 6 个子命令。

- [ ] **Step 6: 全仓库扫 `@sa/`，确认零命中**

Run:
```powershell
Get-ChildItem -Recurse -File -Include "*.ts","*.tsx","*.vue","*.js","*.json","*.yaml","*.yml" -Path . -ErrorAction SilentlyContinue |
  Where-Object { $_.FullName -notmatch "\\(node_modules|agentignore|dist|src-tauri\\target)\\" -and $_.Name -ne "pnpm-lock.yaml" } |
  Select-String -Pattern "@sa/" -SimpleMatch
```
Expected: 无任何输出。

### Task 4.5: 提交 Phase 4

- [ ] **Step 1: 暂存所有改动（含删除）**

Run:
```powershell
git add -A
git status --short
```
Expected: 删除记录覆盖 `packages/scripts/**`、`packages/uno-preset/**`，加 `M package.json`、`M pnpm-workspace.yaml`、`M pnpm-lock.yaml`。

- [ ] **Step 2: 提交（中文）**

Run:
```powershell
git commit -m @'
refactor(workspace): 删除 packages 目录并清理 workspace 声明

至此 packages/ 目录彻底消失。同时移除根 package.json 中最后两条
@sa/* workspace 依赖（scripts、uno-preset），并清理 pnpm-workspace.yaml
里的 packages 通配。pnpm install/typecheck/test/build 全部通过，
src/scripts/bin.ts 仍提供六个 CLI 子命令。
'@
```
Expected: 提交成功，pre-commit 与 commit-msg 钩子均使用新链路通过。

---

## Phase 5: 文档与 openspec 归档

收尾：检查文档，让 openspec change 进入 archive。

### Task 5.1: 检查仓库 docs 是否提到 `@sa/*` 或 `packages/`

- [ ] **Step 1: 扫描 README 与 docs**

Run:
```powershell
Get-ChildItem -Recurse -File -Include "*.md" -Path . -ErrorAction SilentlyContinue |
  Where-Object { $_.FullName -notmatch "\\(node_modules|agentignore|openspec\\changes)\\" } |
  Select-String -Pattern "@sa/|packages/" -SimpleMatch
```
Expected: 若有命中，逐项检查并改写为新位置；若纯历史描述（如 changelog），保留即可。

- [ ] **Step 2: 如有需要，更新 `README.md`**

如果 `README.md` 提到 `@sa/*` 包或 `packages/` 子目录结构，把相关段落改写为：
> "项目源码集中在 `src/`：业务代码、UnoCSS 预设（`src/uno-preset/`）、CLI 工具脚本（`src/scripts/`）。"

具体改动以实际 README 内容为准；如无相关内容，跳过 Step 2。

### Task 5.2: openspec 校验与归档

- [ ] **Step 1: 在 tasks.md 中把所有 task 勾选完成**

打开 `openspec/changes/migrate-packages-to-src/tasks.md`，把每个 `- [ ]` 全部改为 `- [x]`。（与本计划一一对应，逐条勾选。）

- [ ] **Step 2: 运行 openspec validate**

Run:
```powershell
openspec validate migrate-packages-to-src
```
Expected: 输出 `Change 'migrate-packages-to-src' is valid`。

- [ ] **Step 3: 调用归档**

可以用 Skill 工具：
```
Skill openspec-archive-change "migrate-packages-to-src"
```
或直接执行 CLI：
```powershell
openspec archive migrate-packages-to-src --yes
```
Expected: change 移动到 `openspec/changes/archive/` 之类的归档位置（具体路径由 openspec 工具决定），并把 `specs/workspace-layout/spec.md` 应用到 `openspec/specs/workspace-layout/spec.md`。

### Task 5.3: 提交 Phase 5

- [ ] **Step 1: 暂存改动**

Run:
```powershell
git add -A
git status --short
```
Expected: 包含 `M openspec/changes/migrate-packages-to-src/tasks.md`、归档后的文件移动记录、`README.md`（若有改动）。

- [ ] **Step 2: 提交（中文）**

Run:
```powershell
git commit -m @'
docs(openspec): 归档 migrate-packages-to-src 并同步文档

任务全部勾选完成；openspec archive 将 workspace-layout 规范并入主线，
并把 change 移入归档目录。README 若有提及 @sa/* / packages/ 的位置
也同步更新为新的 src/ 结构。
'@
```
Expected: 提交成功。

---

## Self-Review

**1. 规范覆盖检查（对照 specs/workspace-layout/spec.md 6 条 Requirement）**
- "仓库不得保留 `packages/` workspace 子目录" → Phase 4 Task 4.1 + Task 4.3
- "`package.json` 不得保留 `@sa/*` workspace 依赖" → Phase 3 Task 3.3 + Phase 4 Task 4.2
- "UnoCSS 预设由 `src/uno-preset` 模块提供" → Phase 1 全部任务
- "CLI 工具 `sa` 由 `src/scripts` 模块提供" → Phase 2 全部任务
- "类型检查与测试套件迁移后无回归" → 每个 Phase 验证小节都跑 typecheck / test
- "历史 `@sa/*` 命名空间彻底废弃" → Phase 4 Task 4.4 Step 6 全文搜索

全部覆盖。

**2. 占位符扫描**
- 无 "TBD"、"implement later"、"similar to Task N"。
- 每个写文件 step 都给出了完整代码。
- 每个验证 step 都给出了具体命令与期望输出。

**3. 类型与名称一致性**
- `presetSoybeanAdmin` 函数名贯穿 Phase 1 不变。
- `setupCli`、`cleanup`、`updatePkg`、`gitCommit`、`gitCommitVerify`、`genChangelog`、`release` 六个导出名在 Phase 2 中保持一致。
- `src/scripts/bin.ts` 的 import 路径 `'./index.ts'` 与新位置匹配。
- `import { version } from '../../package.json'` 与新位置（`src/scripts/index.ts` → 根 `package.json`）层级一致。

无类型不一致问题。

---

## Execution Handoff

Plan complete and saved to `D:/Steno/openspec/changes/migrate-packages-to-src/PLAN.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
