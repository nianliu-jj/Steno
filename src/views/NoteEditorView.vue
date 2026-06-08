<!--
  @file 前端视图 - Note Editor View

  承载 Note Editor View 的界面结构、响应式状态和用户交互，是 前端视图 模块的可视入口之一。
  注释重点标明模板结构、脚本状态、事件派发和样式隔离边界。
-->

<script setup lang="ts">
// 脚本区：组织 Note Editor View 的响应式状态、计算属性、事件处理和外部模块协作。
/**
 * @component NoteEditorView
 * @description 笔记编辑器页面（`mode === 'note-editor'`）— 在 main 窗口内打开。
 *
 * **功能**：
 * - 标题编辑（点击标题文本切换为 NInput 编辑态）
 * - Markdown 编辑器（CodeMirror 6 + WYSIWYG）↔ 只读预览切换
 * - 标签编辑弹窗（最多 3 个标签）
 * - 大纲面板（右下角 FAB 按钮触发）
 * - 自动保存（useAutosave 1000ms 防抖）
 * - Zen 模式入口（模式切换下拉菜单）
 *
 * **模式切换**：通过底部下拉菜单在"编辑模式" / "只读模式" / "Zen 模式"之间切换。
 * 只读模式使用 `MarkdownReadSurface` 渲染预览；Zen 模式走 `ui.navigateTo('zen')`。
 *
 * @props — 无（所有参数通过 `ui.noteId` 获取）
 */

import { computed, nextTick, ref } from 'vue';
import { NButton, NIcon, NInput, NText, useMessage } from 'naive-ui';
import { onClickOutside } from '@vueuse/core';

import DocumentOutlineTree from '@/components/DocumentOutlineTree.vue';
import MarkdownReadSurface from '@/components/MarkdownReadSurface.vue';
import MarkdownEditor from '@/components/MarkdownEditor.vue';
import { useMarkdown } from '@/composables/useMarkdown';
import { useMarkdownOutline } from '@/composables/useMarkdownOutline';
import { useWritingSession } from '@/composables/useWritingSession';
import { useUiStore } from '@/stores/ui';

// 局部常量 ui：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const ui = useUiStore();
// 局部常量 message：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const message = useMessage();
useMarkdown();

// 局部常量 currentNoteId：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const currentNoteId = ref<string | null>(ui.noteId ?? null);
// 局部常量 session：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const session = useWritingSession(currentNoteId);
// 局部常量 title：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const title = session.title;
// 局部常量 content：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const content = session.content;
// 局部常量 tags：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const tags = session.tags;
// 局部常量 editingTitle：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const editingTitle = ref(false);
// 局部常量 tagsDialogVisible：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const tagsDialogVisible = ref(false);
// 局部常量 tagsDraftRows：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const tagsDraftRows = ref<string[]>([]);
// 局部常量 titleInputRef：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const titleInputRef = ref<{ focus: () => void } | null>(null);
// 局部常量 editorRef：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const editorRef = ref<{ focus: () => void; scrollToLine: (line: number) => void } | null>(null);
// 局部常量 viewMode：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const viewMode = ref<'edit' | 'read'>('edit');
// 局部常量 outlineOpen：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const outlineOpen = ref(false);
// 局部常量 modeDropdownOpen：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const modeDropdownOpen = ref(false);
// 局部常量 modeDropdownRef：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const modeDropdownRef = ref<HTMLElement | null>(null);

// 局部常量 wordCount：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const wordCount = session.wordCount;
// 局部常量 displayTitle：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const displayTitle = computed(() => title.value.trim() || '无标题');
const { buildOutline } = useMarkdownOutline();
// 局部常量 outlineNodes：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const outlineNodes = computed(() => buildOutline(content.value));

// 局部常量 MAX_TAGS：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const MAX_TAGS = 3;
// 局部常量 displayedTags：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const displayedTags = computed(() => tags.value.slice(0, 2));
// 局部常量 extraTagCount：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const extraTagCount = computed(() => Math.max(0, tags.value.length - 2));
// 局部常量 modeLabel：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const modeLabel = computed(() => (viewMode.value === 'read' ? '只读模式' : '编辑模式'));

onClickOutside(modeDropdownRef, () => {
  modeDropdownOpen.value = false;
});

// 函数 parseTagRows：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
function parseTagRows(rows: string[]): string[] {
  return Array.from(new Set(rows.map(tag => tag.replace(/^#+/, '').trim()).filter(Boolean)));
}

// 局部常量 statusText：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
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

// 函数 onBack：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
async function onBack() {
  await session.flushSave();
  ui.navigateToMain();
}

// 函数 onStartTitleEdit：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
async function onStartTitleEdit() {
  editingTitle.value = true;
  await nextTick();
  titleInputRef.value?.focus();
}

// 函数 onFinishTitleEdit：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
function onFinishTitleEdit() {
  editingTitle.value = false;
}

// 函数 onOpenTagsDialog：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
async function onOpenTagsDialog() {
  tagsDraftRows.value = tags.value.length ? [...tags.value] : [''];
  tagsDialogVisible.value = true;
}

// 函数 onCloseTagsDialog：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
function onCloseTagsDialog() {
  tagsDialogVisible.value = false;
}

// 函数 onAddTagRow：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
function onAddTagRow() {
  if (tagsDraftRows.value.length >= MAX_TAGS) {
    message.warning('最多只能添加 3 个标签');
    return;
  }
  tagsDraftRows.value.push('');
}

// 函数 onDeleteTagRow：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
function onDeleteTagRow(index: number) {
  tagsDraftRows.value.splice(index, 1);
  if (tagsDraftRows.value.length === 0) {
    tagsDraftRows.value.push('');
  }
}

// 函数 onConfirmTagsDialog：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
function onConfirmTagsDialog() {
  // 局部常量 parsed：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const parsed = parseTagRows(tagsDraftRows.value);
  if (parsed.length > MAX_TAGS) {
    message.warning('最多只能添加 3 个标签');
    return;
  }
  tags.value = parsed;
  tagsDialogVisible.value = false;
}

// 函数 onToggleReadMode：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
function onToggleReadMode() {
  viewMode.value = 'read';
}

// 函数 onToggleEditMode：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
function onToggleEditMode() {
  viewMode.value = 'edit';
  nextTick(() => editorRef.value?.focus());
}

// 函数 onOpenZen：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
async function onOpenZen() {
  await session.flushSave();
  ui.navigateToZenFromEditor(currentNoteId.value);
}

// 函数 onSelectMode：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
function onSelectMode(mode: 'edit' | 'read' | 'zen') {
  modeDropdownOpen.value = false;
  if (mode === 'zen') {
    void onOpenZen();
    return;
  }
  if (mode === 'read') {
    onToggleReadMode();
    return;
  }
  onToggleEditMode();
}

// 函数 onSelectOutline：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
function onSelectOutline(node: { line: number; id: string }) {
  if (viewMode.value === 'edit') {
    editorRef.value?.scrollToLine(node.line);
    return;
  }

  document.getElementById(node.id)?.scrollIntoView({
    block: 'center',
    behavior: 'smooth'
  });
}
</script>

<template>
  <!-- 模板区：描述 Note Editor View 的 DOM 层级、可交互区域和条件渲染边界。 -->
  <div class="note-editor-root">
    <header class="note-editor-header">
      <div class="note-editor-title">
        <NInput
          v-if="editingTitle"
          ref="titleInputRef"
          v-model:value="title"
          :bordered="false"
          size="large"
          placeholder="无标题"
          aria-label="文档标题"
          class="note-editor-title-input"
          @blur="onFinishTitleEdit"
          @keydown.enter="onFinishTitleEdit"
        />
        <div v-else class="note-editor-title-display">
          <span class="note-editor-title-text">{{ displayTitle }}</span>
          <NButton
            quaternary
            circle
            size="small"
            title="编辑标题"
            aria-label="编辑标题"
            class="note-editor-icon-button"
            data-testid="note-title-edit"
            @click="onStartTitleEdit"
          >
            <template #icon>
              <NIcon>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
                </svg>
              </NIcon>
            </template>
          </NButton>
        </div>
      </div>
      <div class="note-editor-actions">
        <NButton size="small" tertiary class="note-editor-back-button" @click="onBack">返回列表</NButton>
      </div>
    </header>

    <div class="note-editor-body">
      <button
        class="note-editor-outline-fab"
        data-testid="note-outline-toggle"
        type="button"
        :aria-label="outlineOpen ? '收起大纲' : '展开大纲'"
        :title="outlineOpen ? '收起大纲' : '展开大纲'"
        :aria-pressed="outlineOpen"
        @click="outlineOpen = !outlineOpen"
      >
        <svg
          viewBox="0 0 24 24"
          width="16"
          height="16"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <line x1="8" y1="6" x2="20" y2="6" />
          <line x1="8" y1="12" x2="20" y2="12" />
          <line x1="8" y1="18" x2="20" y2="18" />
          <circle cx="4" cy="6" r="1.4" />
          <circle cx="4" cy="12" r="1.4" />
          <circle cx="4" cy="18" r="1.4" />
        </svg>
      </button>
      <aside v-if="outlineOpen" class="note-editor-outline-panel" data-testid="note-outline-panel">
        <DocumentOutlineTree :nodes="outlineNodes" @select="onSelectOutline" />
      </aside>
      <MarkdownEditor v-if="viewMode === 'edit'" ref="editorRef" v-model="content" autofocus placeholder="开始写作…" />
      <MarkdownReadSurface v-else data-testid="note-read-surface" :title="displayTitle" :content="content" />
    </div>

    <footer class="note-editor-footer">
      <div class="note-editor-footer-tags" aria-label="文档标签">
        <span v-if="tags.length === 0" class="note-editor-tag-empty">无标签</span>
        <template v-else>
          <span v-for="tag in displayedTags" :key="tag" class="note-editor-tag">#{{ tag }}</span>
          <span v-if="extraTagCount > 0" class="note-editor-tag-more">+{{ extraTagCount }}</span>
        </template>
        <NButton
          quaternary
          circle
          size="small"
          title="编辑标签"
          aria-label="编辑标签"
          class="note-editor-icon-button note-editor-tags-edit-button"
          data-testid="note-tags-edit"
          @click="onOpenTagsDialog"
        >
          <template #icon>
            <NIcon>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
              </svg>
            </NIcon>
          </template>
        </NButton>
      </div>
      <div ref="modeDropdownRef" class="note-editor-mode-dropdown">
        <button
          type="button"
          class="note-editor-mode-trigger"
          aria-haspopup="listbox"
          :aria-expanded="modeDropdownOpen"
          @click="modeDropdownOpen = !modeDropdownOpen"
        >
          <span>{{ modeLabel }}</span>
          <span class="note-editor-mode-caret" aria-hidden="true">▾</span>
        </button>
        <ul v-show="modeDropdownOpen" class="note-editor-mode-options" role="listbox">
          <li class="note-editor-mode-item">
            <button
              type="button"
              class="note-editor-mode-option"
              data-testid="note-mode-edit"
              @click="onSelectMode('edit')"
            >
              编辑模式
            </button>
          </li>
          <li class="note-editor-mode-item">
            <button
              type="button"
              class="note-editor-mode-option"
              data-testid="note-mode-read"
              @click="onSelectMode('read')"
            >
              只读模式
            </button>
          </li>
          <li class="note-editor-mode-item">
            <button
              type="button"
              class="note-editor-mode-option"
              data-testid="note-open-zen"
              @click="onSelectMode('zen')"
            >
              Zen 模式
            </button>
          </li>
        </ul>
      </div>
      <div class="note-editor-footer-meta">
        <NText depth="3" class="note-editor-meta-text">{{ wordCount }} 字</NText>
        <NText depth="3" class="note-editor-meta-text">{{ statusText }}</NText>
      </div>
    </footer>

    <div
      v-if="tagsDialogVisible"
      class="note-editor-dialog-backdrop"
      @click.self="onCloseTagsDialog"
      @keydown.esc="onCloseTagsDialog"
    >
      <section class="note-editor-dialog" role="dialog" aria-modal="true" aria-labelledby="note-editor-tags-title">
        <h2 id="note-editor-tags-title" class="note-editor-dialog-title">编辑标签</h2>
        <div class="note-editor-tag-editor">
          <div v-for="(_, index) in tagsDraftRows" :key="index" class="note-editor-tag-row">
            <NInput
              v-model:value="tagsDraftRows[index]"
              size="small"
              placeholder="输入标签"
              :aria-label="`标签 ${index + 1}`"
              class="note-editor-tags-input"
              :data-testid="`note-tag-input-${index}`"
            />
            <NButton
              quaternary
              circle
              size="small"
              title="删除标签"
              :aria-label="`删除标签 ${index + 1}`"
              :data-testid="`note-tag-delete-${index}`"
              @click="onDeleteTagRow(index)"
            >
              <template #icon>
                <NIcon>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M18 6 6 18" />
                    <path d="m6 6 12 12" />
                  </svg>
                </NIcon>
              </template>
            </NButton>
          </div>
          <NButton
            size="small"
            tertiary
            class="note-editor-tag-add"
            data-testid="note-tag-add"
            :disabled="tagsDraftRows.length >= MAX_TAGS"
            @click="onAddTagRow"
          >
            <template #icon>
              <NIcon>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M12 5v14" />
                  <path d="M5 12h14" />
                </svg>
              </NIcon>
            </template>
            添加标签
          </NButton>
        </div>
        <div class="note-editor-dialog-actions">
          <NButton size="small" class="note-editor-dialog-cancel" @click="onCloseTagsDialog">取消</NButton>
          <NButton size="small" type="primary" data-testid="note-tags-confirm" @click="onConfirmTagsDialog">
            保存
          </NButton>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
/* 样式区：限定 Note Editor View 的布局、主题色和响应式细节。 */
.note-editor-root {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  color: #2a2a2a;
}

.note-editor-header {
  flex-shrink: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  padding: 12px 24px;
  border-bottom: 1px solid rgba(55, 46, 36, 0.1);
}

.note-editor-meta-text {
  --n-text-color: #5f564d !important;
  color: #5f564d !important;
}

.note-editor-actions {
  justify-self: end;
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.note-editor-icon-button {
  flex-shrink: 0;
  color: #6f5c4c;
}

.note-editor-icon-button:hover,
.note-editor-icon-button:focus-visible {
  color: #2f2923;
}

.note-editor-icon-button :deep(svg) {
  width: 16px;
  height: 16px;
}

.note-editor-back-button {
  --n-text-color: #6f5c4c !important;
  --n-text-color-hover: #2f2923 !important;
  --n-text-color-pressed: #2f2923 !important;
  --n-text-color-focus: #2f2923 !important;
  --n-color-hover: rgba(132, 82, 47, 0.1) !important;
  --n-color-pressed: rgba(132, 82, 47, 0.16) !important;
  --n-color-focus: rgba(132, 82, 47, 0.1) !important;
  color: #6f5c4c !important;
}

.note-editor-back-button:hover,
.note-editor-back-button:focus-visible {
  color: #2f2923 !important;
}

.note-editor-back-button :deep(.n-button__content) {
  color: inherit;
}

.note-editor-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 14px 24px 8px;
  position: relative;
  overflow: hidden;
}

.note-editor-footer {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 0 24px 14px;
  border-top: 1px solid rgba(55, 46, 36, 0.08);
}

.note-editor-footer-tags {
  min-width: 0;
  display: flex;
  flex: 1;
  align-items: center;
  gap: 6px;
  overflow-x: auto;
  color: #6f5c4c;
  font-size: 12px;
}

.note-editor-tag,
.note-editor-tag-empty {
  flex-shrink: 0;
  line-height: 24px;
}

.note-editor-tag {
  max-width: 120px;
  overflow: hidden;
  padding: 0 7px;
  border: 1px solid rgba(132, 82, 47, 0.16);
  border-radius: 6px;
  background: rgba(132, 82, 47, 0.06);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.note-editor-tag-empty {
  color: #8a8178;
}

.note-editor-tag-more {
  flex-shrink: 0;
  padding: 0 7px;
  border: 1px solid rgba(132, 82, 47, 0.16);
  border-radius: 6px;
  background: rgba(132, 82, 47, 0.1);
  color: #6f5c4c;
  font-size: 12px;
  line-height: 24px;
}

.note-editor-tags-edit-button {
  margin-left: 2px;
}

.note-editor-footer-meta {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  font-size: 12px;
  white-space: nowrap;
}

.note-editor-footer-actions {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 8px;
}

.note-editor-mode-dropdown {
  position: relative;
  flex-shrink: 0;
}

.note-editor-mode-trigger {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border: 1px solid rgba(132, 82, 47, 0.18);
  border-radius: 6px;
  background: rgba(255, 250, 244, 0.96);
  color: #6f5c4c;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}

.note-editor-mode-trigger:hover,
.note-editor-mode-trigger:focus-visible {
  background: rgba(132, 82, 47, 0.08);
  color: #2f2923;
  outline: none;
}

.note-editor-mode-caret {
  font-size: 10px;
  line-height: 1;
}

.note-editor-mode-options {
  position: absolute;
  right: 0;
  bottom: calc(100% + 6px);
  z-index: 4;
  min-width: 120px;
  margin: 0;
  padding: 4px 0;
  list-style: none;
  border: 1px solid rgba(55, 46, 36, 0.12);
  border-radius: 8px;
  background: rgba(255, 250, 244, 0.98);
  box-shadow: 0 12px 32px rgba(38, 31, 25, 0.16);
}

.note-editor-mode-item {
  margin: 0;
  padding: 0;
}

.note-editor-mode-option {
  display: block;
  width: 100%;
  padding: 6px 12px;
  border: 0;
  background: transparent;
  color: #5f564d;
  font: inherit;
  font-size: 12px;
  text-align: left;
  cursor: pointer;
}

.note-editor-mode-option:hover,
.note-editor-mode-option:focus-visible {
  background: rgba(132, 82, 47, 0.08);
  color: #2a2a2a;
  outline: none;
}

.note-editor-title {
  width: 100%;
  min-width: 0;
  justify-self: start;
}

.note-editor-title-display {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
  min-width: 0;
}

.note-editor-title-text {
  min-width: 0;
  overflow: hidden;
  color: #2a2a2a;
  font-size: 18px;
  font-weight: 600;
  line-height: 1.4;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.note-editor-title-input {
  width: 100%;
}

.note-editor-title-input :deep(input) {
  padding: 0;
  text-align: left;
  font-size: 18px;
  font-weight: 600;
  color: #2a2a2a !important;
  caret-color: #2a2a2a;
}

.note-editor-title-input :deep(input::placeholder),
.note-editor-title-input :deep(.n-input__placeholder) {
  color: #7e7469 !important;
}

.note-editor-dialog-backdrop {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(38, 31, 25, 0.22);
}

.note-editor-dialog {
  width: min(420px, 100%);
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 18px;
  border: 1px solid rgba(55, 46, 36, 0.14);
  border-radius: 8px;
  background: #fffaf4;
  color: #2a2a2a;
  box-shadow: 0 18px 48px rgba(38, 31, 25, 0.16);
}

.note-editor-dialog-title {
  margin: 0;
  color: #2a2a2a;
  font-size: 16px;
  font-weight: 600;
}

.note-editor-tag-editor {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.note-editor-tag-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 32px;
  align-items: center;
  gap: 8px;
}

.note-editor-tags-input {
  --n-text-color: #2a2a2a !important;
  --n-placeholder-color: #8a7c70 !important;
  --n-color: #fffdf9 !important;
  --n-color-focus: #fffdf9 !important;
  --n-caret-color: #2a2a2a !important;
  --n-border: 1px solid rgba(55, 46, 36, 0.22) !important;
  --n-border-hover: 1px solid rgba(55, 46, 36, 0.38) !important;
  --n-border-focus: 1px solid #18a058 !important;
}

.note-editor-tags-input :deep(.n-input__placeholder),
.note-editor-tags-input :deep(input::placeholder) {
  color: #8a7c70 !important;
}

.note-editor-tags-input :deep(.n-input__input-el),
.note-editor-tags-input :deep(input) {
  color: #2a2a2a !important;
  -webkit-text-fill-color: #2a2a2a;
  caret-color: #2a2a2a;
}

.note-editor-tag-row :deep(.n-button),
.note-editor-tag-add,
.note-editor-dialog-cancel {
  --n-text-color: #6f5c4c !important;
  --n-text-color-hover: #2f2923 !important;
  --n-text-color-pressed: #2f2923 !important;
  --n-text-color-focus: #2f2923 !important;
  --n-color-hover: rgba(55, 46, 36, 0.08) !important;
  --n-color-pressed: rgba(55, 46, 36, 0.12) !important;
  --n-color-focus: rgba(55, 46, 36, 0.08) !important;
  color: #6f5c4c !important;
}

.note-editor-tag-row :deep(.n-button__content),
.note-editor-tag-add :deep(.n-button__content),
.note-editor-dialog-cancel :deep(.n-button__content) {
  color: inherit;
}

.note-editor-tag-row :deep(svg),
.note-editor-tag-add :deep(svg) {
  width: 16px;
  height: 16px;
  color: currentColor;
}

.note-editor-dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.note-editor-outline-fab {
  position: absolute;
  right: 40px;
  bottom: 32px;
  z-index: 4;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: 1px solid rgba(132, 82, 47, 0.18);
  border-radius: 999px;
  background: rgba(255, 250, 244, 0.96);
  color: #6f5c4c;
  font: inherit;
  cursor: pointer;
  box-shadow: 0 8px 24px rgba(38, 31, 25, 0.12);
  transition:
    color 0.15s,
    background 0.15s,
    border-color 0.15s;
}

.note-editor-outline-fab:hover,
.note-editor-outline-fab:focus-visible {
  color: #2f2923;
  border-color: rgba(132, 82, 47, 0.32);
  background: rgba(255, 250, 244, 1);
}

.note-editor-outline-fab[aria-pressed='true'] {
  color: #2f2923;
  background: rgba(132, 82, 47, 0.12);
  border-color: rgba(132, 82, 47, 0.36);
}

.note-editor-outline-fab svg {
  pointer-events: none;
}

.note-editor-outline-panel {
  position: absolute;
  right: 24px;
  bottom: 72px;
  z-index: 3;
  width: 220px;
  max-height: calc(100% - 96px);
  overflow: auto;
  padding: 14px;
  border: 1px solid rgba(55, 46, 36, 0.12);
  border-radius: 12px;
  background: rgba(255, 250, 244, 0.98);
  box-shadow: 0 18px 36px rgba(38, 31, 25, 0.16);
}

.note-editor-body :deep(.md-editor) {
  flex: 1;
  min-height: 420px;
  border: 1px solid rgba(55, 46, 36, 0.1);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.55);
}

.note-editor-body :deep(.markdown-read-surface) {
  flex: 1;
  min-height: 420px;
  border: 1px solid rgba(55, 46, 36, 0.1);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.72);
}

.note-editor-body :deep(.md-editor__toolbar) {
  border-bottom-color: rgba(55, 46, 36, 0.1);
  background: rgba(255, 255, 255, 0.7);
}

.note-editor-body :deep(.md-editor__toolbar button) {
  color: #5f564d;
}

.note-editor-body :deep(.md-editor__textarea) {
  color: #2a2a2a;
}
</style>
