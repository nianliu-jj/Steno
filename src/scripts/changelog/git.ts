import dayjs from 'dayjs';
import { ofetch } from 'ofetch';
import { consola } from 'consola';
import semver from 'semver';
import { execCommand, notNullish } from './shared';
import { VERSION_REG } from './constant';
import type {
  GitCommit,
  GitCommitAuthor,
  GithubConfig,
  RawGitCommit,
  Reference,
  ResolvedAuthor
} from './types';

/** Get the total git tags */
export async function getTotalGitTags(): Promise<string[]> {
  const filtered = (
    await execCommand('git', ['--no-pager', 'tag', '-l', '--sort=v:refname'])
  )
    .split('\n')
    .filter(tag => VERSION_REG.test(tag));
  return semver.sort(filtered);
}

/** Get map of the git tag and date */
export async function getTagDateMap(): Promise<Map<string, string>> {
  const tagDateStr = await execCommand('git', [
    '--no-pager',
    'log',
    '--tags',
    '--simplify-by-decoration',
    '--pretty=format:%ci %d'
  ]);
  const TAG_MARK = 'tag: ';
  const map = new Map<string, string>();
  tagDateStr
    .split('\n')
    .filter(item => item.includes(TAG_MARK))
    .forEach(item => {
      const [dateStr, tagStr] = item.split(TAG_MARK);
      const date = dayjs(dateStr).format('YYYY-MM-DD');
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
  const releaseTags = tags.filter(tag => !isPrerelease(tag));
  const reversedTags = [...tags].reverse();
  reversedTags.forEach((tag, index) => {
    if (index < reversedTags.length - 1) {
      const to = tag;
      let from = reversedTags[index + 1];
      if (!isPrerelease(to)) from = releaseTags[releaseTags.indexOf(to) - 1];
      result.push({ from, to });
    }
  });
  return result.reverse();
}

export async function getGitMainBranchName(): Promise<string> {
  return execCommand('git', ['rev-parse', '--abbrev-ref', 'HEAD']);
}

export async function getCurrentGitBranch(): Promise<string> {
  const tag = await execCommand('git', ['tag', '--points-at', 'HEAD']);
  const main = await getGitMainBranchName();
  return tag || main;
}

export async function getGitHubRepo(): Promise<string> {
  const url = await execCommand('git', ['config', '--get', 'remote.origin.url']);
  const match = url.match(/github\.com[/:]([\w\d._-]+?)\/([\w\d._-]+?)(\.git)?$/i);
  if (!match) throw new Error(`Can not parse GitHub repo from url ${url}`);
  return `${match[1]}/${match[2]}`;
}

export function isPrerelease(version: string): boolean {
  return !/^[^.]*[\d.]+$/.test(version);
}

export function getFirstGitCommit(): Promise<string> {
  return execCommand('git', ['rev-list', '--max-parents=0', 'HEAD']);
}

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

export function parseGitCommit(commit: RawGitCommit): GitCommit | null {
  const ConventionalCommitRegex = /(?<type>[a-z]+)(\((?<scope>.+)\))?(?<breaking>!)?: (?<description>.+)/i;
  const CoAuthoredByRegex = /co-authored-by:\s*(?<name>.+)(<(?<email>.+)>)/gim;
  const PullRequestRE = /\([a-z]*(#\d+)\s*\)/gm;
  const IssueRE = /(#\d+)/gm;
  const match = commit.message.match(ConventionalCommitRegex);
  if (!match?.groups) return null;
  const type = match.groups.type;
  const scope = match.groups.scope || '';
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

export async function getGitCommits(from: string, to: string = 'HEAD'): Promise<GitCommit[]> {
  return (await getGitDiff(from, to)).map(commit => parseGitCommit(commit)).filter(notNullish);
}

function getHeaders(githubToken: string): Record<string, string> {
  return {
    accept: 'application/vnd.github.v3+json',
    authorization: `token ${githubToken}`
  };
}

export async function getResolvedAuthorLogin(
  github: GithubConfig,
  commitHashes: string[],
  email: string
): Promise<string> {
  let login = '';
  try {
    login = ((await ofetch(`https://ungh.cc/users/find/${email}`)) as { user?: { username?: string } })?.user?.username || '';
  } catch (e) {
    consola.log('e: ', e);
  }
  if (login) return login;
  const { repo, token } = github;
  if (!token) return login;
  if (commitHashes.length) {
    try {
      login =
        ((await ofetch(`https://api.github.com/repos/${repo}/commits/${commitHashes[0]}`, {
          headers: getHeaders(token)
        })) as { author?: { login?: string } })?.author?.login || '';
    } catch (e) {
      consola.log('e: ', e);
    }
  }
  if (login) return login;
  try {
    login = ((await ofetch(`https://api.github.com/search/users?q=${encodeURIComponent(email)}`, {
      headers: getHeaders(token)
    })) as { items: Array<{ login: string }> }).items[0].login;
  } catch (e) {
    consola.log('e: ', e);
  }
  return login;
}

export async function getGitCommitsAndResolvedAuthors(
  commits: GitCommit[],
  github: GithubConfig,
  resolvedLogins?: Map<string, string>
): Promise<{ commits: GitCommit[]; contributors: ResolvedAuthor[] }> {
  const resultCommits: GitCommit[] = [];
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
