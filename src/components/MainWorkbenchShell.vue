<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

import { useWindow } from '@/composables/useWindow';
import { useUiStore } from '@/stores/ui';
import type { WindowMode } from '@/types/steno';

interface NavItem {
  key: WindowMode;
  label: string;
  count?: string;
  active?: boolean;
}

const props = defineProps<{
  navItems?: NavItem[];
}>();

const win = useWindow();
const ui = useUiStore();
const compactBreakpoint = 720;
const railState = ref<'expanded' | 'collapsed'>('expanded');
const languageIndex = ref(0);
const languages = ['ZH', 'EN', 'JA'];
const compactViewport = ref(
  typeof window !== 'undefined' ? window.innerWidth < compactBreakpoint : false,
);
const effectiveRailState = computed(() =>
  compactViewport.value ? 'collapsed' : railState.value,
);

onMounted(() => {
  syncCompactViewport();
  window.addEventListener('resize', syncCompactViewport);
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', syncCompactViewport);
});

function onMinimize() {
  void win.minimizeCurrent();
}

function onToggleMaximize() {
  void win.toggleMaximizeCurrent();
}

function onClose() {
  void win.closeCurrent();
}

function onBack() {
  ui.navigateToMain();
}

function onSearch() {
  ui.navigateTo('search');
}

function onNavigate(key: WindowMode) {
  if (key === 'main') {
    ui.navigateToMain();
    return;
  }
  ui.navigateTo(key as Parameters<typeof ui.navigateTo>[0]);
}

function onOpenSettings() {
  ui.navigateTo('settings');
}

function onCycleLanguage() {
  languageIndex.value = (languageIndex.value + 1) % languages.length;
}

function onToggleRail() {
  if (compactViewport.value) return;
  railState.value = railState.value === 'collapsed' ? 'expanded' : 'collapsed';
}

function syncCompactViewport() {
  if (typeof window === 'undefined') return;
  compactViewport.value = window.innerWidth < compactBreakpoint;
}

function iconPathFor(key: WindowMode) {
  switch (key) {
    case 'main':
      return 'M5 4h11l3 3v13H5z M9 9h6 M9 13h6 M9 17h4';
    case 'canvas':
      return 'M4 4h16v16H4z M4 10h16 M10 4v16';
    case 'clipboard':
      return 'M8 4h8 M9 2h6v4H9z M6 4h12v18H6z';
    case 'todo':
      return 'M3 5h18v14H3z M8 12l2.5 2.5L16 9';
    case 'screenshot':
      return 'M7 4h2l1-2h4l1 2h2v16H7z M12 12m-3.5 0a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0-7 0';
    case 'ocr':
      return 'M4 7V4h3 M17 4h3v3 M20 17v3h-3 M7 20H4v-3 M8 10h2 M14 10h2 M8 14h8';
    case 'translate':
      return 'M5 8h10 M10 5v3 M6 8c0 4 2 7 6 9 M14 8c0 4-2 7-6 9 M13 21l4-10 4 10 M14.5 17h5';
    case 'search':
      return 'M11 19a8 8 0 1 0 0-16a8 8 0 0 0 0 16 M21 21l-4.3-4.3';
    case 'settings':
      return 'M12 15a3 3 0 1 0 0-6a3 3 0 0 0 0 6 M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06 M4.21 4.21l.06.06A1.65 1.65 0 0 1 4.6 6 M21 12h-2 M5 12H3 M12 3v2 M12 19v2';
    default:
      return 'M12 12h.01';
  }
}
</script>

<template>
  <div
    class="workbench-root"
    :data-compact="compactViewport"
    :data-rail="effectiveRailState"
  >
    <header class="workbench-titlebar topbar" data-tauri-drag-region="true">
      <div class="topbar-brand" data-tauri-drag-region="true">
        <div class="brand-mark">S</div>
        <span class="brand-name">Steno</span>
      </div>

      <div class="topbar-center" data-tauri-drag-region="true">
        <button class="back-btn" type="button" aria-label="返回" @click.stop="onBack">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="m15 6-6 6 6 6" />
          </svg>
        </button>
        <label class="search-bar" aria-label="全局搜索">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            type="search"
            readonly
            placeholder="搜索笔记、画布、剪贴板、待办…"
            @focus="onSearch"
            @click.stop="onSearch"
          />
          <span class="kbd">⌘K</span>
        </label>
        <slot name="search" />
      </div>

      <div
        class="workbench-window-controls window-controls"
        data-tauri-drag-region="false"
        data-no-drag="true"
      >
        <button class="win-btn wc-btn" type="button" aria-label="最小化" @click.stop="onMinimize">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M5 12h14" />
          </svg>
        </button>
        <button
          class="win-btn wc-btn"
          type="button"
          aria-label="最大化"
          @click.stop="onToggleMaximize"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="5" y="5" width="14" height="14" rx="1" />
          </svg>
        </button>
        <button
          class="win-btn wc-btn"
          type="button"
          data-act="close"
          aria-label="关闭"
          @click.stop="onClose"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
      </div>
    </header>

    <div class="workbench-body">
      <aside v-if="props.navItems?.length" class="workbench-sidebar rail">
        <slot name="sidebar">
          <nav class="rail-menu" aria-label="主菜单">
            <button
              v-for="item in props.navItems"
              :key="item.key"
              class="workbench-nav-item rail-item"
              :class="{ 'workbench-nav-item--active': item.active, 'rail-item--active': item.active }"
              type="button"
              :aria-current="item.active ? 'page' : undefined"
              :data-nav="item.key"
              @click="onNavigate(item.key)"
            >
              <svg
                class="rail-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                aria-hidden="true"
              >
                <path :d="iconPathFor(item.key)" />
              </svg>
              <span class="rail-label">{{ item.label }}</span>
              <span v-if="item.count" class="rail-count">{{ item.count }}</span>
            </button>
          </nav>
          <div class="rail-footer">
            <button
              class="rail-foot-btn"
              type="button"
              data-testid="rail-settings"
              aria-label="打开设置"
              title="设置"
              @click="onOpenSettings"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06" />
                <path d="M4.21 4.21l.06.06A1.65 1.65 0 0 1 4.6 6" />
                <path d="M21 12h-2M5 12H3M12 3v2M12 19v2" />
              </svg>
            </button>
            <button
              class="rail-foot-btn"
              type="button"
              data-testid="rail-language"
              aria-label="切换语言"
              title="语言"
              @click="onCycleLanguage"
            >
              <span class="lang-badge">{{ languages[languageIndex] }}</span>
            </button>
            <button
              class="rail-foot-btn"
              type="button"
              data-testid="rail-collapse"
              :aria-expanded="effectiveRailState === 'expanded'"
              :aria-label="effectiveRailState === 'expanded' ? '折叠侧边栏' : '展开侧边栏'"
              title="折叠侧边栏"
              @click="onToggleRail"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <path :d="effectiveRailState === 'expanded' ? 'M15 6 9 12l6 6' : 'M9 6l6 6-6 6'" />
              </svg>
            </button>
          </div>
        </slot>
      </aside>

      <main class="workbench-main">
        <section class="workbench-content">
          <slot />
        </section>
      </main>
    </div>
  </div>
</template>

<style scoped>
.workbench-root {
  --rail-w: 220px;
  --rail-w-collapsed: 58px;
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100vw;
  background: var(--app-bg);
  color: var(--app-text);
  font-family: -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
}

.workbench-root[data-rail="collapsed"] {
  --rail-w: var(--rail-w-collapsed);
}

.workbench-titlebar {
  display: grid;
  grid-template-columns: var(--rail-w) 1fr auto;
  align-items: center;
  min-height: 44px;
  border-bottom: 1px solid var(--app-border);
  background: color-mix(in srgb, var(--app-surface) 92%, var(--app-bg));
  user-select: none;
  -webkit-user-select: none;
  transition: grid-template-columns 0.22s ease;
}

.topbar-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 100%;
  min-width: 0;
  padding: 0 14px;
  border-right: 1px solid var(--app-border);
  user-select: none;
  -webkit-user-select: none;
}

.brand-mark {
  width: 22px;
  height: 22px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  border-radius: 6px;
  background: var(--app-accent);
  color: white;
  font-family: "JetBrains Mono", "SF Mono", ui-monospace, Menlo, monospace;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.brand-name {
  overflow: hidden;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: -0.01em;
  white-space: nowrap;
}

.workbench-root[data-rail="collapsed"] .brand-name {
  display: none;
}

.topbar-center {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 100%;
  flex: 1;
  min-width: 0;
  padding: 0 14px;
  user-select: none;
  -webkit-user-select: none;
}

.back-btn {
  width: 30px;
  height: 30px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  border: none;
  border-radius: 7px;
  background: transparent;
  color: var(--app-text-muted);
  cursor: pointer;
  transition:
    background 0.15s,
    color 0.15s;
}

.back-btn:hover {
  background: var(--app-bg);
  color: var(--app-text);
}

.topbar svg {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

.search-bar {
  flex: 1;
  max-width: 640px;
  height: 30px;
  display: flex;
  align-items: center;
  gap: 9px;
  min-width: 0;
  padding: 0 11px;
  border: 1px solid var(--app-border);
  border-radius: 8px;
  background: var(--app-bg);
  color: var(--app-text-muted);
  transition:
    border-color 0.15s,
    background 0.15s;
}

.search-bar:focus-within {
  border-color: var(--app-accent);
  background: var(--app-surface);
}

.search-bar input {
  flex: 1;
  min-width: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--app-text);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}

.search-bar input::placeholder {
  color: var(--app-text-faint);
}

.kbd {
  height: 18px;
  min-width: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 5px;
  border: 1px solid var(--app-border);
  border-radius: 4px;
  background: var(--app-surface);
  color: var(--app-text-muted);
  font-family: "JetBrains Mono", "SF Mono", ui-monospace, Menlo, monospace;
  font-size: 10px;
  line-height: 1;
}

.workbench-window-controls {
  display: flex;
  align-items: center;
  gap: 2px;
  height: 100%;
  padding: 0 10px;
}

.win-btn {
  width: 32px;
  height: 28px;
  display: grid;
  place-items: center;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: var(--app-text-muted);
  cursor: pointer;
  transition:
    background 0.15s,
    color 0.15s;
}

.win-btn:hover {
  background: var(--app-bg);
  color: var(--app-text);
}

.win-btn[data-act="close"]:hover {
  background: var(--app-danger);
  color: white;
}

.workbench-body {
  flex: 1;
  min-height: 0;
  display: flex;
}

.workbench-sidebar {
  width: var(--rail-w);
  min-width: var(--rail-w);
  border-right: 1px solid var(--app-border);
  background: var(--app-surface-muted);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transition:
    width 0.22s ease,
    min-width 0.22s ease;
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

.workbench-nav-item {
  width: 100%;
  height: 36px;
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 0 11px;
  border: none;
  border-radius: 7px;
  background: transparent;
  color: var(--app-text-muted);
  font-size: 13px;
  font-weight: 500;
  text-align: left;
  white-space: nowrap;
  cursor: pointer;
  transition:
    background 0.12s,
    color 0.12s;
}

.workbench-nav-item:hover {
  background: var(--app-bg);
  color: var(--app-text);
}

.workbench-nav-item--active {
  background: var(--app-accent-soft);
  color: var(--app-accent);
}

.rail-icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

.rail-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.rail-count {
  margin-left: auto;
  color: var(--app-text-faint);
  font-family: "JetBrains Mono", "SF Mono", ui-monospace, Menlo, monospace;
  font-size: 11px;
}

.workbench-nav-item--active .rail-count {
  color: var(--app-accent);
}

.workbench-root[data-rail="collapsed"] .workbench-nav-item {
  justify-content: center;
  padding: 0;
}

.workbench-root[data-rail="collapsed"] .rail-label,
.workbench-root[data-rail="collapsed"] .rail-count {
  display: none;
}

.rail-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  border-top: 1px solid var(--app-border);
  background: var(--app-surface);
}

.rail-foot-btn {
  width: 30px;
  height: 30px;
  display: grid;
  place-items: center;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--app-text-muted);
  cursor: pointer;
  transition:
    background 0.12s,
    color 0.12s;
}

.rail-foot-btn:hover {
  background: var(--app-bg);
  color: var(--app-text);
}

.rail-foot-btn svg {
  width: 16px;
  height: 16px;
}

.lang-badge {
  font-family: "JetBrains Mono", "SF Mono", ui-monospace, Menlo, monospace;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.workbench-root[data-rail="collapsed"] .rail-footer {
  flex-direction: column;
  gap: 4px;
}

.workbench-main {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.workbench-content {
  flex: 1;
  min-height: 0;
  overflow: auto;
}

@media (max-width: 720px) {
  .workbench-root {
    --rail-w: var(--rail-w-collapsed);
  }

  .brand-name,
  .rail-label,
  .rail-count {
    display: none;
  }

  .topbar-center {
    gap: 6px;
    padding: 0 10px;
  }

  .search-bar {
    max-width: none;
  }

  .workbench-nav-item {
    justify-content: center;
    padding: 0;
  }

  .rail-footer {
    flex-direction: column;
    gap: 4px;
  }

}
</style>
