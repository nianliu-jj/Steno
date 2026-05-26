import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import os from 'node:os';
import { join } from 'node:path';

const root = process.cwd();
const bundleRoot = join(root, 'src-tauri', 'target', 'release', 'bundle');
const macosDir = join(bundleRoot, 'macos');
const dmgDir = join(bundleRoot, 'dmg');
const appName = 'Steno.app';
const volumeName = 'Steno';
const appPath = join(macosDir, appName);
const dmgPath = join(dmgDir, 'Steno_0.0.0_aarch64.dmg');

const build = spawnSync('pnpm', ['tauri', 'build', '-b', 'app'], {
  cwd: root,
  stdio: 'inherit',
});

if (build.status !== 0) {
  process.exit(build.status ?? 1);
}

if (!existsSync(appPath)) {
  throw new Error(`App bundle not found: ${appPath}`);
}

mkdirSync(dmgDir, { recursive: true });
rmSync(dmgPath, { force: true });

const stageDir = mkdtempSync(join(os.tmpdir(), 'steno-dmg-stage-'));

try {
  cpSync(appPath, join(stageDir, appName), { recursive: true });
  symlinkSync('/Applications', join(stageDir, 'Applications'));

  const dmg = spawnSync(
    'hdiutil',
    [
      'create',
      '-volname',
      volumeName,
      '-srcfolder',
      stageDir,
      '-ov',
      '-fs',
      'HFS+',
      '-format',
      'UDZO',
      dmgPath,
    ],
    {
      cwd: root,
      stdio: 'inherit',
    },
  );

  process.exit(dmg.status ?? 1);
} finally {
  rmSync(stageDir, { recursive: true, force: true });
}
