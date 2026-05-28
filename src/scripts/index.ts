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
