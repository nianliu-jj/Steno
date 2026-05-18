<script setup lang="ts">
// Zen 写作窗口顶层视图（mode === 'zen'）。
// 页面由主窗口路由切入，noteId 优先来自 ui store；hash/query 仅作为浏览器
// 调试兜底。no id 时是空白草稿。
//
// 行为（plan Task 8.1 / spec zen-writing）：
// - mount：若有 ?id= 则 getNote 拉数据；否则空白草稿（hide 时若空内容则不写库）
// - 全屏沉浸式：左上角微缩 meta（保存状态/字数）；右上退出按钮
// - 1000ms 防抖自动保存；Esc 触发 flushSave + hide 当前窗口
// - 隐藏 toolbar 中所有非"标题/正文/字数/保存状态/退出"的元素
//   （MarkdownEditor 本身自带 toolbar，这里关掉它的 preview，保留极简工具栏）
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { NDropdown, NInput, NText, useMessage } from 'naive-ui';

import WritingSurface from '@/components/writing/WritingSurface.vue';
import { useOutlineSidebarState } from '@/composables/useOutlineSidebarState';
import { useWritingSession } from '@/composables/useWritingSession';
import { useDb } from '@/composables/useDb';
import { useUiStore } from '@/stores/ui';

const db = useDb();
const ui = useUiStore();
const message = useMessage();
const session = useWritingSession(ref(ui.noteId ?? readIdFromUrl()));
const outline = useOutlineSidebarState('zen');

const isEmpty = computed(
  () => !session.title.value.trim() && !session.content.value.trim() && session.tags.value.length === 0,
);

// ----- 启动加载 -------------------------------------------------------

function readIdFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search.replace(/^\?/, ''));
  return params.get('id');
}

const statusText = computed(() => {
  switch (session.status.value) {
    case 'idle':
      return '';
    case 'scheduled':
      return '编辑中…';
    case 'saving':
      return '保存中…';
    case 'saved':
      return session.savedAt.value
        ? `已保存 ${session.savedAt.value.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`
        : '已保存';
    case 'error':
      return `保存失败：${String(session.error.value).slice(0, 40)}`;
    default:
      return '';
  }
});

// ----- 退出（Esc / 关闭按钮） -----------------------------------------

async function exitZen() {
  if (!isEmpty.value || session.currentNoteId.value) {
    await session.flushSave();
    if (session.status.value === 'error') return; // 保留窗口让用户看错误
  }
  ui.exitZen();
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.preventDefault();
    void exitZen();
  }
}

// ----- 导出 ----------------------------------------------------------

const exportOptions = [
  { key: 'markdown', label: '导出为 Markdown' },
  { key: 'pdf', label: '导出为 PDF' },
];

async function onExport(key: string) {
  if (!session.currentNoteId.value) {
    message.warning('请先输入内容（保存后才能导出）');
    return;
  }
  // 先 flush 一次，确保磁盘上是最新内容
  await session.flushSave();
  if (session.status.value === 'error') {
    message.error('保存失败，已取消导出');
    return;
  }
  try {
    if (key === 'markdown') {
      const path = await db.exportNoteMarkdown(session.currentNoteId.value);
      message.success(`已导出：${path}`);
    } else {
      const path = await db.exportNotePdf(session.currentNoteId.value);
      message.success(`已导出：${path}`);
    }
  } catch (e) {
    message.error(String(e));
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown);
});
onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown);
  // 守护：webview 销毁前再 flush 一次
  void session.flushSave();
});
</script>

<template>
  <div class="zen-root">
    <header class="zen-header">
      <div class="zen-meta">
        <NText depth="3" class="zen-meta-item">{{ session.wordCount.value }} 字</NText>
        <NText
          depth="3"
          class="zen-meta-item"
          :class="{ 'zen-meta-error': session.status.value === 'error' }"
        >
          {{ statusText }}
        </NText>
      </div>
      <div class="zen-actions">
        <NDropdown
          :options="exportOptions"
          trigger="click"
          @select="onExport"
        >
          <button class="zen-export" title="导出">↓</button>
        </NDropdown>
        <button class="zen-exit" title="返回主界面 (Esc)" @click="exitZen">
          ✕
        </button>
      </div>
    </header>

    <div class="zen-stage">
      <div class="zen-paper">
        <NInput
          v-model:value="session.title.value"
          size="large"
          placeholder="标题"
          :bordered="false"
          class="zen-title"
        />
        <div class="zen-outline-shell" data-testid="zen-outline-shell">
      <WritingSurface
        v-model="session.content.value"
        :mode="session.mode.value"
        :headings="session.headings.value"
        :outline-open="outline.open.value"
        :outline-width="outline.width.value"
        :show-floating-outline="false"
        :show-zen-entry="false"
        @toggle-readonly="session.toggleReadonly"
        @open-source="session.openSource"
        @close-source="session.closeSource"
        @resize-outline="outline.setWidth($event)"
      />
    </div>
  </div>
    </div>
  </div>
</template>

<style scoped>
.zen-root {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100vw;
  background: #14141a;
  color: #e8e8ea;
  font-family: -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
}

.zen-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 32px;
  padding: 0 16px;
  /* 沉浸：用极弱的分割线，避免分散注意力 */
  border-bottom: 1px solid rgba(255, 255, 255, 0.03);
}
.zen-meta {
  display: flex;
  align-items: center;
  gap: 16px;
  color: #6f6f78;
  font-size: 11px;
}
.zen-meta-item {
  font-size: 11px;
}
.zen-meta-error {
  color: #ff6b6b;
}

.zen-exit {
  width: 24px;
  height: 24px;
  background: transparent;
  color: #6f6f78;
  border: none;
  border-radius: 3px;
  cursor: pointer;
  font-size: 14px;
  transition: color 0.12s, background 0.12s;
}
.zen-exit:hover {
  color: #e8e8ea;
  background: rgba(255, 255, 255, 0.06);
}

.zen-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}
.zen-export {
  width: 24px;
  height: 24px;
  background: transparent;
  color: #6f6f78;
  border: none;
  border-radius: 3px;
  cursor: pointer;
  font-size: 14px;
  transition: color 0.12s, background 0.12s;
}
.zen-export:hover {
  color: #e8e8ea;
  background: rgba(255, 255, 255, 0.06);
}

.zen-stage {
  flex: 1;
  display: flex;
  justify-content: center;
  padding: 32px 24px 48px;
  overflow: auto;
}
.zen-paper {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 760px;
  min-height: 0;
  gap: 16px;
}

.zen-title :deep(input) {
  font-size: 28px;
  font-weight: 600;
  color: #f0f0f2;
  background: transparent;
  padding: 0;
}
.zen-title :deep(.n-input__placeholder) {
  font-size: 28px;
  font-weight: 600;
}

.zen-outline-shell {
  flex: 1;
  min-height: 60vh;
  display: flex;
  min-width: 0;
}

.zen-outline-shell :deep(.writing-surface) {
  flex: 1;
  min-height: 0;
}

.zen-outline-shell :deep(.writing-outline-pane) {
  border-left: 1px solid rgba(255, 255, 255, 0.06);
}
</style>
