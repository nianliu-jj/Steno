<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue';

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
const layout = ref<HTMLElement | null>(null);
const resizing = ref(false);

function onSelectHeading(id: string) {
  richEditor.value?.scrollToHeading(id);
  emit('select-heading', id);
}

function onResizePointerdown(event: PointerEvent) {
  event.preventDefault();
  resizing.value = true;
  window.addEventListener('pointermove', onResizePointermove);
  window.addEventListener('pointerup', onResizePointerup);
  window.addEventListener('pointercancel', onResizePointerup);
}

function onResizePointermove(event: PointerEvent) {
  if (!resizing.value || !layout.value) return;
  const rect = layout.value.getBoundingClientRect();
  emit('resize-outline', rect.right - event.clientX);
}

function onResizePointerup() {
  resizing.value = false;
  window.removeEventListener('pointermove', onResizePointermove);
  window.removeEventListener('pointerup', onResizePointerup);
  window.removeEventListener('pointercancel', onResizePointerup);
}

onBeforeUnmount(() => {
  onResizePointerup();
});
</script>

<template>
  <section class="writing-surface">
    <button
      v-if="props.showFloatingOutline && !props.outlineOpen"
      class="writing-outline-fab"
      data-testid="writing-outline-fab"
      type="button"
      @click="emit('toggle-outline')"
    >
      大纲
    </button>

    <div ref="layout" class="writing-surface__layout">
      <div class="writing-surface__card">
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

      <aside
        v-if="props.outlineOpen"
        class="writing-outline-pane"
        :style="{ width: `${props.outlineWidth}px` }"
      >
        <div
          class="writing-outline-resize"
          :class="{ 'writing-outline-resize--active': resizing }"
          @pointerdown="onResizePointerdown"
        />
        <button
          v-for="heading in props.headings"
          :key="heading.id"
          class="writing-outline-item"
          type="button"
          @click="onSelectHeading(heading.id)"
        >
          {{ heading.text }}
        </button>
      </aside>
    </div>

    <footer class="writing-surface__footer">
      <button
        class="writing-surface__action"
        data-testid="writing-toggle-readonly"
        type="button"
        @click="emit('toggle-readonly')"
      >
        {{ props.mode === 'rich-readonly' ? '编辑模式' : '只读模式' }}
      </button>
      <button
        v-if="props.mode !== 'source-edit'"
        class="writing-surface__action"
        data-testid="writing-open-source"
        type="button"
        @click="emit('open-source')"
      >
        代码模式
      </button>
      <button
        v-else
        class="writing-surface__action"
        data-testid="writing-close-source"
        type="button"
        @click="emit('close-source')"
      >
        排版编辑
      </button>
      <button
        v-if="props.showZenEntry"
        class="writing-surface__action"
        data-testid="writing-open-zen"
        type="button"
        @click="emit('open-zen')"
      >
        Zen 模式
      </button>
    </footer>
  </section>
</template>

<style scoped>
.writing-surface {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 0;
  height: 100%;
}

.writing-surface__layout {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 12px;
}

.writing-surface__card {
  flex: 1;
  min-height: 0;
  border: 1px solid rgba(55, 46, 36, 0.1);
  border-radius: 12px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.58);
}

.writing-outline-pane {
  position: relative;
  flex: 0 0 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px;
  border: 1px solid rgba(55, 46, 36, 0.1);
  border-radius: 12px;
  overflow: auto;
  background: rgba(255, 255, 255, 0.42);
}

.writing-outline-resize {
  position: absolute;
  top: 0;
  left: -6px;
  width: 12px;
  height: 100%;
  cursor: col-resize;
}

.writing-outline-resize::before {
  content: "";
  position: absolute;
  top: 0;
  left: 5px;
  width: 2px;
  height: 100%;
  background: rgba(55, 46, 36, 0.18);
}

.writing-outline-resize--active::before,
.writing-outline-resize:hover::before {
  background: rgba(168, 95, 50, 0.7);
}

.writing-outline-item {
  border: 0;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
  line-height: 1.4;
}

.writing-surface__footer {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.writing-surface__action,
.writing-outline-fab {
  height: 30px;
  padding: 0 12px;
  border: 1px solid rgba(55, 46, 36, 0.14);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.7);
  color: inherit;
  cursor: pointer;
}
</style>
