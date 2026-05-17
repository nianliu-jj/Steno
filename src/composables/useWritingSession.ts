import { computed, onMounted, ref, watch, type Ref } from 'vue';

import { useAutosave } from '@/composables/useAutosave';
import { useDb } from '@/composables/useDb';
import { useMarkdown } from '@/composables/useMarkdown';
import { useNotesStore } from '@/stores/notes';
import type { Note, SaveNoteRequest } from '@/types/steno';
import { extractHeadings } from '@/utils/extractHeadings';

export type WritingMode = 'rich-edit' | 'rich-readonly' | 'source-edit';

export function useWritingSession(initialNoteId: Ref<string | null>) {
  const db = useDb();
  const notes = useNotesStore();
  const { countWords } = useMarkdown();

  const currentNoteId = ref<string | null>(initialNoteId.value);
  const title = ref('');
  const content = ref('');
  const tags = ref<string[]>([]);
  const loaded = ref(false);
  const mode = ref<WritingMode>('rich-edit');

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
      const note = await db.getNote(currentNoteId.value);
      if (note) {
        hydrateFromNote(note);
      }
    }
    loaded.value = true;
  });

  const { status, savedAt, error, scheduleSave, flushSave } = useAutosave(
    async (payload: SaveNoteRequest) => {
      const saved = await notes.saveDraft(payload);
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
