# Lap 项目分析报告

> **技术栈**: Rust + Tauri 2.x + Vue 3 + Vite + Tailwind CSS  
> **定位**: 离线优先的本地照片管理器（类似 Lightroom）  
> **许可证**: GPL-3.0  
> **版本**: 0.2.3  
> **与 Steno 的关联度**: ⭐⭐⭐⭐⭐ (技术栈完全一致)

---

## 一、项目架构

```
lap/
├── src-tauri/              # Rust 后端 (Tauri)
│   ├── src/
│   │   ├── main.rs         # 入口，插件注册，全局状态管理
│   │   ├── t_cmds.rs       # 所有 Tauri command 定义（~80+）
│   │   ├── t_image.rs      # 图像处理核心（缩略图、缩放、EXIF、编辑）
│   │   ├── t_sqlite.rs     # SQLite 数据库（库、相册、标签、人脸）
│   │   ├── t_ai.rs         # AI 引擎（ONNX Runtime，图像搜索）
│   │   ├── t_face.rs       # 人脸检测与识别
│   │   ├── t_video.rs      # 视频缩略图与播放（FFmpeg sidecar）
│   │   ├── t_dedup.rs      # 图像去重（感知哈希）
│   │   ├── t_jpeg.rs       # libjpeg-turbo JPEG 编解码
│   │   ├── t_jxl.rs        # JPEG XL 支持
│   │   ├── t_heif.rs       # HEIF/HEIC 支持
│   │   ├── t_libraw.rs     # RAW 格式处理
│   │   ├── t_protocol.rs   # 自定义协议注册
│   │   ├── t_config.rs     # 应用配置
│   │   ├── t_menu.rs       # 原生菜单
│   │   ├── t_http.rs       # HTTP Server (Linux 视频)
│   │   ├── t_pasteboard.rs # 剪贴板（macOS）
│   │   ├── t_migration.rs  # 数据库迁移
│   │   ├── t_cluster.rs    # 地理位置聚类
│   │   ├── t_lens.rs       # 镜头信息
│   │   └── third_party/    # C/C++ 第三方库
│   │       ├── libjpeg-turbo/
│   │       ├── LibRaw/
│   │       ├── libheif/
│   │       └── libde265/
│   ├── Cargo.toml          # Rust 依赖
│   └── tauri.conf.json     # Tauri 配置
│
├── src-vite/               # Vue 前端
│   ├── src/
│   │   ├── main.js         # Vue 入口
│   │   ├── App.vue         # 根组件
│   │   ├── views/
│   │   │   ├── Home.vue        # 主界面（库浏览）
│   │   │   ├── ImageViewer.vue # 图片查看器（814行）
│   │   │   ├── ImageEditor.vue # 图片编辑器
│   │   │   ├── Settings.vue    # 设置页
│   │   │   └── PrintView.vue   # 打印页
│   │   ├── components/
│   │   │   ├── MediaViewer.vue  # 媒体查看器核心（~800行）
│   │   │   ├── Image.vue        # 图像渲染组件
│   │   │   ├── Video.vue        # 视频播放组件
│   │   │   ├── GridView.vue     # 缩略图网格
│   │   │   ├── VirtualScroll.vue # 虚拟滚动
│   │   │   ├── Thumbnail.vue    # 缩略图
│   │   │   ├── FileInfo.vue     # 文件信息面板
│   │   │   ├── ContextMenu.vue  # 右键菜单
│   │   │   ├── TaggingDialog.vue # 标签编辑
│   │   │   ├── Calendar.vue     # 日历视图
│   │   │   ├── MapView.vue      # 地图视图
│   │   │   ├── DedupPane.vue    # 去重面板
│   │   │   └── ...
│   │   ├── stores/
│   │   │   ├── configStore.js   # 配置状态
│   │   │   ├── libraryStore.js  # 库状态
│   │   │   └── uiStore.js       # UI 状态
│   │   └── common/
│   │       ├── api.js           # Tauri invoke 封装
│   │       ├── config.js        # 配置管理
│   │       ├── shortcuts.ts     # 快捷键定义
│   │       ├── utils.ts         # 工具函数
│   │       └── types.ts         # 类型定义
│   └── package.json
```

---

## 二、功能模块分析（按原子功能划分）

### 2.1 图像加载与解码

| 原子功能 | 实现位置 | 关键技术 |
|----------|----------|----------|
| **尺寸探测** | `t_image.rs` → `get_image_dimensions()` | `imagesize` crate + JXL 特殊处理 |
| **EXIF 方向读取** | `t_image.rs` → `get_image_orientation()` | 三级 fallback: 标准 EXIF → 二进制暴力扫描 → 默认值1 |
| **缩略图生成** | `t_image.rs` → `get_image_thumbnail()` | `image` crate + `fast_image_resize` (Bilinear) + `libjpeg-turbo` 缩放解码 |
| **RAW 缩略图** | `t_image.rs` → `get_raw_thumbnail()` | LibRaw → 嵌入式 JPEG → macOS `sips` fallback |
| **预览图获取** | `t_image.rs` → `get_raw_preview_image()` | LibRaw → EXIF 嵌入式 JPEG → `sips`/FFmpeg |
| **JXL 支持** | `t_jxl.rs` | `jxl-oxide` crate |
| **HEIF 支持** | `t_heif.rs` | 自编译 `libheif` + `libde265` |
| **视频缩略图** | `t_video.rs` | FFmpeg sidecar, 同步/异步 |

**格式支持**: JPEG, PNG, WebP, GIF, BMP, TIFF, AVIF, HEIC, JXL, RAW (CR2/NEF/ARW/DNG/...)

### 2.2 图像渲染与显示

| 原子功能 | 实现位置 | 关键技术 |
|----------|----------|----------|
| **自适应缩放** | `MediaViewer.vue` / `Image.vue` | CSS `transform: scale()` + `transform-origin` |
| **缩放适应** | `ImageViewer.vue` → `isZoomFit` | 4种模式: Fit, Fill, 1:1, Custom |
| **拖拽平移** | `Image.vue` | pointer events + CSS transform |
| **旋转** | `MediaViewer.vue` → `rotateRight()` | CSS `transform: rotate()` |
| **翻转** | `t_image.rs` → `apply_orientation()` | `image` crate 的 `fliph/flipv/rotate90/rotate180/rotate270` |
| **分屏对比** | `ImageViewer.vue` → `isSplit` | 双 MediaViewer + 同步视口 |
| **视口同步** | `ImageViewer.vue` → `syncViewportFrom()` | `getViewportState()` / `applyViewportState()` |
| **幻灯片** | `ImageViewer.vue` → `isSlideShow` | `setInterval` + 可配置间隔 (1/3/5/10/15/30s) |

### 2.3 图像编辑

| 原子功能 | 实现位置 | 关键技术 |
|----------|----------|----------|
| **裁剪** | `t_image.rs` → `EditParams.crop` | `image::imageops::crop_imm()` |
| **缩放** | `t_image.rs` → `EditParams.resize` | `fast_image_resize` |
| **旋转** | `t_image.rs` → `EditParams.rotate` | `image::imageops::rotate` |
| **翻转** | `t_image.rs` → `EditParams.flipHorizontal/Vertical` | `image::imageops::flip_horizontal/vertical` |
| **滤镜** | `t_image.rs` → `EditParams.filter` | grayscale/sepia/invert |
| **亮度/对比度** | `t_image.rs` → `EditParams.brightness/contrast` | 像素级调整 |
| **模糊** | `t_image.rs` → `EditParams.blur` | 高斯模糊 |
| **色调/饱和度** | `t_image.rs` → `EditParams.hue_rotate/saturation` | 像素级调整 |
| **EXIF 保留** | `t_image.rs` → `copy_metadata_to_output()` | JPEG: EXIF 元数据复制 |
| **输出格式** | `t_image.rs` → `EditParams.output_format` | JPEG / PNG / WebP |

### 2.4 导航与浏览

| 原子功能 | 实现位置 | 关键技术 |
|----------|----------|----------|
| **前后翻页** | `ImageViewer.vue` → `clickPrev/Next()` | 键盘/按钮/触控板 |
| **首尾跳转** | `ImageViewer.vue` → `clickHome/End()` | |
| **文件夹导航** | `t_cmds.rs` → `fetch_folder/count_folder` | |
| **虚拟滚动** | `VirtualScroll.vue` | 窗口化渲染 |
| **缩略图网格** | `GridView.vue` | CSS Grid |

### 2.5 元数据与信息

| 原子功能 | 实现位置 | 关键技术 |
|----------|----------|----------|
| **EXIF 读取** | `t_image.rs` → `read_exif_permissive()` | `kamadak-exif` + 二进制扫描 fallback |
| **EXIF 写入** | `t_image.rs` → `copy_metadata_to_output()` | `little_exif` |
| **文件信息** | `FileInfo.vue` | 直方图、尺寸、相机、镜头、GPS |

### 2.6 库管理（照片管理器特有）

| 原子功能 | 实现位置 | 关键技术 |
|----------|----------|----------|
| **库管理** | `t_cmds.rs` → `add/remove/switch_library` | SQLite |
| **相册** | `t_cmds.rs` → `add/edit/remove_album` | SQLite |
| **标签** | `t_cmds.rs` → `create_tag/add_tag_to_file` | SQLite |
| **收藏/评分** | `t_cmds.rs` → `set_file_favorite/rating` | SQLite |
| **人脸识别** | `t_face.rs` | ONNX Runtime 模型 |
| **相似图搜索** | `t_ai.rs` → `generate_embedding` | CLIP 模型 |
| **去重** | `t_dedup.rs` | BLAKE3 哈希 + 感知哈希 |

---

## 三、代码实现要点

### 3.1 Rust 后端关键模式

**Tauri Command 模式**:
```rust
#[tauri::command]
async fn get_image_thumbnail(file_path: String, orientation: i32, thumbnail_size: u32)
    -> Result<Option<Vec<u8>>, String>
```

**全局状态管理** (main.rs):
```rust
.manage(t_ai::AiState(std::sync::Mutex::new(t_ai::AiEngine::new())))
.manage(t_face::FaceState(std::sync::Arc::new(std::sync::Mutex::new(t_face::FaceEngine::new()))))
```

**图像处理管线**:
```
File → get_image_dimensions → get_image_orientation
     → decode_scaled_jpeg_image (libjpeg-turbo 加速)
     → ImageReader::open (image crate fallback)
     → resize_dynamic_image_to_jpeg (fast_image_resize)
     → encode_jpeg_rgb8 (libjpeg-turbo)
```

### 3.2 Vue 前端关键模式

**组件通信**: Props down / Events up（纯 Vue 3 模式，无状态管理库用于视图逻辑）

**ImageViewer 核心结构**:
```
ImageViewer.vue (窗口管理、导航、状态)
  └── MediaViewer.vue (工具栏、覆盖层、文件类型分发)
       ├── Image.vue (图像渲染、缩放、平移)
       └── Video.vue (视频播放)
```

**缩放实现**: CSS `transform: scale()` + `transform-origin: 0 0` + `translate()` 实现以鼠标为中心的缩放。

**分屏对比**: 两个 MediaViewer 并排，通过 `syncViewportFrom()` 同步视口状态。

---

## 四、对 Steno 图片查看器的启示

### 可直接借鉴的模式:

1. **Tauri Command 设计**: 将图像 I/O 封装为 `#[tauri::command]`，前端通过 `invoke()` 调用
2. **图像加载管线**: `get_image_dimensions` → `get_image_orientation` → 缩放的 JPEG 缩略图
3. **缩略图策略**: 后端生成固定尺寸 JPEG 缩略图，前端直接显示
4. **CSS Transform 渲染**: 缩放/平移/旋转全部使用 CSS `transform`
5. **快捷键系统**: `shortcuts.ts` 中定义平台感知的快捷键
6. **分屏对比模式**: 双 MediaViewer + 视口同步

### 不需要的部分（照片管理特有）:

- SQLite 数据库、库管理、相册
- AI 人脸识别、图像搜索
- 去重
- 日历/地图视图
