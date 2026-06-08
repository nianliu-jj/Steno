/**
 * @file Pinia 状态管理 - clipboard
 *
 * 组织 clipboard 的核心逻辑、类型和协作边界，供 Pinia 状态管理 模块复用。
 * 注释重点标明数据入口、状态边界、事件通道和协作风险点，便于逐行阅读时快速判断代码意图。
 */

import { listen } from '@tauri-apps/api/event';
import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';

import { useDb } from '@/composables/useDb';
import { useSettingsStore } from '@/stores/settings';
import type { ClipboardContentType, ClipboardEntry } from '@/types/steno';

// 局部常量 UPDATED_EVENT：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const UPDATED_EVENT = 'steno:clipboard-updated';
// 局部常量 REMOVED_EVENT：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const REMOVED_EVENT = 'steno:clipboard-removed';
// 局部常量 CLEARED_EVENT：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const CLEARED_EVENT = 'steno:clipboard-cleared';

// Store useClipboardStore：暴露模块状态、派生数据和写入动作，是跨组件共享状态的入口。
export const useClipboardStore = defineStore('clipboard', () => {
  // 局部常量 db：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const db = useDb();
  // 局部常量 settings：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const settings = useSettingsStore();
  // 局部常量 entries：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const entries = ref<ClipboardEntry[]>([]);
  // 局部常量 loading：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const loading = ref(false);
  // 局部常量 error：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const error = ref<string | null>(null);
  // 局部常量 query：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const query = ref('');
  // 局部常量 typeFilter：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const typeFilter = ref<ClipboardContentType | null>(null);
  // 局部常量 listenersStarted：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const listenersStarted = ref(false);
  const unlisteners: Array<() => void> = [];
  // 局部常量 page：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const page = ref(1);
  // 局部常量 totalCount：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const totalCount = ref(0);

  // 局部常量 filteredEntries：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const filteredEntries = computed(() => {
    // 局部常量 term：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const term = query.value.trim().toLowerCase();
    return entries.value.filter(entry => {
      if (typeFilter.value && entry.contentType !== typeFilter.value) return false;
      if (!term) return true;
      return `${entry.preview} ${entry.content}`.toLowerCase().includes(term);
    });
  });

  // 局部常量 pageSize：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const pageSize = computed(() => settings.state.clipboardPageSize);

  // 局部常量 pagedEntries：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const pagedEntries = computed(() => {
    // 函数式常量 start：以闭包形式组织逻辑，便于在组件、store 或测试中传递。
    const start = (page.value - 1) * pageSize.value;
    return filteredEntries.value.slice(start, start + pageSize.value);
  });

  // 局部常量 totalPages：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const totalPages = computed(() => Math.max(1, Math.ceil(filteredEntries.value.length / pageSize.value)));

  // 函数 setPage：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
  function setPage(newPage: number) {
    page.value = Math.max(1, Math.min(newPage, totalPages.value));
  }

  // 函数 setPageSize：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
  function setPageSize(size: number) {
    settings.state.clipboardPageSize = size;
    page.value = 1;
  }

  // 函数 load：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
  async function load() {
    loading.value = true;
    error.value = null;
    try {
      // 局部常量 all：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
      const all = await db.listClipboardEntries({
        limit: 500,
        contentType: typeFilter.value,
        query: query.value
      });
      entries.value = all;
      totalCount.value = all.length;
      if (page.value > totalPages.value) {
        page.value = totalPages.value;
      }
    } catch (e) {
      error.value = String(e);
      entries.value = [];
    } finally {
      loading.value = false;
    }
  }

  // 函数 upsertLocal：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
  function upsertLocal(entry: ClipboardEntry) {
    // 局部常量 updated：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const updated = [entry, ...entries.value.filter(item => item.id !== entry.id)];
    updated.sort((a, b) => {
      // 局部常量 aPin：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
      const aPin = a.pinnedAt ?? '';
      // 局部常量 bPin：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
      const bPin = b.pinnedAt ?? '';
      if (aPin !== bPin) return bPin.localeCompare(aPin);
      // 非置顶项按「最近使用时间」降序 —— 复制/粘贴会刷新 lastUsedAt 使其重排到头部。
      // lastUsedAt 缺失时回退 updatedAt（与后端 COALESCE(last_used_at, updated_at) 一致）。
      const aUsed = a.lastUsedAt ?? a.updatedAt;
      // 局部常量 bUsed：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
      const bUsed = b.lastUsedAt ?? b.updatedAt;
      return bUsed.localeCompare(aUsed);
    });
    entries.value = updated.slice(0, 500);
  }

  // 函数 startEventListeners：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
  async function startEventListeners() {
    if (listenersStarted.value) return;
    listenersStarted.value = true;
    try {
      unlisteners.push(
        await listen<ClipboardEntry>(UPDATED_EVENT, event => {
          upsertLocal(event.payload);
        })
      );
      unlisteners.push(
        await listen<string>(REMOVED_EVENT, event => {
          entries.value = entries.value.filter(entry => entry.id !== event.payload);
        })
      );
      unlisteners.push(
        await listen(CLEARED_EVENT, () => {
          entries.value = [];
        })
      );
    } catch (e) {
      listenersStarted.value = false;
      error.value = String(e);
    }
  }

  // 函数 stopEventListeners：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
  function stopEventListeners() {
    while (unlisteners.length) {
      unlisteners.pop()?.();
    }
    listenersStarted.value = false;
  }

  // 函数 copyEntry：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
  async function copyEntry(id: string) {
    await db.copyClipboardEntry(id);
  }

  // 函数 pasteEntry：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
  async function pasteEntry(id: string) {
    await db.pasteClipboardEntry(id);
  }

  // 函数 deleteEntry：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
  async function deleteEntry(id: string) {
    await db.deleteClipboardEntry(id);
    entries.value = entries.value.filter(entry => entry.id !== id);
  }

  // 函数 clearEntries：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
  async function clearEntries() {
    await db.clearClipboardEntries();
    entries.value = [];
  }

  // 函数 updateEntry：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
  async function updateEntry(id: string, content: string, htmlContent?: string | null) {
    // 局部常量 entry：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const entry = await db.updateClipboardEntry({ id, content, htmlContent });
    upsertLocal(entry);
    return entry;
  }

  // 函数 addImageEntry：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
  async function addImageEntry(dataUrl: string) {
    // 局部常量 entry：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const entry = await db.addImageClipboardEntry(dataUrl);
    upsertLocal(entry);
    return entry;
  }

  // 函数 pinEntry：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
  async function pinEntry(id: string) {
    // 局部常量 entry：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const entry = await db.pinClipboardEntry(id);
    upsertLocal(entry);
    return entry;
  }

  // 函数 unpinEntry：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
  async function unpinEntry(id: string) {
    // 局部常量 entry：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const entry = await db.unpinClipboardEntry(id);
    upsertLocal(entry);
    return entry;
  }

  watch([query, typeFilter], () => {
    page.value = 1;
  });

  return {
    entries,
    loading,
    error,
    query,
    typeFilter,
    filteredEntries,
    pagedEntries,
    page,
    pageSize,
    totalPages,
    totalCount,
    load,
    setPage,
    setPageSize,
    startEventListeners,
    stopEventListeners,
    copyEntry,
    pasteEntry,
    deleteEntry,
    clearEntries,
    updateEntry,
    addImageEntry,
    pinEntry,
    unpinEntry
  };
});
