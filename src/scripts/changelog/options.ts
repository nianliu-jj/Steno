/**
 * @file 项目自动化脚本 - options
 *
 * 组织 options 的核心逻辑、类型和协作边界，供 项目自动化脚本 模块复用。
 * 注释重点标明数据入口、状态边界、事件通道和协作风险点，便于逐行阅读时快速判断代码意图。
 */

import process from 'node:process';
import { readFile } from 'node:fs/promises';
import { getFirstGitCommit, getGitHubRepo, getTagDateMap, getTotalGitTags, isPrerelease } from './git';
import type { ChangelogOption } from './types';

// 函数 createDefaultOptions：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
export function createDefaultOptions(): ChangelogOption {
  return {
    cwd: process.cwd(),
    types: {
      feat: '🚀 Features',
      fix: '🐞 Bug Fixes',
      perf: '🔥 Performance',
      optimize: '🛠 Optimizations',
      refactor: '💅 Refactors',
      docs: '📖 Documentation',
      build: '📦 Build',
      types: '🌊 Types',
      chore: '🏡 Chore',
      examples: '🏀 Examples',
      test: '✅ Tests',
      style: '🎨 Styles',
      ci: '🤖 CI'
    },
    github: {
      repo: '',
      token: process.env.GITHUB_TOKEN || ''
    },
    from: '',
    to: '',
    tags: [],
    tagDateMap: new Map(),
    capitalize: false,
    emoji: true,
    titles: { breakingChanges: '🚨 Breaking Changes' },
    output: 'CHANGELOG.md',
    regenerate: false
  };
}

// 函数 getVersionFromPkgJson：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
export async function getVersionFromPkgJson(cwd: string): Promise<{ newVersion: string }> {
  let newVersion = '';
  try {
    // 局部常量 pkgJson：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const pkgJson = await readFile(`${cwd}/package.json`, 'utf-8');
    newVersion = (JSON.parse(pkgJson) as { version?: string })?.version || '';
  } catch {
    /* swallow */
  }
  return { newVersion };
}

// 函数 createOptions：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
export async function createOptions(options?: Partial<ChangelogOption>): Promise<ChangelogOption> {
  // 局部常量 opts：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const opts = createDefaultOptions();
  Object.assign(opts, options);
  const { newVersion } = await getVersionFromPkgJson(opts.cwd);
  opts.github.repo ||= await getGitHubRepo();
  // 局部常量 tags：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const tags = await getTotalGitTags();
  opts.tags = tags;
  opts.from ||= tags[tags.length - 1];
  opts.to ||= `v${newVersion}`;
  if (opts.to === opts.from) {
    // 局部常量 lastTag：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const lastTag = tags[tags.length - 2];
    // 局部常量 firstCommit：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const firstCommit = await getFirstGitCommit();
    opts.from = lastTag || firstCommit;
  }
  opts.tagDateMap = await getTagDateMap();
  opts.prerelease ||= isPrerelease(opts.to);
  // 局部常量 isFromPrerelease：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const isFromPrerelease = isPrerelease(opts.from);
  if (!isPrerelease(newVersion) && isFromPrerelease) {
    // 局部常量 allReleaseTags：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const allReleaseTags = opts.tags.filter(tag => !isPrerelease(tag) && tag !== opts.to);
    opts.from = allReleaseTags[allReleaseTags.length - 1];
  }
  return opts;
}
