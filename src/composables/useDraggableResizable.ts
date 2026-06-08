/**
 * @file Vue 组合式逻辑 - use Draggable Resizable
 *
 * 组织 use Draggable Resizable 的核心逻辑、类型和协作边界，供 Vue 组合式逻辑 模块复用。
 * 注释重点标明数据入口、状态边界、事件通道和协作风险点，便于逐行阅读时快速判断代码意图。
 */

import { ref } from 'vue';

// 类型 DraggableResizableOptions：记录模块边界的数据形状，帮助调用方理解字段来源和约束。
export interface DraggableResizableOptions {
  initialX: number;
  initialY: number;
  initialWidth: number;
  initialHeight: number;
  minWidth: number;
  minHeight: number;
  maxWidth?: number;
  maxHeight?: number;
}

// 函数 clamp：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

// 函数 useDraggableResizable：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
export function useDraggableResizable(options: DraggableResizableOptions) {
  // 局部常量 x：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const x = ref(options.initialX);
  // 局部常量 y：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const y = ref(options.initialY);
  // 局部常量 width：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const width = ref(options.initialWidth);
  // 局部常量 height：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const height = ref(options.initialHeight);
  // 局部常量 maxWidth：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const maxWidth = ref(options.maxWidth ?? Number.POSITIVE_INFINITY);
  // 局部常量 maxHeight：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const maxHeight = ref(options.maxHeight ?? Number.POSITIVE_INFINITY);

  // 函数 moveBy：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
  function moveBy(dx: number, dy: number) {
    x.value += dx;
    y.value += dy;
  }

  // 函数 resizeBy：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
  function resizeBy(dx: number, dy: number) {
    width.value = clamp(width.value + dx, options.minWidth, maxWidth.value);
    height.value = clamp(height.value + dy, options.minHeight, maxHeight.value);
  }

  // 函数 setMaxSize：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
  function setMaxSize(w: number, h: number) {
    maxWidth.value = w;
    maxHeight.value = h;
    width.value = clamp(width.value, options.minWidth, w);
    height.value = clamp(height.value, options.minHeight, h);
  }

  return { x, y, width, height, moveBy, resizeBy, setMaxSize };
}
