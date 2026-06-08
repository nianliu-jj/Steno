/**
 * @file 项目自动化脚本 - git
 *
 * 组织 git 的核心逻辑、类型和协作边界，供 项目自动化脚本 模块复用。
 * 注释重点标明数据入口、状态边界、事件通道和协作风险点，便于逐行阅读时快速判断代码意图。
 */

import dayjs from 'dayjs';
import { ofetch } from 'ofetch';
import { consola } from 'consola';
import semver from 'semver';
import { execCommand, notNullish } from './shared';
import { VERSION_REG } from './constant';
import type { GitCommit, GitCommitAuthor, GithubConfig, RawGitCommit, Reference, ResolvedAuthor } from './types';

/** Get the total git tags */
export async function getTotalGitTags(): Promise<string[]> {
  // 函数式常量 filtered：以闭包形式组织逻辑，便于在组件、store 或测试中传递。
  const filtered = (await execCommand('git', ['--no-pager', 'tag', '-l', '--sort=v:refname']))
    .split('\n')
    .filter(tag => VERSION_REG.test(tag));
  return semver.sort(filtered);
}

/** Get map of the git tag and date */
export async function getTagDateMap(): Promise<Map<string, string>> {
  // 局部常量 tagDateStr：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const tagDateStr = await execCommand('git', [
    '--no-pager',
    'log',
    '--tags',
    '--simplify-by-decoration',
    '--pretty=format:%ci %d'
  ]);
  // 局部常量 TAG_MARK：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const TAG_MARK = 'tag: ';
  // 局部常量 map：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const map = new Map<string, string>();
  tagDateStr
    .split('\n')
    .filter(item => item.includes(TAG_MARK))
    .forEach(item => {
      const [dateStr, tagStr] = item.split(TAG_MARK);
      // 局部常量 date：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
      const date = dayjs(dateStr).format('YYYY-MM-DD');
      // 局部常量 tag：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
      const tag = tagStr.match(VERSION_REG)?.[0];
      if (tag && date) map.set(tag.trim(), date);
    });
  return map;
}

/**
 * Get the git tags by formatting from-to style
 *
 * @param tags Git tags
 */
export function getFromToTags(tags: string[]): Array<{ from: string; to: string }> {
  const result: Array<{ from: string; to: string }> = [];
  if (tags.length < 2) return result;
  // 局部常量 releaseTags：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const releaseTags = tags.filter(tag => !isPrerelease(tag));
  // 局部常量 reversedTags：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const reversedTags = [...tags].reverse();
  reversedTags.forEach((tag, index) => {
    if (index < reversedTags.length - 1) {
      // 局部常量 to：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
      const to = tag;
      let from = reversedTags[index + 1];
      if (!isPrerelease(to)) from = releaseTags[releaseTags.indexOf(to) - 1];
      result.push({ from, to });
    }
  });
  return result.reverse();
}

// 函数 getGitMainBranchName：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
export async function getGitMainBranchName(): Promise<string> {
  return execCommand('git', ['rev-parse', '--abbrev-ref', 'HEAD']);
}

// 函数 getCurrentGitBranch：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
export async function getCurrentGitBranch(): Promise<string> {
  // 局部常量 tag：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const tag = await execCommand('git', ['tag', '--points-at', 'HEAD']);
  // 局部常量 main：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const main = await getGitMainBranchName();
  return tag || main;
}

// 函数 getGitHubRepo：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
export async function getGitHubRepo(): Promise<string> {
  // 局部常量 url：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const url = await execCommand('git', ['config', '--get', 'remote.origin.url']);
  // 局部常量 match：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const match = url.match(/github\.com[/:]([\w\d._-]+?)\/([\w\d._-]+?)(\.git)?$/i);
  if (!match) throw new Error(`Can not parse GitHub repo from url ${url}`);
  return `${match[1]}/${match[2]}`;
}

// 函数 isPrerelease：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
export function isPrerelease(version: string): boolean {
  return !/^[^.]*[\d.]+$/.test(version);
}

// 函数 getFirstGitCommit：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
export function getFirstGitCommit(): Promise<string> {
  return execCommand('git', ['rev-list', '--max-parents=0', 'HEAD']);
}

// 函数 getGitDiff：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
export async function getGitDiff(from: string, to: string = 'HEAD'): Promise<RawGitCommit[]> {
  return (
    await execCommand('git', [
      '--no-pager',
      'log',
      `${from ? `${from}...` : ''}${to}`,
      '--pretty="----%n%s|%h|%an|%ae%n%b"',
      '--name-status'
    ])
  )
    .split('----\n')
    .splice(1)
    .map(line => {
      const [firstLine, ...body] = line.split('\n');
      const [message, shortHash, authorName, authorEmail] = firstLine.split('|');
      return {
        message,
        shortHash,
        author: {
          name: authorName,
          email: authorEmail
        },
        body: body.join('\n')
      };
    });
}

// 函数 parseGitCommit：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
export function parseGitCommit(commit: RawGitCommit): GitCommit | null {
  // 局部常量 ConventionalCommitRegex：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const ConventionalCommitRegex = /(?<type>[a-z]+)(\((?<scope>.+)\))?(?<breaking>!)?: (?<description>.+)/i;
  // 局部常量 CoAuthoredByRegex：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const CoAuthoredByRegex = /co-authored-by:\s*(?<name>.+)(<(?<email>.+)>)/gim;
  // 局部常量 PullRequestRE：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const PullRequestRE = /\([a-z]*(#\d+)\s*\)/gm;
  // 局部常量 IssueRE：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const IssueRE = /(#\d+)/gm;
  // 局部常量 match：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const match = commit.message.match(ConventionalCommitRegex);
  if (!match?.groups) return null;
  // 局部常量 type：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const type = match.groups.type;
  // 局部常量 scope：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const scope = match.groups.scope || '';
  // 局部常量 isBreaking：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const isBreaking = Boolean(match.groups.breaking);
  let description = match.groups.description;
  const references: Reference[] = [];
  for (const m of description.matchAll(PullRequestRE)) {
    references.push({ type: 'pull-request', value: m[1] });
  }
  for (const m of description.matchAll(IssueRE)) {
    if (!references.some(i => i.value === m[1])) {
      references.push({ type: 'issue', value: m[1] });
    }
  }
  references.push({ value: commit.shortHash, type: 'hash' });
  description = description.replace(PullRequestRE, '').trim();
  const authors: GitCommitAuthor[] = [commit.author];
  // 局部常量 matches：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const matches = commit.body.matchAll(CoAuthoredByRegex);
  for (const $match of matches) {
    const { name = '', email = '' } = $match.groups || {};
    const author: GitCommitAuthor = {
      name: name.trim(),
      email: email.trim()
    };
    authors.push(author);
  }
  return {
    ...commit,
    authors,
    resolvedAuthors: [],
    description,
    type,
    scope,
    references,
    isBreaking
  };
}

// 函数 getGitCommits：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
export async function getGitCommits(from: string, to: string = 'HEAD'): Promise<GitCommit[]> {
  return (await getGitDiff(from, to)).map(commit => parseGitCommit(commit)).filter(notNullish);
}

// 函数 getHeaders：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
function getHeaders(githubToken: string): Record<string, string> {
  return {
    accept: 'application/vnd.github.v3+json',
    authorization: `token ${githubToken}`
  };
}

// 函数 getResolvedAuthorLogin：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
export async function getResolvedAuthorLogin(
  github: GithubConfig,
  commitHashes: string[],
  email: string
): Promise<string> {
  let login = '';
  try {
    login =
      ((await ofetch(`https://ungh.cc/users/find/${email}`)) as { user?: { username?: string } })?.user?.username || '';
  } catch (e) {
    consola.log('e: ', e);
  }
  if (login) return login;
  const { repo, token } = github;
  if (!token) return login;
  if (commitHashes.length) {
    try {
      login =
        (
          (await ofetch(`https://api.github.com/repos/${repo}/commits/${commitHashes[0]}`, {
            headers: getHeaders(token)
          })) as { author?: { login?: string } }
        )?.author?.login || '';
    } catch (e) {
      consola.log('e: ', e);
    }
  }
  if (login) return login;
  try {
    login = (
      (await ofetch(`https://api.github.com/search/users?q=${encodeURIComponent(email)}`, {
        headers: getHeaders(token)
      })) as { items: Array<{ login: string }> }
    ).items[0].login;
  } catch (e) {
    consola.log('e: ', e);
  }
  return login;
}

// 函数 getGitCommitsAndResolvedAuthors：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
export async function getGitCommitsAndResolvedAuthors(
  commits: GitCommit[],
  github: GithubConfig,
  resolvedLogins?: Map<string, string>
): Promise<{ commits: GitCommit[]; contributors: ResolvedAuthor[] }> {
  const resultCommits: GitCommit[] = [];
  // 局部常量 map：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const map = new Map<string, ResolvedAuthor>();
  for await (const commit of commits) {
    const resolvedAuthors: ResolvedAuthor[] = [];
    for await (const [index, author] of commit.authors.entries()) {
      const { email, name } = author;
      if (email && name) {
        const commitHashes: string[] = [];
        if (index === 0) commitHashes.push(commit.shortHash);
        const resolvedAuthor: ResolvedAuthor = {
          name,
          email,
          commits: commitHashes,
          login: ''
        };
        if (!resolvedLogins?.has(email)) {
          // 局部常量 login：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
          const login = await getResolvedAuthorLogin(github, commitHashes, email);
          resolvedAuthor.login = login;
          resolvedLogins?.set(email, login);
        } else {
          resolvedAuthor.login = resolvedLogins?.get(email) || '';
        }
        resolvedAuthors.push(resolvedAuthor);
        if (!map.has(email)) map.set(email, resolvedAuthor);
      }
    }
    const resultCommit: GitCommit = {
      ...commit,
      resolvedAuthors
    };
    resultCommits.push(resultCommit);
  }
  return {
    commits: resultCommits,
    contributors: Array.from(map.values())
  };
}
