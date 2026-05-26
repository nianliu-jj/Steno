// @vitest-environment jsdom

import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useUiStore } from './ui';

type Listener<T> = (event: { payload: T }) => void;

const listeners = new Map<string, Listener<unknown>>();
let currentLabel = 'main';

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({ label: currentLabel }),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn((event: string, handler: Listener<unknown>) => {
    listeners.set(event, handler);
    return Promise.resolve(() => listeners.delete(event));
  }),
}));

function emit<T>(event: string, payload: T) {
  const handler = listeners.get(event) as Listener<T> | undefined;
  if (!handler) throw new Error(`Missing listener: ${event}`);
  handler({ payload });
}

describe('ui store', () => {
  beforeEach(() => {
    listeners.clear();
    currentLabel = 'main';
    window.location.hash = '';
    setActivePinia(createPinia());
  });

  it('switches the main window view when navigation event is received', async () => {
    const ui = useUiStore();
    await Promise.resolve();

    emit('steno:navigate', { mode: 'canvas' });

    expect(ui.mode).toBe('canvas');
    expect(ui.noteId).toBeNull();
  });

  it('keeps the target note when navigating to Zen from the main window', async () => {
    const ui = useUiStore();
    await Promise.resolve();

    emit('steno:navigate', { mode: 'zen', noteId: 'note-1' });

    expect(ui.mode).toBe('zen');
    expect(ui.noteId).toBe('note-1');
  });

  it('ignores main-window navigation events in the quicknote window', async () => {
    currentLabel = 'quicknote';

    const ui = useUiStore();
    await Promise.resolve();

    expect(listeners.has('steno:navigate')).toBe(false);
    expect(ui.mode).toBe('floating');
    expect(ui.noteId).toBeNull();
  });

  it('uses the hash route when the main window is created directly for a page', () => {
    window.location.hash = '#canvas';

    const ui = useUiStore();

    expect(ui.mode).toBe('canvas');
    expect(ui.noteId).toBeNull();
  });

  it('returns to the main view and clears the current note', () => {
    const ui = useUiStore();

    ui.navigateTo('zen', 'note-1');
    ui.navigateToMain();

    expect(ui.mode).toBe('main');
    expect(ui.noteId).toBeNull();
  });

  it('opens the note editor in the main window and keeps the note id', () => {
    const ui = useUiStore();

    ui.navigateTo('note-editor', 'note-1');

    expect(ui.mode).toBe('note-editor');
    expect(ui.noteId).toBe('note-1');
  });

  it('opens a blank note editor from the main window', () => {
    const ui = useUiStore();

    ui.navigateTo('note-editor');

    expect(ui.mode).toBe('note-editor');
    expect(ui.noteId).toBeNull();
  });

  it('returns to the same note editor after opening Zen from the editor page', () => {
    const ui = useUiStore();

    ui.navigateTo('note-editor', 'note-1');
    ui.navigateToZenFromEditor('note-1');
    ui.exitZen();

    expect(ui.mode).toBe('note-editor');
    expect(ui.noteId).toBe('note-1');
  });

  it('navigates to placeholder pages in the main window', () => {
    const ui = useUiStore();

    ui.navigateTo('clipboard');

    expect(ui.mode).toBe('clipboard');
    expect(ui.noteId).toBeNull();
  });

  it('returns to the canvas view after opening Zen from the canvas', () => {
    const ui = useUiStore();

    ui.navigateTo('canvas');
    ui.navigateToZenFromCanvas('note-1');
    ui.exitZen();

    expect(ui.mode).toBe('canvas');
    expect(ui.noteId).toBeNull();
  });

  it('returns to note-editor after opening Zen from the editor page and keeps the note id', () => {
    const ui = useUiStore();

    ui.navigateTo('note-editor', 'note-1');
    ui.navigateTo('zen', 'note-1', { mode: 'note-editor', noteId: 'note-1' });
    ui.exitZen();

    expect(ui.mode).toBe('note-editor');
    expect(ui.noteId).toBe('note-1');
  });

  it('opens settings as a modal state without replacing the current workbench route', () => {
    const ui = useUiStore();

    ui.navigateTo('note-editor', 'note-1');
    ui.navigateTo('settings');

    expect(ui.mode).toBe('note-editor');
    expect(ui.noteId).toBe('note-1');
    expect(ui.settingsOpen).toBe(true);

    ui.closeSettings();

    expect(ui.mode).toBe('note-editor');
    expect(ui.noteId).toBe('note-1');
    expect(ui.settingsOpen).toBe(false);
  });
});
