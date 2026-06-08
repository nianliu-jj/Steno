/**
 * @file Vue 组合式逻辑 - use Image Editor
 *
 * 组织 use Image Editor 的核心逻辑、类型和协作边界，供 Vue 组合式逻辑 模块复用。
 * 注释重点标明数据入口、状态边界、事件通道和协作风险点，便于逐行阅读时快速判断代码意图。
 */

import { computed, ref } from 'vue';

import { NEUTRAL_ADJUST, type AdjustParams, type CropRect, type EditOp } from '@/utils/imageOps';

// 函数 useImageEditor：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
export function useImageEditor() {
  // 局部常量 ops：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const ops = ref<EditOp[]>([]);
  // 局部常量 redoStack：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const redoStack = ref<EditOp[]>([]);

  // 函数 pushOp：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
  function pushOp(op: EditOp) {
    ops.value = [...ops.value, op];
    redoStack.value = [];
  }

  // 函数 rotate：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
  function rotate(deg: number) {
    pushOp({ type: 'rotate', deg });
  }

  // 函数 flip：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
  function flip(axis: 'h' | 'v') {
    pushOp({ type: 'flip', axis });
  }

  // 函数 crop：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
  function crop(rect: CropRect) {
    pushOp({ type: 'crop', rect });
  }

  // 函数 resize：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
  function resize(w: number, h: number) {
    pushOp({ type: 'resize', w, h });
  }

  // 函数 setAdjust：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
  function setAdjust(params: AdjustParams) {
    // 局部常量 last：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const last = ops.value[ops.value.length - 1];
    // 局部常量 base：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const base = last && last.type === 'adjust' ? ops.value.slice(0, -1) : ops.value;
    ops.value = [...base, { type: 'adjust', params }];
    redoStack.value = [];
  }

  // 函数 undo：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
  function undo() {
    if (!ops.value.length) return;
    // 局部常量 op：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const op = ops.value[ops.value.length - 1];
    ops.value = ops.value.slice(0, -1);
    redoStack.value = [...redoStack.value, op];
  }

  // 函数 redo：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
  function redo() {
    if (!redoStack.value.length) return;
    // 局部常量 op：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const op = redoStack.value[redoStack.value.length - 1];
    redoStack.value = redoStack.value.slice(0, -1);
    ops.value = [...ops.value, op];
  }

  // 函数 reset：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
  function reset() {
    ops.value = [];
    redoStack.value = [];
  }

  // 局部常量 canUndo：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const canUndo = computed(() => ops.value.length > 0);
  // 局部常量 canRedo：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const canRedo = computed(() => redoStack.value.length > 0);
  // 局部常量 dirty：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const dirty = computed(() => ops.value.length > 0);
  // 局部常量 currentAdjust：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const currentAdjust = computed<AdjustParams>(() => {
    for (let i = ops.value.length - 1; i >= 0; i -= 1) {
      // 局部常量 op：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
      const op = ops.value[i];
      if (op.type === 'adjust') return op.params;
    }
    return NEUTRAL_ADJUST;
  });

  return { ops, canUndo, canRedo, dirty, currentAdjust, rotate, flip, crop, resize, setAdjust, undo, redo, reset };
}
