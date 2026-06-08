/**
 * @file Vue 组合式逻辑 - use Outline Sidebar State
 *
 * 组织 use Outline Sidebar State 的核心逻辑、类型和协作边界，供 Vue 组合式逻辑 模块复用。
 * 注释重点标明数据入口、状态边界、事件通道和协作风险点，便于逐行阅读时快速判断代码意图。
 */

import { computed, ref } from 'vue';

import { useSettingsStore } from '@/stores/settings';

// 类型 OutlineScope：记录模块边界的数据形状，帮助调用方理解字段来源和约束。
type OutlineScope = 'note-editor' | 'zen';

// 局部常量 COLLAPSE_THRESHOLD：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const COLLAPSE_THRESHOLD = 96;
// 局部常量 MIN_EXPANDED_WIDTH：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const MIN_EXPANDED_WIDTH = 240;
// 局部常量 MAX_WIDTH：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const MAX_WIDTH = 420;

// 函数 useOutlineSidebarState：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
export function useOutlineSidebarState(scope: OutlineScope) {
  // 局部常量 settings：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const settings = useSettingsStore();

  // 局部常量 open：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const open = ref(scope === 'note-editor' ? settings.state.noteEditorOutlineOpen : settings.state.zenOutlineOpen);
  // 局部常量 width：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const width = ref(scope === 'note-editor' ? settings.state.noteEditorOutlineWidth : settings.state.zenOutlineWidth);

  // 局部常量 canResize：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const canResize = computed(() => open.value);

  // 函数 persist：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
  async function persist() {
    await settings.update(scope === 'note-editor' ? 'noteEditorOutlineOpen' : 'zenOutlineOpen', open.value);
    await settings.update(scope === 'note-editor' ? 'noteEditorOutlineWidth' : 'zenOutlineWidth', width.value);
  }

  // 函数 setWidth：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
  function setWidth(next: number) {
    if (next < COLLAPSE_THRESHOLD) {
      open.value = false;
      void persist();
      return;
    }
    open.value = true;
    width.value = Math.max(MIN_EXPANDED_WIDTH, Math.min(MAX_WIDTH, Math.round(next)));
    void persist();
  }

  // 函数 reopen：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
  function reopen() {
    open.value = true;
    width.value = Math.max(width.value, MIN_EXPANDED_WIDTH);
    void persist();
  }

  // 函数 toggle：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
  function toggle() {
    if (open.value) {
      open.value = false;
      void persist();
      return;
    }
    reopen();
  }

  return { open, width, canResize, setWidth, reopen, toggle, persist };
}
