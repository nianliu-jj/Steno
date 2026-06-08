/**
 * @file 项目自动化脚本 - changelog
 *
 * 组织 changelog 的核心逻辑、类型和协作边界，供 项目自动化脚本 模块复用。
 * 注释重点标明数据入口、状态边界、事件通道和协作风险点，便于逐行阅读时快速判断代码意图。
 */

import { Presets, SingleBar } from 'cli-progress';
import { createOptions } from './options';
import { getCurrentGitBranch, getFromToTags, getGitCommits, getGitCommitsAndResolvedAuthors } from './git';
import { generateMarkdown, isVersionInMarkdown, writeMarkdown } from './markdown';
import type { ChangelogOption, GitCommit } from './types';

export type { ChangelogOption } from './types';

/**
 * Get the changelog markdown by two git tags
 *
 * @param options The changelog options
 * @param showTitle Whither show the title
 */
export async function getChangelogMarkdown(
  options?: Partial<ChangelogOption>,
  showTitle: boolean = true
): Promise<{ markdown: string; commits: GitCommit[]; options: ChangelogOption }> {
  // 局部常量 opts：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const opts = await createOptions(options);
  // 局部常量 current：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const current = await getCurrentGitBranch();
  // 局部常量 to：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const to = opts.tags.includes(opts.to) ? opts.to : current;
  // 局部常量 gitCommits：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const gitCommits = await getGitCommits(opts.from, to);
  // 局部常量 resolvedLogins：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const resolvedLogins = new Map<string, string>();
  const { commits, contributors } = await getGitCommitsAndResolvedAuthors(gitCommits, opts.github, resolvedLogins);
  return {
    markdown: await generateMarkdown({
      commits,
      options: opts,
      showTitle,
      contributors
    }),
    commits,
    options: opts
  };
}

/**
 * Get the changelog markdown by the total git tags
 *
 * @param options The changelog options
 * @param showProgress Whether show the progress bar
 */
export async function getTotalChangelogMarkdown(
  options?: Partial<ChangelogOption>,
  showProgress: boolean = true
): Promise<string> {
  // 局部常量 opts：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const opts = await createOptions(options);
  let bar: SingleBar | null = null;
  if (showProgress) {
    bar = new SingleBar(
      { format: 'generate total changelog: [{bar}] {percentage}% | ETA: {eta}s | {value}/{total}' },
      Presets.shades_classic
    );
  }
  // 局部常量 tags：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const tags = getFromToTags(opts.tags);
  if (tags.length === 0) {
    const { markdown: markdown$1 } = await getChangelogMarkdown(opts);
    return markdown$1;
  }
  bar?.start(tags.length, 0);
  let markdown = '';
  // 局部常量 resolvedLogins：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const resolvedLogins = new Map<string, string>();
  for await (const [index, tag] of tags.entries()) {
    const { from, to } = tag;
    const { commits, contributors } = await getGitCommitsAndResolvedAuthors(
      await getGitCommits(from, to),
      opts.github,
      resolvedLogins
    );
    markdown = `${await generateMarkdown({
      commits,
      options: {
        ...opts,
        from,
        to
      },
      showTitle: true,
      contributors
    })}\n\n${markdown}`;
    bar?.update(index + 1);
  }
  bar?.stop();
  return markdown;
}

/**
 * Generate the changelog markdown by two git tags
 *
 * @param options The changelog options
 */
export async function generateChangelog(options?: Partial<ChangelogOption>): Promise<void> {
  // 局部常量 opts：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const opts = await createOptions(options);
  // 局部常量 existContent：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const existContent = await isVersionInMarkdown(opts.to, opts.output);
  if (!opts.regenerate && existContent) return;
  const { markdown } = await getChangelogMarkdown(opts);
  await writeMarkdown(markdown, opts.output, opts.regenerate);
}

/**
 * Generate the changelog markdown by the total git tags
 *
 * @param options The changelog options
 * @param showProgress Whither show the progress bar
 */
export async function generateTotalChangelog(
  options?: Partial<ChangelogOption>,
  showProgress: boolean = true
): Promise<void> {
  // 局部常量 opts：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const opts = await createOptions(options);
  await writeMarkdown(await getTotalChangelogMarkdown(opts, showProgress), opts.output, true);
}
