import { computed, ref } from 'vue';

import { NEUTRAL_ADJUST, type AdjustParams, type CropRect, type EditOp } from '@/utils/imageOps';

export function useImageEditor() {
  const ops = ref<EditOp[]>([]);
  const redoStack = ref<EditOp[]>([]);

  function pushOp(op: EditOp) {
    ops.value = [...ops.value, op];
    redoStack.value = [];
  }

  function rotate(deg: number) {
    pushOp({ type: 'rotate', deg });
  }

  function flip(axis: 'h' | 'v') {
    pushOp({ type: 'flip', axis });
  }

  function crop(rect: CropRect) {
    pushOp({ type: 'crop', rect });
  }

  function resize(w: number, h: number) {
    pushOp({ type: 'resize', w, h });
  }

  function setAdjust(params: AdjustParams) {
    const last = ops.value[ops.value.length - 1];
    const base = last && last.type === 'adjust' ? ops.value.slice(0, -1) : ops.value;
    ops.value = [...base, { type: 'adjust', params }];
    redoStack.value = [];
  }

  function undo() {
    if (!ops.value.length) return;
    const op = ops.value[ops.value.length - 1];
    ops.value = ops.value.slice(0, -1);
    redoStack.value = [...redoStack.value, op];
  }

  function redo() {
    if (!redoStack.value.length) return;
    const op = redoStack.value[redoStack.value.length - 1];
    redoStack.value = redoStack.value.slice(0, -1);
    ops.value = [...ops.value, op];
  }

  function reset() {
    ops.value = [];
    redoStack.value = [];
  }

  const canUndo = computed(() => ops.value.length > 0);
  const canRedo = computed(() => redoStack.value.length > 0);
  const dirty = computed(() => ops.value.length > 0);
  const currentAdjust = computed<AdjustParams>(() => {
    for (let i = ops.value.length - 1; i >= 0; i -= 1) {
      const op = ops.value[i];
      if (op.type === 'adjust') return op.params;
    }
    return NEUTRAL_ADJUST;
  });

  return { ops, canUndo, canRedo, dirty, currentAdjust, rotate, flip, crop, resize, setAdjust, undo, redo, reset };
}
