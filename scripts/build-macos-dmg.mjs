/**
 * @file 平台构建脚本 - build macos dmg
 *
 * 组织 build macos dmg 的核心逻辑、类型和协作边界，供 平台构建脚本 模块复用。
 * 注释重点标明数据入口、状态边界、事件通道和协作风险点，便于逐行阅读时快速判断代码意图。
 */

import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import os from 'node:os';
import { join } from 'node:path';

// 局部常量 root：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const root = process.cwd();
// 局部常量 bundleRoot：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const bundleRoot = join(root, 'src-tauri', 'target', 'release', 'bundle');
// 局部常量 macosDir：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const macosDir = join(bundleRoot, 'macos');
// 局部常量 dmgDir：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const dmgDir = join(bundleRoot, 'dmg');
// 局部常量 appName：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const appName = 'Steno.app';
// 局部常量 volumeName：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const volumeName = 'Steno';
// 局部常量 appPath：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const appPath = join(macosDir, appName);
// 局部常量 dmgPath：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const dmgPath = join(dmgDir, 'Steno_0.0.0_aarch64.dmg');

// 局部常量 build：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const build = spawnSync('pnpm', ['tauri', 'build', '-b', 'app'], {
  cwd: root,
  stdio: 'inherit'
});

if (build.status !== 0) {
  process.exit(build.status ?? 1);
}

if (!existsSync(appPath)) {
  throw new Error(`App bundle not found: ${appPath}`);
}

mkdirSync(dmgDir, { recursive: true });
rmSync(dmgPath, { force: true });

// 局部常量 stageDir：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const stageDir = mkdtempSync(join(os.tmpdir(), 'steno-dmg-stage-'));

try {
  cpSync(appPath, join(stageDir, appName), { recursive: true });
  symlinkSync('/Applications', join(stageDir, 'Applications'));

  // 局部常量 dmg：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const dmg = spawnSync(
    'hdiutil',
    ['create', '-volname', volumeName, '-srcfolder', stageDir, '-ov', '-fs', 'HFS+', '-format', 'UDZO', dmgPath],
    {
      cwd: root,
      stdio: 'inherit'
    }
  );

  process.exit(dmg.status ?? 1);
} finally {
  rmSync(stageDir, { recursive: true, force: true });
}
