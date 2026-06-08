<!--
  @file 前端通用组件 - Floating Editor

  承载 Floating Editor 的界面结构、响应式状态和用户交互，是 前端通用组件 模块的可视入口之一。
  注释重点标明模板结构、脚本状态、事件派发和样式隔离边界。
-->

<script setup lang="ts">
// 脚本区：组织 Floating Editor 的响应式状态、计算属性、事件处理和外部模块协作。
// 浮窗 / 便签双模式顶层视图。
//
// 两种模式由 `props.noteId` 决定：
//   - quicknote 模式（props.noteId == null）：单例 quick-capture 浮窗。
//     标题与标签是 NInput 直接编辑；失焦/关闭 → flushSave → hide + reset；
//     置顶按钮 → pin + 创建独立便签窗口，然后 hide quicknote。
//   - sticky 模式（props.noteId 非空）：每条置顶笔记一个独立 webview。
//     mount 时按 noteId 从 SQLite hydrate；
//     标题与标签默认以只读文本展示，旁侧编辑按钮切换 NInput；
//     失焦不自动关闭；关闭 / 取消置顶 → flushSave → unpin + closeStickyNote。
//
// 跨窗口同步：autosave 成功后 emit `steno:note-saved`，MainView 监听后调用
// syncExternalNote 让笔记列表卡片实时更新（包括标题/标签/内容）。
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { NButton, NIcon, NInput, NText, useMessage } from 'naive-ui';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

import MarkdownEditor from '@/components/MarkdownEditor.vue';
import { useAppEvents } from '@/composables/useAppEvents';
import { useAutosave } from '@/composables/useAutosave';
import { useDb } from '@/composables/useDb';
import { useMarkdown } from '@/composables/useMarkdown';
import { useWindow } from '@/composables/useWindow';
import { useNotesStore } from '@/stores/notes';
import { useSettingsStore } from '@/stores/settings';
import { useClipboardStore } from '@/stores/clipboard';
import type { Note, SaveNoteRequest } from '@/types/steno';

// 局部常量 props：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const props = withDefaults(
  defineProps<{
    noteId?: string | null;
  }>(),
  {
    noteId: null
  }
);

// 局部常量 db：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const db = useDb();
// 局部常量 notes：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const notes = useNotesStore();
// 局部常量 settings：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const settings = useSettingsStore();
// 局部常量 clipboard：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const clipboard = useClipboardStore();
// 局部常量 win：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const win = useWindow();
// 局部常量 appEvents：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const appEvents = useAppEvents();
// 局部常量 message：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const message = useMessage();
const { countWords } = useMarkdown();

// 局部常量 isSticky：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const isSticky = computed(() => !!props.noteId);

// quicknote 模式下"已锁定"开关——pin 按钮 toggle 后不再失焦关闭。
const quicknotePinned = ref(false);

// 局部常量 currentNoteId：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const currentNoteId = ref<string | null>(props.noteId ?? null);
// 局部常量 title：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const title = ref('');
// 局部常量 content：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const content = ref('');
// 局部常量 tagsInput：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const tagsInput = ref('');
// 局部常量 isClipboardView：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const isClipboardView = ref(false);
// 局部常量 clipboardEntryId：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const clipboardEntryId = ref<string | null>(null);
// 局部常量 clipboardInitialContent：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const clipboardInitialContent = ref('');
// 局部常量 clipboardDirty：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const clipboardDirty = ref(false);
// 局部常量 loaded：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const loaded = ref(!isSticky.value);

// 局部常量 titleEditing：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const titleEditing = ref(false);
// 局部常量 titleDraft：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const titleDraft = ref('');
// 局部常量 titleInputRef：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const titleInputRef = ref<{ focus: () => void } | null>(null);

// 局部常量 tagsEditing：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const tagsEditing = ref(false);
// 局部常量 tagsDraft：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const tagsDraft = ref('');
// 局部常量 tagsInputRef：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const tagsInputRef = ref<{ focus: () => void } | null>(null);

// 局部常量 tagsArray：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const tagsArray = computed(() => parseTags(tagsInput.value));

// 函数 parseTags：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
function parseTags(raw: string): string[] {
  // 局部常量 trimmed：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const trimmed = raw.trim();
  if (!trimmed) return [];
  return Array.from(
    new Set(
      trimmed
        .split(/[,，\s]+/)
        .map(t => t.replace(/^#/, '').toLowerCase().trim())
        .filter(Boolean)
    )
  );
}

// 局部常量 wordCount：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const wordCount = computed(() => countWords(content.value));

// 局部常量 isEmpty：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const isEmpty = computed(() => !title.value.trim() && !content.value.trim() && tagsArray.value.length === 0);

// ----- 自动保存 -------------------------------------------------------

const { status, savedAt, error, scheduleSave, flushSave } = useAutosave(async (payload: SaveNoteRequest) => {
  // 局部常量 saved：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const saved = await notes.saveDraft(payload);
  if (!saved) return;
  if (!currentNoteId.value) currentNoteId.value = saved.id;
  void appEvents.emitNoteSaved(saved);
});

watch([title, content, tagsInput], () => {
  if (!loaded.value) return;
  // 粘贴板模式：浮窗只用于查看 / 编辑剪贴板条目，绝不写入笔记库（不创建草稿笔记）。
  // 配合 useAutosave —— 永不 scheduleSave，pending 恒为空，flushSave 自然成为 no-op。
  if (isClipboardView.value) return;
  if (isEmpty.value && !currentNoteId.value) return;
  if (isSticky.value) {
    scheduleSave({
      id: currentNoteId.value ?? undefined,
      title: title.value || undefined,
      content: content.value,
      tags: tagsArray.value
    });
    return;
  }
  // quicknote 模式：写入一份带 is_draft 标记的笔记；首次 autosave 时由
  // 后端分配 UUID，autosave 回写 currentNoteId，后续编辑都更新同一行。
  // 多份草稿天然共存：每次"新建速记"会进入空白态，autosave 会创建新 UUID。
  scheduleSave({
    id: currentNoteId.value ?? undefined,
    title: title.value || undefined,
    content: content.value,
    tags: tagsArray.value,
    isDraft: true
  });
});

// ----- 粘贴板编辑自动保存 -----------------------------------------------

let clipboardSaveTimer: ReturnType<typeof setTimeout> | null = null;

// 函数 scheduleClipboardSave：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
function scheduleClipboardSave() {
  if (!clipboardEntryId.value) return;
  // 只有内容相对"打开时的原始内容"真正改变了才算脏 —— 程序填充初始内容
  // （quicknote:open 回填）不应触发保存，否则会无谓 bump updated_at 而被误标"已修改"。
  clipboardDirty.value = content.value !== clipboardInitialContent.value;
  if (!clipboardDirty.value) {
    // 内容与原始值一致（含"改了又改回"）：撤销待保存，保持条目不被触碰。
    if (clipboardSaveTimer) {
      clearTimeout(clipboardSaveTimer);
      clipboardSaveTimer = null;
    }
    return;
  }
  if (clipboardSaveTimer) clearTimeout(clipboardSaveTimer);
  clipboardSaveTimer = setTimeout(async () => {
    if (!clipboardEntryId.value || !clipboardDirty.value) return;
    clipboardDirty.value = false;
    try {
      await clipboard.updateEntry(clipboardEntryId.value, content.value);
    } catch {
      // 静默
    }
  }, 800);
}

// 函数 flushClipboardSave：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
async function flushClipboardSave() {
  if (clipboardSaveTimer) {
    clearTimeout(clipboardSaveTimer);
    clipboardSaveTimer = null;
  }
  if (!clipboardEntryId.value || !clipboardDirty.value) return;
  clipboardDirty.value = false;
  try {
    await clipboard.updateEntry(clipboardEntryId.value, content.value);
  } catch {
    // 静默
  }
}

watch(content, () => {
  if (!loaded.value) return;
  if (clipboardEntryId.value) {
    scheduleClipboardSave();
  }
});

// 局部常量 statusText：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const statusText = computed(() => {
  switch (status.value) {
    case 'idle':
      return '';
    case 'scheduled':
      return '编辑中…';
    case 'saving':
      return '保存中…';
    case 'saved':
      return savedAt.value
        ? `已保存 ${savedAt.value.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
        : '已保存';
    case 'error':
      return `保存失败：${String(error.value).slice(0, 40)}`;
    default:
      return '';
  }
});

// 局部常量 pinButtonTitle：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const pinButtonTitle = computed(() => {
  if (isSticky.value) return '取消置顶并关闭';
  return quicknotePinned.value ? '取消置顶' : '置顶为便签';
});

// 局部常量 displayTitle：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const displayTitle = computed(() => title.value.trim() || '无标题');
// 局部常量 displayTags：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const displayTags = computed(() => {
  // 局部常量 tags：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const tags = tagsArray.value;
  if (tags.length === 0) return '点击编辑标签';
  return tags.map(t => `#${t}`).join(' ');
});

// ----- 标题编辑 -------------------------------------------------------

async function onStartTitleEdit() {
  titleDraft.value = title.value;
  titleEditing.value = true;
  await nextTick();
  titleInputRef.value?.focus();
}

// 函数 onCancelTitleEdit：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
function onCancelTitleEdit() {
  titleDraft.value = '';
  titleEditing.value = false;
}

// 函数 onSaveTitle：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
function onSaveTitle() {
  // 局部常量 next：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const next = titleDraft.value.trim();
  titleEditing.value = false;
  if (next === title.value) return;
  title.value = next;
}

// ----- 标签编辑 -------------------------------------------------------

async function onStartTagsEdit() {
  tagsDraft.value = tagsInput.value;
  tagsEditing.value = true;
  await nextTick();
  tagsInputRef.value?.focus();
}

// 函数 onCancelTagsEdit：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
function onCancelTagsEdit() {
  tagsDraft.value = '';
  tagsEditing.value = false;
}

// 函数 onSaveTags：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
function onSaveTags() {
  // 局部常量 next：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const next = tagsDraft.value;
  tagsEditing.value = false;
  if (next === tagsInput.value) return;
  tagsInput.value = next;
}

// ----- 拖拽 + 失焦关闭 ------------------------------------------------

const dragUntil = ref(0);

// 函数 onTitlebarPointerdown：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
async function onTitlebarPointerdown(e: PointerEvent) {
  if (e.button !== 0) return;
  if ((e.target as HTMLElement | null)?.closest('button, input, [contenteditable]')) return;
  e.preventDefault();
  dragUntil.value = Date.now() + 500;
  try {
    await win.startDragCurrent();
  } catch (err) {
    console.error('[floating] startDragging failed:', err);
  }
}

// 函数 resetState：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
function resetState() {
  currentNoteId.value = null;
  title.value = '';
  content.value = '';
  tagsInput.value = '';
  isClipboardView.value = false;
  clipboardEntryId.value = null;
  clipboardInitialContent.value = '';
  clipboardDirty.value = false;
  titleEditing.value = false;
  tagsEditing.value = false;
}

// 函数 dismissSticky：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
async function dismissSticky() {
  if (!currentNoteId.value) {
    await win.closeCurrent();
    return;
  }
  await flushSave();
  if (status.value === 'error') return;
  try {
    // 局部常量 updated：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const updated = await notes.unpinNote(currentNoteId.value);
    void appEvents.emitNoteSaved(updated);
  } catch (e) {
    console.error('[sticky] unpin failed:', e);
  }
  try {
    await win.closeStickyNote(currentNoteId.value);
  } catch {
    await win.closeCurrent();
  }
}

// 函数 dismissQuicknote：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
async function dismissQuicknote() {
  // 粘贴板上下文：保存修改后关闭，不创建草稿笔记。
  if (isClipboardView.value) {
    await flushClipboardSave();
    await win.hideCurrent();
    resetState();
    return;
  }
  // 草稿持久化策略：
  // - 内存白板（currentNoteId 为 null 且 isEmpty）：什么都没有，直接 hide，不动 db；
  // - 用户主动清空当前正在编辑的草稿（currentNoteId 已落地且 isEmpty）：顺手把
  //   该 id 的行清掉，列表卡片立即消失；
  // - 其它（有内容）：flushSave 保留到 db，下次重启或重新打开都能恢复。
  if (currentNoteId.value === null && isEmpty.value) {
    await win.hideCurrent();
    resetState();
    return;
  }
  if (!isSticky.value && currentNoteId.value && isEmpty.value) {
    // 局部常量 draftId：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const draftId = currentNoteId.value;
    try {
      await db.deleteNote(draftId);
      void appEvents.emitNoteRemoved({ id: draftId });
    } catch {
      // 草稿原本就不存在时 deleteNote 不抛错，这里 catch 兜底其他偶发情况。
    }
    await win.hideCurrent();
    resetState();
    return;
  }
  await flushSave();
  if (status.value === 'error') return;
  await win.hideCurrent();
  resetState();
}

// 函数 saveAndDismiss：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
async function saveAndDismiss(): Promise<void> {
  if (isSticky.value) {
    await dismissSticky();
    return;
  }
  await dismissQuicknote();
}

let blurTimer: ReturnType<typeof setTimeout> | undefined;
let unlistenFocus: (() => void) | undefined;
let unlistenOpen: UnlistenFn | undefined;

// 函数 applyNoteToUI：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
function applyNoteToUI(note: Note) {
  currentNoteId.value = note.id;
  title.value = note.title === '未命名' ? '' : note.title;
  content.value = note.content;
  tagsInput.value = note.tags.map(t => `#${t}`).join(' ');
}

// 函数 hydrateLatestDraft：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
async function hydrateLatestDraft(): Promise<boolean> {
  try {
    // 局部常量 draft：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const draft = await db.getLatestDraft();
    if (!draft) return false;
    applyNoteToUI(draft);
    return true;
  } catch (e) {
    console.error('[quicknote] hydrate latest draft failed:', e);
    return false;
  }
}

// 函数 hydrateDraftById：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
async function hydrateDraftById(id: string): Promise<boolean> {
  try {
    // 局部常量 draft：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const draft = await db.getNote(id);
    if (!draft || !draft.isDraft) return false;
    applyNoteToUI(draft);
    return true;
  } catch (e) {
    console.error('[quicknote] hydrate draft by id failed:', e);
    return false;
  }
}

onMounted(async () => {
  if (isSticky.value && props.noteId) {
    try {
      // 局部常量 note：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
      const note = await db.getNote(props.noteId);
      if (note) {
        currentNoteId.value = note.id;
        title.value = note.title;
        content.value = note.content;
        tagsInput.value = note.tags.map(t => `#${t}`).join(' ');
      } else {
        console.warn('[sticky] note not found:', props.noteId);
      }
    } catch (e) {
      console.error('[sticky] hydrate failed:', e);
    }
    loaded.value = true;
    return;
  }

  // quicknote 路径：先尝试从 SQLite 拉最新一份草稿；存在则回填 UI。
  // 之后每次窗口 show 都靠 `quicknote:open` 事件按入口语义重新 hydrate。
  await hydrateLatestDraft();
  loaded.value = true;

  unlistenFocus = await win.onCurrentWindowFocusChange(focused => {
    if (focused) {
      // 浮窗单例 hide / show 复用同一组件实例，hydrate 完全交给 `quicknote:open`
      // 事件按入口（快捷键 / 卡片 / 新建按钮）分别决定；focus 只负责清掉
      // 失焦计时器，避免被定时器关闭。
      if (blurTimer) {
        clearTimeout(blurTimer);
        blurTimer = undefined;
      }
      return;
    }
    if (Date.now() < dragUntil.value) return;
    if (quicknotePinned.value) return;
    if (blurTimer) clearTimeout(blurTimer);
    blurTimer = setTimeout(() => {
      blurTimer = undefined;
      void saveAndDismiss();
    }, settings.state.blurCloseDelayMs);
  });

  if (!isSticky.value) {
    // 浮窗单例：每次 show 都从后端收到 `quicknote:open` 事件，按 fresh/noteId
    // 决定空白 / 续写最近草稿 / 按指定 id hydrate。
    unlistenOpen = await listen<{
      fresh: boolean;
      noteId: string | null;
      initialContent?: string | null;
      clipboardContext?: boolean | null;
      clipboardEntryId?: string | null;
    }>('quicknote:open', async ({ payload }) => {
      // 如果有直接传入的初始内容，优先使用它。
      if (payload.initialContent) {
        resetState();
        // 先记录原始内容与上下文，再回填 content —— content 的 watch 异步触发，
        // 届时这些基准值已就绪，初始回填便不会被误判为"用户编辑"。
        clipboardInitialContent.value = payload.initialContent;
        isClipboardView.value = !!payload.clipboardContext;
        clipboardEntryId.value = payload.clipboardEntryId ?? null;
        content.value = payload.initialContent;
        return;
      }
      isClipboardView.value = false;
      if (payload.fresh) {
        // "新建速记"按钮入口：清空 UI 进入空白态；
        // 后续 autosave 触发时由后端分配新 UUID，写入一份新的独立草稿。
        resetState();
        return;
      }
      if (payload.noteId) {
        // 列表卡片入口：按指定 id hydrate 该份草稿。
        resetState();
        await hydrateDraftById(payload.noteId);
        return;
      }
      // 快捷键入口：仅在浮窗为空态时续写最近一份草稿，避免覆盖用户在编辑的内容。
      if (currentNoteId.value === null && isEmpty.value) {
        await hydrateLatestDraft();
      }
    });
  }
});

onUnmounted(() => {
  if (blurTimer) clearTimeout(blurTimer);
  unlistenFocus?.();
  unlistenOpen?.();
  void flushSave();
});

// ----- 关闭 / 置顶 -----------------------------------------------------

async function nextUntitledName(): Promise<string> {
  // 局部常量 base：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const base = '未命名';
  try {
    // 局部常量 existing：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const existing = await db.listNotes(1000);
    // 局部常量 titles：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const titles = new Set(existing.map(n => n.title));
    if (!titles.has(base)) return base;
    let i = 1;
    while (titles.has(`${base}${i}`)) i++;
    return `${base}${i}`;
  } catch (e) {
    console.error('[floating] list notes failed:', e);
    return base;
  }
}

// 函数 onSaveClick：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
async function onSaveClick() {
  if (!content.value.trim()) {
    message.warning('笔记内容为空，无法保存');
    return;
  }
  if (!title.value.trim()) {
    title.value = await nextUntitledName();
  }
  // 先把当前编辑落到 db（autosave 首次会让后端分配 UUID 并回写 currentNoteId），
  // 再按 currentNoteId 原子地提升为正式笔记：分配新 UUID + 清 is_draft + 删旧行。
  await flushSave();
  if (status.value === 'error') return;
  if (isSticky.value) return;
  // 局部常量 draftId：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const draftId = currentNoteId.value;
  if (!draftId) {
    message.error('保存失败：当前没有可提交的草稿');
    return;
  }
  try {
    // 局部常量 promoted：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const promoted = await db.promoteDraft(draftId);
    if (promoted) {
      currentNoteId.value = promoted.id;
      notes.syncExternalNote(promoted);
      void appEvents.emitNoteSaved(promoted);
      void appEvents.emitNoteRemoved({ id: draftId });
      message.success('笔记已保存');
      await win.hideCurrent();
      resetState();
    }
  } catch (e) {
    console.error('[quicknote] promote draft failed:', e);
    message.error(`保存失败：${String(e)}`);
  }
}

// 函数 onCloseClick：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
async function onCloseClick() {
  if (isSticky.value) {
    await dismissSticky();
    return;
  }
  await dismissQuicknote();
}

// 函数 onPinClick：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
async function onPinClick() {
  if (isSticky.value) {
    await dismissSticky();
    return;
  }
  // quicknote 模式：toggle 锁定状态，禁用 / 恢复失焦关闭。
  quicknotePinned.value = !quicknotePinned.value;
  if (quicknotePinned.value && blurTimer) {
    clearTimeout(blurTimer);
    blurTimer = undefined;
  }
}
</script>

<template>
  <!-- 模板区：描述 Floating Editor 的 DOM 层级、可交互区域和条件渲染边界。 -->
  <div class="floating-root">
    <header class="floating-titlebar" @pointerdown="onTitlebarPointerdown">
      <span
        v-if="!titleEditing"
        class="floating-title-readonly"
        :class="{ 'floating-title-empty': !title.trim() }"
        data-testid="floating-title-text"
        @click="onStartTitleEdit"
      >
        {{ displayTitle }}
      </span>
      <NInput
        v-else
        ref="titleInputRef"
        v-model:value="titleDraft"
        size="tiny"
        placeholder="无标题"
        :bordered="false"
        class="floating-title-input"
        data-testid="floating-title-input"
        @pointerdown.stop
        @keydown.enter.prevent="onSaveTitle"
        @keydown.esc.prevent="onCancelTitleEdit"
        @blur="onSaveTitle"
      />
      <NButton
        quaternary
        circle
        size="tiny"
        :title="titleEditing ? '保存标题' : '编辑标题'"
        :data-testid="titleEditing ? 'floating-title-save' : 'floating-title-edit'"
        class="floating-title-action"
        @pointerdown.stop
        @click="titleEditing ? onSaveTitle() : onStartTitleEdit()"
      >
        <template #icon>
          <NIcon>
            <svg v-if="titleEditing" viewBox="0 0 24 24" width="12" height="12" fill="currentColor">
              <path
                d="m9 16.17-3.88-3.88a.996.996 0 1 0-1.41 1.41l4.59 4.59c.39.39 1.02.39 1.41 0L21.7 6.7a.996.996 0 1 0-1.41-1.41z"
              />
            </svg>
            <svg v-else viewBox="0 0 24 24" width="12" height="12" fill="currentColor">
              <path
                d="M3 17.46V21h3.54l10.4-10.4-3.54-3.54L3 17.46zM20.71 7.04a.996.996 0 0 0 0-1.41l-2.34-2.34a.996.996 0 0 0-1.41 0l-1.83 1.83 3.54 3.54 2.04-2.04z"
              />
            </svg>
          </NIcon>
        </template>
      </NButton>
      <div class="floating-titlebar-actions">
        <NButton
          quaternary
          circle
          size="tiny"
          title="保存笔记"
          data-testid="floating-save"
          @pointerdown.stop
          @click="onSaveClick"
        >
          <template #icon>
            <NIcon>
              <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                <path
                  d="M17 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z"
                />
              </svg>
            </NIcon>
          </template>
        </NButton>
        <NButton
          quaternary
          circle
          size="tiny"
          :title="pinButtonTitle"
          :class="{ 'pin-active': !isSticky && quicknotePinned }"
          data-testid="floating-pin"
          @pointerdown.stop
          @click="onPinClick"
        >
          <template #icon>
            <NIcon>
              <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                <path
                  d="M14.4 6 14 4H7.7L7 5.2l3 5.3L7.3 13 4 16.3V17h6.7L12 22l1.3-5h6.7v-.7L16.7 13 14 10.5 17 5.2 16.3 4H14.4z"
                />
              </svg>
            </NIcon>
          </template>
        </NButton>
        <NButton
          quaternary
          circle
          size="tiny"
          title="关闭浮窗"
          data-testid="floating-close"
          @pointerdown.stop
          @click="onCloseClick"
        >
          <template #icon>
            <NIcon>
              <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                <path
                  d="M18.3 5.71 12 12l6.3 6.29-1.41 1.42L12 14.83l-4.89 4.88-1.42-1.42L10.59 12 5.69 7.12 7.11 5.71 12 10.59z"
                />
              </svg>
            </NIcon>
          </template>
        </NButton>
      </div>
    </header>

    <div class="floating-body">
      <MarkdownEditor v-model="content" autofocus placeholder="此刻在想什么？支持 Markdown · #标签 自动识别" />
    </div>

    <footer class="floating-footer">
      <span
        v-if="!tagsEditing"
        class="floating-tags-readonly"
        :class="{ 'floating-tags-empty': tagsArray.length === 0 }"
        data-testid="floating-tags-text"
        @click="onStartTagsEdit"
      >
        {{ displayTags }}
      </span>
      <NInput
        v-else
        ref="tagsInputRef"
        v-model:value="tagsDraft"
        size="tiny"
        :bordered="false"
        placeholder="#tag1 #tag2"
        class="floating-tags-input"
        data-testid="floating-tags-input"
        @keydown.enter.prevent="onSaveTags"
        @keydown.esc.prevent="onCancelTagsEdit"
        @blur="onSaveTags"
      />
      <NButton
        quaternary
        circle
        size="tiny"
        :title="tagsEditing ? '保存标签' : '编辑标签'"
        :data-testid="tagsEditing ? 'floating-tags-save' : 'floating-tags-edit'"
        class="floating-tags-action"
        @click="tagsEditing ? onSaveTags() : onStartTagsEdit()"
      >
        <template #icon>
          <NIcon>
            <svg v-if="tagsEditing" viewBox="0 0 24 24" width="12" height="12" fill="currentColor">
              <path
                d="m9 16.17-3.88-3.88a.996.996 0 1 0-1.41 1.41l4.59 4.59c.39.39 1.02.39 1.41 0L21.7 6.7a.996.996 0 1 0-1.41-1.41z"
              />
            </svg>
            <svg v-else viewBox="0 0 24 24" width="12" height="12" fill="currentColor">
              <path
                d="M3 17.46V21h3.54l10.4-10.4-3.54-3.54L3 17.46zM20.71 7.04a.996.996 0 0 0 0-1.41l-2.34-2.34a.996.996 0 0 0-1.41 0l-1.83 1.83 3.54 3.54 2.04-2.04z"
              />
            </svg>
          </NIcon>
        </template>
      </NButton>
      <div class="floating-footer-meta">
        <NText depth="3" class="floating-meta-item">{{ wordCount }} 字</NText>
        <NText depth="3" class="floating-meta-item" :class="{ 'floating-meta-error': status === 'error' }">
          {{ statusText }}
        </NText>
      </div>
    </footer>
  </div>
</template>

<style scoped>
/* 样式区：限定 Floating Editor 的布局、主题色和响应式细节。 */
.floating-root {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100vw;
  background: #1f1f24;
  color: #e8e8ea;
  border-radius: 8px;
  overflow: hidden;
  font-family: -apple-system, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
}

.floating-titlebar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 4px 4px 10px;
  background: #17171b;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  -webkit-user-select: none;
  user-select: none;
  cursor: grab;
}
.floating-titlebar:active {
  cursor: grabbing;
}

.floating-title-readonly {
  flex: 0 1 auto;
  min-width: 0;
  max-width: 60%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  font-weight: 600;
  color: #e8e8ea;
  cursor: text;
}

.floating-title-empty {
  color: #6f6f78;
  font-weight: 500;
  font-style: italic;
}

.floating-title-input {
  flex: 1;
  min-width: 0;
  background: transparent;
  font-size: 12px;
  color: #cfcfd4;
}
.floating-title-input :deep(input) {
  font-size: 12px;
}

.floating-title-action {
  flex: 0 0 auto;
  color: #8a8a92 !important;
}

.floating-titlebar-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  flex: 0 0 auto;
  margin-left: auto;
}

.pin-active :deep(svg) {
  color: #ff8a4c;
}

.floating-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.floating-footer {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 10px;
  background: #17171b;
  border-top: 1px solid rgba(255, 255, 255, 0.04);
  font-size: 11px;
}

.floating-tags-readonly {
  flex: 0 1 auto;
  min-width: 0;
  max-width: 60%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  color: #cfcfd4;
  cursor: text;
}

.floating-tags-empty {
  color: #6f6f78;
  font-style: italic;
}

.floating-tags-input {
  flex: 0 1 auto;
  min-width: 0;
  max-width: 60%;
  font-size: 11px;
}
.floating-tags-input :deep(input) {
  font-size: 11px;
}

.floating-tags-action {
  flex: 0 0 auto;
  color: #8a8a92 !important;
}

.floating-footer-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  color: #6f6f78;
  white-space: nowrap;
  margin-left: auto;
}
.floating-meta-item {
  font-size: 11px;
}
.floating-meta-error {
  color: #ff6b6b;
}
</style>
