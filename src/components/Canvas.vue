<script setup lang="ts">
// 无限画布核心（plan Task 7 Step 3-8）。
//
// 坐标系：
// - 世界坐标 (world)：note.canvasPosition.x/y，稳定不变。
// - 屏幕坐标 (screen)：world * zoom + pan。
// - 容器内 pointer 事件直接给屏幕坐标（layerX/Y）；换算到世界用：
//     wx = (sx - pan.x) / zoom
//
// 交互：
// - 背景拖动 → 改 pan
// - 卡片拖动 → 改卡片 world position（释放时 commit 到 db）
// - 滚轮 → 改 zoom，锚定在鼠标位置
// - 双击卡片 → 进入 Zen 写作视图编辑
//
// 视口裁剪：只渲染当前可见 + 600px buffer 内的卡片。无 canvasPosition 的卡片
// 按网格初始排列（不写库，等用户主动拖一下才落库）。
import { computed, onMounted, onUnmounted, ref, useTemplateRef } from 'vue';
import { NInput, NTag } from 'naive-ui';

import { useNotesStore } from '@/stores/notes';
import { useUiStore } from '@/stores/ui';
import type { CanvasPosition, Note } from '@/types/steno';

const notes = useNotesStore();
const ui = useUiStore();

// ----- 卡片尺寸 + 默认网格布局 ----------------------------------------

const CARD_W = 200;
const CARD_H = 140;
const GRID_GAP_X = 220;
const GRID_GAP_Y = 160;
const GRID_COLS = 5;
const VIEWPORT_BUFFER = 600;

function defaultPosition(index: number): { x: number; y: number } {
  const col = index % GRID_COLS;
  const row = Math.floor(index / GRID_COLS);
  return { x: col * GRID_GAP_X, y: row * GRID_GAP_Y };
}

function noteWorldPosition(
  note: Note,
  fallbackIndex: number,
  override?: { x: number; y: number },
): { x: number; y: number } {
  if (override) return override;
  if (note.canvasPosition) {
    return { x: note.canvasPosition.x, y: note.canvasPosition.y };
  }
  return defaultPosition(fallbackIndex);
}

// ----- 视口状态 -------------------------------------------------------

const root = useTemplateRef<HTMLDivElement>('root');
const pan = ref({ x: 40, y: 40 });
const zoom = ref(1);
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 3;

const viewport = ref({ w: 1024, h: 720 });

function refreshViewport() {
  const el = root.value;
  if (!el) return;
  viewport.value = { w: el.clientWidth, h: el.clientHeight };
}

let resizeObserver: ResizeObserver | undefined;
onMounted(() => {
  refreshViewport();
  if (typeof ResizeObserver !== 'undefined' && root.value) {
    resizeObserver = new ResizeObserver(() => refreshViewport());
    resizeObserver.observe(root.value);
  }
});
onUnmounted(() => {
  resizeObserver?.disconnect();
});

// ----- 搜索 + 标签过滤 ------------------------------------------------

const query = ref('');
const selectedTags = ref<string[]>([]);

const allTags = computed(() => {
  const set = new Set<string>();
  for (const n of notes.notes) {
    for (const t of n.tags) set.add(t);
  }
  return Array.from(set).sort();
});

function matchesFilters(n: Note): boolean {
  const q = query.value.trim().toLowerCase();
  if (q) {
    const hay = `${n.title}\n${n.content}\n${n.tags.join(' ')}`.toLowerCase();
    if (!hay.includes(q)) return false;
  }
  if (selectedTags.value.length > 0) {
    if (!selectedTags.value.every(t => n.tags.includes(t))) return false;
  }
  return true;
}

function toggleTag(tag: string) {
  const i = selectedTags.value.indexOf(tag);
  if (i >= 0) {
    selectedTags.value.splice(i, 1);
  } else {
    selectedTags.value.push(tag);
  }
}

// ----- 卡片位置 + 视口裁剪 --------------------------------------------

/** 拖动期间的临时覆盖位置（世界坐标）。pointerup 时清掉并写库。 */
const dragOverrides = new Map<string, { x: number; y: number }>();
const dragVersion = ref(0); // 触发 cards computed 重新计算

interface VisibleCard {
  note: Note;
  x: number;
  y: number;
  visible: boolean;
}

const cards = computed<VisibleCard[]>(() => {
  void dragVersion.value;
  const visW = viewport.value.w / zoom.value;
  const visH = viewport.value.h / zoom.value;
  const worldLeft = -pan.value.x / zoom.value - VIEWPORT_BUFFER;
  const worldTop = -pan.value.y / zoom.value - VIEWPORT_BUFFER;
  const worldRight = worldLeft + visW + 2 * VIEWPORT_BUFFER;
  const worldBottom = worldTop + visH + 2 * VIEWPORT_BUFFER;

  return notes.notes.map((note, i) => {
    const pos = noteWorldPosition(note, i, dragOverrides.get(note.id));
    const inViewport =
      pos.x + CARD_W > worldLeft &&
      pos.x < worldRight &&
      pos.y + CARD_H > worldTop &&
      pos.y < worldBottom;
    const passFilters = matchesFilters(note);
    return { note, x: pos.x, y: pos.y, visible: inViewport && passFilters };
  });
});

// ----- 平移：背景 pointerdown → 拖动 ----------------------------------

const panning = ref(false);
let panStart = { x: 0, y: 0, panX: 0, panY: 0 };

function onSurfacePointerdown(e: PointerEvent) {
  if (e.button !== 0) return;
  // 落在卡片或内部交互元素上的事件，不触发 pan
  if ((e.target as HTMLElement | null)?.closest('.canvas-card, .canvas-toolbar, button, input, textarea')) {
    return;
  }
  panning.value = true;
  panStart = { x: e.clientX, y: e.clientY, panX: pan.value.x, panY: pan.value.y };
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
}

function onSurfacePointermove(e: PointerEvent) {
  if (!panning.value) return;
  pan.value = {
    x: panStart.panX + (e.clientX - panStart.x),
    y: panStart.panY + (e.clientY - panStart.y),
  };
}

function onSurfacePointerup(e: PointerEvent) {
  if (!panning.value) return;
  panning.value = false;
  (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
}

// ----- 滚轮缩放（锚定在鼠标） -----------------------------------------

function onWheel(e: WheelEvent) {
  e.preventDefault();
  const el = root.value;
  if (!el) return;
  const rect = el.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;

  const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
  const nextZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom.value * factor));
  if (nextZoom === zoom.value) return;
  const ratio = nextZoom / zoom.value;
  pan.value = {
    x: mx - (mx - pan.value.x) * ratio,
    y: my - (my - pan.value.y) * ratio,
  };
  zoom.value = nextZoom;
}

function setZoom(target: number) {
  const next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, target));
  if (next === zoom.value) return;
  // 以视口中心为锚
  const cx = viewport.value.w / 2;
  const cy = viewport.value.h / 2;
  const ratio = next / zoom.value;
  pan.value = {
    x: cx - (cx - pan.value.x) * ratio,
    y: cy - (cy - pan.value.y) * ratio,
  };
  zoom.value = next;
}

// ----- 卡片拖动 -------------------------------------------------------

interface CardDragState {
  id: string;
  pointerId: number;
  startScreen: { x: number; y: number };
  startWorld: { x: number; y: number };
  el: HTMLElement;
}

let cardDrag: CardDragState | null = null;

function onCardPointerdown(e: PointerEvent, card: VisibleCard) {
  if (e.button !== 0) return;
  if ((e.target as HTMLElement | null)?.closest('button, input, textarea')) return;
  e.stopPropagation();
  const el = e.currentTarget as HTMLElement;
  cardDrag = {
    id: card.note.id,
    pointerId: e.pointerId,
    startScreen: { x: e.clientX, y: e.clientY },
    startWorld: { x: card.x, y: card.y },
    el,
  };
  el.setPointerCapture(e.pointerId);
}

function onCardPointermove(e: PointerEvent) {
  if (!cardDrag) return;
  const dx = (e.clientX - cardDrag.startScreen.x) / zoom.value;
  const dy = (e.clientY - cardDrag.startScreen.y) / zoom.value;
  dragOverrides.set(cardDrag.id, {
    x: cardDrag.startWorld.x + dx,
    y: cardDrag.startWorld.y + dy,
  });
  dragVersion.value++;
}

async function onCardPointerup(e: PointerEvent) {
  if (!cardDrag) return;
  const id = cardDrag.id;
  const final = dragOverrides.get(id);
  cardDrag.el.releasePointerCapture(e.pointerId);
  cardDrag = null;
  if (!final) return;
  try {
    const position: CanvasPosition = {
      x: Math.round(final.x),
      y: Math.round(final.y),
      scale: zoom.value,
    };
    await notes.updateCanvasPosition(id, position);
  } catch (err) {
    console.error('[canvas] updateCanvasPosition failed:', err);
  } finally {
    dragOverrides.delete(id);
    dragVersion.value++;
  }
}

// ----- 双击卡片：进入 Zen 写作视图 -------------------------------------

function onCardDblclick(card: VisibleCard) {
  ui.navigateToZenFromCanvas(card.note.id);
}

// ----- 卡片预览文本 ---------------------------------------------------

function previewText(content: string): string {
  // 去掉 markdown 语法符号，截断到 ~120 chars 给卡片预览用
  const stripped = content
    .replace(/^#+\s+/gm, '')
    .replace(/\*\*|__|`/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .trim();
  return stripped.length > 120 ? `${stripped.slice(0, 120).trim()}…` : stripped;
}

// ----- 重置视图 -------------------------------------------------------

function resetView() {
  pan.value = { x: 40, y: 40 };
  zoom.value = 1;
}

defineExpose({ resetView, setZoom });
</script>

<template>
  <div class="canvas-root" tabindex="0">
    <!-- 顶栏：搜索 + 标签 + 缩放控件 -->
    <div class="canvas-toolbar">
      <NInput
        v-model:value="query"
        size="small"
        placeholder="搜索标题 / 内容 / 标签"
        clearable
        class="canvas-search"
      />
      <div class="canvas-tags">
        <NTag
          v-for="tag in allTags"
          :key="tag"
          :type="selectedTags.includes(tag) ? 'primary' : 'default'"
          size="small"
          checkable
          :checked="selectedTags.includes(tag)"
          @click="toggleTag(tag)"
        >
          #{{ tag }}
        </NTag>
      </div>
      <div class="canvas-zoom">
        <button title="缩小" @click="setZoom(zoom / 1.2)">−</button>
        <span class="canvas-zoom-value">{{ Math.round(zoom * 100) }}%</span>
        <button title="放大" @click="setZoom(zoom * 1.2)">+</button>
        <button title="重置视图" class="canvas-reset" @click="resetView">⟳</button>
      </div>
    </div>

    <!-- 画布表面：负责 pan 和 wheel -->
    <div
      ref="root"
      class="canvas-surface"
      :class="{ 'canvas-surface--panning': panning }"
      @pointerdown="onSurfacePointerdown"
      @pointermove="onSurfacePointermove"
      @pointerup="onSurfacePointerup"
      @pointercancel="onSurfacePointerup"
      @wheel.passive.prevent="onWheel"
    >
      <!-- 网格背景层（不参与 pan，CSS 用 background-position 跟随） -->
      <div
        class="canvas-grid"
        :style="{
          backgroundPosition: `${pan.x}px ${pan.y}px`,
          backgroundSize: `${20 * zoom}px ${20 * zoom}px`,
        }"
      />

      <!-- 真正的卡片容器：translate + scale -->
      <div
        class="canvas-world"
        :style="{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }"
      >
        <template v-for="card in cards" :key="card.note.id">
          <article
            v-if="card.visible"
            class="canvas-card"
            :class="{
              'canvas-card--pinned': card.note.isPinned,
            }"
            :style="{
              left: `${card.x}px`,
              top: `${card.y}px`,
              width: `${CARD_W}px`,
              height: `${CARD_H}px`,
            }"
            @pointerdown="onCardPointerdown($event, card)"
            @pointermove="onCardPointermove"
            @pointerup="onCardPointerup"
            @pointercancel="onCardPointerup"
            @dblclick.stop="onCardDblclick(card)"
          >
            <header class="canvas-card-header">
              <span class="canvas-card-title">
                {{ card.note.title || '无标题' }}
              </span>
              <span v-if="card.note.isPinned" class="canvas-card-pin" title="已置顶">★</span>
            </header>

            <p class="canvas-card-body">{{ previewText(card.note.content) }}</p>

            <footer v-if="card.note.tags.length" class="canvas-card-tags">
              <span
                v-for="t in card.note.tags.slice(0, 4)"
                :key="t"
                class="canvas-card-tag"
              >
                #{{ t }}
              </span>
              <span
                v-if="card.note.tags.length > 4"
                class="canvas-card-tag canvas-card-tag--more"
              >+{{ card.note.tags.length - 4 }}</span>
            </footer>
          </article>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.canvas-root {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100vw;
  background: #14141a;
  color: #e8e8ea;
  font-family: -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
  outline: none;
}

/* 顶栏 */
.canvas-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  background: #1a1a22;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}
.canvas-search { width: 240px; flex: 0 0 auto; }
.canvas-tags {
  flex: 1;
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  overflow: hidden;
  max-height: 28px;
}
.canvas-zoom {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 0 0 auto;
  font-size: 12px;
  color: #9a9aa3;
}
.canvas-zoom button {
  width: 22px;
  height: 22px;
  background: transparent;
  color: #cfcfd4;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 3px;
  cursor: pointer;
}
.canvas-zoom button:hover { background: rgba(255, 255, 255, 0.06); }
.canvas-zoom-value { width: 38px; text-align: center; }

/* 画布表面 */
.canvas-surface {
  position: relative;
  flex: 1;
  overflow: hidden;
  cursor: grab;
}
.canvas-surface--panning { cursor: grabbing; }

.canvas-grid {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(to right, rgba(255, 255, 255, 0.04) 1px, transparent 1px),
    linear-gradient(to bottom, rgba(255, 255, 255, 0.04) 1px, transparent 1px);
  pointer-events: none;
}

.canvas-world {
  position: absolute;
  top: 0;
  left: 0;
  transform-origin: 0 0;
  /* 大世界画布，让卡片绝对定位有"无限"感 */
  width: 1px;
  height: 1px;
  will-change: transform;
}

/* 卡片 */
.canvas-card {
  position: absolute;
  background: #1f1f28;
  color: #e8e8ea;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 6px;
  padding: 10px 12px;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.25);
  display: flex;
  flex-direction: column;
  gap: 6px;
  overflow: hidden;
  cursor: grab;
  user-select: none;
  transition: box-shadow 0.12s, border-color 0.12s;
}
.canvas-card:hover {
  border-color: rgba(255, 255, 255, 0.18);
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.35);
}
.canvas-card--pinned { border-color: rgba(255, 200, 90, 0.35); }
.canvas-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}
.canvas-card-title {
  font-size: 13px;
  font-weight: 600;
  color: #f0f0f2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
}
.canvas-card-pin { color: #ffd166; font-size: 12px; }
.canvas-card-body {
  flex: 1;
  font-size: 12px;
  line-height: 1.5;
  color: #b3b3bb;
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 4;
  -webkit-box-orient: vertical;
  white-space: pre-wrap;
}
.canvas-card-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  font-size: 10px;
  color: #88e0a7;
}
.canvas-card-tag {
  background: rgba(136, 224, 167, 0.1);
  padding: 1px 5px;
  border-radius: 8px;
}
.canvas-card-tag--more { color: #9a9aa3; background: rgba(255, 255, 255, 0.06); }
</style>
