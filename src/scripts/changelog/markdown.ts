/**
 * @file 项目自动化脚本 - markdown
 *
 * 组织 markdown 的核心逻辑、类型和协作边界，供 项目自动化脚本 模块复用。
 * 注释重点标明数据入口、状态边界、事件通道和协作风险点，便于逐行阅读时快速判断代码意图。
 */

import dayjs from 'dayjs';
import { convert } from 'convert-gitmoji';
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { capitalize, groupBy, join, partition } from './shared';
import { VERSION_REG_OF_MARKDOWN, VERSION_WITH_RELEASE } from './constant';
import { getGitMainBranchName } from './git';
import type { ChangelogOption, GitCommit, Reference, ResolvedAuthor } from './types';

// 函数 formatReferences：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
function formatReferences(references: Reference[], githubRepo: string, type: 'issues' | 'hash'): string {
  // 局部常量 referencesString：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const referencesString = join(
    references
      .filter(i => {
        if (type === 'issues') return i.type === 'issue' || i.type === 'pull-request';
        return i.type === 'hash';
      })
      .map(ref => {
        if (!githubRepo) return ref.value;
        if (ref.type === 'pull-request' || ref.type === 'issue') {
          return `https://github.com/${githubRepo}/issues/${ref.value.slice(1)}`;
        }
        return `[<samp>(${ref.value.slice(0, 5)})</samp>](https://github.com/${githubRepo}/commit/${ref.value})`;
      })
  ).trim();
  if (type === 'issues') return referencesString && `in ${referencesString}`;
  return referencesString;
}

// 函数 formatLine：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
function formatLine(commit: GitCommit, options: ChangelogOption): string {
  // 局部常量 prRefs：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const prRefs = formatReferences(commit.references, options.github.repo, 'issues');
  // 局部常量 hashRefs：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const hashRefs = formatReferences(commit.references, options.github.repo, 'hash');
  let authors = join([...new Set(commit.resolvedAuthors.map(i => (i.login ? `@${i.login}` : `**${i.name}**`)))]).trim();
  if (authors) authors = `by ${authors}`;
  let refs = [authors, prRefs, hashRefs].filter(i => i?.trim()).join(' ');
  if (refs) refs = `&nbsp;-&nbsp; ${refs}`;
  return [options.capitalize ? capitalize(commit.description) : commit.description, refs]
    .filter(i => i?.trim())
    .join(' ');
}

// 函数 formatTitle：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
function formatTitle(name: string, options: ChangelogOption): string {
  // 局部常量 emojisRE：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const emojisRE = /([✀-➿]|[-]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[‑-⛿]|\uD83E[\uDD10-\uDDFF])/g;
  let formatName = name.trim();
  if (!options.emoji) formatName = name.replace(emojisRE, '').trim();
  return `### &nbsp;&nbsp;&nbsp;${formatName}`;
}

// 函数 formatSection：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
function formatSection(commits: GitCommit[], sectionName: string, options: ChangelogOption): string[] {
  if (!commits.length) return [];
  const lines: string[] = ['', formatTitle(sectionName, options), ''];
  // 局部常量 scopes：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const scopes = groupBy(commits as unknown as Array<Record<string, unknown>>, 'scope') as unknown as Record<
    string,
    GitCommit[]
  >;
  let useScopeGroup = true;
  if (!Object.entries(scopes).some(([k, v]) => k && v.length > 1)) useScopeGroup = false;
  Object.keys(scopes)
    .sort()
    .forEach(scope => {
      let padding = '';
      let prefix = '';
      // 局部常量 scopeText：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
      const scopeText = `**${scope}**`;
      if (scope && useScopeGroup) {
        lines.push(`- ${scopeText}:`);
        padding = '  ';
      } else if (scope) {
        prefix = `${scopeText}: `;
      }
      lines.push(...scopes[scope].reverse().map(commit => `${padding}- ${prefix}${formatLine(commit, options)}`));
    });
  return lines;
}

// 函数 getUserGithub：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
function getUserGithub(userName: string): string {
  return `https://github.com/${userName}`;
}

// 函数 getGitUserAvatar：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
function getGitUserAvatar(userName: string): string {
  return `${getUserGithub(userName)}.png?size=48`;
}

// 函数 createContributorLine：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
function createContributorLine(contributors: ResolvedAuthor[]): string {
  let loginLine = '';
  let unLoginLine = '';
  // 局部常量 contributorMap：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const contributorMap = new Map<string, ResolvedAuthor>();
  contributors.forEach(contributor => {
    contributorMap.set(contributor.email, contributor);
  });
  Array.from(contributorMap.values()).forEach((contributor, index) => {
    const { name, email, login } = contributor;
    if (!login) {
      let line = `[${name}](mailto:${email})`;
      if (index < contributors.length - 1) line += ',&nbsp;';
      unLoginLine += line;
    } else {
      // 局部常量 githubUrl：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
      const githubUrl = getUserGithub(login);
      // 局部常量 avatar：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
      const avatar = getGitUserAvatar(login);
      loginLine += `[![${login}](${avatar})](${githubUrl})&nbsp;&nbsp;`;
    }
  });
  return `${loginLine}\n${unLoginLine}`;
}

// 函数 generateMarkdown：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
export async function generateMarkdown(params: {
  commits: GitCommit[];
  options: ChangelogOption;
  showTitle: boolean;
  contributors: ResolvedAuthor[];
}): Promise<string> {
  const { options, showTitle, contributors } = params;
  // 局部常量 commits：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const commits = params.commits.filter(commit => commit.description.match(VERSION_WITH_RELEASE) === null);
  const lines: string[] = [];
  let url = `https://github.com/${options.github.repo}/compare/${options.from}...${options.to}`;
  if (!options.from) {
    // 局部常量 mainBranch：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const mainBranch = await getGitMainBranchName();
    url = `https://github.com/${options.github.repo}/compare/${options.to}...${mainBranch || 'HEAD'}`;
  }
  if (showTitle) {
    // 局部常量 date：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const date = options.tagDateMap.get(options.to) || dayjs().format('YYYY-MM-DD');
    let title = `## [${options.to}](${url})`;
    if (date) title += ` (${date})`;
    lines.push(title);
  }
  const [breaking, changes] = partition(commits, c => c.isBreaking);
  // 局部常量 group：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const group = groupBy(changes as unknown as Array<Record<string, unknown>>, 'type') as unknown as Record<
    string,
    GitCommit[]
  >;
  lines.push(...formatSection(breaking, options.titles.breakingChanges, options));
  for (const type of Object.keys(options.types)) {
    // 局部常量 items：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const items = group[type] || [];
    lines.push(...formatSection(items, options.types[type], options));
  }
  if (!lines.length) lines.push('*No significant changes*');
  if (!showTitle) lines.push('', `##### &nbsp;&nbsp;&nbsp;&nbsp;[View changes on GitHub](${url})`);
  if (showTitle) {
    lines.push('', '### &nbsp;&nbsp;&nbsp;❤️ Contributors', '');
    // 局部常量 contributorLine：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const contributorLine = createContributorLine(contributors);
    lines.push(contributorLine);
  }
  return convert(lines.join('\n').trim(), true);
}

// 函数 isVersionInMarkdown：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
export async function isVersionInMarkdown(newVersion: string, mdPath: string): Promise<boolean> {
  let isIn = false;
  let md = '';
  try {
    md = await readFile(mdPath, 'utf8');
  } catch {
    /* swallow */
  }
  if (md) {
    // 局部常量 matches：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const matches = md.match(VERSION_REG_OF_MARKDOWN);
    if (matches?.length) {
      // 局部常量 versionInMarkdown：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
      const versionInMarkdown = `## [${newVersion}]`;
      isIn = matches.includes(versionInMarkdown);
    }
  }
  return isIn;
}

// 函数 writeMarkdown：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
export async function writeMarkdown(md: string, mdPath: string, regenerate: boolean = false): Promise<void> {
  let changelogMD = '';
  // 局部常量 changelogPrefix：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const changelogPrefix = '# Changelog';
  if (!existsSync(mdPath)) await writeFile(mdPath, `${changelogPrefix}\n\n`, 'utf8');
  if (!regenerate) changelogMD = await readFile(mdPath, 'utf8');
  if (!changelogMD.startsWith(changelogPrefix)) changelogMD = `${changelogPrefix}\n\n${changelogMD}`;
  // 局部常量 lastEntry：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const lastEntry = changelogMD.match(/^###?\s+.*$/m);
  if (lastEntry && typeof lastEntry.index === 'number') {
    changelogMD = `${changelogMD.slice(0, lastEntry.index) + md}\n\n${changelogMD.slice(lastEntry.index)}`;
  } else {
    changelogMD += `\n${md}\n\n`;
  }
  await writeFile(mdPath, changelogMD);
}
