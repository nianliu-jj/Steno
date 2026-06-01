# Steno 图片查看器 — 参考项目综合分析与执行计划

> **目标**: 为 Steno 项目（Rust + Tauri 2.x + Vue 3）设计并实现图片查看器功能  
> **参考项目**: lap, oculante, qView, simp, viu, ImageGlass, JarkViewer, FlowVision  
> **日期**: 2025-07-15

---

## 一、参考项目技术栈总览

| 项目 | 语言 | GUI 框架 | 图像渲染 | 平台 | 定位 |
|------|------|----------|----------|------|------|
| **lap** | Rust+TS | Tauri 2 + Vue 3 | CSS/DOM | 跨平台 | 照片管理器 (最相关) |
| **oculante** | Rust | notan + egui | OpenGL/WGPU 纹理 | 跨平台 | 轻量查看器 |
| **qView** | C++ | Qt6 Widgets | QGraphicsView | 跨平台 | 轻量查看器 |
| **simp** | Rust | wgpu + egui | GPU 着色器 | 跨平台 | 轻量查看器 |
| **viu** | Rust | CLI | 终端协议 | 跨平台 | 终端查看器 |
| **ImageGlass** | C# | WinForms + D2D | Direct2D | Windows | 重量级查看器 |
| **JarkViewer** | C++ | Win32 + D3D11 | CPU + GPU 混合 | Windows | 本地查看器 |
| **FlowVision** | Swift | AppKit | NSImageView | macOS | 本地查看器 |

---

## 二、原子功能对比矩阵

### 2.1 图像加载

| 原子功能 | lap | oculante | qView | simp | ImageGlass | JarkViewer |
|----------|-----|----------|-------|------|------------|------------|
| JPEG/PNG/GIF/BMP/WebP | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| AVIF | ✅ | ✅ (feature) | ✅ | ❌ | ✅ | ✅ |
| HEIC/HEIF | ✅ | ✅ (feature) | ✅ | ✅ (feature) | ✅ | ✅ |
| JPEG XL | ✅ | ✅ | ❌ | ✅ (feature) | ❌ | ✅ |
| RAW (CR2/NEF/ARW/...) | ✅ (30+) | ✅ (30+) | ❌ | ✅ (30+) | ✅ | ✅ (30+) |
| SVG | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| PSD | ❌ | ✅ | ❌ | ✅ | ✅ | ✅ |
| EXR/HDR | ❌ | ✅ | ❌ | ✅ (EXR) | ❌ | ❌ |
| 视频缩略图 | ✅ (FFmpeg) | ❌ | ❌ | ❌ | ❌ | ✅ (FFmpeg) |
| KTX2/DDS | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| PDF | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| DICOM | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |

### 2.2 图像显示

| 原子功能 | lap | oculante | qView | simp | ImageGlass | JarkViewer |
|----------|-----|----------|-------|------|------------|------------|
| 适应窗口 (Fit) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 1:1 像素 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 填充窗口 (Fill) | ✅ | ❌ | ❌ | ✅ | ✅ | ❌ |
| 自由缩放 | ✅ | ✅ | ✅ | ✅ | ✅ (1%-10000%) | ✅ |
| 鼠标居中缩放 | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ |
| 拖拽平移 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 旋转 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 翻转 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 棋盘格背景 | ❌ | ❌ | ✅ | ✅ | ✅ | ❌ |
| 通道隔离 | ❌ | ✅ (GPU) | ❌ | ❌ (着色器) | ✅ | ❌ |
| 像素放大镜 | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| 分屏对比 | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| 视口同步 | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |

### 2.3 导航与浏览

| 原子功能 | lap | oculante | qView | simp | ImageGlass | JarkViewer |
|----------|-----|----------|-------|------|------------|------------|
| 前后翻页 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 首尾跳转 | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |
| 随机跳转 | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| 目录枚举 (自然排序) | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| 幻灯片 | ✅ | ❌ | ✅ | ❌ | ✅ | ❌ |
| 缩略图条/网格 | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ |
| 虚拟滚动 | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ |
| 文件浏览器对话框 | ❌ | ✅ (自定义) | ❌ | ❌ | ✅ | ❌ |

### 2.4 编辑功能

| 原子功能 | lap | oculante | qView | simp | ImageGlass |
|----------|-----|----------|-------|------|------------|
| 裁剪 | ✅ | ✅ | ❌ | ✅ | ✅ |
| 缩放 (resize) | ✅ | ✅ | ❌ | ❌ | ✅ |
| 旋转/翻转保存 | ✅ | ✅ | ✅ | ✅ | ✅ |
| 亮度/对比度 | ✅ | ✅ | ❌ | ✅ (GPU) | ✅ |
| 饱和度/色调 | ✅ | ✅ | ❌ | ✅ (GPU) | ✅ |
| 灰度 | ✅ | ✅ | ❌ | ✅ (GPU) | ✅ |
| 反相 | ✅ | ✅ | ❌ | ✅ (GPU) | ✅ |
| 模糊 | ✅ | ❌ | ❌ | ❌ | ❌ |
| 滤镜 | ✅ (sepia) | ❌ | ❌ | ❌ | ❌ |
| Undo/Redo | ❌ | ✅ (操作栈) | ❌ | ✅ | ❌ |
| 绘画 | ❌ | ✅ | ❌ | ❌ | ❌ |
| 输出格式选择 | ✅ | ✅ | ❌ | ✅ | ✅ |

### 2.5 元数据

| 原子功能 | lap | oculante | qView | ImageGlass | JarkViewer |
|----------|-----|----------|-------|------------|------------|
| EXIF 读取 | ✅ | ✅ | ❌ | ✅ | ✅ |
| EXIF 方向自动旋转 | ✅ | ❌ | ✅ | ❌ | ❌ |
| EXIF 写入/保留 | ✅ | ❌ | ❌ | ✅ | ❌ |
| 直方图 | ✅ | ✅ | ❌ | ❌ | ❌ |
| 文件信息对话框 | ✅ | ✅ | ✅ (QVInfoDialog) | ✅ | ✅ |
| 色彩空间管理 | ❌ | ❌ | ✅ (ICC) | ✅ | ✅ (lcms2) |

### 2.6 快捷键与配置

| 原子功能 | lap | oculante | qView | simp | ImageGlass |
|----------|-----|----------|-------|------|------------|
| 可配置快捷键 | ✅ | ✅ | ✅ | ❌ | ✅ |
| 平台感知快捷键 | ✅ (Mac/Win) | ❌ | ✅ | ❌ | ❌ |
| 全局热键 | ❌ | ✅ | ❌ | ❌ | ❌ |
| 设置持久化 | ✅ (config) | ✅ (JSON) | ✅ (JSON) | ✅ (TOML) | ✅ (JSON) |
| 会话恢复 | ❌ | ❌ | ✅ | ❌ | ✅ |
| 多语言 | ✅ (9种) | ❌ | ✅ (8种) | ❌ | ✅ (20+) |

---

## 三、Steno 图片查看器推荐架构

基于 8 个项目的分析，结合 Steno 的 Tauri + Vue 技术栈，推荐以下架构：

### 3.1 整体分层

```
┌─────────────────────────────────────────────────────────┐
│                    Vue 3 前端 (src-vite/)                │
├─────────────────────────────────────────────────────────┤
│  Views: ImageViewer.vue, ImageEditor.vue                │
│  Components: ImageCanvas.vue, ThumbnailStrip.vue,       │
│              Toolbar.vue, InfoPanel.vue, ...             │
│  Composables: useZoom.ts, usePan.ts, useSlideshow.ts    │
│  Stores: viewerStore.ts, settingsStore.ts               │
├─────────────────────────────────────────────────────────┤
│              Tauri Commands (IPC 桥)                     │
│  invoke('load_image') / invoke('get_thumbnail') / ...   │
├─────────────────────────────────────────────────────────┤
│                   Rust 后端 (src-tauri/)                 │
├─────────────────────────────────────────────────────────┤
│  t_image.rs     — 图像加载/解码/缩略图/EXIF             │
│  t_format.rs    — 格式探测与分发 (jpeg/jxl/heif/raw/...)│
│  t_edit.rs      — 图像编辑操作                          │
│  t_fileops.rs   — 文件操作 (复制/移动/删除/重命名)      │
│  t_config.rs    — 查看器配置                            │
│  t_shortcuts.rs — 快捷键管理                            │
└─────────────────────────────────────────────────────────┘
```

### 3.2 推荐的 Cargo 依赖 (借鉴 lap + oculante)

```toml
# 核心图像处理
image = "0.25"                    # 通用格式解码
fast_image_resize = "5.1"         # 高性能缩放
imagesize = "0.13"                # 快速尺寸探测
kamadak-exif = "0.6"              # EXIF 读取
little_exif = "0.6"               # EXIF 写入

# 特定格式
jxl-oxide = "0.12"                # JPEG XL
# libheif-rs (可选, HEIC/HEIF)
# libraw (可选, RAW 格式)

# JPEG 加速 (可选, 需编译 C 库)
# 参考 lap 的 libjpeg-turbo 方案

# FFmpeg sidecar (可选, 视频缩略图)
# 参考 lap 的 t_video.rs
```

### 3.3 Vue 前端渲染策略

**核心方案: CSS Transform** (借鉴 lap)

```vue
<!-- ImageCanvas.vue 渲染策略 -->
<div class="image-container">
  <img
    :src="imageUrl"
    :style="{
      transform: `scale(${zoom}) translate(${panX}px, ${panY}px)`,
      transformOrigin: '0 0',
      cursor: isDragging ? 'grabbing' : 'grab'
    }"
    @wheel="handleZoom"
    @pointerdown="handlePanStart"
    @pointermove="handlePanMove"
    @pointerup="handlePanEnd"
  />
</div>
```

**缩放模式** (借鉴 ImageGlass 的六种模式):

| 模式 | 说明 | 快捷键 |
|------|------|--------|
| `fit` | 适应窗口 (默认) | Ctrl+0 |
| `fill` | 填充窗口 | |
| `width` | 适应宽度 | |
| `height` | 适应高度 | |
| `actual` | 1:1 像素 | Ctrl+1 |
| `custom` | 自由缩放 | Ctrl+滚轮 |

**以鼠标为中心的缩放算法** (借鉴 simp):

```typescript
function zoomAtPoint(currentZoom, delta, mouseX, mouseY) {
  const factor = 1 + delta * 0.001;  // 指数缩放
  const newZoom = currentZoom * factor;
  // 调整平移以保持鼠标位置不变
  panX = mouseX - (mouseX - panX) * (newZoom / currentZoom);
  panY = mouseY - (mouseY - panY) * (newZoom / currentZoom);
  return { newZoom, panX, panY };
}
```

---

## 四、分阶段执行计划

### Phase 1: 最小可行图片查看器 (MVP)

**目标**: 打开图片、缩放、平移、翻页

| 步骤 | 任务 | 关键参考 | 预估工作量 |
|------|------|----------|-----------|
| 1.1 | Rust 后端: 图像尺寸探测 + 缩略图生成 | lap `t_image.rs` | 2d |
| 1.2 | Rust 后端: 目录文件枚举 (自然排序) | qView `qvfileenumerator` | 1d |
| 1.3 | Vue 前端: ImageCanvas 组件 (CSS Transform 缩放/平移) | lap `Image.vue` | 2d |
| 1.4 | Vue 前端: ImageViewer 页面 (前后翻页) | lap `ImageViewer.vue` | 2d |
| 1.5 | Vue 前端: Toolbar 工具栏 (缩放/适应/翻页按钮) | lap `MediaViewer.vue` | 1d |
| 1.6 | Tauri: 自定义协议注册 (本地文件访问) | lap `t_protocol.rs` | 0.5d |

**Phase 1 产出**: 双击图片 → 全屏查看器 → 鼠标滚轮缩放 → 拖拽平移 → 左右键翻页

### Phase 2: 增强浏览体验

**目标**: 缩略图条、全屏、幻灯片、信息面板

| 步骤 | 任务 | 关键参考 | 预估工作量 |
|------|------|----------|-----------|
| 2.1 | ThumbnailStrip 缩略图条组件 | ImageGlass `ImageGallery`, lap `GridView` | 2d |
| 2.2 | 全屏模式 (Tauri window setFullscreen) | lap `ImageViewer.vue` | 1d |
| 2.3 | 幻灯片模式 (可配置间隔) | qView slideshow, lap slideshow | 1d |
| 2.4 | 文件信息面板 (EXIF 显示) | oculante `info_ui`, lap `FileInfo.vue` | 1.5d |
| 2.5 | 右键菜单 | lap `ContextMenu.vue` | 1d |
| 2.6 | 缓存 + 预加载策略 | qView 缓存分层, lap 预加载 | 1.5d |

### Phase 3: 编辑功能

**目标**: 旋转、裁剪、颜色调整、保存

| 步骤 | 任务 | 关键参考 | 预估工作量 |
|------|------|----------|-----------|
| 3.1 | 旋转/翻转 (带 EXIF 保留) | lap `t_image.rs` edit_image | 1.5d |
| 3.2 | 裁剪 (选择框 + 蚂蚁线) | simp `crop.frag`, ImageGlass `SelectionResizer` | 2d |
| 3.3 | 颜色调整 (亮度/对比度/饱和度/灰度) | oculante `image_editing.rs`, simp shader | 2d |
| 3.4 | 输出格式/品质选择 | lap `EditParams`, oculante `file_encoder` | 1d |
| 3.5 | Undo/Redo 操作栈 | oculante, simp | 1.5d |

### Phase 4: 高级功能

**目标**: 格式扩展、分屏对比、快捷键系统

| 步骤 | 任务 | 关键参考 | 预估工作量 |
|------|------|----------|-----------|
| 4.1 | 扩展格式支持 (RAW, AVIF, HEIC, JXL, SVG) | oculante 40+ 格式, JarkViewer 格式分发 | 3d |
| 4.2 | 分屏对比模式 | lap `isSplit` + viewport sync | 2d |
| 4.3 | 可配置快捷键系统 | lap `shortcuts.ts`, qView `ShortcutManager` | 2d |
| 4.4 | 通道隔离查看 (R/G/B/A) | oculante GLSL swizzle, ImageGlass | 1d |
| 4.5 | 色彩管理 (ICC) | qView, JarkViewer lcms2 | 2d |
| 4.6 | 命令行接口 (CLI) | viu CLI, simp CLI | 1d |
| 4.7 | 主题切换 (亮/暗/系统) | lap, ImageGlass | 1d |

---

## 五、关键设计决策

### 5.1 图像渲染: CSS Transform vs Canvas

| 方案 | 优势 | 劣势 |
|------|------|------|
| **CSS Transform** (推荐) | 简单, GPU 加速, 浏览器优化 | 超大图 (>100MP) 内存占用高 |
| Canvas 2D | 像素级控制, 编辑友好 | 实现复杂, 缩放不够流畅 |
| WebGL | 极致性能, 着色器编辑 | 开发成本高, 兼容性 |

**推荐**: CSS Transform 用于 MVP, 后续可添加 Canvas/WebGL 用于编辑模式。

### 5.2 图像加载: Tauri Protocol vs Base64

| 方案 | 优势 | 劣势 |
|------|------|------|
| **Tauri 自定义协议** (推荐) | 流式加载, 无 Base64 开销 | 需处理缓存 |
| Base64 data URL | 简单 | 33% 体积膨胀, 大图不可行 |
| `convertFileSrc` | Tauri 内置 | 仅本地文件 |

**推荐**: `convertFileSrc` 用于显示, 自定义协议用于缩略图流。

### 5.3 缩略图策略

借鉴 lap: **后端预生成固定尺寸 JPEG** → 前端直接显示

```
文件 → get_file_thumb(filePath, 256) → JPEG bytes → <img src="asset://thumb/...">
```

### 5.4 缓存策略

借鉴 qView 三级缓存:

1. **内存 LRU**: 当前 + 前后各 2 张全分辨率图像 (~400 MiB)
2. **磁盘缓存**: 缩略图持久化 (lap 模式)
3. **预加载**: 后台预加载邻图 (±2)

---

## 六、风险与注意事项

1. **内存管理**: CSS Transform 渲染大图时, 浏览器可能消耗大量内存。需限制最大缩放倍率或使用瓦片纹理策略 (oculante 方案)。
2. **动画图像**: GIF/APNG/WebP 动画需要特殊处理，CSS `<img>` 或 Canvas 渲染均可行。
3. **色彩空间**: 浏览器默认 sRGB, 对广色域图像可能不正确。需评估是否需要 ICC 支持。
4. **性能**: `image` crate 的纯 Rust 解码对某些格式较慢, 可选 `libjpeg-turbo` 等 C 库加速 (lap 方案)。
5. **Tauri 权限**: Tauri 2.x 使用 capability 系统, 需正确配置文件系统访问权限。

---

## 七、参考文档索引

| 文件 | 内容 |
|------|------|
| [docs/01-lap-analysis.md](docs/01-lap-analysis.md) | lap (Tauri+Vue 照片管理器) |
| [docs/02-oculante-analysis.md](docs/02-oculante-analysis.md) | oculante (Rust+egui 查看器) |
| [docs/03-qview-analysis.md](docs/03-qview-analysis.md) | qView (C++/Qt 轻量查看器) |
| [docs/04-simp-analysis.md](docs/04-simp-analysis.md) | simp (Rust+wgpu 查看器) |
| [docs/05-viu-analysis.md](docs/05-viu-analysis.md) | viu (Rust CLI 终端查看器) |
| [docs/06-imageglass-analysis.md](docs/06-imageglass-analysis.md) | ImageGlass (C# 功能最全) |
| [docs/07-jarkviewer-analysis.md](docs/07-jarkviewer-analysis.md) | JarkViewer (C++ Win32 高性能) |
| [docs/08-flowvision-analysis.md](docs/08-flowvision-analysis.md) | FlowVision (Swift macOS 原生) |
