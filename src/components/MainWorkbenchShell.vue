<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { NModal } from 'naive-ui';

import { useWindow } from '@/composables/useWindow';
import { useNotesStore } from '@/stores/notes';
import { useUiStore } from '@/stores/ui';
import type { WindowMode } from '@/types/steno';
import SettingsView from '@/views/SettingsView.vue';

interface NavItem {
  key: WindowMode;
  label: string;
  count?: string;
  active?: boolean;
}

const props = defineProps<{
  title: string;
  description: string;
  navItems?: NavItem[];
}>();

const win = useWindow();
const ui = useUiStore();
const notes = useNotesStore();
const railState = ref<'expanded' | 'collapsed'>('expanded');
const settingsVisible = ref(false);

const pinnedChips = computed(() =>
  notes.pinned.slice(0, 5).map(note => ({
    id: note.id,
    type: note.isPinned ? 'pin' : 'note',
    text: note.title || note.content.slice(0, 60) || '无标题',
  })),
);

onMounted(() => {
  void notes.loadPinned();
});

function onDragBarPointerDown(event: PointerEvent) {
  const target = event.target as HTMLElement | null;
  if (target?.closest('[data-no-drag="true"]')) return;
  void win.startDragCurrent();
}

function onMinimize() {
  void win.minimizeCurrent();
}

function onToggleMaximize() {
  void win.toggleMaximizeCurrent();
}

function onClose() {
  void win.closeCurrent();
}

function onNavigate(key: WindowMode) {
  if (key === 'main') {
    ui.navigateToMain();
    return;
  }
  ui.navigateTo(key as Parameters<typeof ui.navigateTo>[0]);
}

function iconFor(key: WindowMode) {
  switch (key) {
    case 'main':
      return '▤';
    case 'canvas':
      return '▦';
    case 'clipboard':
      return '▣';
    case 'todo':
      return '✓';
    case 'screenshot':
      return '◎';
    case 'ocr':
      return '▢';
    case 'translate':
      return '文';
    case 'search':
      return '⌕';
    case 'settings':
      return '⚙';
    default:
      return '•';
  }
}
</script>

<template>
  <div class="app" :data-rail="railState">
    <header class="topbar workbench-titlebar" @pointerdown="onDragBarPointerDown">
      <div class="topbar-brand">
        <div class="brand-mark">S</div>
        <span class="brand-name">Steno</span>
      </div>

      <div class="topbar-center" data-no-drag="true">
        <button class="back-btn" type="button" aria-label="返回" @click="ui.navigateToMain()">
          ‹
        </button>
        <button class="search-bar" type="button" @click="ui.navigateTo('search')">
          <span class="search-icon">⌕</span>
          <span class="search-placeholder">搜索笔记、画布、剪贴板、待办…</span>
          <span class="kbd">⌘K</span>
        </button>
      </div>

      <div class="window-controls" data-no-drag="true">
        <button class="wc-btn win-btn" type="button" aria-label="最小化" @click.stop="onMinimize">
          −
        </button>
        <button
          class="wc-btn win-btn"
          type="button"
          aria-label="最大化"
          @click.stop="onToggleMaximize"
        >
          □
        </button>
        <button
          class="wc-btn win-btn"
          type="button"
          data-act="close"
          aria-label="关闭"
          @click.stop="onClose"
        >
          ×
        </button>
      </div>
    </header>

    <aside class="rail">
      <nav class="rail-menu" aria-label="主菜单">
        <button
          v-for="item in props.navItems"
          :key="item.key"
          class="rail-item"
          :class="{ active: item.active }"
          type="button"
          :data-nav="item.key"
          @click="onNavigate(item.key)"
        >
          <span class="nav-icon" aria-hidden="true">{{ iconFor(item.key) }}</span>
          <span class="label">{{ item.label }}</span>
          <span v-if="item.count" class="count">{{ item.count }}</span>
        </button>
      </nav>

      <div class="rail-footer">
        <button
          class="rail-foot-btn"
          data-testid="rail-settings"
          type="button"
          title="设置"
          @click="settingsVisible = true"
        >
          ⚙
        </button>
        <button class="rail-foot-btn" type="button" title="语言">
          <span class="lang-badge">ZH</span>
        </button>
        <button
          class="rail-foot-btn"
          data-testid="rail-collapse"
          type="button"
          title="折叠侧边栏"
          @click="railState = railState === 'collapsed' ? 'expanded' : 'collapsed'"
        >
          {{ railState === 'collapsed' ? '›' : '‹' }}
        </button>
      </div>
    </aside>

    <main class="main">
      <header class="main-header">
        <div class="main-title">
          <h1>{{ title }}</h1>
          <p>{{ description }}</p>
        </div>
        <div class="main-actions" data-no-drag="true">
          <slot name="actions" />
        </div>
      </header>

      <section class="notes-area">
        <slot />
      </section>
    </main>

    <footer class="bottombar">
      <div class="pin-label">置顶内容</div>
      <div class="pin-strip">
        <button v-for="chip in pinnedChips" :key="chip.id" class="pin-chip" type="button">
          <span class="type">{{ chip.type }}</span>
          <span class="text">{{ chip.text }}</span>
        </button>
        <span v-if="pinnedChips.length === 0" class="pin-chip pin-chip--empty">
          暂无置顶内容
        </span>
      </div>
      <div class="pin-tail">
        <span>{{ pinnedChips.length }}/5</span>
      </div>
    </footer>

    <NModal
      v-model:show="settingsVisible"
      display-directive="if"
      :auto-focus="false"
      :trap-focus="true"
      class="settings-modal-host"
    >
      <SettingsView embedded @close="settingsVisible = false" />
    </NModal>
  </div>
</template>

<style scoped>
.app {
  --bg: oklch(97% 0.014 78);
  --surface: oklch(99% 0.006 78);
  --surface-2: oklch(98% 0.008 78);
  --fg: oklch(20% 0.02 70);
  --muted: oklch(49% 0.018 70);
  --faint: oklch(70% 0.014 70);
  --border: oklch(88% 0.012 78);
  --border-strong: oklch(80% 0.014 78);
  --accent: oklch(61% 0.13 42);
  --accent-soft: oklch(94% 0.034 42);
  --shadow: oklch(24% 0.02 70 / 0.1);
  --rail-w: 220px;
  --rail-w-collapsed: 58px;
  --topbar-h: 44px;
  --bottombar-h: 40px;
  width: 100vw;
  height: 100vh;
  display: grid;
  grid-template-columns: var(--rail-w) 1fr;
  grid-template-rows: var(--topbar-h) 1fr var(--bottombar-h);
  overflow: hidden;
  background: var(--surface);
  color: var(--fg);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei",
    sans-serif;
  font-size: 13.5px;
  font-variant-numeric: tabular-nums;
  transition: grid-template-columns 0.22s ease;
}

.app[data-rail='collapsed'] {
  --rail-w: var(--rail-w-collapsed);
}

button {
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
}

.topbar {
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: var(--rail-w) 1fr auto;
  align-items: center;
  border-bottom: 1px solid var(--border);
  background: color-mix(in oklch, var(--surface) 92%, var(--bg));
  transition: grid-template-columns 0.22s ease;
}

.topbar-brand {
  min-width: 0;
  height: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 14px;
  border-right: 1px solid var(--border);
}

.brand-mark {
  width: 22px;
  height: 22px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  border-radius: 6px;
  background: var(--accent);
  color: white;
  font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", Menlo, monospace;
  font-size: 12px;
  font-weight: 700;
}

.brand-name {
  overflow: hidden;
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
}

.app[data-rail='collapsed'] .brand-name {
  display: none;
}

.topbar-center {
  min-width: 0;
  height: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 14px;
}

.back-btn,
.wc-btn,
.rail-foot-btn {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  color: var(--muted);
  transition:
    background 0.15s ease,
    color 0.15s ease;
}

.back-btn {
  width: 30px;
  height: 30px;
  border-radius: 7px;
  font-size: 20px;
  line-height: 1;
}

.back-btn:hover,
.wc-btn:hover,
.rail-foot-btn:hover {
  background: var(--bg);
  color: var(--fg);
}

.search-bar {
  flex: 1;
  max-width: 640px;
  height: 30px;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 0 11px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg);
  color: var(--muted);
  text-align: left;
}

.search-placeholder {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.search-icon {
  flex-shrink: 0;
  color: var(--faint);
}

.kbd {
  min-width: 22px;
  height: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 5px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--surface);
  color: var(--muted);
  font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", Menlo, monospace;
  font-size: 10px;
}

.window-controls {
  height: 100%;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 0 10px;
}

.wc-btn {
  width: 32px;
  height: 28px;
  border-radius: 5px;
  font-size: 16px;
}

.wc-btn[data-act='close']:hover {
  background: oklch(60% 0.2 25);
  color: white;
}

.rail {
  grid-row: 2 / 3;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-right: 1px solid var(--border);
  background: var(--surface-2);
}

.rail-menu {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px 8px;
  overflow-y: auto;
}

.rail-item {
  width: 100%;
  height: 36px;
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 0 11px;
  border-radius: 7px;
  color: var(--muted);
  font-size: 13px;
  font-weight: 500;
  text-align: left;
  white-space: nowrap;
}

.rail-item:hover {
  background: var(--bg);
  color: var(--fg);
}

.rail-item.active {
  background: var(--accent-soft);
  color: var(--accent);
}

.nav-icon {
  width: 16px;
  flex-shrink: 0;
  text-align: center;
}

.count {
  margin-left: auto;
  color: var(--faint);
  font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", Menlo, monospace;
  font-size: 11px;
}

.app[data-rail='collapsed'] .rail-item {
  justify-content: center;
  padding: 0;
}

.app[data-rail='collapsed'] .rail-item .label,
.app[data-rail='collapsed'] .rail-item .count {
  display: none;
}

.rail-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  border-top: 1px solid var(--border);
  background: var(--surface);
}

.rail-foot-btn {
  width: 30px;
  height: 30px;
  border-radius: 6px;
}

.lang-badge {
  font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", Menlo, monospace;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.04em;
}

.app[data-rail='collapsed'] .rail-footer {
  flex-direction: column;
  gap: 4px;
}

.main {
  grid-row: 2 / 3;
  min-width: 0;
  min-height: 0;
  display: grid;
  grid-template-rows: auto 1fr;
  overflow: hidden;
  background: var(--bg);
}

.main-header {
  display: flex;
  align-items: flex-end;
  gap: 16px;
  padding: 20px 28px 14px;
  border-bottom: 1px solid var(--border);
  background: var(--surface);
}

.main-title {
  min-width: 0;
}

.main-title h1 {
  margin: 0 0 3px;
  font-size: 22px;
  font-weight: 600;
  letter-spacing: -0.02em;
}

.main-title p {
  margin: 0;
  overflow: hidden;
  color: var(--muted);
  font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", Menlo, monospace;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.main-actions {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 8px;
}

.notes-area {
  min-height: 0;
  overflow-y: auto;
  padding: 22px 28px 28px;
}

.bottombar {
  grid-column: 1 / -1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  overflow: hidden;
  padding: 0 14px;
  border-top: 1px solid var(--border);
  background: var(--surface-2);
}

.pin-label {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  padding-right: 12px;
  border-right: 1px solid var(--border);
  color: var(--muted);
  font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", Menlo, monospace;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
}

.pin-strip {
  min-width: 0;
  flex: 1;
  display: flex;
  gap: 8px;
  overflow-x: auto;
  scrollbar-width: none;
}

.pin-strip::-webkit-scrollbar {
  display: none;
}

.pin-chip {
  max-width: 280px;
  height: 26px;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 0 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface);
  color: var(--fg);
  font-size: 12px;
}

.pin-chip--empty {
  color: var(--muted);
}

.pin-chip .type {
  color: var(--faint);
  font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", Menlo, monospace;
  font-size: 9.5px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.pin-chip .text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pin-tail {
  flex-shrink: 0;
  padding-left: 10px;
  border-left: 1px solid var(--border);
  color: var(--muted);
  font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", Menlo, monospace;
  font-size: 11px;
}

:deep(.settings-modal-host) {
  width: auto;
}

@media (max-width: 720px) {
  .app {
    --rail-w: var(--rail-w-collapsed);
  }

  .brand-name,
  .rail-item .label,
  .rail-item .count {
    display: none;
  }

  .rail-item {
    justify-content: center;
    padding: 0;
  }

  .main-header {
    padding: 16px 16px 12px;
  }

  .notes-area {
    padding: 14px 16px 22px;
  }
}
</style>
