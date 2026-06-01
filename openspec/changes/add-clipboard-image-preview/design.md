## Design

### Clipboard Capture

后台监听顺序保持保守：先尝试读取文本，只有文本无法分类为有效条目时再读取图片。这样可以避免某些应用同时提供文本和图片时产生重复记录，也符合当前粘贴板模块已有行为。

图片读取采用 `arboard::Clipboard::get_image()`。该 API 返回宽、高和 RGBA 字节，和 PicViewer `simp/src/app/clipboard.rs` 的 `paste()` 逻辑一致。Steno 不直接持有 RGBA 原始数据，而是通过 `image::RgbaImage::from_raw()` 组装图像，再编码为 PNG bytes，最后转为 `data:image/png;base64,...`。

### Storage

图片条目沿用现有 `clipboard_history` 表：

- `content_type = "image"`
- `content = data:image/png;base64,...`
- `preview = "图片内容"`
- `content_hash = image:<hash>`
- `size_bytes = data URL UTF-8 字节数`

首版不拆分图片资源文件，也不生成多尺寸缩略图。这样能保持粘贴板历史列表和跨窗口事件 payload 简单一致。

### Preview UI

前端根据 `entry.contentType === "image"` 渲染 `<img>`，`src` 直接使用 data URL。图片区域使用固定最大高度与 `object-fit: contain`，防止大图撑开列表。`alt` 使用“剪贴板图片预览”，便于测试和辅助技术识别。

### Copy Back

复制图片条目时，后端将 data URL 解码为图片，再转换为 `arboard::ImageData` 写回系统剪贴板。该路径与文本复制共用 `copy_clipboard_entry(id)` 命令，对前端透明。

### Non-Goals

- 不实现图片缩放查看器、旋转、裁剪、EXIF、RAW 或多帧 GIF。
- 不实现图片落盘缓存或自动清理。
- 不解析 macOS `NSPasteboardNameDrag` 拖拽粘贴板；本次只处理系统剪贴板复制。
