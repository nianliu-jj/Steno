<script setup lang="ts">
// 设置面板（mode === 'settings'）。由 main 窗口路由切入。
//
// 行为（plan 8.3 / spec search-export-settings）：
// - 启动：settings store.load() 已在 App.vue mounted 时触发；这里只读 state
// - 主题（light/dark/system）：写完即刻生效（App.vue watch themeMode）
// - 快捷键三项：直接编辑 NInput；onBlur 时写 setting 并 reloadShortcuts
// - 浮窗尺寸 / 失焦延迟 / 备份阈值：NInputNumber，change 后立即写
// - 编辑器模式（split/edit/preview）：NRadioGroup
// - 存储区域：调 getDataPaths 拿三条路径，只读展示 + 复制按钮
import { computed, onMounted, ref } from 'vue';
import {
  NButton,
  NCard,
  NCode,
  NDivider,
  NFormItem,
  NInput,
  NInputNumber,
  NRadio,
  NRadioGroup,
  NSpace,
  NText,
  useMessage,
} from 'naive-ui';

import { useDb } from '@/composables/useDb';
import { useSettingsStore, type EditorMode, type ThemeMode } from '@/stores/settings';
import { useUiStore } from '@/stores/ui';

const db = useDb();
const settings = useSettingsStore();
const ui = useUiStore();
const message = useMessage();

// ----- 主题 -----------------------------------------------------------

async function onThemeChange(value: ThemeMode) {
  try {
    await settings.update('themeMode', value);
  } catch (e) {
    message.error(`主题保存失败：${String(e)}`);
  }
}

// ----- 快捷键 ----------------------------------------------------------
// 用本地缓冲值，避免每次按键都写 db。NInput 失焦或回车时 commit。

const mainShortcut = ref('');
const quicknoteShortcut = ref('');
const searchShortcut = ref('');

function syncShortcutLocals() {
  mainShortcut.value = settings.state.mainWindowShortcut;
  quicknoteShortcut.value = settings.state.quicknoteShortcut;
  searchShortcut.value = settings.state.searchShortcut;
}

async function commitShortcut(
  key: 'mainWindowShortcut' | 'quicknoteShortcut' | 'searchShortcut',
  value: string,
) {
  const trimmed = value.trim();
  if (!trimmed || trimmed === settings.state[key]) return;
  try {
    await settings.update(key, trimmed);
    // 主窗口与浮窗快捷键变更要通知 Rust 重新 register
    if (key !== 'searchShortcut') {
      await db.reloadShortcuts();
    }
    message.success(`已更新「${labelOf(key)}」`);
  } catch (e) {
    message.error(`快捷键保存失败：${String(e)}`);
    syncShortcutLocals();
  }
}

function labelOf(key: 'mainWindowShortcut' | 'quicknoteShortcut' | 'searchShortcut') {
  switch (key) {
    case 'mainWindowShortcut':
      return '主窗口快捷键';
    case 'quicknoteShortcut':
      return '速记浮窗快捷键';
    case 'searchShortcut':
      return '搜索快捷键';
  }
}

// ----- 浮窗 / 编辑器 / 备份 -------------------------------------------

async function onUpdateNumber<
  K extends 'floatingWidth' | 'floatingHeight' | 'blurCloseDelayMs' | 'backupEveryChanges',
>(key: K, value: number | null) {
  if (value == null || !Number.isFinite(value)) return;
  if (value === settings.state[key]) return;
  try {
    await settings.update(key, value);
  } catch (e) {
    message.error(`设置保存失败：${String(e)}`);
  }
}

async function onEditorModeChange(value: EditorMode) {
  try {
    await settings.update('editorMode', value);
  } catch (e) {
    message.error(`编辑器模式保存失败：${String(e)}`);
  }
}

// ----- 存储路径 --------------------------------------------------------

const paths = ref<{ dataDir: string; dbPath: string; backupDir: string } | null>(null);

async function loadPaths() {
  try {
    paths.value = await db.getDataPaths();
  } catch (e) {
    console.error('[settings] getDataPaths failed:', e);
  }
}

async function copyPath(p: string) {
  try {
    await navigator.clipboard.writeText(p);
    message.success('已复制到剪贴板');
  } catch {
    message.error('复制失败');
  }
}

// ----- mount ----------------------------------------------------------

onMounted(async () => {
  if (!settings.loaded) {
    await settings.load();
  }
  syncShortcutLocals();
  await loadPaths();
});

const headerSub = computed(() =>
  settings.error ? `加载错误：${settings.error}` : '所有更改自动保存',
);
</script>

<template>
  <div class="settings-root">
    <header class="settings-header">
      <div>
        <h1>设置</h1>
        <NText depth="3" class="settings-subtitle">{{ headerSub }}</NText>
      </div>
      <NButton size="small" quaternary @click="ui.navigateToMain">
        返回
      </NButton>
    </header>

    <div class="settings-body">
      <!-- 主题 -->
      <NCard size="small" title="主题" class="settings-card">
        <NRadioGroup
          :value="settings.state.themeMode"
          @update:value="onThemeChange"
        >
          <NSpace>
            <NRadio value="light">浅色</NRadio>
            <NRadio value="dark">深色</NRadio>
            <NRadio value="system">跟随系统</NRadio>
          </NSpace>
        </NRadioGroup>
      </NCard>

      <!-- 快捷键 -->
      <NCard size="small" title="全局快捷键" class="settings-card">
        <NFormItem label="主窗口" label-placement="left" :label-width="120">
          <NInput
            v-model:value="mainShortcut"
            placeholder="Ctrl+Shift+N"
            size="small"
            @blur="commitShortcut('mainWindowShortcut', mainShortcut)"
            @keydown.enter="commitShortcut('mainWindowShortcut', mainShortcut)"
          />
        </NFormItem>
        <NFormItem label="速记浮窗" label-placement="left" :label-width="120">
          <NInput
            v-model:value="quicknoteShortcut"
            placeholder="Ctrl+Shift+M"
            size="small"
            @blur="commitShortcut('quicknoteShortcut', quicknoteShortcut)"
            @keydown.enter="commitShortcut('quicknoteShortcut', quicknoteShortcut)"
          />
        </NFormItem>
        <NFormItem label="搜索（未注册到 OS）" label-placement="left" :label-width="120">
          <NInput
            v-model:value="searchShortcut"
            placeholder="Ctrl+Shift+F"
            size="small"
            @blur="commitShortcut('searchShortcut', searchShortcut)"
            @keydown.enter="commitShortcut('searchShortcut', searchShortcut)"
          />
        </NFormItem>
        <NText depth="3" class="settings-hint">
          目前主窗口和速记浮窗会注册到操作系统级全局快捷键。搜索快捷键预留字段，后续在应用内监听。
        </NText>
      </NCard>

      <!-- 浮窗 -->
      <NCard size="small" title="速记浮窗" class="settings-card">
        <NFormItem label="默认宽度 (px)" label-placement="left" :label-width="160">
          <NInputNumber
            :value="settings.state.floatingWidth"
            :min="240"
            :max="1200"
            :step="20"
            size="small"
            @update:value="v => onUpdateNumber('floatingWidth', v)"
          />
        </NFormItem>
        <NFormItem label="默认高度 (px)" label-placement="left" :label-width="160">
          <NInputNumber
            :value="settings.state.floatingHeight"
            :min="180"
            :max="900"
            :step="20"
            size="small"
            @update:value="v => onUpdateNumber('floatingHeight', v)"
          />
        </NFormItem>
        <NFormItem label="失焦关闭延迟 (ms)" label-placement="left" :label-width="160">
          <NInputNumber
            :value="settings.state.blurCloseDelayMs"
            :min="0"
            :max="5000"
            :step="100"
            size="small"
            @update:value="v => onUpdateNumber('blurCloseDelayMs', v)"
          />
        </NFormItem>
      </NCard>

      <!-- 编辑器 -->
      <NCard size="small" title="编辑器" class="settings-card">
        <NRadioGroup
          :value="settings.state.editorMode"
          @update:value="onEditorModeChange"
        >
          <NSpace>
            <NRadio value="split">编辑 + 预览</NRadio>
            <NRadio value="edit">只编辑</NRadio>
            <NRadio value="preview">只预览</NRadio>
          </NSpace>
        </NRadioGroup>
      </NCard>

      <!-- 备份 -->
      <NCard size="small" title="备份" class="settings-card">
        <NFormItem label="累计修改次数触发备份" label-placement="left" :label-width="200">
          <NInputNumber
            :value="settings.state.backupEveryChanges"
            :min="1"
            :max="200"
            :step="1"
            size="small"
            @update:value="v => onUpdateNumber('backupEveryChanges', v)"
          />
        </NFormItem>
      </NCard>

      <!-- 数据目录 -->
      <NCard size="small" title="存储区域" class="settings-card">
        <div v-if="paths" class="settings-paths">
          <div class="settings-path-row">
            <span class="settings-path-label">数据目录</span>
            <NCode class="settings-path-value">{{ paths.dataDir }}</NCode>
            <NButton tertiary size="tiny" @click="copyPath(paths.dataDir)">复制</NButton>
          </div>
          <NDivider />
          <div class="settings-path-row">
            <span class="settings-path-label">数据库文件</span>
            <NCode class="settings-path-value">{{ paths.dbPath }}</NCode>
            <NButton tertiary size="tiny" @click="copyPath(paths.dbPath)">复制</NButton>
          </div>
          <NDivider />
          <div class="settings-path-row">
            <span class="settings-path-label">备份目录</span>
            <NCode class="settings-path-value">{{ paths.backupDir }}</NCode>
            <NButton tertiary size="tiny" @click="copyPath(paths.backupDir)">复制</NButton>
          </div>
        </div>
        <NText v-else depth="3">加载中…</NText>
      </NCard>
    </div>
  </div>
</template>

<style scoped>
.settings-root {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100vw;
  background: #14141a;
  color: #e8e8ea;
  font-family: -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
}

.settings-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px 10px;
  background: #1a1a22;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
}
.settings-header h1 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #f0f0f2;
}
.settings-subtitle {
  font-size: 11px;
}

.settings-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 16px 24px 32px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.settings-card {
  background: #1a1a22;
}

.settings-hint {
  display: block;
  margin-top: 6px;
  font-size: 11px;
}

.settings-paths {
  display: flex;
  flex-direction: column;
}
.settings-path-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.settings-path-label {
  flex: 0 0 88px;
  font-size: 12px;
  color: #9a9aa3;
}
.settings-path-value {
  flex: 1;
  min-width: 0;
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
