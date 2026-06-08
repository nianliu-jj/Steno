/**
 * @file 通用自动保存调度器
 *
 * 提供 debounce 式自动保存能力，供 FloatingEditor / NoteEditorView / ZenMode 等
 * 编辑器视图复用。核心思路：每次输入排进队列（重置计时器），定时器到期后触发
 * 保存函数。支持立即 flush（失焦 / 卸载时）。
 *
 * **注意**：调用方负责"空内容丢弃"判断，这里只做纯 debounce 调度，不做内容判定。
 *
 * @example 典型用法
 * ```ts
 * const { status, savedAt, error, scheduleSave, flushSave } =
 *   useAutosave((input) => db.saveNote(input));
 *
 * watch(content, () => scheduleSave({ id, content, tags, ... }));
 * onUnmounted(() => flushSave());
 * ```
 */

import { ref, shallowRef } from 'vue';

/**
 * 自动保存状态机。
 *
 * ```
 * idle → scheduled → saving → saved
 *                  → saving → error
 * ```
 */
export type AutosaveStatus = 'idle' | 'scheduled' | 'saving' | 'saved' | 'error';

/** 自动保存配置选项。 */
export interface UseAutosaveOptions {
  /**
   * Debounce 间隔（毫秒）。
   *
   * 每次 `scheduleSave` 调用会重置计时器；只有连续 `delayMs` 毫秒无新输入后
   * 才真正触发保存。默认 1000ms。
   */
  delayMs?: number;
}

/**
 * 创建自动保存调度器。
 *
 * @typeParam TInput - 传给 `saver` 的数据类型（如 `SaveNoteRequest`）
 * @param saver - 保存函数，把输入数据转成 Promise。调用方负责 IPC 调用和错误处理。
 * @param options - 可选配置
 * @returns `{ status, savedAt, error, scheduleSave, flushSave }`
 *
 * @example
 * ```ts
 * const { scheduleSave, flushSave, status } = useAutosave<SaveNoteRequest>(
 *   async (payload) => { await notes.saveDraft(payload); }
 * );
 * // 输入变化时排入队列
 * scheduleSave({ id, content: '...', tags: [] });
 * // 组件卸载/失焦时立即保存
 * await flushSave();
 * ```
 */
export function useAutosave<TInput>(saver: (input: TInput) => Promise<unknown>, options: UseAutosaveOptions = {}) {
  // 局部常量 delayMs：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const delayMs = options.delayMs ?? 1000;
  /** 当前保存状态。UI 可据此显示"编辑中…" / "已保存" / "保存失败"。 */
  const status = ref<AutosaveStatus>('idle');
  /** 上次成功保存的时间。UI 可据此显示"已保存 14:32"。 */
  const savedAt = ref<Date | null>(null);
  /**
   * 最近一次保存失败的错误对象。
   * 使用 `shallowRef` — 错误对象本身不可变，不需要深层响应式。
   */
  const error = shallowRef<unknown>(null);

  /** Debounce 定时器句柄；`undefined` 表示无待执行任务。 */
  let timer: ReturnType<typeof setTimeout> | undefined;
  /**
   * 当前排队的待保存数据。
   * 每次 `scheduleSave` 会覆盖它 — 总是只保存最新版本，中间态丢弃。
   */
  let pending: TInput | undefined;

  /**
   * 执行实际保存。
   *
   * 内部函数，由定时器或 `flushSave` 触发；不直接暴露给调用方。
   */
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

  /**
   * 把最新输入排入保存队列。
   *
   * 每次调用会重置 debounce 计时器 — 只有用户停止输入 `delayMs` 毫秒后才真正保存。
   * 这是一种"尾调用节流"模式：中间状态全部丢弃，只保存最终版本。
   *
   * @param input - 待保存的数据
   */
  function scheduleSave(input: TInput) {
    pending = input;
    status.value = 'scheduled';
    if (timer) {
      clearTimeout(timer); // 重置计时器 — 只要有新输入就推迟保存
    }
    timer = setTimeout(() => {
      timer = undefined;
      if (pending !== undefined) {
        // 局部常量 next：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
        const next = pending;
        pending = undefined;
        void fire(next); // void: fire 的 Promise 不需要 await，错误已在内部 catch
      }
    }, delayMs);
  }

  /**
   * 立即清掉计时器并保存当前 pending 数据。
   *
   * 用于 `onUnmounted` / 失焦保存 / 手动保存按钮等场景。
   * 与 `scheduleSave` 不同：不走 debounce，立即执行。
   *
   * @returns Promise，等待保存完成后 resolve
   */
  async function flushSave() {
    if (timer) {
      clearTimeout(timer);
      timer = undefined;
    }
    if (pending !== undefined) {
      // 局部常量 next：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
      const next = pending;
      pending = undefined;
      await fire(next);
    }
  }

  return { status, savedAt, error, scheduleSave, flushSave };
}
