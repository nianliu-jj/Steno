## Why

Steno 已有粘贴板历史页和后台监听能力，但用户在复制截图、浏览器图片或图片编辑器内容后，需要在粘贴板列表中直接确认图片内容，而不是只看到“图片内容”的文本摘要。参考 `PicViewer` 中 `simp/src/app/clipboard.rs` 的实现，图片粘贴板能力应基于系统剪贴板读取 RGBA 像素，再转换为可在前端稳定展示的图像资源。

## What Changes

- 粘贴板监听继续使用现有 `arboard::Clipboard`，在文本读取无有效条目时读取图片数据。
- 将系统剪贴板图片转换为 PNG data URL 存入 `clipboard_history.content`，保持前端无需额外文件协议即可预览。
- 粘贴板页面对 `contentType === "image"` 的条目渲染真实缩略图，并保留复制回系统剪贴板的能力。
- 补充前端测试，确保图片条目不会退化为文本摘要。
- 补充 Rust 测试，覆盖图片 data URL 条目的类型、摘要、hash 和大小计算。

## Capabilities

### Modified Capabilities

- `clipboard-history`: 粘贴板历史支持图片条目的捕获、持久化、缩略预览和复制回系统剪贴板。

## Impact

- **后端**：复用 `src-tauri/src/clipboard.rs` 现有 image data URL 转换和写回逻辑，必要时补齐单测。
- **前端**：复用 `src/views/ClipboardView.vue` 的图片分支，必要时补齐图片预览测试与可访问属性。
- **参考项目**：沿用 PicViewer `simp` 中“arboard 读取/写入 RGBA 图片”的架构思路；不引入完整图片查看器、缩放、编辑和多格式解码管线。
- **数据迁移**：无新增 schema，图片继续以 `clipboard_history.content` 保存 data URL。
