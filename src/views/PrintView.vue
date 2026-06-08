<!--
  @file 前端视图 - Print View

  承载 Print View 的界面结构、响应式状态和用户交互，是 前端视图 模块的可视入口之一。
  注释重点标明模板结构、脚本状态、事件派发和样式隔离边界。
-->

<script setup lang="ts">
// 脚本区：组织 Print View 的响应式状态、计算属性、事件处理和外部模块协作。
/**
 * @component PrintView
 * @description 导出 PDF 的「打印窗口」顶层视图（独立 webview，label = `print-{noteId}`）。
 *
 * 思路：Tauri 没有静默生成 PDF 文件的 API，故复用 webview 的打印能力——本窗口只渲染
 * 目标笔记的只读内容（复用 MarkdownReadSurface，图片/代码/公式所见即所得），挂载并等
 * 渲染稳定后自动调用 `window.print()`，用户在系统对话框选「另存为 PDF / Microsoft Print
 * to PDF」。打印对话框关闭（`afterprint`）后自动关窗。
 */
import { nextTick, onMounted, ref } from 'vue';

import MarkdownReadSurface from '@/components/MarkdownReadSurface.vue';
import { useDb } from '@/composables/useDb';
import { useWindow } from '@/composables/useWindow';
import type { Note } from '@/types/steno';

// 局部常量 props：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const props = defineProps<{ noteId: string }>();

// 局部常量 db：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const db = useDb();
// 局部常量 win：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const win = useWindow();
// 局部常量 note：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const note = ref<Note | null>(null);

/** 给 ProseMirror 渲染 + 图片解码留出时间，避免打印到半成品。 */
const PRINT_DELAY_MS = 500;

// 函数 handleAfterPrint：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
function handleAfterPrint() {
  void win.closeCurrent();
}

onMounted(async () => {
  try {
    // 局部常量 loaded：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const loaded = await db.getNote(props.noteId);
    if (!loaded) {
      await win.closeCurrent();
      return;
    }
    note.value = loaded;
    await nextTick();
    window.addEventListener('afterprint', handleAfterPrint, { once: true });
    setTimeout(() => window.print(), PRINT_DELAY_MS);
  } catch {
    await win.closeCurrent();
  }
});
</script>

<template>
  <!-- 模板区：描述 Print View 的 DOM 层级、可交互区域和条件渲染边界。 -->
  <div class="print-root" data-testid="print-root">
    <MarkdownReadSurface v-if="note" :title="note.title" :content="note.content" />
  </div>
</template>

<style scoped>
/* 样式区：限定 Print View 的布局、主题色和响应式细节。 */
/* 打印窗口本身即打印内容：屏幕上也用白底黑字（接近打印预览），整页交给系统打印。 */
.print-root {
  min-height: 100vh;
  background: #ffffff;
  color: #1a1a1a;
}

.print-root :deep(.markdown-read-surface) {
  color: #1a1a1a;
}

@media print {
  .print-root {
    min-height: 0;
  }
}
</style>
