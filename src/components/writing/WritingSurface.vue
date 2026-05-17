<script setup lang="ts">
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
  'select-heading': [id: string];
}>();
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

    <div class="writing-surface__layout">
      <div class="writing-surface__card">
        <MarkdownRichEditor
          v-if="props.mode !== 'source-edit'"
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
        <button
          v-for="heading in props.headings"
          :key="heading.id"
          class="writing-outline-item"
          type="button"
          @click="emit('select-heading', heading.id)"
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

.writing-outline-item {
  border: 0;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
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
