// 通用自动保存调度器。
//
// 用法（典型 FloatingEditor / StickyNote）：
//
//   const { status, savedAt, error, scheduleSave, flushSave } =
//     useAutosave((input) => db.saveNote(input));
//
//   watch(content, () => scheduleSave({ id, content, tags, ... }));
//   onUnmounted(() => flushSave());
//
// 1000ms debounce。第一次输入算"dirty + scheduled"；定时器到期触发 saver。
// saver 抛错时 status='error' 并把错误对象记到 error.value，方便 UI 显示。
//
// 注意：调用方负责把"空内容丢弃"判断放在自己手里（plan 5.5），这里只是单纯的
// debounce 调度器，不做内容判定。

import { ref, shallowRef } from 'vue';

export type AutosaveStatus = 'idle' | 'scheduled' | 'saving' | 'saved' | 'error';

export interface UseAutosaveOptions {
  /** debounce 间隔毫秒。默认 1000。 */
  delayMs?: number;
}

/**
 * @param saver 把"待保存内容"转成 Promise。saver 自身只关心如何把数据扔给后端。
 */
export function useAutosave<TInput>(
  saver: (input: TInput) => Promise<unknown>,
  options: UseAutosaveOptions = {},
) {
  const delayMs = options.delayMs ?? 1000;
  const status = ref<AutosaveStatus>('idle');
  const savedAt = ref<Date | null>(null);
  const error = shallowRef<unknown>(null);

  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: TInput | undefined;

  async function fire(input: TInput) {
    status.value = 'saving';
    try {
      await saver(input);
      status.value = 'saved';
      savedAt.value = new Date();
      error.value = null;
    } catch (e) {
      status.value = 'error';
      error.value = e;
    }
  }

  /** 把最新一次输入排进队列；过 delayMs 后触发 saver。期间再调就重置计时器。 */
  function scheduleSave(input: TInput) {
    pending = input;
    status.value = 'scheduled';
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      timer = undefined;
      if (pending !== undefined) {
        const next = pending;
        pending = undefined;
        void fire(next);
      }
    }, delayMs);
  }

  /** 立刻清掉计时器并把 pending 立刻丢给 saver（onUnmounted / 失焦保存 用）。 */
  async function flushSave() {
    if (timer) {
      clearTimeout(timer);
      timer = undefined;
    }
    if (pending !== undefined) {
      const next = pending;
      pending = undefined;
      await fire(next);
    }
  }

  return { status, savedAt, error, scheduleSave, flushSave };
}
