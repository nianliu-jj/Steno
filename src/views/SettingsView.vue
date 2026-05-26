<script setup lang="ts">
/**
 * @component SettingsView
 * @description 设置面板 — 主窗口内由 `NModal` 承载（`embedded=true`），
 *              独立 `settings` 模式下作为整页展示。
 *
 * **标签页**：常规 / 外观 / 快捷键 / 隐私安全 / 存储 / 关于
 *
 * **数据流**：
 * - 读取：`settings.state`（Pinia store），由 `settings.load()` 初始化
 * - 写入：乐观更新模式（`settings.update(key, value)`，失败回滚）
 * - 主题变更：写入后通过 `steno:theme-mode-changed` 事件广播到所有窗口
 * - 快捷键变更：写入后调用 `db.reloadShortcuts()` 让 Rust 端重新注册
 *
 * @props
 * - `embedded?: boolean` — `true` = Modal 内嵌模式（有 close emit）
 *
 * @emits
 * - `close` — 关闭设置面板（仅 embedded 模式）
 */

import { computed, onMounted, ref } from 'vue';
import {
  NButton,
  NInput,
  NInputNumber,
  NRadio,
  NRadioGroup,
  NSelect,
  NSpace,
  NText,
  useMessage,
} from 'naive-ui';

import { useAppEvents } from '@/composables/useAppEvents';
import { useDb } from '@/composables/useDb';
import { useSettingsStore, type EditorMode, type ThemeMode } from '@/stores/settings';
import { useUiStore } from '@/stores/ui';

const props = withDefaults(defineProps<{ embedded?: boolean }>(), {
  embedded: false,
});

const emit = defineEmits<{
  close: [];
}>();

type SettingsSection = 'general' | 'appearance' | 'shortcuts' | 'privacy' | 'storage' | 'about';

const sections: { key: SettingsSection; label: string; eyebrow: string }[] = [
  { key: 'general', label: '常规', eyebrow: '启动与速记' },
  { key: 'appearance', label: '外观', eyebrow: '主题与编辑' },
  { key: 'shortcuts', label: '快捷键', eyebrow: '全局入口' },
  { key: 'privacy', label: '隐私安全', eyebrow: '本地优先' },
  { key: 'storage', label: '存储', eyebrow: '路径与备份' },
  { key: 'about', label: '关于', eyebrow: '版本信息' },
];

const db = useDb();
const settings = useSettingsStore();
const ui = useUiStore();
const message = useMessage();
const { emitThemeModeChanged } = useAppEvents();
const activeSection = ref<SettingsSection>('general');

async function onThemeChange(value: ThemeMode) {
  try {
    await settings.update('themeMode', value);
  } catch (e) {
    message.error(`主题保存失败：${String(e)}`);
    return;
  }

  try {
    await emitThemeModeChanged(value);
  } catch (e) {
    console.error('[settings] failed to broadcast theme mode change:', e);
  }
}

const mainShortcut = ref('');
const quicknoteShortcut = ref('');
const clipboardShortcut = ref('');
const searchShortcut = ref('');

function syncShortcutLocals() {
  mainShortcut.value = settings.state.mainWindowShortcut;
  quicknoteShortcut.value = settings.state.quicknoteShortcut;
  clipboardShortcut.value = settings.state.clipboardShortcut;
  searchShortcut.value = settings.state.searchShortcut;
}

async function commitShortcut(
  key: 'mainWindowShortcut' | 'quicknoteShortcut' | 'clipboardShortcut' | 'searchShortcut',
  value: string,
) {
  const trimmed = value.trim();
  if (!trimmed || trimmed === settings.state[key]) return;
  const previous = settings.state[key];
  try {
    await settings.update(key, trimmed);
    if (key !== 'searchShortcut') {
      await db.reloadShortcuts();
    }
    message.success(`已更新「${labelOf(key)}」`);
  } catch (e) {
    try {
      await settings.update(key, previous);
      if (key !== 'searchShortcut') {
        await db.reloadShortcuts();
      }
    } catch {
      // 回滚失败时保留原始保存错误给用户。
    }
    message.error(`快捷键保存失败：${String(e)}`);
    syncShortcutLocals();
  }
}

function labelOf(
  key: 'mainWindowShortcut' | 'quicknoteShortcut' | 'clipboardShortcut' | 'searchShortcut',
) {
  switch (key) {
    case 'mainWindowShortcut':
      return '主窗口快捷键';
    case 'quicknoteShortcut':
      return '速记浮窗快捷键';
    case 'clipboardShortcut':
      return '粘贴板快捷键';
    case 'searchShortcut':
      return '搜索快捷键';
  }
}

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

const editorModeOptions = [
  { label: '编辑 + 预览', value: 'split' },
  { label: '只编辑', value: 'edit' },
  { label: '只预览', value: 'preview' },
] satisfies { label: string; value: EditorMode }[];

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

function closePanel() {
  if (props.embedded) {
    emit('close');
  } else {
    ui.navigateToMain();
  }
}

function resetPlanned() {
  message.info('当前版本暂不支持一键重置');
}

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
  <div class="settings-shell" :class="{ 'settings-shell--embedded': props.embedded }">
    <section class="settings-panel" role="dialog" aria-labelledby="settingsTitle">
      <header class="settings-panel__header">
        <div class="settings-brand">
          <span class="settings-brand__mark" aria-hidden="true">S</span>
          <div class="settings-brand__copy">
            <h1 id="settingsTitle">设置</h1>
            <p>{{ headerSub }}</p>
          </div>
        </div>

        <nav class="settings-tabs" aria-label="设置分类">
          <button
            v-for="section in sections"
            :key="section.key"
            class="settings-tab"
            :class="{ 'settings-tab--active': activeSection === section.key }"
            :data-testid="`settings-tab-${section.key}`"
            type="button"
            :aria-pressed="activeSection === section.key"
            @click="activeSection = section.key"
          >
            <span>{{ section.label }}</span>
            <small>{{ section.eyebrow }}</small>
          </button>
        </nav>

        <NButton quaternary circle aria-label="关闭设置" @click="closePanel">×</NButton>
      </header>

      <main class="settings-panel__body">
        <section v-if="activeSection === 'general'" class="settings-section">
          <div class="settings-section__intro">
            <h2>常规</h2>
            <p>启动与速记相关行为，决定 Steno 如何驻留在桌面工作流中。</p>
          </div>

          <h3 class="settings-group">启动与速记</h3>
          <div class="settings-row">
            <div class="settings-row__meta">
              <strong>速记浮窗宽度</strong>
              <p>新打开速记浮窗时使用的默认宽度。</p>
            </div>
            <NInputNumber
              :value="settings.state.floatingWidth"
              :min="240"
              :max="1200"
              :step="20"
              size="small"
              @update:value="value => onUpdateNumber('floatingWidth', value)"
            />
          </div>
          <div class="settings-row">
            <div class="settings-row__meta">
              <strong>速记浮窗高度</strong>
              <p>新打开速记浮窗时使用的默认高度。</p>
            </div>
            <NInputNumber
              :value="settings.state.floatingHeight"
              :min="180"
              :max="900"
              :step="20"
              size="small"
              @update:value="value => onUpdateNumber('floatingHeight', value)"
            />
          </div>
          <div class="settings-row">
            <div class="settings-row__meta">
              <strong>失焦关闭延迟</strong>
              <p>速记浮窗失去焦点后等待关闭的毫秒数。</p>
            </div>
            <NInputNumber
              :value="settings.state.blurCloseDelayMs"
              :min="0"
              :max="5000"
              :step="100"
              size="small"
              @update:value="value => onUpdateNumber('blurCloseDelayMs', value)"
            />
          </div>
        </section>

        <section v-else-if="activeSection === 'appearance'" class="settings-section">
          <div class="settings-section__intro">
            <h2>外观</h2>
            <p>主题、编辑器模式和未来纸张偏好集中在这里管理。</p>
          </div>

          <h3 class="settings-group">主题</h3>
          <div class="settings-row">
            <div class="settings-row__meta">
              <strong>颜色模式</strong>
              <p>跟随系统会响应操作系统浅色或深色模式。</p>
            </div>
            <NRadioGroup
              :value="settings.state.themeMode"
              @update:value="value => onThemeChange(value as ThemeMode)"
            >
              <NSpace>
                <NRadio value="light">浅色</NRadio>
                <NRadio value="dark">深色</NRadio>
                <NRadio value="system">跟随系统</NRadio>
              </NSpace>
            </NRadioGroup>
          </div>
          <div class="settings-row settings-row--disabled">
            <div class="settings-row__meta">
              <strong>主题强调色</strong>
              <p>原型中的强调色选择已预留，当前版本不写入设置。</p>
            </div>
            <div class="settings-swatches" aria-label="规划中的主题强调色">
              <span style="--swatch: #b45f2a"></span>
              <span style="--swatch: #2f8f63"></span>
              <span style="--swatch: #3b6ea8"></span>
              <span style="--swatch: #8d5db7"></span>
            </div>
          </div>

          <h3 class="settings-group">编辑器</h3>
          <div class="settings-row">
            <div class="settings-row__meta">
              <strong>编辑器模式</strong>
              <p>控制 Markdown 编辑器默认展示方式。</p>
            </div>
            <NSelect
              class="settings-control"
              size="small"
              :value="settings.state.editorMode"
              :options="editorModeOptions"
              @update:value="value => onEditorModeChange(value as EditorMode)"
            />
          </div>
          <div class="settings-row settings-row--disabled">
            <div class="settings-row__meta">
              <strong>便签默认底色</strong>
              <p>新便签纸张颜色将在后续版本接入画布卡片。</p>
            </div>
            <NButton size="tiny" disabled>规划中</NButton>
          </div>
        </section>

        <section v-else-if="activeSection === 'shortcuts'" class="settings-section">
          <div class="settings-section__intro">
            <h2>快捷键</h2>
            <p>输入完成后失焦或按回车保存；系统级快捷键会重新注册。</p>
          </div>

          <h3 class="settings-group">全局入口</h3>
          <div class="settings-row">
            <div class="settings-row__meta">
              <strong>主窗口</strong>
              <p>呼出或聚焦 Steno 主窗口。</p>
            </div>
            <NInput
              v-model:value="mainShortcut"
              class="settings-control"
              placeholder="Ctrl+Shift+N"
              size="small"
              @blur="commitShortcut('mainWindowShortcut', mainShortcut)"
              @keydown.enter="commitShortcut('mainWindowShortcut', mainShortcut)"
            />
          </div>
          <div class="settings-row">
            <div class="settings-row__meta">
              <strong>速记浮窗</strong>
              <p>从任意应用快速打开速记输入框。</p>
            </div>
            <NInput
              v-model:value="quicknoteShortcut"
              class="settings-control"
              placeholder="Ctrl+Shift+M"
              size="small"
              @blur="commitShortcut('quicknoteShortcut', quicknoteShortcut)"
              @keydown.enter="commitShortcut('quicknoteShortcut', quicknoteShortcut)"
            />
          </div>
          <div class="settings-row">
            <div class="settings-row__meta">
              <strong>粘贴板</strong>
              <p>呼出 Steno 主窗口并打开粘贴板历史。</p>
            </div>
            <NInput
              v-model:value="clipboardShortcut"
              class="settings-control"
              data-testid="clipboard-shortcut-input"
              placeholder="Ctrl+Shift+V"
              size="small"
              @blur="commitShortcut('clipboardShortcut', clipboardShortcut)"
              @keydown.enter="commitShortcut('clipboardShortcut', clipboardShortcut)"
            />
          </div>
          <div class="settings-row">
            <div class="settings-row__meta">
              <strong>搜索</strong>
              <p>当前为应用内预留字段，暂不注册到操作系统。</p>
            </div>
            <NInput
              v-model:value="searchShortcut"
              class="settings-control"
              placeholder="Ctrl+Shift+F"
              size="small"
              @blur="commitShortcut('searchShortcut', searchShortcut)"
              @keydown.enter="commitShortcut('searchShortcut', searchShortcut)"
            />
          </div>
        </section>

        <section v-else-if="activeSection === 'privacy'" class="settings-section">
          <div class="settings-section__intro">
            <h2>隐私安全</h2>
            <p>Steno 当前保持本地优先，隐私增强项先展示边界，不写入不存在的设置键。</p>
          </div>

          <h3 class="settings-group">本地保护</h3>
          <div class="settings-row settings-row--disabled">
            <div class="settings-row__meta">
              <strong>数据库加密</strong>
              <p>SQLCipher 加密入口规划中，当前版本不会修改数据库结构。</p>
            </div>
            <NButton size="tiny" disabled>规划中</NButton>
          </div>
          <div class="settings-row settings-row--disabled">
            <div class="settings-row__meta">
              <strong>敏感内容过滤</strong>
              <p>信用卡号、Token、私钥等模式过滤需要后端规则支持。</p>
            </div>
            <NButton size="tiny" disabled>规划中</NButton>
          </div>
          <div class="settings-row settings-row--disabled">
            <div class="settings-row__meta">
              <strong>应用排除名单</strong>
              <p>密码管理器和指定应用排除名单将在权限层接入。</p>
            </div>
            <NButton size="tiny" disabled>只读</NButton>
          </div>
        </section>

        <section v-else-if="activeSection === 'storage'" class="settings-section">
          <div class="settings-section__intro">
            <h2>存储位置</h2>
            <p>查看本地数据目录、数据库文件和备份目录；路径以普通文本渲染。</p>
          </div>

          <h3 class="settings-group">本地路径</h3>
          <div v-if="paths" class="settings-paths">
            <div class="settings-path-row">
              <span class="settings-path-label">数据目录</span>
              <code class="settings-path-value">{{ paths.dataDir }}</code>
              <NButton tertiary size="tiny" @click="copyPath(paths.dataDir)">复制</NButton>
            </div>
            <div class="settings-path-row">
              <span class="settings-path-label">数据库文件</span>
              <code class="settings-path-value">{{ paths.dbPath }}</code>
              <NButton tertiary size="tiny" @click="copyPath(paths.dbPath)">复制</NButton>
            </div>
            <div class="settings-path-row">
              <span class="settings-path-label">备份目录</span>
              <code class="settings-path-value">{{ paths.backupDir }}</code>
              <NButton tertiary size="tiny" @click="copyPath(paths.backupDir)">复制</NButton>
            </div>
          </div>
          <NText v-else depth="3">加载中...</NText>

          <h3 class="settings-group">备份</h3>
          <div class="settings-row">
            <div class="settings-row__meta">
              <strong>累计修改次数触发备份</strong>
              <p>达到阈值后打包本地 Markdown 与索引。</p>
            </div>
            <NInputNumber
              :value="settings.state.backupEveryChanges"
              :min="1"
              :max="200"
              :step="1"
              size="small"
              @update:value="value => onUpdateNumber('backupEveryChanges', value)"
            />
          </div>
        </section>

        <section v-else class="settings-section">
          <div class="settings-section__intro">
            <h2>关于 Steno</h2>
            <p>一款本地优先的桌面速记工具，使用 Tauri、Rust 和 Vue 构建。</p>
          </div>

          <div class="settings-about-grid">
            <div class="settings-about-card">
              <span>版本</span>
              <strong>Steno 0.0.0</strong>
              <small>本地开发版</small>
            </div>
            <div class="settings-about-card">
              <span>运行时</span>
              <strong>Tauri 2 + Vue 3</strong>
              <small>Rust 后端 · SQLite 本地库</small>
            </div>
            <div class="settings-about-card">
              <span>数据策略</span>
              <strong>本地优先</strong>
              <small>默认不上传笔记内容</small>
            </div>
            <div class="settings-about-card">
              <span>许可证</span>
              <strong>MIT</strong>
              <small>开源项目</small>
            </div>
          </div>
        </section>
      </main>

      <footer class="settings-panel__footer">
        <NButton quaternary type="error" @click="closePanel">取消</NButton>
        <span class="settings-save-hint">所有更改自动保存到本地</span>
        <NButton secondary @click="resetPlanned">重置</NButton>
        <NButton type="primary" @click="closePanel">确认</NButton>
      </footer>
    </section>
  </div>
</template>

<style scoped>
.settings-shell {
  width: 100vw;
  height: 100vh;
  display: grid;
  place-items: center;
  padding: 24px;
  background:
    linear-gradient(90deg, rgba(255, 255, 255, 0.04) 1px, transparent 1px),
    linear-gradient(0deg, rgba(255, 255, 255, 0.04) 1px, transparent 1px),
    #15151a;
  background-size: 44px 44px;
  color: #ebe7e2;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei",
    sans-serif;
}

.settings-shell--embedded {
  /* 主窗口内通过 NModal 承载，mask 已置透明。让 shell 自身 fixed 铺满整个
     app 视口、背景跟随主题，看起来就像设置直接替换了 main view，不再有外层
     黑色 mask + card 边框包裹。 */
  position: fixed;
  inset: 0;
  width: 100vw;
  height: 100vh;
  padding: 0;
  background: var(--bg, #15151a);
  display: grid;
  place-items: stretch;
}

.settings-shell--embedded .settings-panel {
  /* 全屏铺满，去掉 card 视觉（圆角 / 边框 / 阴影），让设置内容直接呈现。 */
  width: 100%;
  height: 100%;
  max-width: none;
  max-height: none;
  border-radius: 0;
  border: none;
  box-shadow: none;
}

.settings-panel {
  width: min(920px, calc(100vw - 32px));
  height: min(660px, calc(100vh - 48px));
  display: grid;
  grid-template-rows: 76px 1fr 60px;
  overflow: hidden;
  border: 1px solid rgba(128, 117, 105, 0.35);
  border-radius: 14px;
  background: #fbfaf8;
  color: #27231f;
  box-shadow: 0 28px 80px rgba(20, 17, 14, 0.35);
}

:global(.dark) .settings-panel,
.settings-shell:not(.settings-shell--embedded) .settings-panel {
  background: #202025;
  color: #eee9e2;
  border-color: rgba(255, 255, 255, 0.1);
}

/* NRadio 默认会跟随 Naive UI 主题色（dark 主题下变浅），但 .settings-panel 自身
   背景与 panel.color 已经做了双主题；让 radio label / 数字输入 / 路径 code 直接
   继承 panel 当前 color，避免在浅色背景上残留浅文字看不清。 */
.settings-panel :deep(.n-radio__label),
.settings-panel :deep(.n-input-number .n-input__input-el),
.settings-panel :deep(.n-input .n-input__input-el) {
  color: inherit;
}

.settings-panel__header,
.settings-panel__footer {
  display: flex;
  align-items: center;
  gap: 12px;
  background: rgba(128, 117, 105, 0.07);
  border-color: rgba(128, 117, 105, 0.22);
}

.settings-panel__header {
  min-width: 0;
  padding: 0 14px 0 18px;
  border-bottom: 1px solid rgba(128, 117, 105, 0.22);
}

.settings-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 150px;
  padding-right: 12px;
  border-right: 1px solid rgba(128, 117, 105, 0.22);
}

.settings-brand__mark {
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  border-radius: 7px;
  background: #a85f32;
  color: white;
  font-weight: 700;
}

.settings-brand__copy {
  min-width: 0;
}

.settings-brand h1,
.settings-brand p,
.settings-section__intro h2,
.settings-section__intro p {
  margin: 0;
}

.settings-brand h1 {
  font-size: 15px;
  font-weight: 650;
}

.settings-brand p {
  margin-top: 2px;
  font-size: 11px;
  color: #7b7067;
}

:global(.dark) .settings-brand p,
.settings-shell:not(.settings-shell--embedded) .settings-brand p {
  color: #afa59b;
}

.settings-tabs {
  min-width: 0;
  flex: 1;
  display: flex;
  align-items: stretch;
  gap: 4px;
  overflow-x: auto;
  scrollbar-width: none;
}

.settings-tabs::-webkit-scrollbar {
  display: none;
}

.settings-tab {
  min-width: 88px;
  border: 0;
  border-radius: 8px;
  padding: 8px 10px;
  background: transparent;
  color: #695f57;
  cursor: pointer;
  text-align: left;
  transition:
    background 0.16s ease,
    color 0.16s ease;
}

.settings-tab:hover,
.settings-tab--active {
  background: rgba(168, 95, 50, 0.12);
  color: #27231f;
}

:global(.dark) .settings-tab,
.settings-shell:not(.settings-shell--embedded) .settings-tab {
  color: #c3b8ae;
}

:global(.dark) .settings-tab:hover,
:global(.dark) .settings-tab--active,
.settings-shell:not(.settings-shell--embedded) .settings-tab:hover,
.settings-shell:not(.settings-shell--embedded) .settings-tab--active {
  color: #f8f1e9;
}

.settings-tab span,
.settings-tab small {
  display: block;
}

.settings-tab span {
  font-size: 13px;
  font-weight: 650;
}

.settings-tab small {
  margin-top: 2px;
  font-size: 10px;
  color: currentColor;
  opacity: 0.65;
}

.settings-panel__body {
  min-height: 0;
  overflow: auto;
  padding: 22px 28px 28px;
}

.settings-section {
  max-width: 760px;
}

.settings-section__intro {
  margin-bottom: 18px;
  padding-bottom: 14px;
  border-bottom: 1px solid rgba(128, 117, 105, 0.22);
}

.settings-section__intro h2 {
  font-size: 18px;
  font-weight: 650;
}

.settings-section__intro p {
  margin-top: 4px;
  color: #71675f;
  font-size: 12.5px;
}

:global(.dark) .settings-section__intro p,
.settings-shell:not(.settings-shell--embedded) .settings-section__intro p {
  color: #b8aea4;
}

.settings-group {
  margin: 22px 0 8px;
  padding-bottom: 6px;
  border-bottom: 1px dashed rgba(128, 117, 105, 0.24);
  color: #8a5a38;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.settings-group:first-of-type {
  margin-top: 0;
}

.settings-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 18px;
  padding: 12px 0;
}

.settings-row + .settings-row {
  border-top: 1px solid rgba(128, 117, 105, 0.16);
}

.settings-row--disabled {
  opacity: 0.68;
}

.settings-row__meta {
  min-width: 0;
}

.settings-row__meta strong {
  display: block;
  margin-bottom: 2px;
  font-size: 13.5px;
  font-weight: 650;
}

.settings-row__meta p {
  margin: 0;
  color: #756b63;
  font-size: 12px;
  line-height: 1.5;
}

:global(.dark) .settings-row__meta p,
.settings-shell:not(.settings-shell--embedded) .settings-row__meta p {
  color: #b6aca2;
}

.settings-control {
  width: 220px;
}

.settings-swatches {
  display: flex;
  align-items: center;
  gap: 8px;
}

.settings-swatches span {
  width: 24px;
  height: 24px;
  border: 1px solid rgba(128, 117, 105, 0.28);
  border-radius: 6px;
  background: var(--swatch);
}

.settings-paths {
  display: grid;
  gap: 8px;
}

.settings-path-row {
  display: grid;
  grid-template-columns: 88px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  padding: 9px 10px;
  border: 1px solid rgba(128, 117, 105, 0.2);
  border-radius: 8px;
  background: rgba(128, 117, 105, 0.07);
}

.settings-path-label {
  color: #6f655d;
  font-size: 12px;
}

.settings-path-value {
  min-width: 0;
  overflow: hidden;
  color: inherit;
  font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", Menlo, monospace;
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.settings-about-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.settings-about-card {
  display: grid;
  gap: 4px;
  padding: 14px;
  border: 1px solid rgba(128, 117, 105, 0.2);
  border-radius: 8px;
  background: rgba(128, 117, 105, 0.07);
}

.settings-about-card span,
.settings-about-card small {
  color: #756b63;
  font-size: 11px;
}

.settings-about-card strong {
  font-size: 15px;
}

.settings-panel__footer {
  padding: 0 18px;
  border-top: 1px solid rgba(128, 117, 105, 0.22);
}

.settings-save-hint {
  flex: 1;
  color: #756b63;
  font-size: 12px;
}

:global(.dark) .settings-save-hint,
:global(.dark) .settings-path-label,
:global(.dark) .settings-about-card span,
:global(.dark) .settings-about-card small,
.settings-shell:not(.settings-shell--embedded) .settings-save-hint,
.settings-shell:not(.settings-shell--embedded) .settings-path-label,
.settings-shell:not(.settings-shell--embedded) .settings-about-card span,
.settings-shell:not(.settings-shell--embedded) .settings-about-card small {
  color: #b6aca2;
}

@media (max-width: 720px) {
  .settings-panel {
    width: calc(100vw - 20px);
    height: calc(100vh - 20px);
    grid-template-rows: auto 1fr auto;
  }

  .settings-panel__header {
    flex-wrap: wrap;
    padding: 12px;
  }

  .settings-brand {
    width: calc(100% - 44px);
    border-right: 0;
  }

  .settings-tabs {
    order: 3;
    width: 100%;
  }

  .settings-row,
  .settings-path-row {
    grid-template-columns: 1fr;
    align-items: stretch;
  }

  .settings-control {
    width: 100%;
  }

  .settings-about-grid {
    grid-template-columns: 1fr;
  }
}
</style>
