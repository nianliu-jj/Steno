// @vitest-environment jsdom

import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ReminderOption } from '@/types/steno';

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

  it('uses the default reminder quick options when nothing is persisted', async () => {
    const store = useSettingsStore();
    await store.load();

    expect(store.state.reminderQuickOptions).toEqual([
      {
        id: 'after-30-minutes',
        label: '30 分钟后',
        type: 'relative',
        value: 30,
        unit: 'minute',
      },
      {
        id: 'after-1-hour',
        label: '1 小时后',
        type: 'relative',
        value: 1,
        unit: 'hour',
      },
      {
        id: 'after-2-hours',
        label: '2 小时后',
        type: 'relative',
        value: 2,
        unit: 'hour',
      },
      {
        id: 'after-1-day',
        label: '1 天后',
        type: 'relative',
        value: 1,
        unit: 'day',
      },
      {
        id: 'next-week',
        label: '下周',
        type: 'relative',
        value: 7,
        unit: 'day',
      },
      {
        id: 'today-16',
        label: '今天下午 4 点',
        type: 'absolute',
        value: 0,
        unit: 'minute',
        absoluteTime: '16:00',
        dayOffset: 0,
      },
    ]);
  });

  it('decodes and persists reminder quick options as JSON', async () => {
    const persistedOptions: ReminderOption[] = [
      {
        id: 'after-15-minutes',
        label: '15 分钟后',
        type: 'relative',
        value: 15,
        unit: 'minute',
      },
    ];
    dbGetSettingMock.mockImplementation(async (key: string) => {
      const map: Record<string, string | null> = {
        reminderQuickOptions: JSON.stringify(persistedOptions),
      };
      return map[key] ?? null;
    });

    const store = useSettingsStore();
    await store.load();

    expect(store.state.reminderQuickOptions).toEqual(persistedOptions);

    const nextOptions: ReminderOption[] = [
      ...persistedOptions,
      {
        id: 'tomorrow-9',
        label: '明天 9 点',
        type: 'absolute',
        value: 0,
        unit: 'minute',
        absoluteTime: '09:00',
        dayOffset: 1,
      },
    ];
    await store.update('reminderQuickOptions', nextOptions);

    expect(dbSetSettingMock).toHaveBeenCalledWith(
      'reminderQuickOptions',
      JSON.stringify(nextOptions),
    );
  });

  it('rejects invalid reminder quick options and keeps the previous value', async () => {
    const store = useSettingsStore();
    await store.load();
    const previous = [...store.state.reminderQuickOptions];

    await expect(
      store.update('reminderQuickOptions', [
        {
          id: 'broken',
          label: '错误选项',
          type: 'relative',
          value: 0,
          unit: 'minute',
        },
      ]),
    ).rejects.toThrow('Invalid reminder quick option');

    expect(store.state.reminderQuickOptions).toEqual(previous);
    expect(dbSetSettingMock).not.toHaveBeenCalled();
  });
});
