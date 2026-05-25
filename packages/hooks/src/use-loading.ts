import useBoolean from './use-boolean';

/**
 * 加载状态管理 Hook — 基于 `useBoolean` 的语义化封装。
 *
 * 提供 `loading` 状态和 `startLoading` / `endLoading` 方法，
 * 适合在异步请求前后使用。
 *
 * @param initValue - 初始加载状态，默认 `false`
 * @returns `{ loading, startLoading, endLoading }`
 *
 * @example
 * ```ts
 * const { loading, startLoading, endLoading } = useLoading();
 * async function fetchData() {
 *   startLoading();
 *   try {
 *     await api.get('/data');
 *   } finally {
 *     endLoading();
 *   }
 * }
 * ```
 */
export default function useLoading(initValue = false) {
  const { bool: loading, setTrue: startLoading, setFalse: endLoading } = useBoolean(initValue);

  return {
    loading,
    startLoading,
    endLoading
  };
}
