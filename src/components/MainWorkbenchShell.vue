<script setup lang="ts">
import { useWindow } from '@/composables/useWindow';
import { useUiStore } from '@/stores/ui';
import type { WindowMode } from '@/types/steno';

interface NavItem {
  key: WindowMode;
  label: string;
  active?: boolean;
}

const props = defineProps<{
  title: string;
  description: string;
  navItems?: NavItem[];
}>();

const win = useWindow();
const ui = useUiStore();

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
</script>

<template>
  <div class="workbench-root">
    <header class="workbench-titlebar" @pointerdown="onDragBarPointerDown">
      <div class="workbench-brand">Steno</div>
      <div class="workbench-search">
        <slot name="search" />
      </div>
      <div class="workbench-window-controls" data-no-drag="true">
        <button class="win-btn" type="button" @click.stop="onMinimize">_</button>
        <button class="win-btn" type="button" @click.stop="onToggleMaximize">[]</button>
        <button class="win-btn" type="button" @click.stop="onClose">x</button>
      </div>
    </header>

    <div class="workbench-body">
      <aside v-if="props.navItems?.length" class="workbench-sidebar">
        <slot name="sidebar">
          <button
            v-for="item in props.navItems"
            :key="item.key"
            class="workbench-nav-item"
            :class="{ 'workbench-nav-item--active': item.active }"
            type="button"
            :data-nav="item.key"
            @click="onNavigate(item.key)"
          >
            {{ item.label }}
          </button>
        </slot>
      </aside>

      <main class="workbench-main">
        <header class="workbench-page-header">
          <div>
            <h1>{{ title }}</h1>
            <p>{{ description }}</p>
          </div>
          <div class="workbench-actions" data-no-drag="true">
            <slot name="actions" />
          </div>
        </header>

        <section class="workbench-content">
          <slot />
        </section>
      </main>
    </div>
  </div>
</template>

<style scoped>
.workbench-root {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100vw;
  background: #f7f4ee;
  color: #28241f;
  font-family: -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
}

.workbench-titlebar {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 44px;
  padding: 0 12px;
  border-bottom: 1px solid rgba(55, 46, 36, 0.1);
  background: #fbfaf7;
}

.workbench-brand {
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.workbench-search {
  flex: 1;
  min-width: 0;
}

.workbench-window-controls {
  display: flex;
  align-items: center;
  gap: 6px;
}

.win-btn {
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: inherit;
  cursor: pointer;
}

.workbench-body {
  flex: 1;
  min-height: 0;
  display: flex;
}

.workbench-sidebar {
  width: 220px;
  padding: 12px 10px;
  border-right: 1px solid rgba(55, 46, 36, 0.1);
  background: #fffdf8;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.workbench-nav-item {
  height: 36px;
  padding: 0 10px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.workbench-nav-item--active {
  background: rgba(199, 108, 52, 0.12);
  color: #9a4d20;
}

.workbench-main {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.workbench-page-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  padding: 20px 24px 14px;
  border-bottom: 1px solid rgba(55, 46, 36, 0.1);
  background: #fffdf8;
}

.workbench-page-header h1 {
  margin: 0 0 4px;
  font-size: 22px;
  font-weight: 600;
}

.workbench-page-header p {
  margin: 0;
  font-size: 12px;
  color: #6e6256;
}

.workbench-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.workbench-content {
  flex: 1;
  min-height: 0;
  overflow: auto;
}
</style>
