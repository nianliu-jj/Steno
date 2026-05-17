<script setup lang="ts">
import { ref, watch } from 'vue';

import type { WritingMode } from '@/composables/useWritingSession';

interface Props {
  modelValue: string;
  mode: WritingMode;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  'update:modelValue': [value: string];
}>();

const local = ref(props.modelValue);

watch(() => props.modelValue, value => {
  if (value !== local.value) {
    local.value = value;
  }
});
</script>

<template>
  <textarea
    v-model="local"
    class="writing-rich-editor"
    :readonly="props.mode !== 'rich-edit'"
    spellcheck="false"
    @input="emit('update:modelValue', local)"
  />
</template>

<style scoped>
.writing-rich-editor {
  width: 100%;
  min-height: 320px;
  padding: 12px 14px;
  border: none;
  outline: none;
  resize: none;
  background: transparent;
  color: inherit;
  font: inherit;
  line-height: 1.65;
}
</style>
