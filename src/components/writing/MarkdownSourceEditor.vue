<script setup lang="ts">
interface Props {
  modelValue: string;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  'update:modelValue': [value: string];
}>();
</script>

<template>
  <textarea
    class="writing-source-editor"
    :value="props.modelValue"
    spellcheck="false"
    @input="emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
  />
</template>

<style scoped>
.writing-source-editor {
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
  font-family: ui-monospace, "JetBrains Mono", "Consolas", monospace;
}
</style>
