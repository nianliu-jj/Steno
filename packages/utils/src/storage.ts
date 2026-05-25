/**
 * @file 浏览器存储抽象层
 *
 * 提供两类存储封装：
 * - `createStorage` — 基于 `localStorage` / `sessionStorage` 的 typed key-value 存储
 * - `createLocalforage` — 基于 localforage 的异步存储（支持 IndexedDB / WebSQL 等后端）
 */

import localforage from 'localforage';

/** 存储类型：`local`（持久化）或 `session`（会话级别）。 */
export type StorageType = 'local' | 'session';

/**
 * 创建 typed key-value 存储实例。
 *
 * 所有值通过 `JSON.stringify` / `JSON.parse` 进行序列化/反序列化。
 * 键名自动添加 `storagePrefix` 前缀，避免与其它存储项冲突。
 *
 * **`get` 的清理策略**：若 `JSON.parse` 成功后结果为 `null`，
 * 自动 `removeItem` — 这是为了防止 `"null"` 字符串被错误保留。
 *
 * @typeParam T - 存储的键值类型映射
 * @param type - 存储类型（`local` 或 `session`）
 * @param storagePrefix - 键名前缀（如 `"steno_"`）
 * @returns `{ set, get, remove, clear }` 操作对象
 *
 * @example
 * ```ts
 * interface MyStore { token: string; theme: 'light' | 'dark'; }
 * const store = createStorage<MyStore>('local', 'app_');
 * store.set('token', 'abc123');
 * const token = store.get('token'); // 'abc123'
 * ```
 */
export function createStorage<T extends object>(type: StorageType, storagePrefix: string) {
  const stg = type === 'session' ? window.sessionStorage : window.localStorage;

  const storage = {
    /**
     * 设置存储项。
     *
     * @param key - 键名（会自动添加前缀）
     * @param value - 键值（会被 JSON.stringify）
     */
    set<K extends keyof T>(key: K, value: T[K]) {
      const json = JSON.stringify(value);
      stg.setItem(`${storagePrefix}${key as string}`, json);
    },
    /**
     * 获取存储项。
     *
     * @param key - 键名
     * @returns 反序列化后的值；不存在或解析失败返回 `null`
     */
    get<K extends keyof T>(key: K): T[K] | null {
      const json = stg.getItem(`${storagePrefix}${key as string}`);
      if (json) {
        let storageData: T[K] | null = null;
        try {
          storageData = JSON.parse(json);
        } catch {}

        // `storageData` 可能为 `false`（布尔类型），需要用 `!== null` 而非 truthy 判断
        if (storageData !== null) {
          return storageData as T[K];
        }
      }
      // JSON 解析失败或结果为 null → 清理无效数据
      stg.removeItem(`${storagePrefix}${key as string}`);
      return null;
    },
    /** 删除指定存储项。 */
    remove(key: keyof T) {
      stg.removeItem(`${storagePrefix}${key as string}`);
    },
    /** 清空所有存储项（注意：会清空同一 storage 下的所有 key，不限于当前前缀）。 */
    clear() {
      stg.clear();
    }
  };
  return storage;
}

/** localforage 的 typed 包装类型 — 覆盖 getItem/setItem/removeItem 的类型签名。 */
type LocalForage<T extends object> = Omit<typeof localforage, 'getItem' | 'setItem' | 'removeItem'> & {
  getItem<K extends keyof T>(key: K, callback?: (err: any, value: T[K] | null) => void): Promise<T[K] | null>;
  setItem<K extends keyof T>(key: K, value: T[K], callback?: (err: any, value: T[K]) => void): Promise<T[K]>;
  removeItem(key: keyof T, callback?: (err: any) => void): Promise<void>;
};

/** localforage 支持的存储驱动类型。 */
type LocalforageDriver = 'local' | 'indexedDB' | 'webSQL';

/**
 * 创建 typed localforage 实例。
 *
 * 配置指定的存储驱动（localStorage / IndexedDB / WebSQL），
 * 返回带有正确类型的 localforage 实例。
 *
 * @typeParam T - 存储的键值类型映射
 * @param driver - 存储驱动类型
 * @returns typed localforage 实例
 */
export function createLocalforage<T extends object>(driver: LocalforageDriver) {
  const driverMap: Record<LocalforageDriver, string> = {
    local: localforage.LOCALSTORAGE,
    indexedDB: localforage.INDEXEDDB,
    webSQL: localforage.WEBSQL
  };

  localforage.config({
    driver: driverMap[driver]
  });

  return localforage as LocalForage<T>;
}
