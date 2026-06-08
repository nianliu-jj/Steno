/**
 * @file Vue 组合式逻辑 - use Image Editor
 *
 * 覆盖 use Image Editor 的主要行为、边界条件和跨模块契约，帮助重构时快速定位预期。
 * 注释重点标明数据入口、状态边界、事件通道和协作风险点，便于逐行阅读时快速判断代码意图。
 */

import { describe, expect, it } from 'vitest';

import { useImageEditor } from './useImageEditor';
import { NEUTRAL_ADJUST } from '@/utils/imageOps';

// 测试用例：验证「useImageEditor」场景，锁定 use Image Editor 的用户可见行为。
describe('useImageEditor', () => {
  // 测试用例：验证「pushes transform ops and tracks dirty/undo state」场景，锁定 use Image Editor 的用户可见行为。
  it('pushes transform ops and tracks dirty/undo state', () => {
    // 局部常量 e：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const e = useImageEditor();
    expect(e.dirty.value).toBe(false);
    expect(e.canUndo.value).toBe(false);

    e.rotate(90);
    e.flip('h');
    expect(e.ops.value.map(o => o.type)).toEqual(['rotate', 'flip']);
    expect(e.dirty.value).toBe(true);
    expect(e.canUndo.value).toBe(true);
  });

  // 测试用例：验证「collapses consecutive adjusts into one trailing op」场景，锁定 use Image Editor 的用户可见行为。
  it('collapses consecutive adjusts into one trailing op', () => {
    // 局部常量 e：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const e = useImageEditor();
    e.rotate(90);
    e.setAdjust({ ...NEUTRAL_ADJUST, brightness: 10 });
    e.setAdjust({ ...NEUTRAL_ADJUST, brightness: 40 });
    expect(e.ops.value.map(o => o.type)).toEqual(['rotate', 'adjust']);
    expect(e.currentAdjust.value.brightness).toBe(40);
  });

  // 测试用例：验证「undo/redo/reset operate on the stack」场景，锁定 use Image Editor 的用户可见行为。
  it('undo/redo/reset operate on the stack', () => {
    // 局部常量 e：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const e = useImageEditor();
    e.rotate(90);
    e.flip('v');

    e.undo();
    expect(e.ops.value.map(o => o.type)).toEqual(['rotate']);
    expect(e.canRedo.value).toBe(true);

    e.redo();
    expect(e.ops.value.map(o => o.type)).toEqual(['rotate', 'flip']);

    e.reset();
    expect(e.ops.value).toEqual([]);
    expect(e.canUndo.value).toBe(false);
    expect(e.canRedo.value).toBe(false);
  });

  // 测试用例：验证「pushing a new op clears the redo stack」场景，锁定 use Image Editor 的用户可见行为。
  it('pushing a new op clears the redo stack', () => {
    // 局部常量 e：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const e = useImageEditor();
    e.rotate(90);
    e.undo();
    e.flip('h');
    expect(e.canRedo.value).toBe(false);
  });
});
