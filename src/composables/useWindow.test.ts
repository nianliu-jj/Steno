// @vitest-environment jsdom

import {describe, expect, it, vi} from 'vitest';

import {useWindow} from './useWindow';

const minimize = vi.fn(() => Promise.resolve());
const toggleMaximize = vi.fn(() => Promise.resolve());

vi.mock('@tauri-apps/api/core', () => ({
    invoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/window', () => ({
    getCurrentWindow: () => ({
        label: 'main',
        minimize,
        toggleMaximize,
    }),
}));

describe('useWindow', () => {
    it('exposes main-window controls for custom title bars', async () => {
        const win = useWindow();

        await win.minimizeCurrent();
        await win.toggleMaximizeCurrent();

        expect(minimize).toHaveBeenCalledOnce();
        expect(toggleMaximize).toHaveBeenCalledOnce();
    });
});
