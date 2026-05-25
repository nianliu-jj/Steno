import { ref } from 'vue';

/**
 * 布尔状态管理 Hook。
 *
 * 封装常见的布尔操作：设置、设为 true、设为 false、切换。
 *
 * @param initValue - 初始值，默认 `false`
 * @returns `{ bool, setBool, setTrue, setFalse, toggle }`
 *
 * @example
 * ```ts
 * const { bool: visible, setTrue: open, setFalse: close, toggle } = useBoolean();
 * open();  // visible.value = true
 * close(); // visible.value = false
 * toggle(); // 切换
 * ```
 */
export default function useBoolean(initValue = false) {
  const bool = ref(initValue);

  /** 直接设置布尔值。 */
  function setBool(value: boolean) {
    bool.value = value;
  }
  /** 设为 `true`。 */
  function setTrue() {
    setBool(true);
  }
  /** 设为 `false`。 */
  function setFalse() {
    setBool(false);
  }
  /** 切换当前值。 */
  function toggle() {
    setBool(!bool.value);
  }

  return {
    bool,
    setBool,
    setTrue,
    setFalse,
    toggle
  };
}
