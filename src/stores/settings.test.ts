// @vitest-environment jsdom

import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useSettingsStore } from './settings';

const dbGetSettingMock = vi.fn<(key: string) => Promise<string | null>>();
const dbSetSettingMock = vi.fn<(key: string, value: string) => Promise<void>>();

vi.mock('@/composables/useDb', () => ({
  useDb: () => ({
    getSetting: (...args: Parameters<typeof dbGetSettingMock>) => dbGetSettingMock(...args),
    setSetting: (...args: Parameters<typeof dbSetSettingMock>) => dbSetSettingMock(...args),
  }),
}));

describe('settings store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    dbGetSettingMock.mockReset();
    dbSetSettingMock.mockReset();
    dbGetSettingMock.mockResolvedValue(null);
    dbSetSettingMock.mockResolvedValue();
  });

  it('decodes persisted workbench layout settings', async () => {
    dbGetSettingMock.mockImplementation(async (key: string) => {
      const map: Record<string, string | null> = {
        mainSidebarWidth: '248',
        mainSidebarCollapsed: 'true',
        zenOutlineWidth: '312',
      };
      return map[key] ?? null;
    });

    const store = useSettingsStore();
    await store.load();

    expect(store.state.mainSidebarWidth).toBe(248);
    expect(store.state.mainSidebarCollapsed).toBe(true);
    expect(store.state.zenOutlineWidth).toBe(312);
  });

  it('falls back to layout defaults when persisted values are invalid', async () => {
    dbGetSettingMock.mockImplementation(async (key: string) => {
      const map: Record<string, string | null> = {
        mainSidebarWidth: 'NaN',
        mainSidebarCollapsed: 'oops',
        zenOutlineWidth: '-1',
      };
      return map[key] ?? null;
    });

    const store = useSettingsStore();
    await store.load();

    expect(store.state.mainSidebarWidth).toBe(220);
    expect(store.state.mainSidebarCollapsed).toBe(false);
    expect(store.state.zenOutlineWidth).toBe(300);
  });

  it('persists layout setting updates through the db adapter', async () => {
    const store = useSettingsStore();

    await store.update('mainSidebarWidth', 264);
    await store.update('mainSidebarCollapsed', true);
    await store.update('zenOutlineWidth', 296);

    expect(dbSetSettingMock).toHaveBeenNthCalledWith(1, 'mainSidebarWidth', '264');
    expect(dbSetSettingMock).toHaveBeenNthCalledWith(2, 'mainSidebarCollapsed', 'true');
    expect(dbSetSettingMock).toHaveBeenNthCalledWith(3, 'zenOutlineWidth', '296');
  });

  it('loads and persists the clipboard shortcut setting', async () => {
    dbGetSettingMock.mockImplementation(async (key: string) => {
      const map: Record<string, string | null> = {
        clipboardShortcut: 'Alt+C',
      };
      return map[key] ?? null;
    });

    const store = useSettingsStore();
    await store.load();

    expect(store.state.clipboardShortcut).toBe('Alt+C');

    await store.update('clipboardShortcut', 'Ctrl+Shift+V');
    expect(dbSetSettingMock).toHaveBeenCalledWith('clipboardShortcut', 'Ctrl+Shift+V');
  });

  it('uses defaults for todo quick panel settings when nothing is persisted', async () => {
    const store = useSettingsStore();
    await store.load();

    expect(store.state.todoQuickPanelEnabled).toBe(true);
    expect(store.state.todoQuickPanelShortcut).toBe('Ctrl+Shift+T');
    expect(store.state.todoQuickPanelPosition).toBe('bottom-right');
    expect(store.state.todoQuickPanelLastPos).toBe('');
  });

  it('decodes persisted todo quick panel settings', async () => {
    dbGetSettingMock.mockImplementation(async (key: string) => {
      const map: Record<string, string | null> = {
        todoQuickPanelEnabled: 'false',
        todoQuickPanelShortcut: 'Alt+T',
        todoQuickPanelPosition: 'cursor',
        todoQuickPanelLastPos: '120,80',
      };
      return map[key] ?? null;
    });

    const store = useSettingsStore();
    await store.load();

    expect(store.state.todoQuickPanelEnabled).toBe(false);
    expect(store.state.todoQuickPanelShortcut).toBe('Alt+T');
    expect(store.state.todoQuickPanelPosition).toBe('cursor');
    expect(store.state.todoQuickPanelLastPos).toBe('120,80');
  });

  it('falls back to defaults when todo quick panel position is invalid', async () => {
    dbGetSettingMock.mockImplementation(async (key: string) => {
      const map: Record<string, string | null> = {
        todoQuickPanelEnabled: 'maybe',
        todoQuickPanelPosition: 'somewhere-weird',
      };
      return map[key] ?? null;
    });

    const store = useSettingsStore();
    await store.load();

    expect(store.state.todoQuickPanelEnabled).toBe(true);
    expect(store.state.todoQuickPanelPosition).toBe('bottom-right');
  });

  it('persists todo quick panel updates through the db adapter', async () => {
    const store = useSettingsStore();

    await store.update('todoQuickPanelEnabled', false);
    await store.update('todoQuickPanelShortcut', 'Ctrl+Alt+T');
    await store.update('todoQuickPanelPosition', 'last');
    await store.update('todoQuickPanelLastPos', '320,240');

    expect(dbSetSettingMock).toHaveBeenNthCalledWith(1, 'todoQuickPanelEnabled', 'false');
    expect(dbSetSettingMock).toHaveBeenNthCalledWith(2, 'todoQuickPanelShortcut', 'Ctrl+Alt+T');
    expect(dbSetSettingMock).toHaveBeenNthCalledWith(3, 'todoQuickPanelPosition', 'last');
    expect(dbSetSettingMock).toHaveBeenNthCalledWith(4, 'todoQuickPanelLastPos', '320,240');
  });
});
