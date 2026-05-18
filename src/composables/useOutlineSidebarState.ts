import { computed, ref } from 'vue';

import { useSettingsStore } from '@/stores/settings';

type OutlineScope = 'note-editor' | 'zen';

const COLLAPSE_THRESHOLD = 96;
const MIN_EXPANDED_WIDTH = 240;
const MAX_WIDTH = 420;

export function useOutlineSidebarState(scope: OutlineScope) {
  const settings = useSettingsStore();

  const open = ref(
    scope === 'note-editor'
      ? settings.state.noteEditorOutlineOpen
      : settings.state.zenOutlineOpen,
  );
  const width = ref(
    scope === 'note-editor'
      ? settings.state.noteEditorOutlineWidth
      : settings.state.zenOutlineWidth,
  );

  const canResize = computed(() => open.value);

  async function persist() {
    await settings.update(
      scope === 'note-editor' ? 'noteEditorOutlineOpen' : 'zenOutlineOpen',
      open.value,
    );
    await settings.update(
      scope === 'note-editor' ? 'noteEditorOutlineWidth' : 'zenOutlineWidth',
      width.value,
    );
  }

  function setWidth(next: number) {
    if (next < COLLAPSE_THRESHOLD) {
      open.value = false;
      void persist();
      return;
    }
    open.value = true;
    width.value = Math.max(
      MIN_EXPANDED_WIDTH,
      Math.min(MAX_WIDTH, Math.round(next)),
    );
    void persist();
  }

  function reopen() {
    open.value = true;
    width.value = Math.max(width.value, MIN_EXPANDED_WIDTH);
    void persist();
  }

  function toggle() {
    if (open.value) {
      open.value = false;
      void persist();
      return;
    }
    reopen();
  }

  return { open, width, canResize, setWidth, reopen, toggle, persist };
}
