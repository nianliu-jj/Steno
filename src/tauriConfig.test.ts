import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

type TauriConfig = {
  app?: {
    windows?: Array<{
      label?: string;
      decorations?: boolean;
    }>;
  };
};

const config = JSON.parse(
  readFileSync(resolve(process.cwd(), 'src-tauri/tauri.conf.json'), 'utf8'),
) as TauriConfig;
const defaultCapability = JSON.parse(
  readFileSync(resolve(process.cwd(), 'src-tauri/capabilities/default.json'), 'utf8'),
) as {
  permissions?: string[];
};

describe('tauri config', () => {
  it('disables the system title bar on the main window so the custom header can drag', () => {
    const mainWindow = config.app?.windows?.find(window => window.label === 'main');

    expect(mainWindow?.decorations).toBe(false);
  });

  it('allows the main window capability to open the dialog picker', () => {
    expect(defaultCapability.permissions).toContain('dialog:allow-open');
  });
});
