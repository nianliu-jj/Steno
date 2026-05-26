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
        sessionKind.value = editorEntry.kind;
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
        folderEntryId: library.context.folderEntryId,
      };
    }
    loaded.value = true;
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
