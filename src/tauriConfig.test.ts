/**
 * @file 前端应用入口 - tauri Config
 *
 * 覆盖 tauri Config 的主要行为、边界条件和跨模块契约，帮助重构时快速定位预期。
 * 注释重点标明数据入口、状态边界、事件通道和协作风险点，便于逐行阅读时快速判断代码意图。
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

// 类型 TauriConfig：记录模块边界的数据形状，帮助调用方理解字段来源和约束。
type TauriConfig = {
  app?: {
    windows?: Array<{
      label?: string;
      decorations?: boolean;
    }>;
  };
};

// 局部常量 config：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const config = JSON.parse(readFileSync(resolve(process.cwd(), 'src-tauri/tauri.conf.json'), 'utf8')) as TauriConfig;
// 局部常量 defaultCapability：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const defaultCapability = JSON.parse(
  readFileSync(resolve(process.cwd(), 'src-tauri/capabilities/default.json'), 'utf8')
) as {
  permissions?: string[];
};

// 测试用例：验证「tauri config」场景，锁定 tauri Config 的用户可见行为。
describe('tauri config', () => {
  // 测试用例：验证「disables the system title bar on the main window so the custom header can drag」场景，锁定 tauri Config 的用户可见行为。
  it('disables the system title bar on the main window so the custom header can drag', () => {
    // 局部常量 mainWindow：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const mainWindow = config.app?.windows?.find(window => window.label === 'main');

    expect(mainWindow?.decorations).toBe(false);
  });

  // 测试用例：验证「allows the main window capability to open the dialog picker」场景，锁定 tauri Config 的用户可见行为。
  it('allows the main window capability to open the dialog picker', () => {
    expect(defaultCapability.permissions).toContain('dialog:allow-open');
  });
});
