/**
 * @file Vue 组合式逻辑 - use Outline Sidebar State
 *
 * 覆盖 use Outline Sidebar State 的主要行为、边界条件和跨模块契约，帮助重构时快速定位预期。
 * 注释重点标明数据入口、状态边界、事件通道和协作风险点，便于逐行阅读时快速判断代码意图。
 */

// @vitest-environment jsdom

import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useOutlineSidebarState } from './useOutlineSidebarState';

// 局部常量 update：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const update = vi.fn(() => Promise.resolve());

vi.mock('@/stores/settings', () => ({
  useSettingsStore: () => ({
    state: {
      noteEditorOutlineWidth: 280,
      noteEditorOutlineOpen: false,
      zenOutlineWidth: 300,
      zenOutlineOpen: true
    },
    update
  })
}));

// 测试用例：验证「useOutlineSidebarState」场景，锁定 use Outline Sidebar State 的用户可见行为。
describe('useOutlineSidebarState', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    update.mockClear();
  });

  // 测试用例：验证「collapses when dragged below the threshold」场景，锁定 use Outline Sidebar State 的用户可见行为。
  it('collapses when dragged below the threshold', () => {
    // 局部常量 state：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const state = useOutlineSidebarState('note-editor');
    state.setWidth(72);

    expect(state.open.value).toBe(false);
    expect(state.canResize.value).toBe(false);
  });
});
