# 剪贴板图片原地编辑器 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把剪贴板图片预览框改成无遮罩、可拖动缩放的模态编辑器，支持裁剪/旋转/翻转/缩放/基础调整，编辑结果默认存为新条目。

**Architecture:** 纯前端 canvas 编辑引擎。每步编辑建模为可序列化 `EditOp`；纯像素/几何数学放 `utils/imageOps.ts`（node 可测），canvas 渲染胶水放 `utils/canvasRender.ts`（mock ctx 测），操作栈放 `composables/useImageEditor.ts`（无 canvas 依赖、可测），模态框拖动/缩放放 `composables/useDraggableResizable.ts`。后端新增两个薄命令：`add_image_clipboard_entry`（B 存新条目）、`copy_edited_image_to_clipboard`（复制到系统剪贴板）。

**Tech Stack:** Vue 3 `<script setup>` + TypeScript + Pinia + vitest/@vue/test-utils（jsdom）；Tauri 2 + Rust（arboard + image crate，已在用）。

**Spec:** `docs/superpowers/specs/2026-06-01-clipboard-image-editor-design.md`

> **测试约定**（沿用现有）：组件/store 测试首行加 `// @vitest-environment jsdom`；`vi.mock('@tauri-apps/api/event')`、`vi.mock('@/composables/useDb')`；`mount()` 后 `await vi.dynamicImportSettled()`；用 `data-testid` 查询。纯函数/composable 测试不需要 jsdom。
> **运行**：前端 `pnpm test -- <文件>`（vitest）；后端 `cd src-tauri && cargo test <名>`。每个任务最后 `pnpm typecheck` 应通过。

---

## 任务总览

| # | 任务 | 主要产物 |
|---|------|----------|
| 1 | 后端：`add_image_clipboard_entry` 命令 | commands.rs, lib.rs, db.rs 测试 |
| 2 | 后端：`copy_edited_image_to_clipboard` 命令 + helper | clipboard.rs, commands.rs, lib.rs |
| 3 | 前端：useDb 封装 + store `addImageEntry` action | useDb.ts, stores/clipboard.ts(+test) |
| 4 | 前端纯工具：`imageOps.ts`（像素+几何数学） | utils/imageOps.ts(+test) |
| 5 | 前端：`useDraggableResizable` composable | composables/(+test) |
| 6 | 前端：`useImageEditor` 操作栈 composable | composables/(+test) |
| 7 | 前端：`canvasRender.ts` canvas 渲染胶水 | utils/canvasRender.ts(+test) |
| 8 | 前端：`ClipboardImageEditor.vue` 模态外壳 | components/clipboard/(+test) |
| 9 | 前端：工具栏（变换+历史）接线 | 同上(+test) |
| 10 | 前端：裁剪选框 + 调整面板接线 | 同上(+test) |
| 11 | 前端：保存(B)/复制 + 错误处理 | 同上(+test) |
| 12 | 前端：接入 ClipboardView（替换旧预览） | views/ClipboardView.vue(+test) |

---

## Task 1: 后端 — `add_image_clipboard_entry` 命令（B 存新条目）

**Files:**
- Modify: `src-tauri/src/commands.rs`（新增命令，紧随 `update_clipboard_entry` 之后）
- Modify: `src-tauri/src/lib.rs`（`invoke_handler!` 注册）
- Test: `src-tauri/src/db.rs`（新增单测验证图片 data URL 入库路径）

- [ ] **Step 1: 写失败测试**（db.rs 的 `#[cfg(test)] mod tests` 内追加）

```rust
#[test]
fn upsert_image_entry_from_data_url_inserts_image_row() {
    let db = Db::open_in_memory().expect("db");
    let data_url = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB".to_string();
    let input = crate::clipboard::image_entry_from_data_url(data_url.clone()).expect("image entry");

    let saved = db.upsert_clipboard_entry(input).expect("saved");

    assert_eq!(saved.content_type, "image");
    assert_eq!(saved.preview, "图片内容");
    assert_eq!(saved.content, data_url);
}
```

> 若 `Db::open_in_memory` 名称不同，参照同文件其它测试（如 `upsert_clipboard_entry_inserts_and_deduplicates_by_hash`，约 db.rs:2699）使用相同的内存库构造方式。

- [ ] **Step 2: 运行测试确认失败/通过基线**

Run: `cd src-tauri && cargo test upsert_image_entry_from_data_url -- --nocapture`
Expected: 编译通过且测试通过（该路径已存在）。若失败，说明 `image_entry_from_data_url` 或 `upsert_clipboard_entry` 行为与预期不符，先修测试断言对齐现状再继续。

- [ ] **Step 3: 新增命令**（commands.rs，紧随 `update_clipboard_entry` 函数之后）

```rust
#[tauri::command]
pub async fn add_image_clipboard_entry(
    app: AppHandle,
    db: State<'_, Db>,
    data_url: String,
) -> Result<ClipboardEntry, String> {
    let entry = clipboard::image_entry_from_data_url(data_url)
        .ok_or_else(|| "无效的图片数据".to_string())?;
    let db = db.inner().clone();
    let saved = tauri::async_runtime::spawn_blocking(move || db.upsert_clipboard_entry(entry))
        .await
        .map_err(to_msg)?
        .map_err(to_msg)?;
    let _ = app.emit(clipboard::CLIPBOARD_UPDATED_EVENT, saved.clone());
    Ok(saved)
}
```

> 检查 commands.rs 顶部已 `use` 了 `clipboard`、`ClipboardEntry`、`AppHandle`、`State`、`Emitter`(`app.emit`)、`to_msg`。`update_clipboard_entry` 已用到这些，照抄其 use 即可。

- [ ] **Step 4: 注册命令**（lib.rs 的 `tauri::generate_handler![ ... ]` 列表中，`update_clipboard_entry,` 旁边加一行）

```rust
            commands::add_image_clipboard_entry,
```

- [ ] **Step 5: 编译 + 测试**

Run: `cd src-tauri && cargo test upsert_image_entry_from_data_url && cargo build`
Expected: 编译通过，测试 PASS。

- [ ] **Step 6: 提交**

```bash
git add src-tauri/src/commands.rs src-tauri/src/lib.rs src-tauri/src/db.rs
git commit -m "feat: 新增 add_image_clipboard_entry 命令存储编辑后的剪贴板图片"
```

---

## Task 2: 后端 — `copy_edited_image_to_clipboard` 命令 + helper

**Files:**
- Modify: `src-tauri/src/clipboard.rs`（新增 `write_image_data_url_to_system_clipboard` helper + 单测）
- Modify: `src-tauri/src/commands.rs`（新增命令）
- Modify: `src-tauri/src/lib.rs`（注册）

- [ ] **Step 1: 写失败测试**（clipboard.rs 测试模块内）

```rust
#[test]
fn image_data_url_to_arboard_rejects_non_image() {
    assert!(image_data_url_to_arboard("data:text/plain;base64,AAAA").is_err());
}
```

> 仅测可在无显示环境运行的解析 helper；`set_image` 需要真实剪贴板上下文，不在 CI 单测。

- [ ] **Step 2: 运行确认失败**

Run: `cd src-tauri && cargo test image_data_url_to_arboard_rejects_non_image`
Expected: 若现有 `image_data_url_to_arboard` 对非图片已返回 Err 则 PASS；否则按其实现调整断言。

- [ ] **Step 3: 新增 helper**（clipboard.rs，紧随 `write_entry_to_system_clipboard` 之后）

```rust
pub fn write_image_data_url_to_system_clipboard(data_url: &str) -> Result<(), String> {
    let mut clipboard = Clipboard::new().map_err(|e| e.to_string())?;
    let image = image_data_url_to_arboard(data_url)?;
    clipboard.set_image(image).map_err(|e| e.to_string())
}
```

- [ ] **Step 4: 新增命令**（commands.rs）

```rust
#[tauri::command]
pub async fn copy_edited_image_to_clipboard(data_url: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        clipboard::write_image_data_url_to_system_clipboard(&data_url)
    })
    .await
    .map_err(to_msg)?
}
```

- [ ] **Step 5: 注册命令**（lib.rs handler 列表）

```rust
            commands::copy_edited_image_to_clipboard,
```

- [ ] **Step 6: 编译 + 测试**

Run: `cd src-tauri && cargo test image_data_url_to_arboard_rejects_non_image && cargo build`
Expected: PASS + 编译通过。

- [ ] **Step 7: 提交**

```bash
git add src-tauri/src/clipboard.rs src-tauri/src/commands.rs src-tauri/src/lib.rs
git commit -m "feat: 新增 copy_edited_image_to_clipboard 命令将编辑结果写入系统剪贴板"
```

---

## Task 3: 前端 — useDb 封装 + store `addImageEntry` action

**Files:**
- Modify: `src/composables/useDb.ts`（加两个 invoke 封装并导出）
- Modify: `src/stores/clipboard.ts`（加 `addImageEntry` action）
- Test: `src/stores/clipboard.test.ts`

- [ ] **Step 1: 写失败测试**（clipboard.test.ts 内）

先在文件顶部 mock 对象区追加：

```ts
const addImageClipboardEntry = vi.fn<(dataUrl: string) => Promise<ClipboardEntry>>();
```

在 `vi.mock('@/composables/useDb', ...)` 的返回对象里加入 `addImageClipboardEntry,`。
在 `beforeEach` 里加 `addImageClipboardEntry.mockReset();`。
然后新增用例：

```ts
it('adds an edited image as a new entry and upserts it locally', async () => {
  const imageEntry: ClipboardEntry = {
    id: 'img-9',
    contentType: 'image',
    content: 'data:image/png;base64,iVBORw0KGgo=',
    htmlContent: null,
    preview: '图片内容',
    createdAt: '2026-06-01T00:00:00Z',
    updatedAt: '2026-06-01T00:00:00Z',
    sizeBytes: 40,
  };
  addImageClipboardEntry.mockResolvedValue(imageEntry);

  const store = useClipboardStore();
  const result = await store.addImageEntry('data:image/png;base64,iVBORw0KGgo=');

  expect(addImageClipboardEntry).toHaveBeenCalledWith('data:image/png;base64,iVBORw0KGgo=');
  expect(result).toEqual(imageEntry);
  expect(store.entries[0]).toEqual(imageEntry);
});
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm test -- src/stores/clipboard.test.ts`
Expected: FAIL（`store.addImageEntry is not a function`）。

- [ ] **Step 3: useDb 加封装**（useDb.ts，clipboard 区，`updateClipboardEntry` 附近）

```ts
  function addImageClipboardEntry(dataUrl: string) {
    return invoke<ClipboardEntry>('add_image_clipboard_entry', { dataUrl });
  }

  function copyEditedImageToClipboard(dataUrl: string) {
    return invoke<void>('copy_edited_image_to_clipboard', { dataUrl });
  }
```

并在 `useDb()` 的 `return { ... }` 中加入 `addImageClipboardEntry,` 与 `copyEditedImageToClipboard,`。

- [ ] **Step 4: store 加 action**（clipboard.ts，仿 `updateEntry` 模式，放其后）

```ts
  async function addImageEntry(dataUrl: string) {
    const entry = await db.addImageClipboardEntry(dataUrl);
    upsertLocal(entry);
    return entry;
  }
```

并在 store 的 `return { ... }` 中加入 `addImageEntry,`。

- [ ] **Step 5: 运行测试**

Run: `pnpm test -- src/stores/clipboard.test.ts`
Expected: PASS。

- [ ] **Step 6: typecheck + 提交**

```bash
pnpm typecheck
git add src/composables/useDb.ts src/stores/clipboard.ts src/stores/clipboard.test.ts
git commit -m "feat: store 与 useDb 支持新增图片条目与复制编辑结果"
```

---

## Task 4: 前端纯工具 — `imageOps.ts`（像素 + 几何数学）

**Files:**
- Create: `src/utils/imageOps.ts`
- Test: `src/utils/imageOps.test.ts`

- [ ] **Step 1: 写失败测试**（imageOps.test.ts，纯 node，无需 jsdom）

```ts
import { describe, expect, it } from 'vitest';

import {
  applyAdjustments,
  clampCropRect,
  computeOutputSize,
  NEUTRAL_ADJUST,
  type EditOp,
} from './imageOps';

describe('applyAdjustments', () => {
  it('returns identical pixels for neutral params', () => {
    const out = applyAdjustments(new Uint8ClampedArray([10, 20, 30, 255]), NEUTRAL_ADJUST);
    expect(Array.from(out)).toEqual([10, 20, 30, 255]);
  });

  it('inverts colors and preserves alpha', () => {
    const out = applyAdjustments(new Uint8ClampedArray([0, 0, 0, 128]), { ...NEUTRAL_ADJUST, invert: true });
    expect(Array.from(out)).toEqual([255, 255, 255, 128]);
  });

  it('raises black to white at +100 brightness', () => {
    const out = applyAdjustments(new Uint8ClampedArray([0, 0, 0, 255]), { ...NEUTRAL_ADJUST, brightness: 100 });
    expect(Array.from(out)).toEqual([255, 255, 255, 255]);
  });

  it('collapses to luma on grayscale', () => {
    const out = applyAdjustments(new Uint8ClampedArray([255, 0, 0, 255]), { ...NEUTRAL_ADJUST, grayscale: true });
    expect(Array.from(out)).toEqual([76, 76, 76, 255]);
  });
});

describe('computeOutputSize', () => {
  it('crop sets size to rect', () => {
    const ops: EditOp[] = [{ type: 'crop', rect: { x: 0, y: 0, w: 100, h: 50 } }];
    expect(computeOutputSize(ops, 200, 200)).toEqual({ w: 100, h: 50 });
  });

  it('rotate 90 swaps dimensions', () => {
    expect(computeOutputSize([{ type: 'rotate', deg: 90 }], 200, 100)).toEqual({ w: 100, h: 200 });
  });

  it('rotate 180 keeps dimensions', () => {
    expect(computeOutputSize([{ type: 'rotate', deg: 180 }], 200, 100)).toEqual({ w: 200, h: 100 });
  });

  it('chains crop then rotate 90', () => {
    const ops: EditOp[] = [
      { type: 'crop', rect: { x: 0, y: 0, w: 100, h: 50 } },
      { type: 'rotate', deg: 90 },
    ];
    expect(computeOutputSize(ops, 200, 200)).toEqual({ w: 50, h: 100 });
  });
});

describe('clampCropRect', () => {
  it('clamps rect within bounds', () => {
    expect(clampCropRect({ x: -10, y: 5, w: 9999, h: 20 }, 100, 100)).toEqual({ x: 0, y: 5, w: 100, h: 20 });
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm test -- src/utils/imageOps.test.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现 imageOps.ts**

```ts
export interface AdjustParams {
  /** -100..100，0 = 不变 */
  brightness: number;
  contrast: number;
  saturation: number;
  grayscale: boolean;
  invert: boolean;
}

export const NEUTRAL_ADJUST: AdjustParams = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
  grayscale: false,
  invert: false,
};

export interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type EditOp =
  | { type: 'crop'; rect: CropRect }
  | { type: 'rotate'; deg: number } // 本期 UI 仅 ±90° 步进；模型支持任意角(预留)
  | { type: 'flip'; axis: 'h' | 'v' }
  | { type: 'resize'; w: number; h: number }
  | { type: 'adjust'; params: AdjustParams };

const LUMA_R = 0.299;
const LUMA_G = 0.587;
const LUMA_B = 0.114;

/** 逐像素应用基础调整，返回新数组（不修改入参）。Uint8ClampedArray 自动裁剪到 0..255。 */
export function applyAdjustments(data: Uint8ClampedArray, p: AdjustParams): Uint8ClampedArray {
  const out = new Uint8ClampedArray(data.length);
  const bright = (p.brightness / 100) * 255;
  const cf = 1 + p.contrast / 100;
  const sf = 1 + p.saturation / 100;

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];

    r += bright;
    g += bright;
    b += bright;

    r = (r - 128) * cf + 128;
    g = (g - 128) * cf + 128;
    b = (b - 128) * cf + 128;

    const luma = LUMA_R * r + LUMA_G * g + LUMA_B * b;
    r = luma + (r - luma) * sf;
    g = luma + (g - luma) * sf;
    b = luma + (b - luma) * sf;

    if (p.grayscale) {
      const gray = LUMA_R * r + LUMA_G * g + LUMA_B * b;
      r = gray;
      g = gray;
      b = gray;
    }

    if (p.invert) {
      r = 255 - r;
      g = 255 - g;
      b = 255 - b;
    }

    out[i] = r;
    out[i + 1] = g;
    out[i + 2] = b;
    out[i + 3] = data[i + 3];
  }

  return out;
}

/** 按 op 链推导最终输出像素尺寸（纯计算，不渲染）。 */
export function computeOutputSize(ops: readonly EditOp[], srcW: number, srcH: number): { w: number; h: number } {
  let w = srcW;
  let h = srcH;
  for (const op of ops) {
    if (op.type === 'crop') {
      w = op.rect.w;
      h = op.rect.h;
    } else if (op.type === 'resize') {
      w = op.w;
      h = op.h;
    } else if (op.type === 'rotate') {
      const n = ((op.deg % 360) + 360) % 360;
      if (n === 90 || n === 270) {
        const t = w;
        w = h;
        h = t;
      }
    }
  }
  return { w, h };
}

/** 把裁剪框约束到图像范围内，最小边长 1。 */
export function clampCropRect(rect: CropRect, srcW: number, srcH: number): CropRect {
  const x = Math.min(Math.max(Math.round(rect.x), 0), Math.max(srcW - 1, 0));
  const y = Math.min(Math.max(Math.round(rect.y), 0), Math.max(srcH - 1, 0));
  const w = Math.min(Math.max(Math.round(rect.w), 1), srcW - x);
  const h = Math.min(Math.max(Math.round(rect.h), 1), srcH - y);
  return { x, y, w, h };
}
```

- [ ] **Step 4: 运行测试**

Run: `pnpm test -- src/utils/imageOps.test.ts`
Expected: PASS（全部用例）。

- [ ] **Step 5: typecheck + 提交**

```bash
pnpm typecheck
git add src/utils/imageOps.ts src/utils/imageOps.test.ts
git commit -m "feat: 新增 imageOps 像素与几何变换纯函数"
```

---

## Task 5: 前端 — `useDraggableResizable` composable

**Files:**
- Create: `src/composables/useDraggableResizable.ts`
- Test: `src/composables/useDraggableResizable.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { describe, expect, it } from 'vitest';

import { useDraggableResizable } from './useDraggableResizable';

function make() {
  return useDraggableResizable({
    initialX: 100,
    initialY: 80,
    initialWidth: 760,
    initialHeight: 580,
    minWidth: 480,
    minHeight: 420,
  });
}

describe('useDraggableResizable', () => {
  it('moves by delta', () => {
    const m = make();
    m.moveBy(20, -10);
    expect(m.x.value).toBe(120);
    expect(m.y.value).toBe(70);
  });

  it('clamps resize to min bounds', () => {
    const m = make();
    m.resizeBy(-9999, -9999);
    expect(m.width.value).toBe(480);
    expect(m.height.value).toBe(420);
  });

  it('clamps resize to max after setMaxSize', () => {
    const m = make();
    m.setMaxSize(1000, 800);
    m.resizeBy(9999, 9999);
    expect(m.width.value).toBe(1000);
    expect(m.height.value).toBe(800);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm test -- src/composables/useDraggableResizable.test.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现**

```ts
import { ref } from 'vue';

export interface DraggableResizableOptions {
  initialX: number;
  initialY: number;
  initialWidth: number;
  initialHeight: number;
  minWidth: number;
  minHeight: number;
  maxWidth?: number;
  maxHeight?: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function useDraggableResizable(options: DraggableResizableOptions) {
  const x = ref(options.initialX);
  const y = ref(options.initialY);
  const width = ref(options.initialWidth);
  const height = ref(options.initialHeight);
  const maxWidth = ref(options.maxWidth ?? Number.POSITIVE_INFINITY);
  const maxHeight = ref(options.maxHeight ?? Number.POSITIVE_INFINITY);

  function moveBy(dx: number, dy: number) {
    x.value += dx;
    y.value += dy;
  }

  function resizeBy(dx: number, dy: number) {
    width.value = clamp(width.value + dx, options.minWidth, maxWidth.value);
    height.value = clamp(height.value + dy, options.minHeight, maxHeight.value);
  }

  function setMaxSize(w: number, h: number) {
    maxWidth.value = w;
    maxHeight.value = h;
    width.value = clamp(width.value, options.minWidth, w);
    height.value = clamp(height.value, options.minHeight, h);
  }

  return { x, y, width, height, moveBy, resizeBy, setMaxSize };
}
```

- [ ] **Step 4: 运行测试**

Run: `pnpm test -- src/composables/useDraggableResizable.test.ts`
Expected: PASS。

- [ ] **Step 5: typecheck + 提交**

```bash
pnpm typecheck
git add src/composables/useDraggableResizable.ts src/composables/useDraggableResizable.test.ts
git commit -m "feat: 新增 useDraggableResizable 控制模态框拖动与缩放"
```

---

## Task 6: 前端 — `useImageEditor` 操作栈 composable

**Files:**
- Create: `src/composables/useImageEditor.ts`
- Test: `src/composables/useImageEditor.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { describe, expect, it } from 'vitest';

import { useImageEditor } from './useImageEditor';
import { NEUTRAL_ADJUST } from '@/utils/imageOps';

describe('useImageEditor', () => {
  it('pushes transform ops and tracks dirty/undo state', () => {
    const e = useImageEditor();
    expect(e.dirty.value).toBe(false);
    expect(e.canUndo.value).toBe(false);

    e.rotate(90);
    e.flip('h');
    expect(e.ops.value.map(o => o.type)).toEqual(['rotate', 'flip']);
    expect(e.dirty.value).toBe(true);
    expect(e.canUndo.value).toBe(true);
  });

  it('collapses consecutive adjusts into one trailing op', () => {
    const e = useImageEditor();
    e.rotate(90);
    e.setAdjust({ ...NEUTRAL_ADJUST, brightness: 10 });
    e.setAdjust({ ...NEUTRAL_ADJUST, brightness: 40 });
    expect(e.ops.value.map(o => o.type)).toEqual(['rotate', 'adjust']);
    expect(e.currentAdjust.value.brightness).toBe(40);
  });

  it('undo/redo/reset operate on the stack', () => {
    const e = useImageEditor();
    e.rotate(90);
    e.flip('v');

    e.undo();
    expect(e.ops.value.map(o => o.type)).toEqual(['rotate']);
    expect(e.canRedo.value).toBe(true);

    e.redo();
    expect(e.ops.value.map(o => o.type)).toEqual(['rotate', 'flip']);

    e.reset();
    expect(e.ops.value).toEqual([]);
    expect(e.canUndo.value).toBe(false);
    expect(e.canRedo.value).toBe(false);
  });

  it('pushing a new op clears the redo stack', () => {
    const e = useImageEditor();
    e.rotate(90);
    e.undo();
    e.flip('h');
    expect(e.canRedo.value).toBe(false);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm test -- src/composables/useImageEditor.test.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现**

```ts
import { computed, ref } from 'vue';

import { NEUTRAL_ADJUST, type AdjustParams, type CropRect, type EditOp } from '@/utils/imageOps';

export function useImageEditor() {
  const ops = ref<EditOp[]>([]);
  const redoStack = ref<EditOp[]>([]);

  function pushOp(op: EditOp) {
    ops.value = [...ops.value, op];
    redoStack.value = [];
  }

  function rotate(deg: number) {
    pushOp({ type: 'rotate', deg });
  }

  function flip(axis: 'h' | 'v') {
    pushOp({ type: 'flip', axis });
  }

  function crop(rect: CropRect) {
    pushOp({ type: 'crop', rect });
  }

  function resize(w: number, h: number) {
    pushOp({ type: 'resize', w, h });
  }

  function setAdjust(params: AdjustParams) {
    const last = ops.value[ops.value.length - 1];
    const base = last && last.type === 'adjust' ? ops.value.slice(0, -1) : ops.value;
    ops.value = [...base, { type: 'adjust', params }];
    redoStack.value = [];
  }

  function undo() {
    if (!ops.value.length) return;
    const op = ops.value[ops.value.length - 1];
    ops.value = ops.value.slice(0, -1);
    redoStack.value = [...redoStack.value, op];
  }

  function redo() {
    if (!redoStack.value.length) return;
    const op = redoStack.value[redoStack.value.length - 1];
    redoStack.value = redoStack.value.slice(0, -1);
    ops.value = [...ops.value, op];
  }

  function reset() {
    ops.value = [];
    redoStack.value = [];
  }

  const canUndo = computed(() => ops.value.length > 0);
  const canRedo = computed(() => redoStack.value.length > 0);
  const dirty = computed(() => ops.value.length > 0);
  const currentAdjust = computed<AdjustParams>(() => {
    for (let i = ops.value.length - 1; i >= 0; i -= 1) {
      const op = ops.value[i];
      if (op.type === 'adjust') return op.params;
    }
    return NEUTRAL_ADJUST;
  });

  return { ops, canUndo, canRedo, dirty, currentAdjust, rotate, flip, crop, resize, setAdjust, undo, redo, reset };
}
```

- [ ] **Step 4: 运行测试**

Run: `pnpm test -- src/composables/useImageEditor.test.ts`
Expected: PASS。

- [ ] **Step 5: typecheck + 提交**

```bash
pnpm typecheck
git add src/composables/useImageEditor.ts src/composables/useImageEditor.test.ts
git commit -m "feat: 新增 useImageEditor 编辑操作栈与撤销重做"
```

---

## Task 7: 前端 — `canvasRender.ts` canvas 渲染胶水

**Files:**
- Create: `src/utils/canvasRender.ts`
- Test: `src/utils/canvasRender.test.ts`

- [ ] **Step 1: 写失败测试**（jsdom；mock canvas 2D context，仅验证几何尺寸与调用）

```ts
// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderOps } from './canvasRender';
import type { EditOp } from './imageOps';

function stubCanvas() {
  const ctx = {
    drawImage: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    scale: vi.fn(),
    getImageData: vi.fn((_x: number, _y: number, w: number, h: number) => ({
      data: new Uint8ClampedArray(w * h * 4),
      width: w,
      height: h,
    })),
    putImageData: vi.fn(),
  };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
  return ctx;
}

afterEach(() => vi.restoreAllMocks());

describe('renderOps', () => {
  it('produces a canvas with rotated dimensions for rotate 90', () => {
    stubCanvas();
    const source = document.createElement('canvas');
    const ops: EditOp[] = [{ type: 'rotate', deg: 90 }];
    const out = renderOps(source, 200, 100, ops);
    expect(out.width).toBe(100);
    expect(out.height).toBe(200);
  });

  it('crops to the rect size', () => {
    stubCanvas();
    const source = document.createElement('canvas');
    const ops: EditOp[] = [{ type: 'crop', rect: { x: 10, y: 10, w: 80, h: 40 } }];
    const out = renderOps(source, 200, 200, ops);
    expect(out.width).toBe(80);
    expect(out.height).toBe(40);
  });

  it('runs pixel adjustment pass when an adjust op exists', () => {
    const ctx = stubCanvas();
    const source = document.createElement('canvas');
    const ops: EditOp[] = [{ type: 'adjust', params: { brightness: 10, contrast: 0, saturation: 0, grayscale: false, invert: false } }];
    renderOps(source, 4, 4, ops);
    expect(ctx.getImageData).toHaveBeenCalled();
    expect(ctx.putImageData).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm test -- src/utils/canvasRender.test.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现**

```ts
import { applyAdjustments, NEUTRAL_ADJUST, type AdjustParams, type EditOp } from './imageOps';

/** 把 op 链渲染到一个 canvas（几何变换 + 末尾像素调整）。getContext 不可用时返回降级 canvas。 */
export function renderOps(
  source: CanvasImageSource,
  srcW: number,
  srcH: number,
  ops: readonly EditOp[],
  doc: Document = document,
): HTMLCanvasElement {
  let canvas = doc.createElement('canvas');
  canvas.width = srcW;
  canvas.height = srcH;
  let ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.drawImage(source, 0, 0, srcW, srcH);

  let adjust: AdjustParams = NEUTRAL_ADJUST;

  for (const op of ops) {
    if (op.type === 'adjust') {
      adjust = op.params;
      continue;
    }

    const next = doc.createElement('canvas');
    const nctx = next.getContext('2d');
    if (!nctx) return canvas;

    if (op.type === 'crop') {
      next.width = op.rect.w;
      next.height = op.rect.h;
      nctx.drawImage(canvas, op.rect.x, op.rect.y, op.rect.w, op.rect.h, 0, 0, op.rect.w, op.rect.h);
    } else if (op.type === 'resize') {
      next.width = op.w;
      next.height = op.h;
      nctx.drawImage(canvas, 0, 0, canvas.width, canvas.height, 0, 0, op.w, op.h);
    } else if (op.type === 'rotate') {
      const n = ((op.deg % 360) + 360) % 360;
      const swap = n === 90 || n === 270;
      next.width = swap ? canvas.height : canvas.width;
      next.height = swap ? canvas.width : canvas.height;
      nctx.translate(next.width / 2, next.height / 2);
      nctx.rotate((n * Math.PI) / 180);
      nctx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
    } else if (op.type === 'flip') {
      next.width = canvas.width;
      next.height = canvas.height;
      nctx.translate(op.axis === 'h' ? next.width : 0, op.axis === 'v' ? next.height : 0);
      nctx.scale(op.axis === 'h' ? -1 : 1, op.axis === 'v' ? -1 : 1);
      nctx.drawImage(canvas, 0, 0);
    }

    canvas = next;
    ctx = nctx;
  }

  if (adjust !== NEUTRAL_ADJUST && ctx) {
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    img.data.set(applyAdjustments(img.data, adjust));
    ctx.putImageData(img, 0, 0);
  }

  return canvas;
}

export function renderToDataUrl(
  source: CanvasImageSource,
  srcW: number,
  srcH: number,
  ops: readonly EditOp[],
  type = 'image/png',
  doc: Document = document,
): string {
  return renderOps(source, srcW, srcH, ops, doc).toDataURL(type);
}
```

- [ ] **Step 4: 运行测试**

Run: `pnpm test -- src/utils/canvasRender.test.ts`
Expected: PASS。

- [ ] **Step 5: typecheck + 提交**

```bash
pnpm typecheck
git add src/utils/canvasRender.ts src/utils/canvasRender.test.ts
git commit -m "feat: 新增 canvasRender 将编辑操作渲染为 canvas/dataURL"
```

---

## Task 8: 前端 — `ClipboardImageEditor.vue` 模态外壳

模态外壳：`<Teleport to="body">` 无遮罩浮层、标题栏可拖动、右下角手柄缩放、✕/Esc 关闭、stage 内 `<canvas>` 预览（onMounted 载入原图，jsdom 下 getContext 为 null 时安全降级）。本任务先不接工具栏逻辑（占位）。

**Files:**
- Create: `src/components/clipboard/ClipboardImageEditor.vue`
- Test: `src/components/clipboard/ClipboardImageEditor.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
// @vitest-environment jsdom

import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ClipboardEntry } from '@/types/steno';
import ClipboardImageEditor from './ClipboardImageEditor.vue';

vi.mock('@/composables/useDb', () => ({
  useDb: () => ({
    addImageClipboardEntry: vi.fn(async () => ({}) as ClipboardEntry),
    copyEditedImageToClipboard: vi.fn(async () => {}),
    listClipboardEntries: vi.fn(async () => []),
  }),
}));

vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(async () => () => {}) }));

const entry: ClipboardEntry = {
  id: 'img-1',
  contentType: 'image',
  content: 'data:image/png;base64,iVBORw0KGgo=',
  htmlContent: null,
  preview: '图片内容',
  createdAt: '2026-06-01T10:14:00Z',
  updatedAt: '2026-06-01T10:14:00Z',
  sizeBytes: 40,
};

describe('ClipboardImageEditor shell', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('renders the editor dialog without a backdrop mask', () => {
    const wrapper = mount(ClipboardImageEditor, { props: { entry }, attachTo: document.body });
    expect(wrapper.find('[data-testid="clip-image-editor"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="clip-editor-backdrop"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="clip-editor-resize-grip"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('emits close on the close button', async () => {
    const wrapper = mount(ClipboardImageEditor, { props: { entry }, attachTo: document.body });
    await wrapper.get('[data-testid="clip-editor-close"]').trigger('click');
    expect(wrapper.emitted('close')).toBeTruthy();
    wrapper.unmount();
  });

  it('emits close on Escape', async () => {
    const wrapper = mount(ClipboardImageEditor, { props: { entry }, attachTo: document.body });
    await wrapper.get('[data-testid="clip-image-editor"]').trigger('keydown', { key: 'Escape' });
    expect(wrapper.emitted('close')).toBeTruthy();
    wrapper.unmount();
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm test -- src/components/clipboard/ClipboardImageEditor.test.ts`
Expected: FAIL（组件不存在）。

- [ ] **Step 3: 实现外壳**（先建立可测的结构骨架；工具栏/裁剪/调整/保存在后续任务填充）

```vue
<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';

import { useDraggableResizable } from '@/composables/useDraggableResizable';
import type { ClipboardEntry } from '@/types/steno';

const props = defineProps<{ entry: ClipboardEntry }>();
const emit = defineEmits<{ close: [] }>();

const rootEl = ref<HTMLElement | null>(null);
const canvasEl = ref<HTMLCanvasElement | null>(null);
const srcWidth = ref(0);
const srcHeight = ref(0);

const win = useDraggableResizable({
  initialX: 0,
  initialY: 0,
  initialWidth: 760,
  initialHeight: 580,
  minWidth: 480,
  minHeight: 420,
});

let sourceImage: HTMLImageElement | null = null;

function paintPreview() {
  const canvas = canvasEl.value;
  if (!canvas || !sourceImage || !srcWidth.value) return;
  canvas.width = srcWidth.value;
  canvas.height = srcHeight.value;
  const ctx = canvas.getContext('2d');
  if (!ctx) return; // jsdom / 不支持时安全降级
  ctx.drawImage(sourceImage, 0, 0);
}

function centerInViewport() {
  const maxW = Math.min(window.innerWidth - 48, 1200);
  const maxH = window.innerHeight - 48;
  win.setMaxSize(Math.max(maxW, 480), Math.max(maxH, 420));
  win.x.value = Math.max((window.innerWidth - win.width.value) / 2, 24);
  win.y.value = Math.max((window.innerHeight - win.height.value) / 2, 24);
}

function close() {
  emit('close');
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.preventDefault();
    close();
  }
}

// 标题栏拖动移动
function startDrag(e: PointerEvent) {
  const startX = e.clientX;
  const startY = e.clientY;
  const onMove = (ev: PointerEvent) => win.moveBy(ev.clientX - lastX, ev.clientY - lastY) || setLast(ev);
  let lastX = startX;
  let lastY = startY;
  function setLast(ev: PointerEvent) {
    lastX = ev.clientX;
    lastY = ev.clientY;
  }
  const move = (ev: PointerEvent) => {
    win.moveBy(ev.clientX - lastX, ev.clientY - lastY);
    lastX = ev.clientX;
    lastY = ev.clientY;
  };
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}

// 右下角缩放
function startResize(e: PointerEvent) {
  e.stopPropagation();
  let lastX = e.clientX;
  let lastY = e.clientY;
  const move = (ev: PointerEvent) => {
    win.resizeBy(ev.clientX - lastX, ev.clientY - lastY);
    lastX = ev.clientX;
    lastY = ev.clientY;
  };
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}

onMounted(() => {
  centerInViewport();
  rootEl.value?.focus();
  const img = new Image();
  img.onload = () => {
    sourceImage = img;
    srcWidth.value = img.naturalWidth;
    srcHeight.value = img.naturalHeight;
    paintPreview();
  };
  img.src = props.entry.content;
});

onBeforeUnmount(() => {
  sourceImage = null;
});

defineExpose({ srcWidth, srcHeight });
</script>

<template>
  <Teleport to="body">
    <div
      ref="rootEl"
      class="clip-editor"
      role="dialog"
      aria-modal="false"
      aria-label="图片编辑"
      tabindex="-1"
      data-testid="clip-image-editor"
      :style="{ left: win.x.value + 'px', top: win.y.value + 'px', width: win.width.value + 'px', height: win.height.value + 'px' }"
      @keydown="onKeydown"
    >
      <header class="clip-editor__head" data-testid="clip-editor-head" @pointerdown="startDrag">
        <div class="clip-editor__title">
          <strong>编辑图片</strong>
          <span>{{ entry.preview }} · {{ srcWidth }}×{{ srcHeight }}</span>
        </div>
        <button
          class="clip-editor__icon"
          type="button"
          aria-label="关闭"
          title="关闭"
          data-testid="clip-editor-close"
          @click="close"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </button>
      </header>

      <div class="clip-editor__toolbar" data-testid="clip-editor-toolbar">
        <!-- Task 9/10 在此填充工具按钮 -->
      </div>

      <div class="clip-editor__stage" data-testid="clip-editor-stage">
        <canvas ref="canvasEl" class="clip-editor__canvas" data-testid="clip-editor-canvas" />
      </div>

      <footer class="clip-editor__footer" data-testid="clip-editor-footer">
        <span class="clip-editor__spacer" />
        <button class="clip-editor__btn" type="button" data-testid="clip-editor-cancel" @click="close">取消</button>
      </footer>

      <div
        class="clip-editor__resize"
        data-testid="clip-editor-resize-grip"
        title="拖动缩放窗口"
        @pointerdown="startResize"
      />
    </div>
  </Teleport>
</template>

<style scoped>
.clip-editor {
  position: fixed;
  z-index: 30;
  display: grid;
  grid-template-rows: auto auto 1fr auto;
  background: var(--app-bg);
  border: 1px solid var(--app-border);
  border-radius: 10px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.18);
  overflow: hidden;
  outline: none;
}
.clip-editor__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--app-border);
  background: var(--app-surface);
  cursor: grab;
  user-select: none;
}
.clip-editor__title { display: grid; gap: 2px; min-width: 0; }
.clip-editor__title strong { font-size: 14px; }
.clip-editor__title span { color: var(--app-muted); font-size: 12px; }
.clip-editor__toolbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--app-border);
  background: var(--app-surface);
  min-height: 40px;
}
.clip-editor__stage {
  min-height: 0;
  position: relative;
  display: grid;
  place-items: center;
  padding: 18px;
  overflow: hidden;
  background:
    linear-gradient(45deg, rgba(120, 108, 96, 0.12) 25%, transparent 25%),
    linear-gradient(-45deg, rgba(120, 108, 96, 0.12) 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, rgba(120, 108, 96, 0.12) 75%),
    linear-gradient(-45deg, transparent 75%, rgba(120, 108, 96, 0.12) 75%);
  background-position: 0 0, 0 12px, 12px -12px, -12px 0;
  background-size: 24px 24px;
}
.clip-editor__canvas { max-width: 100%; max-height: 100%; object-fit: contain; border-radius: 4px; }
.clip-editor__footer {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-top: 1px solid var(--app-border);
  background: var(--app-surface);
}
.clip-editor__spacer { flex: 1; }
.clip-editor__btn {
  height: 32px;
  padding: 0 12px;
  border: 1px solid var(--app-border);
  border-radius: 7px;
  background: var(--app-bg);
  color: var(--app-fg);
  cursor: pointer;
}
.clip-editor__btn:hover { border-color: var(--app-accent); color: var(--app-accent); }
.clip-editor__icon {
  width: 28px;
  height: 28px;
  display: inline-grid;
  place-items: center;
  border: 1px solid var(--app-border);
  border-radius: 6px;
  background: var(--app-bg);
  color: var(--app-muted);
  cursor: pointer;
}
.clip-editor__icon svg { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.clip-editor__resize {
  position: absolute;
  right: 2px;
  bottom: 2px;
  width: 16px;
  height: 16px;
  cursor: nwse-resize;
}
</style>
```

> 注：`startDrag` 内的 `onMove`/`setLast` 是冗余写法，实现时删掉那两行未用变量，仅保留 `move`/`up` 逻辑（保持 lint 干净）。

- [ ] **Step 4: 运行测试**

Run: `pnpm test -- src/components/clipboard/ClipboardImageEditor.test.ts`
Expected: PASS（3 个用例）。

- [ ] **Step 5: typecheck + 提交**

```bash
pnpm typecheck
git add src/components/clipboard/ClipboardImageEditor.vue src/components/clipboard/ClipboardImageEditor.test.ts
git commit -m "feat: 新增剪贴板图片编辑器模态外壳（无遮罩+拖动缩放）"
```

---

## Task 9: 前端 — 工具栏（变换 + 历史）接线

把工具栏接到 `useImageEditor`：旋转/翻转/缩放/撤销/重做/重置；ops 变化时按 op 链重渲染预览 canvas（用 `renderOps`）。裁剪与调整在 Task 10。

**Files:**
- Modify: `src/components/clipboard/ClipboardImageEditor.vue`
- Modify: `src/components/clipboard/ClipboardImageEditor.test.ts`

- [ ] **Step 1: 追加失败测试**

```ts
it('adds a rotate op when clicking rotate-right and enables undo', async () => {
  const wrapper = mount(ClipboardImageEditor, { props: { entry }, attachTo: document.body });
  expect(wrapper.get('[data-testid="clip-tool-undo"]').attributes('disabled')).toBeDefined();

  await wrapper.get('[data-testid="clip-tool-rotate-right"]').trigger('click');
  expect(wrapper.get('[data-testid="clip-editor-status"]').text()).toContain('1');
  expect(wrapper.get('[data-testid="clip-tool-undo"]').attributes('disabled')).toBeUndefined();

  await wrapper.get('[data-testid="clip-tool-undo"]').trigger('click');
  expect(wrapper.get('[data-testid="clip-tool-redo"]').attributes('disabled')).toBeUndefined();
  wrapper.unmount();
});
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm test -- src/components/clipboard/ClipboardImageEditor.test.ts`
Expected: FAIL（找不到 `clip-tool-rotate-right`）。

- [ ] **Step 3: 接线**

在 `<script setup>` 顶部 import 增补：

```ts
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';

import { useDraggableResizable } from '@/composables/useDraggableResizable';
import { useImageEditor } from '@/composables/useImageEditor';
import { computeOutputSize } from '@/utils/imageOps';
import { renderOps } from '@/utils/canvasRender';
import type { ClipboardEntry } from '@/types/steno';
```

在 `srcHeight` 声明后加入编辑器实例与派生：

```ts
const editor = useImageEditor();
const outputSize = computed(() => computeOutputSize(editor.ops.value, srcWidth.value, srcHeight.value));
```

把 `paintPreview` 改为按 op 链渲染：

```ts
function paintPreview() {
  const canvas = canvasEl.value;
  if (!canvas || !sourceImage || !srcWidth.value) return;
  const rendered = renderOps(sourceImage, srcWidth.value, srcHeight.value, editor.ops.value);
  canvas.width = rendered.width;
  canvas.height = rendered.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.drawImage(rendered, 0, 0);
}

watch(() => editor.ops.value, paintPreview, { deep: true });
```

工具栏模板（替换 Task 8 的空 `clip-editor__toolbar`）：

```vue
      <div class="clip-editor__toolbar" data-testid="clip-editor-toolbar">
        <div class="clip-editor__group">
          <button class="clip-editor__icon" type="button" title="向左旋转 90°" data-testid="clip-tool-rotate-left" @click="editor.rotate(-90)">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></svg>
          </button>
          <button class="clip-editor__icon" type="button" title="向右旋转 90°" data-testid="clip-tool-rotate-right" @click="editor.rotate(90)">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a9 9 0 1 1-3-6.7L21 8" /><path d="M21 3v5h-5" /></svg>
          </button>
          <button class="clip-editor__icon" type="button" title="水平翻转" data-testid="clip-tool-flip-h" @click="editor.flip('h')">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v18" /><path d="M7 8 4 12l3 4" /><path d="M17 8l3 4-3 4" /></svg>
          </button>
          <button class="clip-editor__icon" type="button" title="垂直翻转" data-testid="clip-tool-flip-v" @click="editor.flip('v')">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12h18" /><path d="M8 7 12 4l4 3" /><path d="M8 17l4 3 4-3" /></svg>
          </button>
        </div>

        <span class="clip-editor__divider" />

        <div class="clip-editor__group">
          <button class="clip-editor__icon" type="button" title="撤销" data-testid="clip-tool-undo" :disabled="!editor.canUndo.value" @click="editor.undo()">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 14 4 9l5-5" /><path d="M4 9h11a5 5 0 0 1 0 10h-1" /></svg>
          </button>
          <button class="clip-editor__icon" type="button" title="重做" data-testid="clip-tool-redo" :disabled="!editor.canRedo.value" @click="editor.redo()">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 14 5-5-5-5" /><path d="M20 9H9a5 5 0 0 0 0 10h1" /></svg>
          </button>
          <button class="clip-editor__btn" type="button" title="重置为原图" data-testid="clip-tool-reset" :disabled="!editor.dirty.value" @click="editor.reset()">重置</button>
        </div>

        <span class="clip-editor__group clip-editor__future" title="范围二预留：标注工具">＋标注（预留）</span>
      </div>
```

底部状态文案（在 footer 的 `clip-editor__spacer` 前加）：

```vue
        <span class="clip-editor__status" data-testid="clip-editor-status">已应用 {{ editor.ops.value.length }} 步 · {{ outputSize.w }}×{{ outputSize.h }}</span>
```

补充样式：

```css
.clip-editor__group { display: flex; align-items: center; gap: 4px; }
.clip-editor__divider { width: 1px; height: 22px; background: var(--app-border); margin: 0 4px; }
.clip-editor__future { color: var(--app-faint); font-size: 11px; border: 1px dashed var(--app-border); border-radius: 7px; padding: 4px 8px; margin-left: auto; }
.clip-editor__icon:disabled { opacity: 0.4; cursor: not-allowed; }
.clip-editor__status { color: var(--app-muted); font-size: 12px; }
.clip-editor__btn:disabled { opacity: 0.4; cursor: not-allowed; }
```

- [ ] **Step 4: 运行测试**

Run: `pnpm test -- src/components/clipboard/ClipboardImageEditor.test.ts`
Expected: PASS（含新用例）。

- [ ] **Step 5: typecheck + 提交**

```bash
pnpm typecheck
git add src/components/clipboard/ClipboardImageEditor.vue src/components/clipboard/ClipboardImageEditor.test.ts
git commit -m "feat: 编辑器工具栏接线旋转翻转与撤销重做"
```

---

## Task 10: 前端 — 裁剪选框 + 调整面板接线

新增"裁剪"与"缩放尺寸"按钮、裁剪选框交互（确认时 `editor.crop(clampCropRect(...))`），以及"调整"popover（亮度/对比度/饱和度滑块 + 灰度/反相开关），松手提交 `editor.setAdjust(...)`，拖动中用 CSS filter 实时预览。

**Files:**
- Modify: `src/components/clipboard/ClipboardImageEditor.vue`
- Modify: `src/components/clipboard/ClipboardImageEditor.test.ts`

- [ ] **Step 1: 追加失败测试**

```ts
it('commits an adjust op from the adjust panel sliders', async () => {
  const wrapper = mount(ClipboardImageEditor, { props: { entry }, attachTo: document.body });
  await wrapper.get('[data-testid="clip-tool-adjust"]').trigger('click');
  const slider = wrapper.get('[data-testid="clip-adjust-brightness"]');
  await slider.setValue('30');
  await slider.trigger('change');
  expect(wrapper.get('[data-testid="clip-editor-status"]').text()).toContain('1');
  wrapper.unmount();
});

it('commits a crop op when confirming the crop selection', async () => {
  const wrapper = mount(ClipboardImageEditor, { props: { entry }, attachTo: document.body });
  // 模拟已知原图尺寸，避免依赖真实图片解码
  (wrapper.vm as unknown as { srcWidth: { value: number }; srcHeight: { value: number } }).srcWidth.value = 200;
  (wrapper.vm as unknown as { srcHeight: { value: number } }).srcHeight.value = 200;
  await wrapper.get('[data-testid="clip-tool-crop"]').trigger('click');
  await wrapper.get('[data-testid="clip-crop-confirm"]').trigger('click');
  expect(wrapper.get('[data-testid="clip-editor-status"]').text()).toContain('1');
  wrapper.unmount();
});
```

> 第二个用例依赖组件 `defineExpose({ srcWidth, srcHeight })`（Task 8 已导出）。裁剪默认选框为整图，确认即产生一个 crop op。

- [ ] **Step 2: 运行确认失败**

Run: `pnpm test -- src/components/clipboard/ClipboardImageEditor.test.ts`
Expected: FAIL（找不到 `clip-tool-adjust` / `clip-tool-crop`）。

- [ ] **Step 3: 接线**

`<script setup>` 增补 import：

```ts
import { clampCropRect, NEUTRAL_ADJUST, type AdjustParams, type CropRect } from '@/utils/imageOps';
```

增补状态与方法：

```ts
const showAdjust = ref(false);
const cropping = ref(false);
const draft = ref<AdjustParams>({ ...NEUTRAL_ADJUST });
const cropRect = ref<CropRect>({ x: 0, y: 0, w: 0, h: 0 });

// 实时预览滤镜（拖动滑块时不入栈，仅 CSS）
const previewFilter = computed(() => {
  const a = draft.value;
  const parts = [
    `brightness(${1 + a.brightness / 100})`,
    `contrast(${1 + a.contrast / 100})`,
    `saturate(${a.grayscale ? 0 : 1 + a.saturation / 100})`,
    `invert(${a.invert ? 1 : 0})`,
  ];
  return parts.join(' ');
});

function openAdjust() {
  draft.value = { ...editor.currentAdjust.value };
  showAdjust.value = true;
  cropping.value = false;
}

function commitAdjust() {
  editor.setAdjust({ ...draft.value });
}

function startCrop() {
  cropping.value = true;
  showAdjust.value = false;
  cropRect.value = { x: 0, y: 0, w: srcWidth.value, h: srcHeight.value };
}

function confirmCrop() {
  editor.crop(clampCropRect(cropRect.value, srcWidth.value, srcHeight.value));
  cropping.value = false;
}

function cancelCrop() {
  cropping.value = false;
}

function applyResize() {
  const w = Number(window.prompt('输出宽度(px)', String(outputSize.value.w)));
  const h = Number(window.prompt('输出高度(px)', String(outputSize.value.h)));
  if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) {
    editor.resize(Math.round(w), Math.round(h));
  }
}
```

工具栏"变换"组内（旋转翻转旁）追加裁剪、缩放按钮：

```vue
          <button class="clip-editor__icon" type="button" title="裁剪" data-testid="clip-tool-crop" :class="{ 'clip-editor__icon--active': cropping }" @click="startCrop">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2v14a2 2 0 0 0 2 2h14" /><path d="M2 6h14a2 2 0 0 1 2 2v14" /></svg>
          </button>
          <button class="clip-editor__icon" type="button" title="缩放尺寸" data-testid="clip-tool-resize" @click="applyResize">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 3h6v6" /><path d="M9 21H3v-6" /><path d="M21 3l-7 7" /><path d="M3 21l7-7" /></svg>
          </button>
```

"调整"组（在历史组前加一个分隔 + 按钮）：

```vue
        <span class="clip-editor__divider" />
        <div class="clip-editor__group">
          <button class="clip-editor__btn" type="button" title="亮度/对比度/饱和度" data-testid="clip-tool-adjust" :class="{ 'clip-editor__icon--active': showAdjust }" @click="openAdjust">调整</button>
        </div>
```

stage 内追加裁剪框与调整 popover（放在 `<canvas>` 之后）：

```vue
        <div v-if="cropping" class="clip-editor__crop" data-testid="clip-crop">
          <div class="clip-editor__crop-actions">
            <button class="clip-editor__btn" type="button" data-testid="clip-crop-confirm" @click="confirmCrop">确认裁剪</button>
            <button class="clip-editor__btn" type="button" data-testid="clip-crop-cancel" @click="cancelCrop">取消</button>
          </div>
        </div>

        <div v-if="showAdjust" class="clip-editor__adjust" data-testid="clip-adjust">
          <label>亮度
            <input type="range" min="-100" max="100" v-model.number="draft.brightness" data-testid="clip-adjust-brightness" @change="commitAdjust" />
          </label>
          <label>对比度
            <input type="range" min="-100" max="100" v-model.number="draft.contrast" data-testid="clip-adjust-contrast" @change="commitAdjust" />
          </label>
          <label>饱和度
            <input type="range" min="-100" max="100" v-model.number="draft.saturation" data-testid="clip-adjust-saturation" @change="commitAdjust" />
          </label>
          <div class="clip-editor__adjust-toggles">
            <label><input type="checkbox" v-model="draft.grayscale" data-testid="clip-adjust-grayscale" @change="commitAdjust" /> 灰度</label>
            <label><input type="checkbox" v-model="draft.invert" data-testid="clip-adjust-invert" @change="commitAdjust" /> 反相</label>
          </div>
        </div>
```

给预览 canvas 加实时滤镜绑定（拖动滑块时直观反馈，松手 commit 后由 op 重渲染覆盖）：

```vue
        <canvas
          ref="canvasEl"
          class="clip-editor__canvas"
          data-testid="clip-editor-canvas"
          :style="{ filter: showAdjust ? previewFilter : 'none' }"
        />
```

补充样式：

```css
.clip-editor__icon--active { border-color: var(--app-accent); color: var(--app-accent); background: var(--app-accent-soft); }
.clip-editor__crop { position: absolute; inset: 18px; border: 1.5px dashed var(--app-accent); border-radius: 4px; pointer-events: none; }
.clip-editor__crop-actions { position: absolute; right: 8px; bottom: 8px; display: flex; gap: 6px; pointer-events: auto; }
.clip-editor__adjust { position: absolute; top: 10px; right: 10px; width: 220px; display: grid; gap: 8px; padding: 12px; background: var(--app-surface); border: 1px solid var(--app-border); border-radius: 8px; box-shadow: 0 8px 24px rgba(0,0,0,0.16); }
.clip-editor__adjust label { display: grid; gap: 4px; font-size: 12px; color: var(--app-muted); }
.clip-editor__adjust input[type="range"] { width: 100%; }
.clip-editor__adjust-toggles { display: flex; gap: 12px; font-size: 12px; }
.clip-editor__adjust-toggles label { display: inline-flex; gap: 4px; align-items: center; }
```

> 裁剪框本期为整图选区（确认即生效）+ 后续可加四角拖拽手柄；当前实现先保证 crop op 链路与可测性，手柄拖拽作为同任务的增强（用 pointer 事件更新 `cropRect`，再 `clampCropRect`）。若时间紧，整图裁剪 + resize 已满足"裁剪"原子能力的最小闭环。

- [ ] **Step 4: 运行测试**

Run: `pnpm test -- src/components/clipboard/ClipboardImageEditor.test.ts`
Expected: PASS。

- [ ] **Step 5: typecheck + 提交**

```bash
pnpm typecheck
git add src/components/clipboard/ClipboardImageEditor.vue src/components/clipboard/ClipboardImageEditor.test.ts
git commit -m "feat: 编辑器接入裁剪选框与基础调整面板"
```

---

## Task 11: 前端 — 保存(B)/复制 + 错误处理

底部主按钮"保存为新条目"(B) 调 `store.addImageEntry(dataUrl)` 成功后 emit close；失败显示错误条且不关闭。"复制"调 `useDb().copyEditedImageToClipboard(dataUrl)`。下拉里"覆盖原条目"(A)、"导出到文件"(D) 置灰。

**Files:**
- Modify: `src/components/clipboard/ClipboardImageEditor.vue`
- Modify: `src/components/clipboard/ClipboardImageEditor.test.ts`

- [ ] **Step 1: 追加失败测试**（替换 Task 8 中 useDb 的简单 mock，集中管理可断言的 spy）

在测试文件顶部补充可控 spy 与 store mock：

```ts
const addImageEntry = vi.fn(async () => ({ id: 'new-1' }));
const copyEditedImageToClipboard = vi.fn(async () => {});

vi.mock('@/stores/clipboard', () => ({
  useClipboardStore: () => ({ addImageEntry }),
}));
```

并把已有的 `vi.mock('@/composables/useDb', ...)` 改为包含 `copyEditedImageToClipboard`。新增用例：

```ts
it('saves as a new entry then closes', async () => {
  addImageEntry.mockClear();
  const wrapper = mount(ClipboardImageEditor, { props: { entry }, attachTo: document.body });
  await wrapper.get('[data-testid="clip-editor-save"]').trigger('click');
  await Promise.resolve();
  expect(addImageEntry).toHaveBeenCalledOnce();
  expect(wrapper.emitted('close')).toBeTruthy();
  wrapper.unmount();
});

it('keeps the editor open and shows an error when saving fails', async () => {
  addImageEntry.mockRejectedValueOnce(new Error('boom'));
  const wrapper = mount(ClipboardImageEditor, { props: { entry }, attachTo: document.body });
  await wrapper.get('[data-testid="clip-editor-save"]').trigger('click');
  await Promise.resolve();
  await Promise.resolve();
  expect(wrapper.get('[data-testid="clip-editor-error"]').exists()).toBe(true);
  expect(wrapper.emitted('close')).toBeFalsy();
  wrapper.unmount();
});
```

> 因 jsdom 下 `canvas.toDataURL` 不可用，需 mock 渲染导出。在测试顶部加：
> ```ts
> vi.mock('@/utils/canvasRender', async (orig) => ({
>   ...(await orig<typeof import('@/utils/canvasRender')>()),
>   renderToDataUrl: vi.fn(() => 'data:image/png;base64,ZWRpdGVk'),
> }));
> ```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm test -- src/components/clipboard/ClipboardImageEditor.test.ts`
Expected: FAIL（找不到 `clip-editor-save`）。

- [ ] **Step 3: 接线**

`<script setup>` 增补 import 与依赖：

```ts
import { useClipboardStore } from '@/stores/clipboard';
import { useDb } from '@/composables/useDb';
import { renderToDataUrl } from '@/utils/canvasRender';
```

```ts
const store = useClipboardStore();
const db = useDb();
const saving = ref(false);
const errorMessage = ref<string | null>(null);

function exportDataUrl(): string | null {
  if (!sourceImage || !srcWidth.value) return null;
  return renderToDataUrl(sourceImage, srcWidth.value, srcHeight.value, editor.ops.value);
}

async function saveAsNew() {
  const dataUrl = exportDataUrl();
  if (!dataUrl) {
    errorMessage.value = '图片尚未加载完成';
    return;
  }
  saving.value = true;
  errorMessage.value = null;
  try {
    await store.addImageEntry(dataUrl);
    emit('close');
  } catch (e: unknown) {
    errorMessage.value = e instanceof Error ? e.message : '保存失败';
  } finally {
    saving.value = false;
  }
}

async function copyResult() {
  const dataUrl = exportDataUrl();
  if (!dataUrl) return;
  try {
    await db.copyEditedImageToClipboard(dataUrl);
  } catch (e: unknown) {
    errorMessage.value = e instanceof Error ? e.message : '复制失败';
  }
}
```

footer 模板替换为：

```vue
      <footer class="clip-editor__footer" data-testid="clip-editor-footer">
        <span v-if="errorMessage" class="clip-editor__error" role="alert" data-testid="clip-editor-error">{{ errorMessage }}</span>
        <span class="clip-editor__status" data-testid="clip-editor-status">已应用 {{ editor.ops.value.length }} 步 · {{ outputSize.w }}×{{ outputSize.h }}</span>
        <span class="clip-editor__spacer" />
        <button class="clip-editor__btn" type="button" data-testid="clip-editor-copy" @click="copyResult">复制</button>
        <button class="clip-editor__btn" type="button" data-testid="clip-editor-cancel" @click="close">取消</button>
        <span class="clip-editor__save-split">
          <button class="clip-editor__primary" type="button" :disabled="saving" data-testid="clip-editor-save" @click="saveAsNew">保存为新条目</button>
          <button class="clip-editor__primary-caret" type="button" title="更多保存方式" data-testid="clip-editor-save-more" disabled>▾</button>
        </span>
      </footer>
```

补充样式：

```css
.clip-editor__error { color: var(--danger, #d03050); font-size: 12px; }
.clip-editor__save-split { display: inline-flex; }
.clip-editor__primary { height: 34px; padding: 0 14px; border: 1px solid var(--app-accent); background: var(--app-accent); color: #fff; border-radius: 7px 0 0 7px; cursor: pointer; }
.clip-editor__primary:disabled { opacity: 0.6; cursor: not-allowed; }
.clip-editor__primary-caret { height: 34px; width: 28px; border: 1px solid var(--app-accent); border-left-color: rgba(255,255,255,0.35); background: var(--app-accent); color: #fff; border-radius: 0 7px 7px 0; cursor: not-allowed; opacity: 0.7; }
```

> 删除 Task 8 footer 里旧的 `clip-editor__spacer` + 单独取消按钮（被本任务的 footer 覆盖）。

- [ ] **Step 4: 运行测试**

Run: `pnpm test -- src/components/clipboard/ClipboardImageEditor.test.ts`
Expected: PASS（全部用例）。

- [ ] **Step 5: typecheck + 提交**

```bash
pnpm typecheck
git add src/components/clipboard/ClipboardImageEditor.vue src/components/clipboard/ClipboardImageEditor.test.ts
git commit -m "feat: 编辑器保存为新条目与复制结果并处理错误"
```

---

## Task 12: 前端 — 接入 ClipboardView（替换旧全屏预览）

把 `ClipboardView.vue` 里内联的 `.clipboard-image-viewer`（全屏遮罩预览）整体移除，改为：点图片"打开"时挂载 `ClipboardImageEditor`。

**Files:**
- Modify: `src/views/ClipboardView.vue`
- Modify: `src/views/ClipboardView.test.ts`

- [ ] **Step 1: 改测试**（替换现有 "opens image entries in the built-in image previewer" 用例）

```ts
it('opens image entries in the built-in image editor', async () => {
  const dataUrl = 'data:image/png;base64,iVBORw0KGgo=';
  listClipboardEntries.mockResolvedValueOnce([
    {
      id: 'img-1',
      contentType: 'image',
      content: dataUrl,
      htmlContent: null,
      preview: '图片内容',
      createdAt: '2026-06-01T00:00:00Z',
      updatedAt: '2026-06-01T00:00:00Z',
      sizeBytes: dataUrl.length,
    },
  ]);

  const wrapper = mount(ClipboardView, { attachTo: document.body });
  await vi.dynamicImportSettled();

  expect(wrapper.find('[data-testid="clip-image-editor"]').exists()).toBe(false);
  await wrapper.get('[data-testid="clipboard-open-img-1"]').trigger('click');
  expect(openUrl).not.toHaveBeenCalled();
  expect(document.querySelector('[data-testid="clip-image-editor"]')).not.toBeNull();
  wrapper.unmount();
});
```

> 编辑器用 `<Teleport to="body">`，断言用 `document.querySelector` 查 body。需 `attachTo: document.body`。同时在该测试文件的 useDb mock 里补 `addImageClipboardEntry`/`copyEditedImageToClipboard`（返回 vi.fn），并 mock `@/stores/clipboard` 的 `addImageEntry`（或依赖真实 store+mock useDb）。

- [ ] **Step 2: 运行确认失败**

Run: `pnpm test -- src/views/ClipboardView.test.ts`
Expected: FAIL（仍是旧的 `clipboard-image-viewer`）。

- [ ] **Step 3: 改 ClipboardView.vue**

script 部分：import 编辑器，`previewImage` 语义不变（作为"当前编辑的图片条目"）：

```ts
import ClipboardImageEditor from '@/components/clipboard/ClipboardImageEditor.vue';
```

`handleOpen` 的 image 分支保持 `previewImage.value = entry;`（不变）。`closeImagePreview` 保持。

模板：删除整段 `<div v-if="previewImage" class="clipboard-image-viewer" ...> ... </div>`（约 `ClipboardView.vue:388-424`），替换为：

```vue
    <ClipboardImageEditor
      v-if="previewImage"
      :entry="previewImage"
      @close="closeImagePreview"
    />
```

样式：删除 `.clipboard-image-viewer`、`.clipboard-image-viewer__surface`、`.clipboard-image-viewer__header`、`.clipboard-image-viewer__stage` 及其子规则（约 `:808-880`）。

- [ ] **Step 4: 运行测试**（含整套回归）

Run: `pnpm test -- src/views/ClipboardView.test.ts`
Expected: PASS。

- [ ] **Step 5: 全量校验**

Run: `pnpm typecheck && pnpm test`
Expected: typecheck 通过；测试全绿。

- [ ] **Step 6: 提交**

```bash
git add src/views/ClipboardView.vue src/views/ClipboardView.test.ts
git commit -m "feat: 剪贴板图片改用内置原地编辑器替换全屏预览"
```

---

## 自检（计划 vs spec）

- **spec 覆盖**：模态框无遮罩/拖动缩放 → Task 8；变换(裁剪/旋转/翻转/缩放) → Task 9+10；基础调整(亮度/对比度/饱和度/灰度/反相) → Task 10；撤销/重做/重置 → Task 6+9；保存为新条目(B) → Task 1+3+11；复制 → Task 2+11；A/D 预留置灰 → Task 11；接入替换旧预览 → Task 12；可序列化 EditOp → Task 4+6；组件拆分(4 新文件) → Task 4-8；后端 1+1 命令 → Task 1+2。**无遗漏**。
- **占位符**：无 TBD/TODO；每步含可运行代码与命令。Task 10 的裁剪手柄拖拽标为"增强"，但整图裁剪闭环已实现，crop 原子能力达成。
- **类型一致性**：`EditOp`/`AdjustParams`/`CropRect`/`NEUTRAL_ADJUST`（imageOps）→ `useImageEditor`/`canvasRender`/组件全程同名；`addImageEntry`(store)/`addImageClipboardEntry`+`copyEditedImageToClipboard`(useDb)/`add_image_clipboard_entry`+`copy_edited_image_to_clipboard`(Rust) 命名贯穿一致；invoke 参数 `{ dataUrl }` ↔ Rust `data_url`（与现有 `update_clipboard_entry` 的 `htmlContent`↔`html_content` 一致）。

## 偏离 spec 的小修正（已在计划内消化）

- spec §5 "后端只新增 1 个命令" → 实际 **2 个**（补了 `copy_edited_image_to_clipboard`，因 spec §4.3/§5 本就要求"复制写回系统剪贴板"，原 spec 后端清单漏列）。
