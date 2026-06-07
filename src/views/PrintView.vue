<script setup lang="ts">
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

const props = defineProps<{ noteId: string }>();

const db = useDb();
const win = useWindow();
const note = ref<Note | null>(null);

/** 给 ProseMirror 渲染 + 图片解码留出时间，避免打印到半成品。 */
const PRINT_DELAY_MS = 500;

function handleAfterPrint() {
  void win.closeCurrent();
}

onMounted(async () => {
  try {
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
  <div class="print-root" data-testid="print-root">
    <MarkdownReadSurface
      v-if="note"
      :title="note.title"
      :content="note.content"
    />
  </div>
</template>

<style scoped>
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
