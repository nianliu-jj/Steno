# 剪贴板图片 · 原地编辑器 — 设计文档

> **日期**: 2026-06-01
> **分支**: pic/dev
> **范围**: 给剪贴板图片预览框增加原地编辑能力 + 重做预览框形态
> **状态**: 设计已确认，待写实现计划

---

## 一、目标与背景

剪贴板历史里点"打开"一张图片时，当前会弹出一个**全屏暗化 + 重模糊**的覆盖层（`ClipboardView.vue` 内联的 `.clipboard-image-viewer`）。本次要做两件事：

1. **重做预览框形态**：去掉全屏遮罩那圈阴影，改成一个**无遮罩、可拖动移动、可拖角缩放、比主窗口小**的 DOM 模态框。
2. **新增原地编辑能力**：在这个框里直接对图片做**裁剪、旋转、翻转、缩放、基础调整**，并把结果存回剪贴板。

### 关键技术事实（已核对源码）

- 剪贴板图片的 `content` 字段是**整串 `data:image/png;base64,…` data URL**（`src-tauri/src/clipboard.rs:67` `image_entry_from_data_url`，编码见 `:290` `image_data_url`）。
- 复制回系统剪贴板时后端把该 data URL 解码成 arboard 图像（`clipboard.rs:121`）。→ 编辑后只要重新编码成 PNG data URL，复制/粘贴链路天然可用。
- 后端已有 `db.upsert_clipboard_entry(NewClipboardEntry)`（`db.rs:1267`，插入并按 `content_hash` 去重）与 `image_entry_from_data_url`（`clipboard.rs:67`，构造 `preview="图片内容"` 的图片条目）。watcher 写库后 emit `steno:clipboard-updated`（`clipboard.rs:16,195`）。
- `update_clipboard_entry_content`（`db.rs:1386`）把 `preview` 截成 `content[..120]` —— 对图片会变成一段 base64，是个已知坑（仅影响"覆盖"语义 A，本期不启用，记录在案）。
- 前端类型 `ClipboardEntry`（`src/types/steno.ts:163`）、IPC 封装 `useDb()`（`src/composables/useDb.ts`）、预览框现状（`ClipboardView.vue:388-424`，样式 `:808-880`，`handleOpen` 在 `:113`）。

---

## 二、已确认的产品决策

| 维度 | 决策 |
|------|------|
| **保存目标** | **默认 B = 存为新条目**（保留原图）；架构预留 **A = 覆盖原条目**、**D = 导出到文件**（本期入口置灰/"即将支持"） |
| **功能范围** | **范围三**：本期实现裁剪/旋转/翻转/缩放/基础调整；工具栏与数据结构按"将来可加标注"预留，不引入标注内核 |
| **模态框形态** | **无遮罩**：编辑器直接浮在应用上、背后完全可见；居中、比主窗口小、标题栏可拖动移动、右下角手柄拖动缩放 |
| **编辑引擎** | **A1 · 纯前端 canvas**：几何用 `drawImage`，调整用逐像素 `ImageData`（不依赖 `ctx.filter`），实时预览用 CSS `filter`；每步编辑建模为**可序列化操作**，给将来后端渲染(A2)留门 |

### 基础调整的具体集合（范围一）

亮度 (brightness)、对比度 (contrast)、饱和度 (saturation)、灰度 (grayscale)、反相 (invert)。
前三者为滑块（含中点=无变化），后两者为开关。

---

## 三、架构与组件拆分

现 `ClipboardView.vue` 已 893 行，编辑器必须独立，避免继续膨胀。

```
src/
├── views/ClipboardView.vue          # 仅负责：点"打开"图片 → 挂载编辑器、透传 entry、接收 saved/close
├── components/clipboard/
│   └── ClipboardImageEditor.vue     # 模态框外壳：无遮罩浮层 / 拖动移动 / 拖角缩放 / 工具栏 / 底部操作栏 / 键盘
├── composables/
│   ├── useImageEditor.ts            # 编辑状态机：原图载入、ops 操作栈、undo/redo/reset、导出 dataURL
│   └── useDraggableResizable.ts     # 模态框的拖动+缩放（纯交互，可独立测）
└── utils/
    └── imageOps.ts                  # 纯函数：几何变换 + 像素调整（无 Vue 依赖，易单测）
```

> 单一职责：`imageOps.ts` 不知道 Vue/DOM；`useImageEditor.ts` 不碰布局；`ClipboardImageEditor.vue` 不写像素算法；`useDraggableResizable.ts` 不知道图片。每个单元可独立理解与测试。

### 3.1 编辑操作模型（可序列化）

```ts
// 几何 op 为离散步骤；adjust 为一个携带全量调整参数的尾部 op
type EditOp =
  | { type: 'crop';   rect: { x: number; y: number; w: number; h: number } } // 原图像素坐标
  | { type: 'rotate'; deg: number }            // 本期 UI 仅 ±90° 步进；模型支持任意角(预留)
  | { type: 'flip';   axis: 'h' | 'v' }
  | { type: 'resize'; w: number; h: number }
  | { type: 'adjust'; brightness: number; contrast: number; saturation: number; grayscale: boolean; invert: boolean };

interface EditorState {
  ops: EditOp[];        // 历史栈：按顺序应用到原图
  redo: EditOp[];       // 重做栈
  dirty: boolean;       // 是否有未保存改动
}
```

- **渲染 = 把 ops 顺序应用到原始位图**（crop→rotate→flip→resize→adjust），最后 `toDataURL('image/png')`。
- **undo** = `ops.pop()` 压入 `redo`；**redo** 反向；**reset** = 清空 ops。
- 滑块拖动时：用 CSS `filter` 做**实时预览**（不入栈）；松手提交时**替换/追加尾部 `adjust` op**，保持栈干净、可序列化。
- 该模型可整串发给 Rust（A2 高质量渲染）而不改 UX——这是"预留"的落点。

### 3.2 渲染性能（剪贴板截图量级，1–4MP）

- 缓存"几何结果 canvas"：仅当几何 op 变化才重跑几何；仅 adjust 变化时只重跑像素调整。
- 像素调整为简单逐像素数学，必要时可移入 Web Worker（本期不强制）。

---

## 四、UI 设计

参考 mockup：`docs/superpowers/mockups/image-editor-mockup.html`。

### 4.1 模态框（无遮罩）

- DOM 内浮层（非独立 OS 窗口）。无背景遮罩、无 backdrop blur，背后应用清晰可见。
- 初始尺寸约 760×580，居中；**最小 480×420**，**最大不超过主窗口可视区**。
- 标题栏可拖动移动整框；右下角手柄拖动缩放（`useDraggableResizable`）。
- 因无遮罩 → **不支持点外部关闭**；关闭走右上角 ✕、Esc、或保存后回调。
- `role="dialog"` `aria-modal="false"`（无遮罩即非真模态遮挡）；打开时聚焦容器，Esc 关闭。
- 标题栏展示：`图片内容 · 06/01 10:14 · {宽}×{高}`。

> 实现选择（已定）：用 Naive UI `n-modal` 需去掉其 mask 并接管拖动/缩放，定制成本高；本设计采用**自绘 `<div>` 浮层 + `<Teleport to="body">`**，对"无遮罩 + 拖动 + 缩放"控制更直接。

### 4.2 工具栏（横向图标条，借鉴 snow-shot 样式）

| 组 | 项 |
|----|----|
| 变换 | 裁剪、左转90°、右转90°、水平翻转、垂直翻转、缩放尺寸 |
| 调整 | 亮度/对比度/饱和度（滑块 popover）、灰度、反相 |
| 历史 | 撤销 (⌘Z)、重做 (⌘⇧Z)、重置为原图 |
| 预留 | 最右一个虚线"＋标注（预留）"占位，范围二接入点 |

- 裁剪：图上选框 + 四角手柄 + 三分线；确认后裁剪、取消还原。
- 缩放尺寸：输入宽高（可锁定纵横比），用于输出像素尺寸（区别于查看 zoom）。

### 4.3 底部操作栏

- 主按钮 **保存为新条目**（B，split button）+ 右侧箭头下拉：**覆盖原条目**(A，置灰/即将支持)、**导出到文件…**(D，置灰/即将支持)。
- **复制**：把当前编辑结果 data URL 写回系统剪贴板。
- **取消**：有未保存改动时二次确认。
- 左侧状态：`已应用 N 步 · 裁剪 {w}×{h}`。

---

## 五、数据流

```
点"打开"图片 (entry.content = data:image/png;base64,…)
  → ClipboardView 挂载 ClipboardImageEditor(entry)
  → useImageEditor 载入原图到离屏 canvas / ImageBitmap
  → 用户操作 → 入 ops 栈 → 实时预览（CSS filter / canvas 重绘）
  → 点"保存为新条目"
       → 离屏 canvas 顺序应用 ops → toDataURL('image/png')
       → invoke('add_image_clipboard_entry', { dataUrl })
       → 后端 image_entry_from_data_url → upsert_clipboard_entry → emit 'steno:clipboard-updated'
       → 前端 store 已监听该事件，自动插入新卡片；编辑器关闭
  → "复制"：writeImage(dataUrl) 回系统剪贴板（不改库）
```

### 后端改动（本期仅 1 处新增）

新增 Tauri command（`commands.rs`）：

```rust
#[tauri::command]
pub async fn add_image_clipboard_entry(
    app: AppHandle, db: State<'_, Db>, data_url: String,
) -> Result<ClipboardEntry, String> {
    // 1. image_entry_from_data_url(data_url) → NewClipboardEntry（非 data:image/ 前缀则报错）
    // 2. db.upsert_clipboard_entry(entry) → ClipboardEntry（按 hash 去重）
    // 3. app.emit(CLIPBOARD_UPDATED_EVENT, entry.clone())
    // 4. Ok(entry)
}
```

- 在 `lib.rs` 的 `invoke_handler!` 注册；`useDb.ts` 加 `addImageClipboardEntry(dataUrl)` 封装；`stores/clipboard.ts` 加 action（或直接由现有 `steno:clipboard-updated` 监听 upsert，无需新 action）。
- **预留项不在本期实现**：A 复用 `update_clipboard_entry`（启用前需修 `db.rs:1386` 的图片 preview 坑）；D 需新增写文件命令（用 `plugin-dialog` 选路径）。本期仅保留置灰入口。

---

## 六、错误处理

- 原图解码失败 / data URL 非法 → 编辑器内显式错误条，不静默关闭。
- 保存（`add_image_clipboard_entry`）失败 → 顶部错误提示，**保留编辑态不关闭**，可重试。
- 复制失败 → 局部提示，不影响编辑。
- 超大图（极端情况）→ 限制最大输出尺寸或提示；剪贴板截图量级通常无需触发。

---

## 七、测试（vitest + @vue/test-utils；后端 cargo test）

**前端单元**
- `imageOps.ts`：crop/rotate/flip/resize 输出尺寸正确；亮度/对比度/饱和度/灰度/反相像素值符合预期（小图断言）。
- `useImageEditor.ts`：ops 入栈、undo/redo/reset、dirty 标记、导出 dataURL 调用顺序。
- `useDraggableResizable.ts`：拖动位移、缩放的 min/max 约束。

**前端组件**
- `ClipboardImageEditor.vue`：打开渲染原图、Esc/✕ 关闭、拖角受 min/max 约束、"保存为新条目"调用 `addImageClipboardEntry(dataUrl)`、"复制"走系统剪贴板、取消的二次确认。
- `ClipboardView.vue`：点图片"打开"挂载编辑器（替换原全屏预览），`saved` 后关闭。

**后端**
- `add_image_clipboard_entry`：合法 data URL → 插入并返回 image 条目；重复内容去重；非 `data:image/` 前缀报错。

覆盖率沿用项目 ≥80% 目标。

---

## 八、明确不做（YAGNI）

标注（箭头/矩形/文字/马赛克/画笔）、滤镜库、格式转换 UI、EXIF 读写、缩略图条、幻灯片、多图浏览、A/D 的实际落地（本期仅留接口与置灰入口）、后端 image-crate 渲染管线（留给 A2）。

---

## 九、影响文件清单

**新增**
- `src/components/clipboard/ClipboardImageEditor.vue`
- `src/composables/useImageEditor.ts`
- `src/composables/useDraggableResizable.ts`
- `src/utils/imageOps.ts`
- 对应 `*.test.ts`

**修改**
- `src/views/ClipboardView.vue`（移除内联全屏预览，改挂载编辑器）
- `src/composables/useDb.ts`（加 `addImageClipboardEntry`）
- `src/stores/clipboard.ts`（按需加 action，或仅依赖现有事件监听）
- `src-tauri/src/commands.rs`（新增 command）
- `src-tauri/src/lib.rs`（注册 command）
