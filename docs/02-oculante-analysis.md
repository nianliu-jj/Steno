# Oculante 项目分析报告

> **技术栈**: 纯 Rust + notan (窗口/图形框架) + egui (GUI) + OpenGL/WGPU  
> **定位**: 跨平台轻量级图片查看器与编辑器  
> **许可证**: MIT  
> **版本**: 0.9.2  
> **与 Steno 的关联度**: ⭐⭐⭐⭐ (Rust 图像处理参考)

---

## 一、项目架构

```
oculante/
├── Cargo.toml              # 依赖定义
├── build.rs
├── src/
│   ├── main.rs             # 入口: notan App 初始化、update/draw 循环、事件处理
│   ├── lib.rs              # 模块声明
│   ├── appstate.rs         # 中心状态: OculanteState
│   ├── image_loader.rs     # 图像加载: 格式分发 → 解码 → Frame 通道
│   ├── image_editing.rs    # 图像编辑: ImageOperation 枚举 (~30种操作)
│   ├── paint.rs            # 绘画: PaintStroke 笔刷渲染
│   ├── texture_wrapper.rs  # 纹理管理: 瓦片纹理 + 自定义 GLSL 着色器
│   ├── thumbnails.rs       # 缩略图: 磁盘缓存 + 线程池
│   ├── filebrowser.rs      # 文件浏览器: 完整自定义文件对话框
│   ├── file_encoder.rs     # 文件编码: JPG/PNG/BMP/WebP 保存选项
│   ├── comparelist.rs      # 对比列表: 并排对比图像列表
│   ├── scrubber.rs         # 导航: 目录图像列表 + 前/后导航
│   ├── shortcuts.rs        # 快捷键: InputEvent + 可配置键绑定
│   ├── settings.rs         # 设置: PersistentSettings + VolatileSettings
│   ├── icons.rs            # 图标: Unicode PUA 字符
│   ├── utils.rs            # 工具: Player, Frame, SUPPORTED_EXTENSIONS
│   ├── cache.rs            # 缓存: LRU 风格图像缓存
│   ├── net.rs              # 网络: 端口监听接收远程图像
│   ├── update.rs           # 更新: GitHub 自更新
│   ├── mac.rs              # macOS 特定处理
│   ├── ktx2_loader/        # KTX2/Basis/DDS 压缩纹理加载器
│   │   ├── mod.rs
│   │   ├── ktx2.rs
│   │   ├── basis.rs
│   │   ├── dds.rs
│   │   └── image_texture_conversion.rs
│   └── ui/                 # UI 层
│       ├── mod.rs          # 主面板绘制
│       ├── top_bar.rs      # 顶部工具栏
│       ├── info_ui.rs      # 左侧信息面板 (EXIF, 直方图, 预览)
│       ├── edit_ui.rs      # 右侧编辑面板
│       ├── settings_ui.rs  # 设置窗口
│       ├── palette_ui.rs   # 调色板
│       ├── theme.rs        # 主题系统
│       └── thumbnail_rendering.rs # 缩略图渲染
├── egui-modal-diag/        # 子 crate: 自定义模态对话框
├── res/                    # 资源: 字体, 图标, LUT, 笔刷
└── tests/                  # 测试图像 (50+ 格式)
```

---

## 二、功能模块分析（按原子功能划分）

### 2.1 图像加载与解码

**支持的格式** (40+):

| 格式类别 | 具体格式 | 实现方式 |
|----------|----------|----------|
| 标准光栅 | PNG/APNG, JPEG, GIF, WebP, BMP, TIFF, PNM, TGA, ICO, QOI | `image` crate / `zune-png` / `turbojpeg` |
| 高动态范围 | EXR, HDR | `exr` crate / `image::hdr` |
| 矢量 | SVG | `usvg` + `resvg` (2x 渲染) |
| 专业格式 | PSD, KRA, DICOM, ICNS | `psd` / ZIP+PNG / `dicom` / `icns` |
| RAW | NEF, CR2, DNG, ARW, RAF 等 30+ | `quickraw` (libraw 绑定) |
| 下一代 | JXL, AVIF, HEIC, JP2 | `jxl-oxide` / `avif-decode` / `libheif-rs` / `jpeg2k` |
| GPU 纹理 | KTX2, DDS | 自定义 wgpu 加载器 |

**加载流程** (`image_loader.rs`):
```
open_image()
  ├── 检测格式 (file_format::FileFormat)
  ├── 按扩展名分发到对应解码器
  │   ├── PNG → zune-png (APNG 动画支持)
  │   ├── JPEG → turbojpeg (优先) / image crate (fallback)
  │   ├── GIF → gif + gif-dispose
  │   ├── SVG → usvg parse → resvg render
  │   └── ...
  └── 通过 mpsc::Sender<Frame> 发送结果
```

### 2.2 图像渲染与显示

| 原子功能 | 实现位置 | 关键技术 |
|----------|----------|----------|
| **瓦片纹理解码** | `texture_wrapper.rs` → `TexWrap` | 超大图分割为 GPU 纹理分片 (≤ max_texture_size) |
| **通道切换** | `texture_wrapper.rs` → 自定义 GLSL | GPU 端 RGBA 通道 swizzle (实时 R/G/B/A 隔离查看) |
| **缩放/平移** | `texture_wrapper.rs` → `draw_textures()` | MVP 矩阵变换 |
| **像素放大镜** | `texture_wrapper.rs` → `draw_zoomed()` | 局部精确像素预览 |
| **颜色拾取** | `top_bar.rs` | 鼠标位置采样 → 颜色值显示 |
| **GIF 播放** | `utils.rs` → `Player` | 帧动画循环, 可暂停/调速 |

### 2.3 图像编辑

| 原子功能 | 实现位置 | 关键技术 |
|----------|----------|----------|
| **操作栈** | `image_editing.rs` → `ImageOperation` | ~30 种操作, undo/redo |
| **裁剪** | image_editing → Crop | |
| **缩放** | image_editing → Resize | |
| **颜色调整** | image_editing → Brightness/Contrast/Saturation/Hue | 像素级操作 |
| **翻转/旋转** | image_editing → FlipH/FlipV/Rotate | |
| **绘画** | `paint.rs` → `PaintStroke` | UV 空间笔刷路径, Rgba::blend() |

### 2.4 导航与浏览

| 原子功能 | 实现位置 | 关键技术 |
|----------|----------|----------|
| **文件浏览器** | `filebrowser.rs` → `browse_modal()` | 侧边栏书签 + 缩略图网格 + 搜索 + 路径面包屑 |
| **前后翻页** | `scrubber.rs` | 目录内顺序导航 |
| **并排对比** | `comparelist.rs` | 多图同时显示 |
| **缩略图** | `thumbnails.rs` | 磁盘缓存 + 线程池生成 |

### 2.5 元数据

| 原子功能 | 实现位置 | 关键技术 |
|----------|----------|----------|
| **EXIF 显示** | `info_ui.rs` | 左侧面板完整 EXIF 数据 |
| **直方图** | `info_ui.rs` | RGB 通道直方图可视化 |

---

## 三、代码实现要点

### 3.1 GPU 瓦片纹理策略

大图像被分割为不超过 `max_texture_size` 的瓦片，每个瓦片独立上传为 GPU 纹理:
```
┌────┬────┬────┐
│ T0 │ T1 │ T2 │
├────┼────┼────┤
│ T3 │ T4 │ T5 │  ← 每个 Tile 独立 Texture
├────┼────┼────┤
│ T6 │ T7 │ T8 │
└────┴────┴────┘
```
渲染时通过 MVP 矩阵将所有瓦片绘制回正确位置。

### 3.2 自定义 GLSL 通道切换

片段着色器实时执行 RGBA 通道矩阵运算:
```glsl
color = ((swizzle_mat * tex_col) + offset) * v_color;
```
这使得无需 CPU 重建纹理即可实时切换显示 R/G/B/A 单通道。

### 3.3 图像格式分发模式

```rust
fn open_image(path, tx) {
    match extension {
        "png" | "apng" => load_png(),
        "jpg" | "jpeg" => load_jpeg(),
        "svg" => load_svg(),
        // ... 40+ 格式
        _ => load_fallback(),
    }
    tx.send(frame);
}
```

---

## 四、对 Steno 图片查看器的启示

### 可借鉴的设计:

1. **图像加载抽象**: 按扩展名分发到对应解码器，通过 Channel 异步返回
2. **瓦片纹理**: 超大图分割方案（不过 Tauri 用 CSS 渲染，此模式更适用于 GPU 原生渲染）
3. **编辑操作栈**: ImageOperation 枚举 + undo/redo
4. **文件浏览器**: 缩略图网格 + 侧边栏书签的设计模式
5. **快捷键系统**: `BTreeMap` 存储可配置键绑定

### 技术选择差异:

| 维度 | Oculante | Steno (Tauri) |
|------|----------|---------------|
| 窗口框架 | notan | Tauri (wry) |
| GUI | egui | Vue 3 (DOM) |
| 图像渲染 | GPU 纹理 (OpenGL/WGPU) | CSS/Canvas |
| 渲染管线 | 自定义 GLSL | 浏览器引擎 |
