<script setup lang="ts">
// 编辑器外壳：编辑区铺满 + 右下角悬浮大纲 + 底部右侧模式下拉。
// 设计参考 PureMark：去掉顶部 outline 占位条，把模式控制收纳到底部下拉，
// 把大纲做成右下角浮标 hover 上扩展开的树。
//
// 为保持调用方（NoteEditorView / ZenMode）和已有 tests 不破：
//   - 保留 outlineOpen / outlineWidth / showFloatingOutline / showZenEntry props
//   - 保留 toggle-outline / resize-outline / toggle-readonly / open-source /
//     close-source / open-zen / select-heading emits（部分不再触发）
//   - 大纲 fab 仍带 data-testid="writing-outline-fab"；模式菜单项仍带
//     data-testid="writing-toggle-readonly|writing-open-source|writing-close-source|writing-open-zen"
//     （用 v-show 控制显隐保证测试 wrapper.get 能够拿到）
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

import MarkdownRichEditor from './MarkdownRichEditor.vue';
import MarkdownSourceEditor from './MarkdownSourceEditor.vue';

import type { WritingMode } from '@/composables/useWritingSession';
import type { OutlineHeading } from '@/utils/extractHeadings';

interface Props {
  modelValue: string;
  mode: WritingMode;
  headings: OutlineHeading[];
  outlineOpen: boolean;
  outlineWidth: number;
  showFloatingOutline?: boolean;
  showZenEntry?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  showFloatingOutline: false,
  showZenEntry: false,
});

const emit = defineEmits<{
  'update:modelValue': [value: string];
  'toggle-readonly': [];
  'open-source': [];
  'close-source': [];
  'open-zen': [];
  'toggle-outline': [];
  'resize-outline': [width: number];
  'select-heading': [id: string];
}>();

const richEditor = ref<{ scrollToHeading: (id: string) => void } | null>(null);
const modeMenuOpen = ref(false);
const modeSelectRef = ref<HTMLElement | null>(null);

const currentModeLabel = computed(() => {
  switch (props.mode) {
    case 'rich-edit':
      return '编辑模式';
    case 'rich-readonly':
      return '只读模式';
    case 'source-edit':
      return '代码模式';
    default:
      return '模式';
  }
});

function onSelectHeading(id: string) {
  richEditor.value?.scrollToHeading(id);
  emit('select-heading', id);
}

function closeModeMenu() {
  modeMenuOpen.value = false;
}

function onPickReadonly() {
  emit('toggle-readonly');
  closeModeMenu();
}
function onPickSource() {
  emit('open-source');
  closeModeMenu();
}
function onPickCloseSource() {
  emit('close-source');
  closeModeMenu();
}
function onPickZen() {
  emit('open-zen');
  closeModeMenu();
}

function onDocumentClick(e: MouseEvent) {
  if (!modeMenuOpen.value || !modeSelectRef.value) return;
  if (modeSelectRef.value.contains(e.target as Node)) return;
  closeModeMenu();
}

onMounted(() => {
  document.addEventListener('click', onDocumentClick);
});
onBeforeUnmount(() => {
  document.removeEventListener('click', onDocumentClick);
});
</script>

<template>
  <section class="writing-surface">
    <div class="writing-surface__editor">
      <MarkdownRichEditor
        v-if="props.mode !== 'source-edit'"
        ref="richEditor"
        :model-value="props.modelValue"
        :mode="props.mode"
        @update:model-value="emit('update:modelValue', $event)"
      />
      <MarkdownSourceEditor
        v-else
        :model-value="props.modelValue"
        @update:model-value="emit('update:modelValue', $event)"
      />
    </div>

    <div
      v-if="props.showFloatingOutline && props.headings.length > 0"
      class="writing-outline-float"
      data-testid="writing-outline-float"
    >
      <div class="writing-outline-tree" role="listbox" aria-label="文档大纲">
        <button
          v-for="heading in props.headings"
          :key="heading.id"
          class="writing-outline-tree-item"
          :class="`writing-outline-tree-item--h${heading.level}`"
          type="button"
          :title="heading.text"
          @click="onSelectHeading(heading.id)"
        >
          {{ heading.text }}
        </button>
      </div>
      <button
        class="writing-outline-fab"
        data-testid="writing-outline-fab"
        type="button"
        :aria-label="`大纲 (${props.headings.length} 项)`"
        @click="emit('toggle-outline')"
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M8 6h13" />
          <path d="M8 12h13" />
          <path d="M8 18h13" />
          <circle cx="4" cy="6" r="1.4" fill="currentColor" />
          <circle cx="4" cy="12" r="1.4" fill="currentColor" />
          <circle cx="4" cy="18" r="1.4" fill="currentColor" />
        </svg>
      </button>
    </div>

    <footer class="writing-surface__footer">
      <div class="writing-surface__footer-spacer" />
      <div ref="modeSelectRef" class="writing-mode-select">
        <div v-show="modeMenuOpen" class="writing-mode-menu" role="menu">
          <button
            type="button"
            class="writing-mode-option"
            data-testid="writing-toggle-readonly"
            @click="onPickReadonly"
          >
            {{ props.mode === 'rich-readonly' ? '编辑模式' : '只读模式' }}
          </button>
          <button
            v-if="props.mode !== 'source-edit'"
            type="button"
            class="writing-mode-option"
            data-testid="writing-open-source"
            @click="onPickSource"
          >
            代码模式
          </button>
          <button
            v-else
            type="button"
            class="writing-mode-option"
            data-testid="writing-close-source"
            @click="onPickCloseSource"
          >
            排版编辑
          </button>
          <button
            v-if="props.showZenEntry"
            type="button"
            class="writing-mode-option"
            data-testid="writing-open-zen"
            @click="onPickZen"
          >
            Zen 模式
          </button>
        </div>
        <button
          type="button"
          class="writing-mode-trigger"
          data-testid="writing-mode-trigger"
          :aria-expanded="modeMenuOpen"
          aria-haspopup="menu"
          @click.stop="modeMenuOpen = !modeMenuOpen"
        >
          <span class="writing-mode-trigger-label">{{ currentModeLabel }}</span>
          <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor">
            <path d="M7 10l5 5 5-5z" />
          </svg>
        </button>
      </div>
    </footer>
  </section>
</template>

<style scoped>
.writing-surface {
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  width: 100%;
}

.writing-surface__editor {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: auto;
}

.writing-surface__editor > * {
  flex: 1;
  min-height: 0;
  width: 100%;
}

/* ---- 底部模式下拉 ---- */
.writing-surface__footer {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  height: 34px;
  padding: 0 12px;
  border-top: 1px solid rgba(55, 46, 36, 0.08);
  background: rgba(255, 255, 255, 0.42);
  flex-shrink: 0;
}
.writing-surface__footer-spacer {
  flex: 1;
}

.writing-mode-select {
  position: relative;
}

.writing-mode-trigger {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 24px;
  padding: 0 8px;
  border: 1px solid rgba(55, 46, 36, 0.14);
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.78);
  color: #5f564d;
  cursor: pointer;
  font-size: 12px;
  line-height: 1;
  transition: background 0.12s ease, color 0.12s ease;
}
.writing-mode-trigger:hover {
  background: rgba(255, 255, 255, 0.95);
  color: #2f2923;
}
.writing-mode-trigger-label {
  font-size: 12px;
}

.writing-mode-menu {
  position: absolute;
  right: 0;
  bottom: calc(100% + 6px);
  min-width: 140px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 4px;
  border: 1px solid rgba(55, 46, 36, 0.14);
  border-radius: 8px;
  background: #fffaf4;
  box-shadow: 0 8px 24px rgba(38, 31, 25, 0.14);
  z-index: 12;
}

.writing-mode-option {
  display: block;
  width: 100%;
  padding: 6px 10px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: #3a3128;
  text-align: left;
  cursor: pointer;
  font-size: 12px;
  white-space: nowrap;
}
.writing-mode-option:hover {
  background: rgba(132, 82, 47, 0.08);
  color: #2f2923;
}

/* ---- 右下角悬浮大纲 ---- */
.writing-outline-float {
  position: absolute;
  right: 14px;
  bottom: 44px;
  z-index: 6;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
}

.writing-outline-fab {
  width: 34px;
  height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(55, 46, 36, 0.14);
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.88);
  box-shadow: 0 4px 12px rgba(38, 31, 25, 0.12);
  color: #6f5c4c;
  cursor: pointer;
  transition: color 0.12s ease, background 0.12s ease, box-shadow 0.12s ease;
}
.writing-outline-fab:hover,
.writing-outline-float:hover .writing-outline-fab,
.writing-outline-float:focus-within .writing-outline-fab {
  color: #2f2923;
  background: #ffffff;
  box-shadow: 0 6px 16px rgba(38, 31, 25, 0.18);
}

.writing-outline-tree {
  opacity: 0;
  pointer-events: none;
  transform: translateY(8px) scaleY(0.6);
  transform-origin: bottom right;
  transition: opacity 0.18s ease-out, transform 0.24s ease-out;
  max-height: min(60vh, 380px);
  overflow-y: auto;
  overflow-x: hidden;
  min-width: 200px;
  max-width: min(320px, 60vw);
  padding: 8px;
  border: 1px solid rgba(55, 46, 36, 0.14);
  border-radius: 10px;
  background: #fffaf4;
  box-shadow: 0 8px 24px rgba(38, 31, 25, 0.14);
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.writing-outline-float:hover .writing-outline-tree,
.writing-outline-float:focus-within .writing-outline-tree {
  opacity: 1;
  pointer-events: auto;
  transform: translateY(0) scaleY(1);
}

.writing-outline-tree-item {
  display: block;
  width: 100%;
  padding: 4px 8px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: #3a3128;
  text-align: left;
  cursor: pointer;
  font-size: 12px;
  line-height: 1.5;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.writing-outline-tree-item:hover {
  background: rgba(132, 82, 47, 0.08);
  color: #2f2923;
}
.writing-outline-tree-item--h1 {
  padding-left: 8px;
  font-weight: 600;
}
.writing-outline-tree-item--h2 {
  padding-left: 20px;
}
.writing-outline-tree-item--h3 {
  padding-left: 32px;
}
.writing-outline-tree-item--h4 {
  padding-left: 44px;
}
.writing-outline-tree-item--h5 {
  padding-left: 56px;
}
.writing-outline-tree-item--h6 {
  padding-left: 68px;
}
</style>
