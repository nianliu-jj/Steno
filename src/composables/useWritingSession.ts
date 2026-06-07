import { computed, onMounted, ref, watch, type Ref } from 'vue';

import { useAutosave } from '@/composables/useAutosave';
import { useDb } from '@/composables/useDb';
import { useMarkdown } from '@/composables/useMarkdown';
import { useLibraryStore } from '@/stores/library';
import { useNotesStore } from '@/stores/notes';
import type { Note, SaveDocumentEntryRequest, SaveNoteRequest } from '@/types/steno';
import { extractHeadings } from '@/utils/extractHeadings';

export type WritingMode = 'rich-edit' | 'rich-readonly' | 'source-edit';

export function useWritingSession(initialNoteId: Ref<string | null>) {
  const db = useDb();
  const notes = useNotesStore();
  const library = useLibraryStore();
  const { countWords } = useMarkdown();

  const currentNoteId = ref<string | null>(initialNoteId.value);
  const title = ref('');
  const content = ref('');
  const tags = ref<string[]>([]);
  const loaded = ref(false);
  const mode = ref<WritingMode>('rich-edit');
  const sessionKind = ref<'legacy-note' | 'text' | 'document' | null>(null);
  const documentContext = ref<{ workspaceId: string; folderEntryId: string | null } | null>(null);

  const headings = computed(() => extractHeadings(content.value));
  const wordCount = computed(() => countWords(content.value));

  // 打开/加载完成时的内容基准快照。watch 据此判断是否发生真实修改，
  // 避免"打开未改动直接关闭"也触发保存（无意义地 bump updated_at、移动笔记卡片位置）。
  let initialSnapshot: string | null = null;
  function currentSnapshot(): string {
    return JSON.stringify({ title: title.value, content: content.value, tags: tags.value });
  }

  function hydrateFromNote(note: Note) {
    currentNoteId.value = note.id;
    title.value = note.title;
    content.value = note.content;
    tags.value = [...note.tags];
  }

  onMounted(async () => {
    if (currentNoteId.value) {
      const editorEntry = typeof db.getEditorEntry === 'function'
        ? await db.getEditorEntry(currentNoteId.value)
        : null;
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
            folderEntryId: editorEntry.parentId ?? null,
          };
        }
      } else {
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
        folderEntryId: library.context.folderEntryId ?? null,
      };
    }
    loaded.value = true;
    // hydrate 完成后记录基准快照，使后续异步回填触发的 watch 不被误判为"用户修改"。
    initialSnapshot = currentSnapshot();
  });

  const { status, savedAt, error, scheduleSave, flushSave } = useAutosave(
    async (payload: SaveNoteRequest | SaveDocumentEntryRequest) => {
      if (sessionKind.value === 'document' && documentContext.value && typeof db.saveDocumentEntry === 'function') {
        const saved = await db.saveDocumentEntry({
          id: currentNoteId.value ?? undefined,
          title: title.value || undefined,
          content: content.value,
          tags: tags.value,
          workspaceId: documentContext.value.workspaceId,
          folderEntryId: documentContext.value.folderEntryId,
        });
        if (!currentNoteId.value) {
          currentNoteId.value = saved.id;
        }
        return;
      }

      const saved = await notes.saveDraft(payload as SaveNoteRequest);
      if (saved && !currentNoteId.value) {
        currentNoteId.value = saved.id;
      }
    },
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
      tags: tags.value,
    });
  });

  function toggleReadonly() {
    mode.value = mode.value === 'rich-readonly' ? 'rich-edit' : 'rich-readonly';
  }

  function openSource() {
    mode.value = 'source-edit';
  }

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
    closeSource,
  };
}
