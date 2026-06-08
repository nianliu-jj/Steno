<!--
  @file 前端通用组件 - Canvas

  承载 Canvas 的界面结构、响应式状态和用户交互，是 前端通用组件 模块的可视入口之一。
  注释重点标明模板结构、脚本状态、事件派发和样式隔离边界。
-->

<script setup lang="ts">
// 脚本区：组织 Canvas 的响应式状态、计算属性、事件处理和外部模块协作。
/**
 * @component Canvas
 * @description 无限画布核心 — 以空间化方式组织和浏览笔记卡片。
 *
 * **坐标系（三层）**：
 * - **世界坐标 (world)**：`note.canvasPosition.x/y`，稳定不变，存库
 * - **屏幕坐标 (screen)**：`world * zoom + pan`
 * - **容器坐标**：pointer 事件直接给屏幕坐标；换算到世界用 `wx = (sx - pan.x) / zoom`
 *
 * **交互**：
 * - 背景拖动 → 改 pan（平移视口）
 * - 卡片拖动 → 改卡片 world position（释放时 commit 到 db）
 * - 滚轮 → 改 zoom，锚定在鼠标位置
 * - 双击卡片 → 进入 Zen 写作视图（`navigateToZenFromCanvas`）
 *
 * **视口裁剪**：只渲染当前可见 + 600px buffer 内的卡片。
 * 无 `canvasPosition` 的卡片按网格初始排列（不写库，等用户主动拖一下才落库）。
 *
 * @emits — 无（所有操作通过 stores 和 ui.navigateToZenFromCanvas 完成）
 */

import { computed, onMounted, onUnmounted, ref, useTemplateRef } from 'vue';
import { NInput, NTag } from 'naive-ui';

import { useNotesStore } from '@/stores/notes';
import { useUiStore } from '@/stores/ui';
import type { CanvasPosition, Note } from '@/types/steno';

// 局部常量 notes：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const notes = useNotesStore();
// 局部常量 ui：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const ui = useUiStore();

// ----- 卡片尺寸 + 默认网格布局 ----------------------------------------

const CARD_W = 200;
// 局部常量 CARD_H：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const CARD_H = 140;
// 局部常量 GRID_GAP_X：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const GRID_GAP_X = 220;
// 局部常量 GRID_GAP_Y：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const GRID_GAP_Y = 160;
// 局部常量 GRID_COLS：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const GRID_COLS = 5;
// 局部常量 VIEWPORT_BUFFER：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const VIEWPORT_BUFFER = 600;

// 函数 defaultPosition：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
function defaultPosition(index: number): { x: number; y: number } {
  // 局部常量 col：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const col = index % GRID_COLS;
  // 局部常量 row：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const row = Math.floor(index / GRID_COLS);
  return { x: col * GRID_GAP_X, y: row * GRID_GAP_Y };
}

// 函数 noteWorldPosition：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
function noteWorldPosition(
  note: Note,
  fallbackIndex: number,
  override?: { x: number; y: number }
): { x: number; y: number } {
  if (override) return override;
  if (note.canvasPosition) {
    return { x: note.canvasPosition.x, y: note.canvasPosition.y };
  }
  return defaultPosition(fallbackIndex);
}

// ----- 视口状态 -------------------------------------------------------

const root = useTemplateRef<HTMLDivElement>('root');
// 局部常量 pan：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const pan = ref({ x: 40, y: 40 });
// 局部常量 zoom：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const zoom = ref(1);
// 局部常量 ZOOM_MIN：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const ZOOM_MIN = 0.25;
// 局部常量 ZOOM_MAX：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const ZOOM_MAX = 3;

// 局部常量 viewport：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const viewport = ref({ w: 1024, h: 720 });

// 函数 refreshViewport：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
function refreshViewport() {
  // 局部常量 el：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
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
// 局部常量 selectedTags：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const selectedTags = ref<string[]>([]);

// 局部常量 allTags：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const allTags = computed(() => {
  // 局部常量 set：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const set = new Set<string>();
  for (const n of notes.notes) {
    for (const t of n.tags) set.add(t);
  }
  return Array.from(set).sort();
});

// 函数 matchesFilters：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
function matchesFilters(n: Note): boolean {
  // 局部常量 q：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const q = query.value.trim().toLowerCase();
  if (q) {
    // 局部常量 hay：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const hay = `${n.title}\n${n.content}\n${n.tags.join(' ')}`.toLowerCase();
    if (!hay.includes(q)) return false;
  }
  if (selectedTags.value.length > 0) {
    if (!selectedTags.value.every(t => n.tags.includes(t))) return false;
  }
  return true;
}

// 函数 toggleTag：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
function toggleTag(tag: string) {
  // 局部常量 i：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
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
// 局部常量 dragVersion：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const dragVersion = ref(0); // 触发 cards computed 重新计算

// 类型 VisibleCard：记录模块边界的数据形状，帮助调用方理解字段来源和约束。
interface VisibleCard {
  note: Note;
  x: number;
  y: number;
  visible: boolean;
}

/**
 * 可见卡片列表 — 视口裁剪 + 标签搜索过滤。
 *
 * **为什么用 `computed` 而不直接在 template 里 `v-if`**：
 * `computed` 只在依赖变化时重新计算；template 内 `v-if` 每次渲染都执行。
 * 卡片数量可能很大（`loadNotes(500)`），提前计算 `visible` 字段并配合
 * `<template v-if="card.visible">` 实现虚拟化渲染。
 *
 * **`dragVersion` hack**：`dragOverrides` 是 `Map`（非响应式），
 * pointermove 时改 Map + `dragVersion++` 触发此 computed 重新计算。
 *
 * **视口 buffer**：比实际视口扩大 `VIEWPORT_BUFFER` px（600px），
 * 确保快速拖动时卡片不会闪现消失 — 渲染范围比可见范围大一圈。
 */
const cards = computed<VisibleCard[]>(() => {
  void dragVersion.value; // 读取以建立响应式依赖（Map 改值后触发重算）
  // 将视口像素尺寸换算为世界坐标尺寸
  const visW = viewport.value.w / zoom.value;
  // 局部常量 visH：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const visH = viewport.value.h / zoom.value;
  // 可见世界坐标范围（含 buffer）
  const worldLeft = -pan.value.x / zoom.value - VIEWPORT_BUFFER;
  // 局部常量 worldTop：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const worldTop = -pan.value.y / zoom.value - VIEWPORT_BUFFER;
  // 局部常量 worldRight：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const worldRight = worldLeft + visW + 2 * VIEWPORT_BUFFER;
  // 局部常量 worldBottom：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const worldBottom = worldTop + visH + 2 * VIEWPORT_BUFFER;

  return notes.notes.map((note, i) => {
    // 局部常量 pos：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const pos = noteWorldPosition(note, i, dragOverrides.get(note.id));
    // AABB 碰撞检测：卡片矩形是否与可见矩形相交
    const inViewport =
      pos.x + CARD_W > worldLeft && pos.x < worldRight && pos.y + CARD_H > worldTop && pos.y < worldBottom;
    // 局部常量 passFilters：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const passFilters = matchesFilters(note);
    return { note, x: pos.x, y: pos.y, visible: inViewport && passFilters };
  });
});

// ----- 平移：背景 pointerdown → 拖动 ----------------------------------

const panning = ref(false);
let panStart = { x: 0, y: 0, panX: 0, panY: 0 };

// 函数 onSurfacePointerdown：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
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

// 函数 onSurfacePointermove：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
function onSurfacePointermove(e: PointerEvent) {
  if (!panning.value) return;
  pan.value = {
    x: panStart.panX + (e.clientX - panStart.x),
    y: panStart.panY + (e.clientY - panStart.y)
  };
}

// 函数 onSurfacePointerup：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
function onSurfacePointerup(e: PointerEvent) {
  if (!panning.value) return;
  panning.value = false;
  (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
}

// ----- 滚轮缩放（锚定在鼠标） -----------------------------------------

/**
 * 滚轮缩放 — 以鼠标位置为锚点。
 *
 * **为什么锚定在鼠标位置**：用户将鼠标指向某个卡片后滚轮缩放，
 * 期望该卡片保持在鼠标下方。如果不调整 pan，卡片会向视口角落漂移。
 *
 * **数学原理**：
 * 设鼠标在屏幕上位于 `(mx, my)`，对应世界坐标 `wx = (mx - pan.x) / zoom`。
 * 缩放后 `zoom' = zoom * factor`，要保持 `wx` 不变，需要调整 `pan'`：
 * ```
 * mx = wx * zoom' + pan'   →   pan' = mx - wx * zoom'
 *                                = mx - (mx - pan.x) / zoom * zoom'
 *                                = mx - (mx - pan.x) * ratio
 * ```
 *
 * @param e - WheelEvent
 */
function onWheel(e: WheelEvent) {
  e.preventDefault();
  // 局部常量 el：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const el = root.value;
  if (!el) return;
  // 局部常量 rect：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const rect = el.getBoundingClientRect();
  // 局部常量 mx：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const mx = e.clientX - rect.left; // 鼠标在容器内的 X
  // 局部常量 my：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const my = e.clientY - rect.top; // 鼠标在容器内的 Y

  // 每次滚轮缩放 10%；deltaY > 0 = 向下滚 = 缩小
  const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
  // 局部常量 nextZoom：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const nextZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom.value * factor));
  if (nextZoom === zoom.value) return;
  // 局部常量 ratio：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const ratio = nextZoom / zoom.value;
  // 调整 pan 使鼠标位置的世界坐标不变
  pan.value = {
    x: mx - (mx - pan.value.x) * ratio,
    y: my - (my - pan.value.y) * ratio
  };
  zoom.value = nextZoom;
}

/**
 * 设置缩放级别（工具栏 +/- 按钮调用）。
 *
 * 与 `onWheel` 不同：以**视口中心**为锚点。
 *
 * @param target - 目标缩放值（会被 clamp 到 [ZOOM_MIN, ZOOM_MAX]）
 */
function setZoom(target: number) {
  // 局部常量 next：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, target));
  if (next === zoom.value) return;
  // 以视口中心为锚 — 工具栏按钮与鼠标位置无关
  const cx = viewport.value.w / 2;
  // 局部常量 cy：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const cy = viewport.value.h / 2;
  // 局部常量 ratio：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const ratio = next / zoom.value;
  pan.value = {
    x: cx - (cx - pan.value.x) * ratio,
    y: cy - (cy - pan.value.y) * ratio
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

// 函数 onCardPointerdown：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
function onCardPointerdown(e: PointerEvent, card: VisibleCard) {
  if (e.button !== 0) return;
  if ((e.target as HTMLElement | null)?.closest('button, input, textarea')) return;
  e.stopPropagation();
  // 局部常量 el：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const el = e.currentTarget as HTMLElement;
  cardDrag = {
    id: card.note.id,
    pointerId: e.pointerId,
    startScreen: { x: e.clientX, y: e.clientY },
    startWorld: { x: card.x, y: card.y },
    el
  };
  el.setPointerCapture(e.pointerId);
}

// 函数 onCardPointermove：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
function onCardPointermove(e: PointerEvent) {
  if (!cardDrag) return;
  // 函数式常量 dx：以闭包形式组织逻辑，便于在组件、store 或测试中传递。
  const dx = (e.clientX - cardDrag.startScreen.x) / zoom.value;
  // 函数式常量 dy：以闭包形式组织逻辑，便于在组件、store 或测试中传递。
  const dy = (e.clientY - cardDrag.startScreen.y) / zoom.value;
  dragOverrides.set(cardDrag.id, {
    x: cardDrag.startWorld.x + dx,
    y: cardDrag.startWorld.y + dy
  });
  dragVersion.value++;
}

// 函数 onCardPointerup：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
async function onCardPointerup(e: PointerEvent) {
  if (!cardDrag) return;
  // 局部常量 id：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const id = cardDrag.id;
  // 局部常量 final：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const final = dragOverrides.get(id);
  cardDrag.el.releasePointerCapture(e.pointerId);
  cardDrag = null;
  if (!final) return;
  try {
    const position: CanvasPosition = {
      x: Math.round(final.x),
      y: Math.round(final.y),
      scale: zoom.value
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
  <!-- 模板区：描述 Canvas 的 DOM 层级、可交互区域和条件渲染边界。 -->
  <div class="canvas-root" tabindex="0">
    <!-- 顶栏：搜索 + 标签 + 缩放控件 -->
    <div class="canvas-toolbar">
      <NInput v-model:value="query" size="small" placeholder="搜索标题 / 内容 / 标签" clearable class="canvas-search" />
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
          backgroundSize: `${20 * zoom}px ${20 * zoom}px`
        }"
      />

      <!-- 真正的卡片容器：translate + scale -->
      <div class="canvas-world" :style="{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }">
        <template v-for="card in cards" :key="card.note.id">
          <article
            v-if="card.visible"
            class="canvas-card"
            :class="{
              'canvas-card--pinned': card.note.isPinned
            }"
            :style="{
              left: `${card.x}px`,
              top: `${card.y}px`,
              width: `${CARD_W}px`,
              height: `${CARD_H}px`
            }"
            @pointerdown="onCardPointerdown($event, card)"
            @pointermove="onCardPointermove"
            @pointerup="onCardPointerup"
            @pointercancel="onCardPointerup"
            @dblclick.stop="onCardDblclick(card)"
          >
            <header class="canvas-card-header">
              <span v-if="card.note.isDraft" class="canvas-card-draft-tag" title="尚未保存">未保存</span>
              <span class="canvas-card-title">
                {{ card.note.title || '无标题' }}
              </span>
              <span v-if="card.note.isPinned" class="canvas-card-pin" title="已置顶">★</span>
            </header>

            <p class="canvas-card-body">{{ previewText(card.note.content) }}</p>

            <footer v-if="card.note.tags.length" class="canvas-card-tags">
              <span v-for="t in card.note.tags.slice(0, 4)" :key="t" class="canvas-card-tag">#{{ t }}</span>
              <span v-if="card.note.tags.length > 4" class="canvas-card-tag canvas-card-tag--more">
                +{{ card.note.tags.length - 4 }}
              </span>
            </footer>
          </article>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 样式区：限定 Canvas 的布局、主题色和响应式细节。 */
.canvas-root {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100vw;
  background: #14141a;
  color: #e8e8ea;
  font-family: -apple-system, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif;
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
.canvas-search {
  width: 240px;
  flex: 0 0 auto;
}
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
.canvas-zoom button:hover {
  background: rgba(255, 255, 255, 0.06);
}
.canvas-zoom-value {
  width: 38px;
  text-align: center;
}

/* 画布表面 */
.canvas-surface {
  position: relative;
  flex: 1;
  overflow: hidden;
  cursor: grab;
}
.canvas-surface--panning {
  cursor: grabbing;
}

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
  transition:
    box-shadow 0.12s,
    border-color 0.12s;
}
.canvas-card:hover {
  border-color: rgba(255, 255, 255, 0.18);
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.35);
}
.canvas-card--pinned {
  border-color: rgba(255, 200, 90, 0.35);
}
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
.canvas-card-pin {
  color: #ffd166;
  font-size: 12px;
}
.canvas-card-draft-tag {
  flex-shrink: 0;
  padding: 1px 6px;
  border-radius: 6px;
  font-size: 10px;
  font-weight: 500;
  color: #ebcfa9;
  background: rgba(168, 95, 50, 0.18);
  border: 1px solid rgba(168, 95, 50, 0.42);
  letter-spacing: 0.5px;
}
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
.canvas-card-tag--more {
  color: #9a9aa3;
  background: rgba(255, 255, 255, 0.06);
}
</style>
