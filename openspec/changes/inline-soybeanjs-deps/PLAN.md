# Inline Soybeanjs Deps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把项目残留的 2 个 SoybeanJS npm 依赖（`@soybeanjs/changelog` 576 行 + `@soybeanjs/eslint-config-vue` 136 行 + 其传递依赖 `@soybeanjs/eslint-config@1.7.5`）的实现完整内联到 `src/scripts/changelog/` 与 `src/eslint/` 下；同时把 `src/uno-preset/index.ts` 中 `preset-soybean-admin` 与 `src/scripts/config/index.ts` 中 `name: 'soybean'` 重命名为 `steno`；最终从 `package.json` 删除所有 `@soybeanjs/*` 依赖，全文搜索 `@soybeanjs/` 命中数为 0。

**Architecture:** 不重写算法、不调整规则——纯位置迁移。从 `node_modules/@soybeanjs/<pkg>/dist/index.js` 的 `//#region src/<name>.ts` 注释边界出发，把 ESM dist 反推为多文件 TypeScript 源（changelog 拆 7 文件，eslint-config 拆 4 文件），加上从 `dist/index.d.ts` 抽取的接口类型。所有外部包依赖原样保留，但从 `@soybeanjs/changelog` 的传递依赖位置移动到根 `package.json` 的 `devDependencies`。

**Tech Stack:** pnpm 11、TypeScript 5.9（ESM `moduleResolution: bundler`）、tsx 4.21、ESLint 10 flat config、Windows PowerShell。

---

## File Structure

| 操作 | 路径 | 来源 region / 说明 |
|---|---|---|
| 创建 | `src/scripts/changelog/types.ts` | 反推自 `dist/index.d.ts` 的 `src/types.d.ts` 区段：导出 `ChangelogOption`、`GitCommit`、`Reference`、`ResolvedAuthor`、`RawGitCommit`、`GitCommitAuthor`、`GithubConfig` 7 个接口 |
| 创建 | `src/scripts/changelog/shared.ts` | dist line 11-52 region：`execCommand`、`notNullish`、`partition`、`groupBy`、`capitalize`、`join` 6 个工具函数；外部 import：`execa`（动态）、`node:process` |
| 创建 | `src/scripts/changelog/constant.ts` | dist line 53-58 region：`VERSION_REG`、`VERSION_REG_OF_MARKDOWN`、`VERSION_WITH_RELEASE` 三个正则 |
| 创建 | `src/scripts/changelog/git.ts` | dist line 59-284 region：~30 个 git/github 工具函数（tag 列表、commits 解析、reference 抓取、`getGitHubRepo`、`isPrerelease` 等）；外部 import：`semver`、`ofetch`、`consola`、`convert-gitmoji`、`dayjs` |
| 创建 | `src/scripts/changelog/options.ts` | dist line 285-351 region：`createDefaultOptions`、`createOptions`、`getVersionFromPkgJson`；外部 import：`node:fs/promises` |
| 创建 | `src/scripts/changelog/markdown.ts` | dist line 352-491 region：`formatReferences`、`formatCommit`、按 type 分组渲染；外部 import：`dayjs`、`convert-gitmoji` |
| 创建 | `src/scripts/changelog/index.ts` | dist line 492-576 region：4 个公开 API：`getChangelogMarkdown`、`getTotalChangelogMarkdown`、`generateChangelog`、`generateTotalChangelog`；外部 import：`cli-progress`、`node:fs/promises`、`node:fs`、`consola` |
| 创建 | `src/eslint/shared.ts` | dist `src/shared.ts` region：`interopDefault` 1 个函数 |
| 创建 | `src/eslint/ts-rules.ts` | 从 dist `defineConfig` 内的 `tsRules` 对象表达式提取为命名常量；约 50 条 `@typescript-eslint/*` 规则 |
| 创建 | `src/eslint/vue-rules.ts` | 从 dist `defineConfig` 内的 vue 规则块提取为 `buildVueRules(pluginVue)` 工厂；约 30 条 `vue/*` 规则 |
| 创建 | `src/eslint/index.ts` | dist `src/index.ts` region：`defineConfig(overrides?)` 主入口；运行时 `import('eslint-plugin-vue')`、`import('vue-eslint-parser')`、`import('@typescript-eslint/eslint-plugin')` |
| 修改 | `src/scripts/commands/changelog.ts` | 把 `from '@soybeanjs/changelog'` 改为 `from '../changelog'` |
| 修改 | `src/scripts/types/index.ts` | 把 `from '@soybeanjs/changelog'` 改为 `from '../changelog/types'` |
| 修改 | `eslint.config.js` | 把 `from '@soybeanjs/eslint-config-vue'` 改为 `from './src/eslint/index.ts'` |
| 修改 | `src/uno-preset/index.ts` | `name: 'preset-soybean-admin'` → `name: 'preset-steno'` |
| 修改 | `src/scripts/config/index.ts` | c12 `name: 'soybean'` → `name: 'steno'` |
| 修改 | `package.json` | devDependencies 增 9 条（cli-progress / convert-gitmoji / ofetch / semver / @types/cli-progress / @types/semver / @typescript-eslint/eslint-plugin / @typescript-eslint/parser / eslint-plugin-vue），删 2 条（@soybeanjs/changelog / @soybeanjs/eslint-config-vue） |

---

## Phase 0: 基线快照

### Task 0.1: 跑通基线并固化对比数据

**Files:** 无改动。

- [ ] **Step 1: 冻结安装**

Run:
```powershell
pnpm install --frozen-lockfile
```
Expected: 退出码 0，无 `ERR_PNPM_OUTDATED_LOCKFILE`。

- [ ] **Step 2: typecheck 基线**

Run:
```powershell
pnpm typecheck
```
Expected: 退出码 0，无任何 `error TS` 输出。

- [ ] **Step 3: lint 基线（关键）**

Run:
```powershell
pnpm lint 2>&1 | Tee-Object -FilePath D:/Steno/.tmp-lint-baseline.txt
```
Expected: 输出含 `✖ 9 problems (0 errors, 9 warnings)`；记录 3 个文件、9 个 warning 的精确清单（`MarkdownSourceEditor.vue:18:57`、`WritingSurface.vue:42:8` 等）。这份 baseline 是 Phase 2 验证的硬性对比对象。

- [ ] **Step 4: test 基线**

Run:
```powershell
pnpm test 2>&1 | Select-String -Pattern "Test Files|Tests "
```
Expected: 输出 `Test Files 2 failed | 35 passed | 1 skipped (38)`、`Tests 3 failed | 214 passed | 11 skipped (228)`。

- [ ] **Step 5: build 基线**

Run:
```powershell
pnpm build
```
Expected: 退出码 0，`dist/` 生成。

- [ ] **Step 6: 确认 @soybeanjs 起点**

Run:
```powershell
Select-String -Path package.json -Pattern "@soybeanjs/"
```
Expected: 输出两行——`@soybeanjs/changelog` 与 `@soybeanjs/eslint-config-vue`。

**Phase 0 无 git commit**（无改动）。

---

## Phase 1: 内联 `@soybeanjs/changelog` 到 `src/scripts/changelog/`

把 576 行 ESM dist 按 region 拆为 7 个 TS 文件，公开 API 签名完全等价。

### Task 1.1: 把 changelog 运行时依赖提升到根 devDependencies

**Files:**
- Modify: `package.json`（`devDependencies`）

- [ ] **Step 1: 在 devDependencies 中插入 6 个新项**

打开 `package.json`，在 `devDependencies` 中按字母序插入：
```json
"@types/cli-progress": "^3.11.6",
"@types/semver": "^7.7.1",
"cli-progress": "3.12.0",
"convert-gitmoji": "0.1.5",
"ofetch": "1.5.1",
"semver": "7.7.3",
```
（`dayjs`、`execa`、`consola` 已存在于根依赖，无需重复添加。）

- [ ] **Step 2: 安装**

Run:
```powershell
pnpm install
```
Expected: 退出码 0，6 个 `+` 新增条目。

- [ ] **Step 3: 验证可解析**

Run:
```powershell
pnpm exec node -e "import('cli-progress').then(m => console.log(Object.keys(m).includes('SingleBar')))"
pnpm exec node -e "import('semver').then(m => console.log(typeof m.default))"
pnpm exec node -e "import('ofetch').then(m => console.log(typeof m.ofetch))"
pnpm exec node -e "import('convert-gitmoji').then(m => console.log(typeof m.convert))"
```
Expected: 分别输出 `true`、`function/object`、`function`、`function`。

### Task 1.2: 创建 changelog 目录骨架

**Files:**
- Create: `src/scripts/changelog/`（空目录）

- [ ] **Step 1: 建目录**

Run:
```powershell
New-Item -ItemType Directory -Force "src/scripts/changelog" | Out-Null
```
Expected: 目录存在。

### Task 1.3: 写 `types.ts`（从 dist `.d.ts` 反推）

**Files:**
- Create: `src/scripts/changelog/types.ts`

- [ ] **Step 1: 读取 dist 类型源**

Run:
```powershell
Get-Content node_modules/@soybeanjs/changelog/dist/index.d.ts
```
找到 `src/types.d.ts` region（从 `interface GitCommitAuthor` 到 `interface ChangelogOption` 闭合）。

- [ ] **Step 2: 写入 `src/scripts/changelog/types.ts`**

把以下接口完整复制（保留 JSDoc 注释）：`GitCommitAuthor`、`RawGitCommit`、`Reference`、`ResolvedAuthor`、`GitCommit`、`GithubConfig`、`ChangelogOption`。文件以 `export interface` 形式导出每一个；不导出 `default`。

校验：
```powershell
Test-Path src/scripts/changelog/types.ts
```
Expected: True。

### Task 1.4: 写 `shared.ts`（dist line 11-52 region）

**Files:**
- Create: `src/scripts/changelog/shared.ts`

- [ ] **Step 1: 复制 region 到新文件**

把 `node_modules/@soybeanjs/changelog/dist/index.js` 第 11 行到第 52 行（`//#region src/shared.ts` 之间）的 6 个函数 (`execCommand`、`notNullish`、`partition`、`groupBy`、`capitalize`、`join`) 复制到 `src/scripts/changelog/shared.ts`。

- [ ] **Step 2: 加 TypeScript 类型注解**

对 6 个函数补全参数与返回值类型：
- `execCommand(cmd: string, args: string[], options?: import('execa').Options): Promise<string>`
- `notNullish<T>(v: T | null | undefined): v is T`
- `partition<T>(array: T[], ...filters: Array<(e: T, idx: number, arr: T[]) => boolean>): T[][]`
- `groupBy<T, K extends keyof T>(items: T[], key: K, groups?: Record<string, T[]>): Record<string, T[]>`
- `capitalize(str: string): string`
- `join(array: readonly string[] | undefined, glue?: string, finalGlue?: string): string`

每个函数前加 `export`。

- [ ] **Step 3: 类型检查 sanity**

Run:
```powershell
pnpm typecheck
```
Expected: 0 error（虽然 `shared.ts` 还没被消费，但被 include 进 tsconfig 时若类型不正确会立刻爆）。

### Task 1.5: 写 `constant.ts`（dist line 53-58 region）

**Files:**
- Create: `src/scripts/changelog/constant.ts`

- [ ] **Step 1: 写文件**

把 dist 第 54-56 行三个常量复制进来，加 `export`：

```ts
export const VERSION_REG = /^v\d+\.\d+\.\d+(-(beta|alpha)\.\d+)?/;
export const VERSION_REG_OF_MARKDOWN = /## \[v\d+\.\d+\.\d+(-(beta|alpha)\.\d+)?]/g;
export const VERSION_WITH_RELEASE = /release\sv\d+\.\d+\.\d+(-(beta|alpha)\.\d+)?/;
```

### Task 1.6: 写 `git.ts`（dist line 59-284 region）

**Files:**
- Create: `src/scripts/changelog/git.ts`

- [ ] **Step 1: 把整段 region 原样复制到新文件**

把 dist 第 60-283 行（region 内部）粘到 `src/scripts/changelog/git.ts`。这段含约 30 个函数，涉及：
- git 命令（`getTotalGitTags`、`getTagDateMap`、`getCurrentGitBranch`、`getGitHubRepo`、`getFirstGitCommit`、`isPrerelease`、`parseGitCommit` 等）
- GitHub API 调用（通过 `ofetch` 拉作者 login）
- commit 解析（regex 抓 type/scope/breaking/issue/PR）

- [ ] **Step 2: 把顶部所需 import 补在文件开头**

```ts
import semver from 'semver';
import { ofetch } from 'ofetch';
import { consola } from 'consola';
import { execCommand, notNullish, partition } from './shared';
import type { ChangelogOption, GitCommit, GitCommitAuthor, RawGitCommit, Reference, ResolvedAuthor } from './types';
```

（dist 整文件顶部的 import 中只有 `semver`、`ofetch`、`consola` 与本 region 直接相关；`dayjs`、`convert-gitmoji` 仅被 markdown 模块用；`cli-progress` 只在 index 模块用。）

- [ ] **Step 3: 为函数补类型注解**

阅读每个函数实际使用情况，给参数与返回值打类型（如 `parseGitCommit(commit: RawGitCommit, options: ChangelogOption): Promise<GitCommit>`）。若一时无法精确推导，可先用 `any` 占位再迭代修复——但优先尝试用 `GitCommit`/`RawGitCommit`/`Reference`/`ChangelogOption` 等 `types.ts` 已定义的接口。

- [ ] **Step 4: 给所有导出函数加 `export`**

确保下游 `options.ts` / `markdown.ts` / `index.ts` 引用的函数（如 `getTotalGitTags`、`getGitHubRepo`、`getFirstGitCommit`、`getTagDateMap`、`isPrerelease`、`parseGitCommit`、`getCommits`、`getResolvedAuthorsInfo` 等）都加上 `export` 关键字。

### Task 1.7: 写 `options.ts`（dist line 285-351 region）

**Files:**
- Create: `src/scripts/changelog/options.ts`

- [ ] **Step 1: 复制并加 import**

把 dist 第 286-350 行复制到 `src/scripts/changelog/options.ts`，并补 import：

```ts
import process from 'node:process';
import { readFile } from 'node:fs/promises';
import { getFirstGitCommit, getGitHubRepo, getTagDateMap, getTotalGitTags, isPrerelease } from './git';
import type { ChangelogOption } from './types';
```

- [ ] **Step 2: 加导出**

为 `createDefaultOptions`、`createOptions`、`getVersionFromPkgJson` 添加 `export`。

### Task 1.8: 写 `markdown.ts`（dist line 352-491 region）

**Files:**
- Create: `src/scripts/changelog/markdown.ts`

- [ ] **Step 1: 复制并加 import**

把 dist 第 353-490 行复制到 `src/scripts/changelog/markdown.ts`，补 import：

```ts
import dayjs from 'dayjs';
import { convert } from 'convert-gitmoji';
import { capitalize, groupBy, join, notNullish, partition } from './shared';
import type { ChangelogOption, GitCommit, Reference } from './types';
```

- [ ] **Step 2: 加导出**

为 `generateMarkdown`、`formatCommit`、`formatReferences` 等公共函数加 `export`。

### Task 1.9: 写 `index.ts`（dist line 492-576 region）

**Files:**
- Create: `src/scripts/changelog/index.ts`

- [ ] **Step 1: 复制并加 import**

把 dist 第 493-575 行（不含 `//#region` 与 `//#endregion`）复制到 `src/scripts/changelog/index.ts`，并补 import：

```ts
import { Presets, SingleBar } from 'cli-progress';
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { consola } from 'consola';
import { createOptions } from './options';
import { getCommits, getResolvedAuthorsInfo, parseGitCommit } from './git';
import { generateMarkdown } from './markdown';
import { VERSION_REG, VERSION_REG_OF_MARKDOWN, VERSION_WITH_RELEASE } from './constant';
import type { ChangelogOption } from './types';
```

> 注：上面 6 个 `from './git'` import 名取自 dist 内部 region 内调用形式；执行时如果函数名实际不同，按 dist 真实名称调整。

- [ ] **Step 2: 导出 4 个公开 API + 类型**

确保最末尾或函数定义前加 `export`：
```ts
export async function getChangelogMarkdown(...) { ... }
export async function getTotalChangelogMarkdown(...) { ... }
export async function generateChangelog(...) { ... }
export async function generateTotalChangelog(...) { ... }
export type { ChangelogOption } from './types';
```

### Task 1.10: 切换消费者引用到本地路径

**Files:**
- Modify: `src/scripts/commands/changelog.ts`
- Modify: `src/scripts/types/index.ts`

- [ ] **Step 1: 改 `src/scripts/commands/changelog.ts`**

把：
```ts
import { generateChangelog, generateTotalChangelog } from '@soybeanjs/changelog';
import type { ChangelogOption } from '@soybeanjs/changelog';
```
替换为：
```ts
import { generateChangelog, generateTotalChangelog } from '../changelog';
import type { ChangelogOption } from '../changelog';
```

- [ ] **Step 2: 改 `src/scripts/types/index.ts`**

把：
```ts
import type { ChangelogOption } from '@soybeanjs/changelog';
```
替换为：
```ts
import type { ChangelogOption } from '../changelog';
```

### Task 1.11: 验证 changelog 内联

- [ ] **Step 1: typecheck**

Run:
```powershell
pnpm typecheck
```
Expected: 退出码 0。

- [ ] **Step 2: CLI 帮助**

Run:
```powershell
pnpm tsx src/scripts/bin.ts changelog --help
```
Expected: 输出含 `generate changelog`；退出码 0。

- [ ] **Step 3: CLI 主入口 6 子命令仍在**

Run:
```powershell
pnpm tsx src/scripts/bin.ts --help
```
Expected: 仍输出 `cleanup`、`update-pkg`、`git-commit`、`git-commit-verify`、`changelog`、`release` 六个子命令。

- [ ] **Step 4: 单元测试不回归**

Run:
```powershell
pnpm test 2>&1 | Select-String -Pattern "Tests "
```
Expected: 与基线一致（`Tests 3 failed | 214 passed | 11 skipped`）。

### Task 1.12: 提交 Phase 1

- [ ] **Step 1: 暂存**

Run:
```powershell
git add src/scripts/changelog src/scripts/commands/changelog.ts src/scripts/types/index.ts package.json pnpm-lock.yaml
git status --short | Select-Object -First 12
```
Expected: 7 个新文件 + 4 个修改文件。

- [ ] **Step 2: 提交**

Run:
```powershell
git commit -m @'
refactor(changelog): 内联 @soybeanjs/changelog 实现到 src/scripts/changelog

按 dist 的 //#region 拆分还原为 7 个 TS 文件（types/shared/constant/git/
options/markdown/index）；外部依赖 cli-progress、convert-gitmoji、
ofetch、semver 提升到根 devDependencies；commands/changelog.ts 与
types/index.ts 改为相对路径引用。CLI changelog --help 仍正常输出。
'@
```
Expected: 提交成功；pre-commit 钩子通过。

---

## Phase 2: 内联 `@soybeanjs/eslint-config-vue` 到 `src/eslint/`

把 136 行 dist 拆为 4 个 TS 文件，lint 行为必须与 baseline 100% 一致（9 warnings、同位置）。

### Task 2.1: 提升 ESLint 配置依赖

**Files:**
- Modify: `package.json`

- [ ] **Step 1: 追加 3 个 devDependencies**

在 `devDependencies` 中按字母序插入：
```json
"@typescript-eslint/eslint-plugin": "^8.59.2",
"@typescript-eslint/parser": "^8.59.2",
"eslint-plugin-vue": "^10.9.1",
```

- [ ] **Step 2: pnpm install**

Run:
```powershell
pnpm install
```
Expected: 退出码 0，3 个 `+` 新增。

### Task 2.2: 创建 eslint 目录骨架

- [ ] **Step 1: 建目录**

Run:
```powershell
New-Item -ItemType Directory -Force "src/eslint" | Out-Null
```
Expected: 目录存在。

### Task 2.3: 写 `shared.ts`

**Files:**
- Create: `src/eslint/shared.ts`

- [ ] **Step 1: 复制 interopDefault**

把 dist 顶部的 `interopDefault` 函数（来自 `//#region src/shared.ts`）写入新文件，加类型与导出：

```ts
export async function interopDefault<T>(m: T | Promise<T>): Promise<T extends { default: infer D } ? D : T> {
  const resolved = (await m) as T & { default?: unknown };
  return (resolved.default || resolved) as T extends { default: infer D } ? D : T;
}
```

### Task 2.4: 写 `ts-rules.ts`

**Files:**
- Create: `src/eslint/ts-rules.ts`

- [ ] **Step 1: 从 dist 提取 tsRules**

打开 `node_modules/@soybeanjs/eslint-config-vue/dist/index.js`，找到 `defineConfig` 内部 `const tsRules = { ... }` 整块（约 30 行）。

写入 `src/eslint/ts-rules.ts`：

```ts
import type { Linter } from 'eslint';

export function buildTsRules(pluginTs: {
  configs: {
    base: { rules: Linter.RulesRecord };
    'eslint-recommended': { overrides: Array<{ rules: Linter.RulesRecord }> };
    strict: { rules: Linter.RulesRecord };
  };
}): Linter.RulesRecord {
  const { rules: recommendedRules } = pluginTs.configs['eslint-recommended'].overrides[0];
  return {
    ...pluginTs.configs.base.rules,
    ...recommendedRules,
    ...pluginTs.configs.strict.rules,
    '@typescript-eslint/consistent-type-imports': ['error', {
      prefer: 'type-imports',
      disallowTypeAnnotations: false
    }],
    '@typescript-eslint/no-empty-interface': ['error', { allowSingleExtends: true }],
    'no-redeclare': 'off',
    '@typescript-eslint/no-redeclare': 'error',
    'no-unused-vars': 'off',
    '@typescript-eslint/no-unused-vars': ['error', {
      vars: 'all',
      args: 'all',
      ignoreRestSiblings: false,
      varsIgnorePattern: '^_',
      argsIgnorePattern: '^_'
    }],
    'no-use-before-define': 'off',
    '@typescript-eslint/no-use-before-define': ['error', {
      functions: false,
      classes: false,
      variables: true
    }],
    'no-shadow': 'off',
    '@typescript-eslint/no-shadow': 'error',
    '@typescript-eslint/ban-types': 'off',
    '@typescript-eslint/consistent-type-definitions': 'off',
    '@typescript-eslint/no-empty-function': 'off',
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-non-null-assertion': 'off',
    '@typescript-eslint/unified-signatures': 'off'
  };
}
```

### Task 2.5: 写 `vue-rules.ts`

**Files:**
- Create: `src/eslint/vue-rules.ts`

- [ ] **Step 1: 从 dist 提取 vue 规则**

`defineConfig` 内部 `const vueRules = [...].reduce(...)` + 后面那个大 `rules: { ...tsRules, ...pluginVue.configs.base.rules, ...vueRules, ... }` 对象中的 vue/* 规则。

写入 `src/eslint/vue-rules.ts`：

```ts
import type { Linter } from 'eslint';

interface VuePlugin {
  configs: Record<string, { rules?: Linter.RulesRecord }>;
}

export function buildVueRules(pluginVue: VuePlugin): Linter.RulesRecord {
  const vueRecommendedRules = ['essential', 'strongly-recommended', 'recommended'].reduce<Linter.RulesRecord>(
    (preRules, key) => ({ ...preRules, ...(pluginVue.configs[key]?.rules ?? {}) }),
    {}
  );

  return {
    ...(pluginVue.configs.base?.rules ?? {}),
    ...vueRecommendedRules,
    'vue/block-order': ['warn', { order: ['script', 'template', 'style'] }],
    'vue/component-api-style': ['warn', ['script-setup', 'composition']],
    'vue/component-name-in-template-casing': ['warn', 'PascalCase', { registeredComponentsOnly: false, ignores: [] }],
    'vue/component-options-name-casing': ['warn', 'PascalCase'],
    'vue/custom-event-name-casing': ['warn', 'camelCase'],
    'vue/define-emits-declaration': ['warn', 'type-based'],
    'vue/define-macros-order': 'off',
    'vue/define-props-declaration': ['warn', 'type-based'],
    'vue/html-comment-content-newline': 'warn',
    'vue/html-self-closing': 'off',
    'vue/max-attributes-per-line': 'off',
    'vue/multi-word-component-names': 'off',
    'vue/next-tick-style': ['warn', 'promise'],
    'vue/no-duplicate-attr-inheritance': 'warn',
    'vue/no-required-prop-with-default': 'warn',
    'vue/no-reserved-component-names': 'off',
    'vue/no-static-inline-styles': 'off',
    'vue/no-template-target-blank': 'error',
    'vue/no-this-in-before-route-enter': 'error',
    'vue/no-undef-properties': 'warn',
    'vue/no-unsupported-features': 'warn',
    'vue/no-unused-emit-declarations': 'warn',
    'vue/no-unused-properties': 'warn',
    'vue/no-unused-refs': 'warn',
    'vue/no-use-v-else-with-v-for': 'error',
    'vue/no-useless-mustaches': 'warn',
    'vue/no-useless-v-bind': 'error',
    'vue/no-v-text': 'warn',
    'vue/padding-line-between-blocks': 'warn',
    'vue/prefer-define-options': 'warn',
    'vue/prefer-separate-static-class': 'warn',
    'vue/prop-name-casing': ['warn', 'camelCase'],
    'vue/require-macro-variable-name': ['warn', {
      defineProps: 'props',
      defineEmits: 'emit',
      defineSlots: 'slots',
      useSlots: 'slots',
      useAttrs: 'attrs'
    }],
    'vue/singleline-html-element-content-newline': 'off',
    'vue/valid-define-options': 'warn',
    'vue/valid-v-slot': 'off'
  };
}
```

### Task 2.6: 写 `index.ts`

**Files:**
- Create: `src/eslint/index.ts`

- [ ] **Step 1: 装配 defineConfig**

```ts
import type { Linter } from 'eslint';
import { interopDefault } from './shared';
import { buildTsRules } from './ts-rules';
import { buildVueRules } from './vue-rules';

export async function defineConfig(overrides: Linter.RulesRecord = {}): Promise<Linter.Config[]> {
  const [pluginVue, parserVue, pluginTs] = await Promise.all([
    interopDefault(import('eslint-plugin-vue')),
    interopDefault(import('vue-eslint-parser')),
    interopDefault(import('@typescript-eslint/eslint-plugin'))
  ]) as [any, any, any];

  const tsRules = buildTsRules(pluginTs);
  const vueRules = buildVueRules(pluginVue);

  return [
    { plugins: { vue: pluginVue } },
    {
      files: ['**/*.vue'],
      languageOptions: {
        parser: parserVue,
        parserOptions: {
          ecmaFeatures: { jsx: true },
          extraFileExtensions: ['.vue'],
          parser: '@typescript-eslint/parser',
          sourceType: 'module'
        }
      },
      processor: pluginVue.processors['.vue'],
      plugins: { '@typescript-eslint': pluginTs },
      rules: {
        ...tsRules,
        ...vueRules,
        ...overrides
      }
    }
  ];
}

export default defineConfig;
```

> 注：使用 `any` 三连显式 cast 避免插件类型不齐全造成的类型噪音。这是与上游 dist 行为最一致的做法。

### Task 2.7: 切换 `eslint.config.js` 走本地引用

**Files:**
- Modify: `eslint.config.js`

- [ ] **Step 1: 改 import 行**

把：
```js
import { defineConfig } from '@soybeanjs/eslint-config-vue';
```
替换为：
```js
import { defineConfig } from './src/eslint/index.ts';
```

其余内容（overrides 对象、ignores）保持不变。

> 注：ESLint 10 flat config 通过 `jiti` 解析 `.ts` 入口，无需额外配置。

### Task 2.8: 验证 lint 零飘移

- [ ] **Step 1: 跑 lint**

Run:
```powershell
pnpm lint 2>&1 | Tee-Object -FilePath D:/Steno/.tmp-lint-after.txt
```
Expected: 输出仍是 `✖ 9 problems (0 errors, 9 warnings)`，且 3 个文件、9 个警告位置完全一致。

- [ ] **Step 2: 二进制 diff 对比 baseline**

Run:
```powershell
Compare-Object (Get-Content D:/Steno/.tmp-lint-baseline.txt) (Get-Content D:/Steno/.tmp-lint-after.txt) | Where-Object { $_.InputObject -notmatch "Finished in|files with" }
```
Expected: 无输出（除去时间统计行）。若有差异，定位是哪条规则飘移，回到 `ts-rules.ts` 或 `vue-rules.ts` 修正。

- [ ] **Step 3: typecheck**

Run:
```powershell
pnpm typecheck
```
Expected: 退出码 0。

### Task 2.9: 提交 Phase 2

- [ ] **Step 1: 暂存**

Run:
```powershell
git add src/eslint eslint.config.js package.json pnpm-lock.yaml
```

- [ ] **Step 2: 提交**

Run:
```powershell
git commit -m @'
refactor(eslint): 内联 @soybeanjs/eslint-config-vue 实现到 src/eslint

按职责拆为 4 个 TS 文件（shared/ts-rules/vue-rules/index）；
@typescript-eslint/eslint-plugin、@typescript-eslint/parser、
eslint-plugin-vue 提升到根 devDependencies；eslint.config.js
改为相对路径引用本地 defineConfig。pnpm lint 输出与基线 9 个
warning 完全一致（同文件、同行、同规则）。
'@
```

---

## Phase 3: 重命名 `soybean` 字样为 `steno`

### Task 3.1: 重命名 UnoCSS preset 名

**Files:**
- Modify: `src/uno-preset/index.ts:19`

- [ ] **Step 1: 改 preset name**

把 `name: 'preset-soybean-admin'` 替换为 `name: 'preset-steno'`。

- [ ] **Step 2: 验证 build**

Run:
```powershell
pnpm build
```
Expected: 退出码 0。

### Task 3.2: 重命名 c12 配置名

**Files:**
- Modify: `src/scripts/config/index.ts:31`

- [ ] **Step 1: 改 c12 name**

把 `name: 'soybean'` 替换为 `name: 'steno'`。

- [ ] **Step 2: 验证 CLI**

Run:
```powershell
pnpm tsx src/scripts/bin.ts --help
```
Expected: 仍输出 6 个子命令。

### Task 3.3: 验证全局

- [ ] **Step 1: typecheck + lint**

Run:
```powershell
pnpm typecheck
pnpm lint
```
Expected: 全部退出码 0；lint warning 数量与位置仍持平基线。

- [ ] **Step 2: 全文搜 soybean（限主仓库）**

Run:
```powershell
Get-ChildItem -Recurse -File -Include "*.ts","*.tsx","*.vue","*.js" -Path src,uno.config.ts,eslint.config.js -ErrorAction SilentlyContinue |
  Select-String -Pattern "soybean" -SimpleMatch -CaseSensitive:$false
```
Expected: 无输出（src 与配置文件中 soybean 字样彻底消失）。

### Task 3.4: 提交 Phase 3

- [ ] **Step 1: 暂存并提交**

Run:
```powershell
git add src/uno-preset/index.ts src/scripts/config/index.ts
git commit -m @'
refactor(brand): 重命名 UnoCSS preset 与 c12 配置名为 steno

src/uno-preset/index.ts 的 name 由 'preset-soybean-admin' 改为
'preset-steno'；src/scripts/config/index.ts 的 c12 name 由
'soybean' 改为 'steno'。无运行时行为变化，build 与 CLI 均通过。
'@
```

---

## Phase 4: 删除 `@soybeanjs/*` 依赖

### Task 4.1: 从 package.json 删除 2 条依赖

**Files:**
- Modify: `package.json`（`devDependencies`）

- [ ] **Step 1: 删除两行**

打开 `package.json`，在 `devDependencies` 中删掉：
```json
"@soybeanjs/changelog": "0.4.3",
"@soybeanjs/eslint-config-vue": "^0.0.2",
```

- [ ] **Step 2: 校验**

Run:
```powershell
Select-String -Path package.json -Pattern "@soybeanjs/" -SimpleMatch
```
Expected: 无输出。

### Task 4.2: 同步 lockfile

- [ ] **Step 1: pnpm install**

Run:
```powershell
pnpm install
```
Expected: 退出码 0；输出含 `- @soybeanjs/changelog` 与 `- @soybeanjs/eslint-config-vue`；lockfile 中 `@soybeanjs/eslint-config@1.7.5` 子图自动消失。

- [ ] **Step 2: 校验 lockfile 干净**

Run:
```powershell
Select-String -Path pnpm-lock.yaml -Pattern "^\s+'@soybeanjs/" | Select-Object -First 5
```
Expected: 无输出（pnpm-lock 中所有 @soybeanjs/ 命名空间条目消失）。

### Task 4.3: 全量验证

- [ ] **Step 1: typecheck**

Run:
```powershell
pnpm typecheck
```
Expected: 退出码 0。

- [ ] **Step 2: lint**

Run:
```powershell
pnpm lint
```
Expected: 退出码 0；9 warnings 与基线一致。

- [ ] **Step 3: test**

Run:
```powershell
pnpm test 2>&1 | Select-String -Pattern "Tests "
```
Expected: 与基线一致。

- [ ] **Step 4: build**

Run:
```powershell
pnpm build
```
Expected: 退出码 0。

- [ ] **Step 5: CLI 帮助**

Run:
```powershell
pnpm tsx src/scripts/bin.ts --help
pnpm tsx src/scripts/bin.ts changelog --help
```
Expected: 主帮助列 6 子命令；changelog --help 输出 `generate changelog` 描述。

- [ ] **Step 6: 全文扫 @soybeanjs（限活跃代码）**

Run:
```powershell
Get-ChildItem -Recurse -File -Include "*.ts","*.tsx","*.vue","*.js","*.json","*.yaml","*.yml" -Path . -ErrorAction SilentlyContinue |
  Where-Object { $_.FullName -notmatch "\\(node_modules|agentignore|dist|src-tauri\\target|openspec\\changes\\archive)\\" -and $_.Name -ne "pnpm-lock.yaml" } |
  Select-String -Pattern "@soybeanjs/" -SimpleMatch
```
Expected: 无输出。

### Task 4.4: 提交 Phase 4

- [ ] **Step 1: 暂存并提交**

Run:
```powershell
git add package.json pnpm-lock.yaml
git commit -m @'
refactor(deps): 删除 @soybeanjs/* 依赖并完成内联

package.json 移除 @soybeanjs/changelog 与 @soybeanjs/eslint-config-vue
两条 devDependencies；pnpm-lock.yaml 自动清理 @soybeanjs/eslint-config@1.7.5
传递依赖子图。typecheck / test（与基线一致）/ build / lint（9 warnings
持平基线）/ CLI 6 子命令全部通过；仓库源代码全文搜索 @soybeanjs/ 命中为 0。
'@
```

---

## Phase 5: openspec 归档

### Task 5.1: 勾选 tasks.md

**Files:**
- Modify: `openspec/changes/inline-soybeanjs-deps/tasks.md`

- [ ] **Step 1: 全量勾选**

把 `tasks.md` 中所有 `- [ ]` 替换为 `- [x]`。

Run（PowerShell 单行替换）:
```powershell
(Get-Content openspec/changes/inline-soybeanjs-deps/tasks.md) -replace '^- \[ \]','- [x]' | Set-Content openspec/changes/inline-soybeanjs-deps/tasks.md
```

- [ ] **Step 2: 校验**

Run:
```powershell
(Select-String -Path openspec/changes/inline-soybeanjs-deps/tasks.md -Pattern "^- \[ \]").Count
(Select-String -Path openspec/changes/inline-soybeanjs-deps/tasks.md -Pattern "^- \[x\]").Count
```
Expected: 第一行 0；第二行 ≥ 30。

### Task 5.2: openspec validate + archive

- [ ] **Step 1: 校验**

Run:
```powershell
openspec validate inline-soybeanjs-deps
```
Expected: 输出 `Change 'inline-soybeanjs-deps' is valid`。

- [ ] **Step 2: 归档**

Run:
```powershell
openspec archive inline-soybeanjs-deps --yes
```
Expected: 输出含 `Applying changes to openspec/specs/workspace-layout/spec.md` 与 `archived as '2026-05-29-inline-soybeanjs-deps'`。

- [ ] **Step 3: 验证 archive 落地**

Run:
```powershell
Test-Path openspec/changes/archive/2026-05-29-inline-soybeanjs-deps
Test-Path openspec/specs/workspace-layout/spec.md
Test-Path openspec/changes/inline-soybeanjs-deps
```
Expected: 第一/第二行 True；第三行 False。

### Task 5.3: 清理临时文件并提交

- [ ] **Step 1: 删除 baseline 临时文件**

Run:
```powershell
Remove-Item -Force D:/Steno/.tmp-lint-baseline.txt, D:/Steno/.tmp-lint-after.txt -ErrorAction SilentlyContinue
```

- [ ] **Step 2: 暂存并提交**

Run:
```powershell
git add openspec/changes/inline-soybeanjs-deps openspec/changes/archive openspec/specs/workspace-layout
git commit -m @'
docs(openspec): 归档 inline-soybeanjs-deps

约 30 个任务全部勾选完成；openspec archive 把 workspace-layout 的
增量规范（4 条 ADDED + 1 条 MODIFIED Requirements）合并到主 specs，
并把 change 目录搬到 openspec/changes/archive/2026-05-29-inline-soybeanjs-deps/。
'@
```

---

## Self-Review

**1. 规范覆盖检查（对照 specs/workspace-layout/spec.md 6 条 Requirement）**
- "仓库不得保留 `packages/` workspace 子目录" → Phase 4 验证（间接，未变动 packages，但 spec 仍在主体中存在，由先前 archive 维护）
- "`package.json` 不得保留 `@sa/*` 或 `@soybeanjs/*` 依赖" → Phase 4 Task 4.1 + Task 4.2 Step 2
- "`src/scripts/changelog` 提供 changelog 生成器" → Phase 1 全部任务
- "`src/eslint` 提供 ESLint flat config 工厂" → Phase 2 全部任务
- "UnoCSS 预设与 c12 配置名禁止使用 soybean 字样" → Phase 3 Task 3.1 + Task 3.2
- "历史 `@soybeanjs/*` 命名空间彻底废弃" → Phase 4 Task 4.3 Step 6
- "类型检查、测试、构建、lint 套件迁移后无回归" → 每个 Phase 都跑这套验证；Phase 4 是终验

全部覆盖。

**2. 占位符扫描**
- 无 "TBD"、"implement later"。
- 关键代码（ts-rules、vue-rules、index defineConfig）已嵌入完整内容。
- changelog 三个 region 体量过大未逐行嵌入，但每个 Task 都给出明确的 region 起止行号与 import 列表，执行者从 dist 复制 + 加类型注解即可（这是 design.md 明确允许的策略）。

**3. 类型与名称一致性**
- `defineConfig`、`buildTsRules`、`buildVueRules`、`interopDefault` 在 Phase 2 多任务中签名一致。
- `generateChangelog`、`generateTotalChangelog`、`getChangelogMarkdown`、`getTotalChangelogMarkdown`、`ChangelogOption` 五个公开符号贯穿 Phase 1。
- `src/scripts/changelog` 相对路径在 Task 1.10 与 design.md 一致。

无问题。

---

## Execution Handoff

Plan complete and saved to `D:/Steno/openspec/changes/inline-soybeanjs-deps/PLAN.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
