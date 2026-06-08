/**
 * @file Vue 组合式逻辑 - use Writing Session
 *
 * 组织 use Writing Session 的核心逻辑、类型和协作边界，供 Vue 组合式逻辑 模块复用。
 * 注释重点标明数据入口、状态边界、事件通道和协作风险点，便于逐行阅读时快速判断代码意图。
 */

import { computed, onMounted, ref, watch, type Ref } from 'vue';

import { useAutosave } from '@/composables/useAutosave';
import { useDb } from '@/composables/useDb';
import { useMarkdown } from '@/composables/useMarkdown';
import { useLibraryStore } from '@/stores/library';
import { useNotesStore } from '@/stores/notes';
import type { Note, SaveDocumentEntryRequest, SaveNoteRequest } from '@/types/steno';
import { extractHeadings } from '@/utils/extractHeadings';

// 类型 WritingMode：记录模块边界的数据形状，帮助调用方理解字段来源和约束。
export type WritingMode = 'rich-edit' | 'rich-readonly' | 'source-edit';

// 函数 useWritingSession：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
export function useWritingSession(initialNoteId: Ref<string | null>) {
  // 局部常量 db：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const db = useDb();
  // 局部常量 notes：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const notes = useNotesStore();
  // 局部常量 library：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const library = useLibraryStore();
  const { countWords } = useMarkdown();

  // 局部常量 currentNoteId：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const currentNoteId = ref<string | null>(initialNoteId.value);
  // 局部常量 title：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const title = ref('');
  // 局部常量 content：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const content = ref('');
  // 局部常量 tags：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const tags = ref<string[]>([]);
  // 局部常量 loaded：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const loaded = ref(false);
  // 局部常量 mode：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const mode = ref<WritingMode>('rich-edit');
  // 局部常量 sessionKind：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const sessionKind = ref<'legacy-note' | 'text' | 'document' | null>(null);
  // 局部常量 documentContext：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const documentContext = ref<{ workspaceId: string; folderEntryId: string | null } | null>(null);

  // 局部常量 headings：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const headings = computed(() => extractHeadings(content.value));
  // 局部常量 wordCount：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const wordCount = computed(() => countWords(content.value));

  // 打开/加载完成时的内容基准快照。watch 据此判断是否发生真实修改，
  // 避免"打开未改动直接关闭"也触发保存（无意义地 bump updated_at、移动笔记卡片位置）。
  let initialSnapshot: string | null = null;
  // 函数 currentSnapshot：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
  function currentSnapshot(): string {
    return JSON.stringify({ title: title.value, content: content.value, tags: tags.value });
  }

  // 函数 hydrateFromNote：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
  function hydrateFromNote(note: Note) {
    currentNoteId.value = note.id;
    title.value = note.title;
    content.value = note.content;
    tags.value = [...note.tags];
  }

  onMounted(async () => {
    if (currentNoteId.value) {
      // 局部常量 editorEntry：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
      const editorEntry = typeof db.getEditorEntry === 'function' ? await db.getEditorEntry(currentNoteId.value) : null;
      if (editorEntry) {
        currentNoteId.value = editorEntry.id;
        title.value = editorEntry.title;
        content.value = editorEntry.content;
        tags.value = [...editorEntry.tags];
        if (editorEntry.kind === 'text' || editorEntry.kind === 'document') {
          sessionKind.value = editorEntry.kind;
        }
        if (editorEntry.kind === 'document' && editorEntry.workspaceId) {
          documentContext.value = {
            workspaceId: editorEntry.workspaceId,
            folderEntryId: editorEntry.parentId ?? null
          };
        }
      } else {
        // 局部常量 note：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
        const note = await db.getNote(currentNoteId.value);
        if (note) {
          hydrateFromNote(note);
          sessionKind.value = 'legacy-note';
        }
      }
    } else if (library.context.workspaceId) {
      sessionKind.value = 'document';
      documentContext.value = {
        workspaceId: library.context.workspaceId,
        folderEntryId: library.context.folderEntryId ?? null
      };
    }
    loaded.value = true;
    // hydrate 完成后记录基准快照，使后续异步回填触发的 watch 不被误判为"用户修改"。
    initialSnapshot = currentSnapshot();
  });

  const { status, savedAt, error, scheduleSave, flushSave } = useAutosave(
    async (payload: SaveNoteRequest | SaveDocumentEntryRequest) => {
      if (sessionKind.value === 'document' && documentContext.value && typeof db.saveDocumentEntry === 'function') {
        // 局部常量 saved：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
        const saved = await db.saveDocumentEntry({
          id: currentNoteId.value ?? undefined,
          title: title.value || undefined,
          content: content.value,
          tags: tags.value,
          workspaceId: documentContext.value.workspaceId,
          folderEntryId: documentContext.value.folderEntryId
        });
        if (!currentNoteId.value) {
          currentNoteId.value = saved.id;
        }
        return;
      }

      // 局部常量 saved：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
      const saved = await notes.saveDraft(payload as SaveNoteRequest);
      if (saved && !currentNoteId.value) {
        currentNoteId.value = saved.id;
      }
    }
  );

  watch([title, content, tags], () => {
    if (!loaded.value) return;
    // 内容相对打开时的基准未发生变化（含异步 hydrate 回填）则跳过保存，
    // 确保"打开未改动直接关闭"不会更新修改时间、不移动笔记卡片位置。
    if (initialSnapshot !== null && currentSnapshot() === initialSnapshot) return;
    scheduleSave({
      id: currentNoteId.value ?? undefined,
      title: title.value || undefined,
      content: content.value,
      tags: tags.value
    });
  });

  // 函数 toggleReadonly：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
  function toggleReadonly() {
    mode.value = mode.value === 'rich-readonly' ? 'rich-edit' : 'rich-readonly';
  }

  // 函数 openSource：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
  function openSource() {
    mode.value = 'source-edit';
  }

  // 函数 closeSource：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
  function closeSource() {
    mode.value = 'rich-edit';
  }

  return {
    currentNoteId,
    title,
    content,
    tags,
    loaded,
    mode,
    headings,
    wordCount,
    status,
    savedAt,
    error,
    flushSave,
    toggleReadonly,
    openSource,
    closeSource
  };
}
