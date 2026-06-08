<!--
  @file 剪贴板图片编辑组件 - Clipboard Image Editor

  承载 Clipboard Image Editor 的界面结构、响应式状态和用户交互，是 剪贴板图片编辑组件 模块的可视入口之一。
  注释重点标明模板结构、脚本状态、事件派发和样式隔离边界。
-->

<script setup lang="ts">
// 脚本区：组织 Clipboard Image Editor 的响应式状态、计算属性、事件处理和外部模块协作。
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';

import { useDb } from '@/composables/useDb';
import { useDraggableResizable } from '@/composables/useDraggableResizable';
import { useImageEditor } from '@/composables/useImageEditor';
import { useClipboardStore } from '@/stores/clipboard';
import { renderOps, renderToDataUrl } from '@/utils/canvasRender';
import {
  computeOutputSize,
  cropRectFromFraction,
  NEUTRAL_ADJUST,
  // 类型 AdjustParams：记录模块边界的数据形状，帮助调用方理解字段来源和约束。
  type AdjustParams,
  // 类型 CropFraction：记录模块边界的数据形状，帮助调用方理解字段来源和约束。
  type CropFraction
} from '@/utils/imageOps';
import type { ClipboardEntry } from '@/types/steno';

// 局部常量 props：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const props = defineProps<{ entry: ClipboardEntry }>();
// 局部常量 emit：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const emit = defineEmits<{ close: [] }>();

// 局部常量 store：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const store = useClipboardStore();
// 局部常量 db：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const db = useDb();

// 局部常量 rootEl：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const rootEl = ref<HTMLElement | null>(null);
// 局部常量 canvasEl：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const canvasEl = ref<HTMLCanvasElement | null>(null);
// 局部常量 stageEl：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const stageEl = ref<HTMLElement | null>(null);
// 局部常量 sourceImage：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const sourceImage = ref<HTMLImageElement | null>(null);
// 局部常量 srcWidth：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const srcWidth = ref(0);
// 局部常量 srcHeight：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const srcHeight = ref(0);

// 局部常量 editor：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const editor = useImageEditor();
// 局部常量 outputSize：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const outputSize = computed(() => computeOutputSize(editor.ops.value, srcWidth.value, srcHeight.value));

// 局部常量 win：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const win = useDraggableResizable({
  initialX: 0,
  initialY: 0,
  initialWidth: 760,
  initialHeight: 580,
  minWidth: 480,
  minHeight: 420
});

// 局部常量 saving：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const saving = ref(false);
// 局部常量 errorMessage：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const errorMessage = ref<string | null>(null);

// 局部常量 showAdjust：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const showAdjust = ref(false);
// 局部常量 cropping：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const cropping = ref(false);
// 局部常量 showResize：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const showResize = ref(false);
// 局部常量 draft：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const draft = ref<AdjustParams>({ ...NEUTRAL_ADJUST });
// 裁剪选框：相对当前图像的归一化 [0,1] 比例，交互与像素坐标解耦
const cropSel = ref<CropFraction>({ fx: 0, fy: 0, fw: 1, fh: 1 });
// 局部常量 resizeW：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const resizeW = ref(0);
// 局部常量 resizeH：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const resizeH = ref(0);
// 局部常量 lockRatio：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const lockRatio = ref(true);

// 局部常量 previewFilter：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const previewFilter = computed(() => {
  // 局部常量 a：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const a = draft.value;
  return [
    `brightness(${1 + a.brightness / 100})`,
    `contrast(${1 + a.contrast / 100})`,
    `saturate(${a.grayscale ? 0 : 1 + a.saturation / 100})`,
    `invert(${a.invert ? 1 : 0})`
  ].join(' ');
});

// 局部常量 cropBoxStyle：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const cropBoxStyle = computed(() => ({
  left: `${cropSel.value.fx * 100}%`,
  top: `${cropSel.value.fy * 100}%`,
  width: `${cropSel.value.fw * 100}%`,
  height: `${cropSel.value.fh * 100}%`
}));

// 当前活动拖拽手势的清理函数，组件卸载时强制调用避免监听泄漏
let activeGesture: (() => void) | null = null;

// 函数 paintPreview：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
function paintPreview() {
  // 局部常量 canvas：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const canvas = canvasEl.value;
  if (!canvas || !sourceImage.value || !srcWidth.value) return;
  // 局部常量 rendered：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const rendered = renderOps(sourceImage.value, srcWidth.value, srcHeight.value, editor.ops.value);
  canvas.width = rendered.width;
  canvas.height = rendered.height;
  // 局部常量 ctx：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.drawImage(rendered, 0, 0);
}

// ops 更新均为整数组替换（不可变），浅监听即可触发，无需 deep
watch(() => editor.ops.value, paintPreview);

// 函数 centerInViewport：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
function centerInViewport() {
  // 局部常量 maxW：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const maxW = Math.min(window.innerWidth - 48, 1200);
  // 局部常量 maxH：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const maxH = window.innerHeight - 48;
  win.setMaxSize(Math.max(maxW, 480), Math.max(maxH, 420));
  win.x.value = Math.max((window.innerWidth - win.width.value) / 2, 24);
  win.y.value = Math.max((window.innerHeight - win.height.value) / 2, 24);
}

// 局部常量 previouslyFocused：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const previouslyFocused = ref<HTMLElement | null>(null);

// 函数 close：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
function close() {
  emit('close');
}

// 函数 onKeydown：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.preventDefault();
    close();
  }
}

/** 统一的指针拖拽：注册 move/up/cancel，并把清理函数登记到 activeGesture。 */
function beginGesture(onMove: (dx: number, dy: number, ev: PointerEvent) => void) {
  let lastX = 0;
  let lastY = 0;
  let started = false;
  // 函数式常量 move：以闭包形式组织逻辑，便于在组件、store 或测试中传递。
  const move = (ev: PointerEvent) => {
    if (started) onMove(ev.clientX - lastX, ev.clientY - lastY, ev);
    lastX = ev.clientX;
    lastY = ev.clientY;
    started = true;
  };
  // 函数式常量 end：以闭包形式组织逻辑，便于在组件、store 或测试中传递。
  const end = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', end);
    window.removeEventListener('pointercancel', end);
    activeGesture = null;
  };
  activeGesture?.();
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', end);
  window.addEventListener('pointercancel', end);
  activeGesture = end;
}

// 函数 startDrag：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
function startDrag() {
  beginGesture((dx, dy) => win.moveBy(dx, dy));
}

// 函数 startResizeWindow：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
function startResizeWindow(e: PointerEvent) {
  e.stopPropagation();
  beginGesture((dx, dy) => win.resizeBy(dx, dy));
}

// 函数 openAdjust：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
function openAdjust() {
  draft.value = { ...editor.currentAdjust.value };
  showAdjust.value = true;
  cropping.value = false;
  showResize.value = false;
}

// 函数 commitAdjust：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
function commitAdjust() {
  editor.setAdjust({ ...draft.value });
}

// 函数 startCrop：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
function startCrop() {
  cropping.value = true;
  showAdjust.value = false;
  showResize.value = false;
  cropSel.value = { fx: 0, fy: 0, fw: 1, fh: 1 };
}

/** 拖动选框内部整体平移。 */
function startCropMove(e: PointerEvent) {
  e.stopPropagation();
  // 局部常量 rect：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const rect = stageEl.value?.getBoundingClientRect();
  if (!rect) return;
  beginGesture((dx, dy) => {
    // 局部常量 ndx：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const ndx = dx / rect.width;
    // 局部常量 ndy：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const ndy = dy / rect.height;
    // 局部常量 s：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const s = cropSel.value;
    cropSel.value = {
      ...s,
      fx: Math.min(Math.max(s.fx + ndx, 0), 1 - s.fw),
      fy: Math.min(Math.max(s.fy + ndy, 0), 1 - s.fh)
    };
  });
}

/** 拖动某个角手柄缩放选框。corner: tl|tr|bl|br */
function startCropResize(e: PointerEvent, corner: 'tl' | 'tr' | 'bl' | 'br') {
  e.stopPropagation();
  // 局部常量 rect：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const rect = stageEl.value?.getBoundingClientRect();
  if (!rect) return;
  // 局部常量 MIN：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const MIN = 0.05;
  beginGesture((dx, dy) => {
    // 局部常量 ndx：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const ndx = dx / rect.width;
    // 局部常量 ndy：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const ndy = dy / rect.height;
    // 局部常量 s：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const s = { ...cropSel.value };
    if (corner === 'tl') {
      // 局部常量 nx：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
      const nx = Math.min(Math.max(s.fx + ndx, 0), s.fx + s.fw - MIN);
      // 局部常量 ny：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
      const ny = Math.min(Math.max(s.fy + ndy, 0), s.fy + s.fh - MIN);
      s.fw += s.fx - nx;
      s.fh += s.fy - ny;
      s.fx = nx;
      s.fy = ny;
    } else if (corner === 'tr') {
      // 局部常量 ny：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
      const ny = Math.min(Math.max(s.fy + ndy, 0), s.fy + s.fh - MIN);
      s.fh += s.fy - ny;
      s.fy = ny;
      s.fw = Math.min(Math.max(s.fw + ndx, MIN), 1 - s.fx);
    } else if (corner === 'bl') {
      // 局部常量 nx：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
      const nx = Math.min(Math.max(s.fx + ndx, 0), s.fx + s.fw - MIN);
      s.fw += s.fx - nx;
      s.fx = nx;
      s.fh = Math.min(Math.max(s.fh + ndy, MIN), 1 - s.fy);
    } else {
      s.fw = Math.min(Math.max(s.fw + ndx, MIN), 1 - s.fx);
      s.fh = Math.min(Math.max(s.fh + ndy, MIN), 1 - s.fy);
    }
    cropSel.value = s;
  });
}

// 函数 confirmCrop：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
function confirmCrop() {
  // 局部常量 base：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const base = outputSize.value;
  editor.crop(cropRectFromFraction(cropSel.value, base.w, base.h));
  cropping.value = false;
}

// 函数 cancelCrop：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
function cancelCrop() {
  cropping.value = false;
}

// 函数 openResize：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
function openResize() {
  resizeW.value = outputSize.value.w;
  resizeH.value = outputSize.value.h;
  showResize.value = true;
  showAdjust.value = false;
  cropping.value = false;
}

// 函数 onResizeWidthInput：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
function onResizeWidthInput() {
  if (lockRatio.value && outputSize.value.w > 0) {
    // 局部常量 ratio：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const ratio = outputSize.value.h / outputSize.value.w;
    resizeH.value = Math.max(1, Math.round(resizeW.value * ratio));
  }
}

// 函数 onResizeHeightInput：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
function onResizeHeightInput() {
  if (lockRatio.value && outputSize.value.h > 0) {
    // 局部常量 ratio：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const ratio = outputSize.value.w / outputSize.value.h;
    resizeW.value = Math.max(1, Math.round(resizeH.value * ratio));
  }
}

// 函数 confirmResize：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
function confirmResize() {
  // 局部常量 w：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const w = Math.round(resizeW.value);
  // 局部常量 h：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const h = Math.round(resizeH.value);
  if (w > 0 && h > 0) {
    editor.resize(w, h);
  }
  showResize.value = false;
}

// 函数 exportDataUrl：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
function exportDataUrl(): string | null {
  if (!sourceImage.value || !srcWidth.value) return null;
  return renderToDataUrl(sourceImage.value, srcWidth.value, srcHeight.value, editor.ops.value);
}

// 函数 saveAsNew：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
async function saveAsNew() {
  // 局部常量 dataUrl：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const dataUrl = exportDataUrl();
  if (!dataUrl) {
    errorMessage.value = '图片尚未加载完成';
    return;
  }
  saving.value = true;
  errorMessage.value = null;
  try {
    await store.addImageEntry(dataUrl);
    emit('close');
  } catch (e: unknown) {
    errorMessage.value = e instanceof Error ? e.message : '保存失败';
  } finally {
    saving.value = false;
  }
}

// 函数 copyResult：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
async function copyResult() {
  // 局部常量 dataUrl：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const dataUrl = exportDataUrl();
  if (!dataUrl) return;
  try {
    await db.copyEditedImageToClipboard(dataUrl);
  } catch (e: unknown) {
    errorMessage.value = e instanceof Error ? e.message : '复制失败';
  }
}

onMounted(() => {
  previouslyFocused.value = document.activeElement as HTMLElement | null;
  centerInViewport();
  rootEl.value?.focus();
  // 局部常量 img：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const img = new Image();
  img.addEventListener(
    'load',
    () => {
      sourceImage.value = img;
      srcWidth.value = img.naturalWidth;
      srcHeight.value = img.naturalHeight;
      paintPreview();
    },
    { once: true }
  );
  img.src = props.entry.content;
});

onBeforeUnmount(() => {
  activeGesture?.();
  sourceImage.value = null;
  previouslyFocused.value?.focus?.();
});
</script>

<template>
  <!-- 模板区：描述 Clipboard Image Editor 的 DOM 层级、可交互区域和条件渲染边界。 -->
  <Teleport to=".app-theme-root">
    <div
      ref="rootEl"
      class="clip-editor"
      role="dialog"
      aria-modal="false"
      aria-label="图片编辑"
      tabindex="-1"
      data-testid="clip-image-editor"
      :style="{
        left: win.x.value + 'px',
        top: win.y.value + 'px',
        width: win.width.value + 'px',
        height: win.height.value + 'px'
      }"
      @keydown="onKeydown"
    >
      <header class="clip-editor__head" data-testid="clip-editor-head" @pointerdown="startDrag">
        <div class="clip-editor__title">
          <strong>编辑图片</strong>
          <span>{{ entry.preview }} · {{ srcWidth }}×{{ srcHeight }}</span>
        </div>
        <button
          class="clip-editor__icon"
          type="button"
          aria-label="关闭"
          title="关闭"
          data-testid="clip-editor-close"
          @click="close"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </button>
      </header>

      <div class="clip-editor__toolbar" data-testid="clip-editor-toolbar">
        <div class="clip-editor__group">
          <button
            class="clip-editor__icon"
            type="button"
            title="向左旋转 90°"
            data-testid="clip-tool-rotate-left"
            @click="editor.rotate(-90)"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
              <path d="M3 3v5h5" />
            </svg>
          </button>
          <button
            class="clip-editor__icon"
            type="button"
            title="向右旋转 90°"
            data-testid="clip-tool-rotate-right"
            @click="editor.rotate(90)"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M21 12a9 9 0 1 1-3-6.7L21 8" />
              <path d="M21 3v5h-5" />
            </svg>
          </button>
          <button
            class="clip-editor__icon"
            type="button"
            title="水平翻转"
            data-testid="clip-tool-flip-h"
            @click="editor.flip('h')"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 3v18" />
              <path d="M7 8 4 12l3 4" />
              <path d="M17 8l3 4-3 4" />
            </svg>
          </button>
          <button
            class="clip-editor__icon"
            type="button"
            title="垂直翻转"
            data-testid="clip-tool-flip-v"
            @click="editor.flip('v')"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M3 12h18" />
              <path d="M8 7 12 4l4 3" />
              <path d="M8 17l4 3 4-3" />
            </svg>
          </button>
          <button
            class="clip-editor__icon"
            type="button"
            title="裁剪"
            data-testid="clip-tool-crop"
            :class="{ 'clip-editor__icon--active': cropping }"
            @click="startCrop"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 2v14a2 2 0 0 0 2 2h14" />
              <path d="M2 6h14a2 2 0 0 1 2 2v14" />
            </svg>
          </button>
          <button
            class="clip-editor__icon"
            type="button"
            title="缩放尺寸"
            data-testid="clip-tool-resize"
            :class="{ 'clip-editor__icon--active': showResize }"
            @click="openResize"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M15 3h6v6" />
              <path d="M9 21H3v-6" />
              <path d="M21 3l-7 7" />
              <path d="M3 21l7-7" />
            </svg>
          </button>
        </div>

        <span class="clip-editor__divider" />

        <div class="clip-editor__group">
          <button
            class="clip-editor__btn"
            type="button"
            title="亮度/对比度/饱和度"
            data-testid="clip-tool-adjust"
            :class="{ 'clip-editor__icon--active': showAdjust }"
            @click="openAdjust"
          >
            调整
          </button>
        </div>

        <span class="clip-editor__divider" />

        <div class="clip-editor__group">
          <button
            class="clip-editor__icon"
            type="button"
            title="撤销"
            data-testid="clip-tool-undo"
            :disabled="!editor.canUndo.value"
            @click="editor.undo()"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M9 14 4 9l5-5" />
              <path d="M4 9h11a5 5 0 0 1 0 10h-1" />
            </svg>
          </button>
          <button
            class="clip-editor__icon"
            type="button"
            title="重做"
            data-testid="clip-tool-redo"
            :disabled="!editor.canRedo.value"
            @click="editor.redo()"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="m15 14 5-5-5-5" />
              <path d="M20 9H9a5 5 0 0 0 0 10h1" />
            </svg>
          </button>
          <button
            class="clip-editor__btn"
            type="button"
            title="重置为原图"
            data-testid="clip-tool-reset"
            :disabled="!editor.dirty.value"
            @click="editor.reset()"
          >
            重置
          </button>
        </div>

        <span class="clip-editor__group clip-editor__future" title="范围二预留：标注工具">＋标注（预留）</span>
      </div>

      <div ref="stageEl" class="clip-editor__stage" data-testid="clip-editor-stage">
        <canvas
          ref="canvasEl"
          class="clip-editor__canvas"
          data-testid="clip-editor-canvas"
          :style="{ filter: showAdjust ? previewFilter : 'none' }"
        />

        <div v-if="cropping" class="clip-editor__crop-layer" data-testid="clip-crop">
          <div
            class="clip-editor__crop-box"
            :style="cropBoxStyle"
            data-testid="clip-crop-box"
            @pointerdown="startCropMove"
          >
            <span
              class="clip-editor__crop-handle clip-editor__crop-handle--tl"
              data-testid="clip-crop-handle-tl"
              @pointerdown="startCropResize($event, 'tl')"
            />
            <span
              class="clip-editor__crop-handle clip-editor__crop-handle--tr"
              data-testid="clip-crop-handle-tr"
              @pointerdown="startCropResize($event, 'tr')"
            />
            <span
              class="clip-editor__crop-handle clip-editor__crop-handle--bl"
              data-testid="clip-crop-handle-bl"
              @pointerdown="startCropResize($event, 'bl')"
            />
            <span
              class="clip-editor__crop-handle clip-editor__crop-handle--br"
              data-testid="clip-crop-handle-br"
              @pointerdown="startCropResize($event, 'br')"
            />
          </div>
          <div class="clip-editor__crop-actions">
            <button class="clip-editor__btn" type="button" data-testid="clip-crop-confirm" @click="confirmCrop">
              确认裁剪
            </button>
            <button class="clip-editor__btn" type="button" data-testid="clip-crop-cancel" @click="cancelCrop">
              取消
            </button>
          </div>
        </div>

        <div v-if="showResize" class="clip-editor__resize-panel" data-testid="clip-resize">
          <label>
            宽度
            <input
              v-model.number="resizeW"
              type="number"
              min="1"
              data-testid="clip-resize-width"
              @input="onResizeWidthInput"
            />
          </label>
          <label>
            高度
            <input
              v-model.number="resizeH"
              type="number"
              min="1"
              data-testid="clip-resize-height"
              @input="onResizeHeightInput"
            />
          </label>
          <label class="clip-editor__resize-lock">
            <input v-model="lockRatio" type="checkbox" data-testid="clip-resize-lock" />
            锁定纵横比
          </label>
          <div class="clip-editor__resize-actions">
            <button class="clip-editor__btn" type="button" data-testid="clip-resize-confirm" @click="confirmResize">
              应用
            </button>
            <button class="clip-editor__btn" type="button" data-testid="clip-resize-cancel" @click="showResize = false">
              取消
            </button>
          </div>
        </div>

        <div v-if="showAdjust" class="clip-editor__adjust" data-testid="clip-adjust">
          <label>
            亮度
            <input
              v-model.number="draft.brightness"
              type="range"
              min="-100"
              max="100"
              data-testid="clip-adjust-brightness"
              @change="commitAdjust"
            />
          </label>
          <label>
            对比度
            <input
              v-model.number="draft.contrast"
              type="range"
              min="-100"
              max="100"
              data-testid="clip-adjust-contrast"
              @change="commitAdjust"
            />
          </label>
          <label>
            饱和度
            <input
              v-model.number="draft.saturation"
              type="range"
              min="-100"
              max="100"
              data-testid="clip-adjust-saturation"
              @change="commitAdjust"
            />
          </label>
          <div class="clip-editor__adjust-toggles">
            <label>
              <input
                v-model="draft.grayscale"
                type="checkbox"
                data-testid="clip-adjust-grayscale"
                @change="commitAdjust"
              />
              灰度
            </label>
            <label>
              <input v-model="draft.invert" type="checkbox" data-testid="clip-adjust-invert" @change="commitAdjust" />
              反相
            </label>
          </div>
        </div>
      </div>

      <footer class="clip-editor__footer" data-testid="clip-editor-footer">
        <span v-if="errorMessage" class="clip-editor__error" role="alert" data-testid="clip-editor-error">
          {{ errorMessage }}
        </span>
        <span class="clip-editor__status" data-testid="clip-editor-status">
          已应用 {{ editor.ops.value.length }} 步 · {{ outputSize.w }}×{{ outputSize.h }}
        </span>
        <span class="clip-editor__spacer" />
        <button class="clip-editor__btn" type="button" data-testid="clip-editor-copy" @click="copyResult">复制</button>
        <button class="clip-editor__btn" type="button" data-testid="clip-editor-cancel" @click="close">取消</button>
        <span class="clip-editor__save-split">
          <button
            class="clip-editor__primary"
            type="button"
            :disabled="saving || !editor.dirty.value"
            data-testid="clip-editor-save"
            @click="saveAsNew"
          >
            保存为新条目
          </button>
          <button
            class="clip-editor__primary-caret"
            type="button"
            title="更多保存方式（覆盖原图 / 导出文件，即将支持）"
            data-testid="clip-editor-save-more"
            disabled
          >
            ▾
          </button>
        </span>
      </footer>

      <div
        class="clip-editor__resize"
        data-testid="clip-editor-resize-grip"
        title="拖动缩放窗口"
        @pointerdown="startResizeWindow"
      />
    </div>
  </Teleport>
</template>

<style scoped>
/* 样式区：限定 Clipboard Image Editor 的布局、主题色和响应式细节。 */
.clip-editor {
  position: fixed;
  /* teleport 到 .app-theme-root 后与主窗口外壳同处一个堆叠上下文：z-index 需高于
     外壳的功能菜单（z-index:60）等悬浮层；无需盖过 Naive 模态（≈2000）。 */
  z-index: 100;
  display: grid;
  grid-template-rows: auto auto 1fr auto;
  background: var(--app-bg);
  border: 1px solid var(--app-border);
  border-radius: 10px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.18);
  overflow: hidden;
  outline: none;
}
.clip-editor__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--app-border);
  background: var(--app-surface);
  cursor: grab;
  user-select: none;
}
.clip-editor__title {
  display: grid;
  gap: 2px;
  min-width: 0;
}
.clip-editor__title strong {
  font-size: 14px;
}
.clip-editor__title span {
  color: var(--app-muted);
  font-size: 12px;
}
.clip-editor__toolbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--app-border);
  background: var(--app-surface);
  min-height: 40px;
}
.clip-editor__group {
  display: flex;
  align-items: center;
  gap: 4px;
}
.clip-editor__divider {
  width: 1px;
  height: 22px;
  background: var(--app-border);
  margin: 0 4px;
}
.clip-editor__future {
  color: var(--app-faint);
  font-size: 11px;
  border: 1px dashed var(--app-border);
  border-radius: 7px;
  padding: 4px 8px;
  margin-left: auto;
}
.clip-editor__stage {
  min-height: 0;
  position: relative;
  display: grid;
  place-items: center;
  padding: 18px;
  overflow: hidden;
  background:
    linear-gradient(45deg, rgba(120, 108, 96, 0.12) 25%, transparent 25%),
    linear-gradient(-45deg, rgba(120, 108, 96, 0.12) 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, rgba(120, 108, 96, 0.12) 75%),
    linear-gradient(-45deg, transparent 75%, rgba(120, 108, 96, 0.12) 75%);
  background-position:
    0 0,
    0 12px,
    12px -12px,
    -12px 0;
  background-size: 24px 24px;
}
.clip-editor__canvas {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  border-radius: 4px;
}
.clip-editor__crop-layer {
  position: absolute;
  inset: 18px;
  pointer-events: none;
}
.clip-editor__crop-box {
  position: absolute;
  border: 1.5px dashed var(--app-accent);
  box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.32);
  pointer-events: auto;
  cursor: move;
}
.clip-editor__crop-handle {
  position: absolute;
  width: 12px;
  height: 12px;
  background: #fff;
  border: 1px solid var(--app-accent);
  border-radius: 2px;
}
.clip-editor__crop-handle--tl {
  left: -6px;
  top: -6px;
  cursor: nwse-resize;
}
.clip-editor__crop-handle--tr {
  right: -6px;
  top: -6px;
  cursor: nesw-resize;
}
.clip-editor__crop-handle--bl {
  left: -6px;
  bottom: -6px;
  cursor: nesw-resize;
}
.clip-editor__crop-handle--br {
  right: -6px;
  bottom: -6px;
  cursor: nwse-resize;
}
.clip-editor__crop-actions {
  position: absolute;
  right: 8px;
  bottom: 8px;
  display: flex;
  gap: 6px;
  pointer-events: auto;
}
.clip-editor__resize-panel {
  position: absolute;
  top: 10px;
  right: 10px;
  width: 200px;
  display: grid;
  gap: 8px;
  padding: 12px;
  background: var(--app-surface);
  border: 1px solid var(--app-border);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.16);
}
.clip-editor__resize-panel label {
  display: grid;
  gap: 4px;
  font-size: 12px;
  color: var(--app-muted);
}
.clip-editor__resize-panel input[type='number'] {
  height: 28px;
  padding: 0 8px;
  border: 1px solid var(--app-border);
  border-radius: 6px;
  background: var(--app-bg);
  color: var(--app-fg);
}
.clip-editor__resize-lock {
  flex-direction: row;
  align-items: center;
}
.clip-editor__resize-lock {
  display: inline-flex;
  gap: 6px;
}
.clip-editor__resize-actions {
  display: flex;
  gap: 6px;
}
.clip-editor__adjust {
  position: absolute;
  top: 10px;
  right: 10px;
  width: 220px;
  display: grid;
  gap: 8px;
  padding: 12px;
  background: var(--app-surface);
  border: 1px solid var(--app-border);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.16);
}
.clip-editor__adjust label {
  display: grid;
  gap: 4px;
  font-size: 12px;
  color: var(--app-muted);
}
.clip-editor__adjust input[type='range'] {
  width: 100%;
}
.clip-editor__adjust-toggles {
  display: flex;
  gap: 12px;
  font-size: 12px;
}
.clip-editor__adjust-toggles label {
  display: inline-flex;
  gap: 4px;
  align-items: center;
}
.clip-editor__footer {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-top: 1px solid var(--app-border);
  background: var(--app-surface);
}
.clip-editor__error {
  color: var(--danger, #d03050);
  font-size: 12px;
}
.clip-editor__status {
  color: var(--app-muted);
  font-size: 12px;
}
.clip-editor__spacer {
  flex: 1;
}
.clip-editor__btn {
  height: 32px;
  padding: 0 12px;
  border: 1px solid var(--app-border);
  border-radius: 7px;
  background: var(--app-bg);
  color: var(--app-fg);
  cursor: pointer;
}
.clip-editor__btn:hover {
  border-color: var(--app-accent);
  color: var(--app-accent);
}
.clip-editor__btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.clip-editor__icon {
  width: 28px;
  height: 28px;
  display: inline-grid;
  place-items: center;
  border: 1px solid var(--app-border);
  border-radius: 6px;
  background: var(--app-bg);
  color: var(--app-muted);
  cursor: pointer;
}
.clip-editor__icon:hover {
  border-color: var(--app-accent);
  color: var(--app-accent);
}
.clip-editor__icon:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.clip-editor__icon--active {
  border-color: var(--app-accent);
  color: var(--app-accent);
  background: var(--app-accent-soft);
}
.clip-editor__icon svg {
  width: 14px;
  height: 14px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.clip-editor__save-split {
  display: inline-flex;
}
.clip-editor__primary {
  height: 34px;
  padding: 0 14px;
  border: 1px solid var(--app-accent);
  background: var(--app-accent);
  color: #fff;
  border-radius: 7px 0 0 7px;
  cursor: pointer;
}
.clip-editor__primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.clip-editor__primary-caret {
  height: 34px;
  width: 28px;
  border: 1px solid var(--app-accent);
  border-left-color: rgba(255, 255, 255, 0.35);
  background: var(--app-accent);
  color: #fff;
  border-radius: 0 7px 7px 0;
  cursor: not-allowed;
  opacity: 0.7;
}
.clip-editor__resize {
  position: absolute;
  right: 2px;
  bottom: 2px;
  width: 16px;
  height: 16px;
  cursor: nwse-resize;
}
</style>
