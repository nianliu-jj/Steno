/**
 * @file 项目自动化脚本 - git commit
 *
 * 组织 git commit 的核心逻辑、类型和协作边界，供 项目自动化脚本 模块复用。
 * 注释重点标明数据入口、状态边界、事件通道和协作风险点，便于逐行阅读时快速判断代码意图。
 */

import path from 'node:path';
import { readFileSync } from 'node:fs';
import enquirer from 'enquirer';
import { execCommand } from '../shared';
import { locales } from '../locales';
import type { Lang } from '../locales';

const { prompt } = enquirer;

// 类型 PromptObject：记录模块边界的数据形状，帮助调用方理解字段来源和约束。
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

  // 局部常量 typesChoices：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const typesChoices = gitCommitTypes.map(([value, msg]) => {
    // 局部常量 nameWithSuffix：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const nameWithSuffix = `${value}:`;

    // 局部常量 message：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const message = `${nameWithSuffix.padEnd(12)}${msg}`;

    return {
      name: value,
      message
    };
  });

  // 局部常量 scopesChoices：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const scopesChoices = gitCommitScopes.map(([value, msg]) => ({
    name: value,
    message: `${value.padEnd(30)} (${msg})`
  }));

  // 局部常量 result：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
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

  // 局部常量 breaking：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const breaking = result.description.startsWith('!') ? '!' : '';

  // 局部常量 description：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const description = result.description.replace(/^!/, '').trim();

  // 局部常量 commitMsg：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const commitMsg = `${result.types}(${result.scopes})${breaking}: ${description}`;

  await execCommand('git', ['commit', '-m', commitMsg], { stdio: 'inherit' });
}

/** Git commit message verify */
export async function gitCommitVerify(lang: Lang = 'en-us', ignores: RegExp[] = []) {
  // 局部常量 gitPath：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const gitPath = await execCommand('git', ['rev-parse', '--show-toplevel']);

  // 局部常量 gitMsgPath：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const gitMsgPath = path.join(gitPath, '.git', 'COMMIT_EDITMSG');

  // 局部常量 commitMsg：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const commitMsg = readFileSync(gitMsgPath, 'utf8').trim();

  if (ignores.some(regExp => regExp.test(commitMsg))) return;

  // 局部常量 REG_EXP：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const REG_EXP = /(?<type>[a-z]+)(?:\((?<scope>.+)\))?(?<breaking>!)?: (?<description>.+)/i;

  if (!REG_EXP.test(commitMsg)) {
    // 局部常量 errorMsg：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const errorMsg = locales[lang].gitCommitVerify;

    throw new Error(errorMsg);
  }
}
