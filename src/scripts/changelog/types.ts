/**
 * @file 项目自动化脚本 - types
 *
 * 组织 types 的核心逻辑、类型和协作边界，供 项目自动化脚本 模块复用。
 * 注释重点标明数据入口、状态边界、事件通道和协作风险点，便于逐行阅读时快速判断代码意图。
 */

/** The commit author */
export interface GitCommitAuthor {
  /** The author name */
  name: string;
  /** The author email */
  email: string;
}

/** The raw git commit */
export interface RawGitCommit {
  /** The commit message */
  message: string;
  /** The commit body */
  body: string;
  /** The commit hash */
  shortHash: string;
  /** The commit author */
  author: GitCommitAuthor;
}

/** The reference of the commit */
export interface Reference {
  /** The reference type */
  type: 'hash' | 'issue' | 'pull-request';
  /** The reference value */
  value: string;
}

/** The resolved github author */
export interface ResolvedAuthor extends GitCommitAuthor {
  /** The git commit of the author */
  commits: string[];
  /** The github logged username of the author */
  login: string;
}

/** Git commit config */
export interface GitCommit extends RawGitCommit {
  /** The commit description */
  description: string;
  /** The commit scope type */
  type: string;
  /** The commit scope */
  scope: string;
  /** The commit references */
  references: Reference[];
  /** The commit authors */
  authors: GitCommitAuthor[];
  /** The resolved authors */
  resolvedAuthors: ResolvedAuthor[];
  /** The commit breaking changes */
  isBreaking: boolean;
}

/** Github config */
export interface GithubConfig {
  /**
   * The github repository name
   *
   * @example user/repo
   */
  repo: string;
  /** The github token */
  token: string;
}

// 类型 ChangelogOption：记录模块边界的数据形状，帮助调用方理解字段来源和约束。
export interface ChangelogOption {
  /**
   * The directory of the project
   *
   * @default process.cwd()
   */
  cwd: string;
  /** The commit scope types */
  types: Record<string, string>;
  /** Github config */
  github: GithubConfig;
  /** The commit hash or tag */
  from: string;
  /** The commit hash or tag */
  to: string;
  /** The whole commit tags */
  tags: string[];
  /** The commit tag and date map */
  tagDateMap: Map<string, string>;
  /** Whether to capitalize the first letter of the commit type */
  capitalize: boolean;
  /**
   * Use emojis in section titles
   *
   * @default true
   */
  emoji: boolean;
  /** The section titles */
  titles: {
    /** The title of breaking changes section */
    breakingChanges: string;
  };
  /** The output file path of the changelog */
  output: string;
  /**
   * Whether to regenerate the changelog if it already exists
   *
   * @example
   *   the changelog already exists the content of v0.0.1, but you want to regenerate it
   */
  regenerate: boolean;
  /** Mark the release as prerelease */
  prerelease?: boolean;
}
