/**
 * @file 项目自动化脚本 - types
 *
 * 组织 types 的核心逻辑、类型和协作边界，供 项目自动化脚本 模块复用。
 * 注释重点标明数据入口、状态边界、事件通道和协作风险点，便于逐行阅读时快速判断代码意图。
 */

import type { ChangelogOption } from '../changelog';

// 类型 CliOption：记录模块边界的数据形状，帮助调用方理解字段来源和约束。
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
   */
  changelogOptions: Partial<ChangelogOption>;
  /** The ignore pattern list of git commit verify */
  gitCommitVerifyIgnores: RegExp[];
}
