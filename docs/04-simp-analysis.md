# Simp 项目分析报告

> **技术栈**: 纯 Rust + wgpu + winit + egui  
> **定位**: 轻量级跨平台图片查看器  
> **许可证**: 未知  
> **版本**: 3.10.3  
> **与 Steno 的关联度**: ⭐⭐⭐ (Rust 图像渲染参考)

---

## 一、项目架构

```
simp/
├── Cargo.toml              # 依赖定义
├── build.rs
├── src/
│   ├── main.rs             # 入口: WindowHandler, winit+wgpu 生命周期, 事件循环
│   ├── lib.rs              # 重导出 get_clap_command
│   ├── app.rs              # App 结构: UI 分发, 输入, 缩放, 裁剪, 大小调整 (~1315行)
│   ├── cli.rs              # 命令行: --fullscreen, --zen-mode, --no-cache 等
│   ├── icon.rs             # 加载 icon.ico 作为 winit Icon
│   ├── rect.rs             # Rect: 位置+大小, intersects() 碰撞检测
│   ├── image_io/
│   │   ├── load.rs         # 7 种加载器后端 (raster/raw/svg/psd/jxl/heif/un_detectable)
│   │   └── save.rs         # 保存: JPEG/PNG/GIF/WebP/JXL + 品质对话框
│   ├── shader/
│   │   ├── image.vert      # 图像顶点着色器 (GLSL 440)
│   │   ├── image.frag      # 图像片段着色器: 色调/对比度/饱和度/灰度/反相/棋盘格
│   │   ├── crop.vert       # 裁剪顶点着色器
│   │   ├── crop.frag       # 裁剪片段着色器: 蚂蚁线 + 角手柄
│   │   └── blit.wgsl       # 全屏三角形 blit
│   ├── util/
│   │   └── mod.rs          # Image包装, UserEvent枚举, OPENGL_TO_WGPU_MATRIX
│   └── app/                # 16 个文件: UI 面板, 图像管线, 缓存, 剪贴板, 对话框, 撤销, 马赛克
└── contrib/                # Nix flake
```

### 关键依赖

| 类别 | Crate | 版本 | 用途 |
|------|-------|------|------|
| GPU | `wgpu` | 22.1 | 图形 API (GLSL/SPIR-V/Metal/DX12) |
| 窗口 | `winit` | 0.30 | 窗口和事件循环 |
| GUI | `egui` + `egui-wgpu` + `egui-winit` | 0.29 | 即时模式 GUI |
| 数学 | `cgmath` | 0.18 | 向量/矩阵/投影 |
| 图像 | `image` | 0.25 | 核心光栅解码 |
| RAW | `rawloader` + `imagepipe` | 0.37/0.5 | 相机 RAW |
| SVG | `resvg` | 0.45 | SVG 渲染 |
| EXIF | `rexif` | 0.7 | 元数据 |
| 缓存 | `lru` | 0.16 | 内存 LRU 缓存 |
| CLI | `clap` | 4.5 | 命令行参数 |
| 配置 | `confy` | 1.0 | TOML 持久化 |

---

## 二、功能模块分析（按原子功能划分）

### 2.1 图像加载

**7 种加载器后端** (`image_io/load.rs`)，按优先级尝试:

| 加载器 | 格式 | 关键 Crate |
|--------|------|------------|
| `load_raw()` | 30+ RAW 格式 | `rawloader` + `imagepipe` |
| `load_svg()` | SVG | `resvg` |
| `load_psd()` | Photoshop PSD | `psd` |
| `load_raster()` | GIF/WebP/PNG(APNG)/EXR + image crate | `image` |
| `load_jxl()` | JPEG XL | `jpegxl-rs` (feature) |
| `load_heif()` | HEIC/HEIF | `libheif-rs` (feature) |
| `load_un_detectable_raster()` | TGA fallback | `image` |

### 2.2 图像渲染

**双 Pass 渲染管线** (`main.rs`):

```
Frame:
  1. Image Pass: 清屏 → 图像渲染器 (image_renderer) → 裁剪覆盖层 (crop_renderer)
  2. GUI Pass:  egui 界面叠加
  → Present
```

**GPU 后端选择**: Windows 默认 DX12, macOS 默认 Metal, Linux 所有可用。可通过 `SIMP_GPU_BACKEND` 环境变量覆盖。

### 2.3 图像处理着色器 (`image.frag`)

片段着色器中实现的实时像素处理管线:
```
采样纹理 → fromLinear() → rotateHue() → adjustContrast()
→ adjustSaturation() → brighten() → grayscale? → invert?
→ 棋盘格背景混合 → toLinear() → 输出
```

| 操作 | 实现位置 | 说明 |
|------|----------|------|
| 色调旋转 | `rotateHue()` | RGB-HSV 变换 |
| 对比度调整 | `adjustContrast()` | |
| 饱和度调整 | `adjustSaturation()` | |
| 亮度 | `brighten()` | |
| 灰度 | luma 点积 `[0.299, 0.587, 0.114]` | |
| 反相 | `1 - color` | |
| 透明背景 | 64/48 灰棋盘格 | |

### 2.4 视图控制

| 原子功能 | 实现位置 | 技术细节 |
|----------|----------|----------|
| **缩放模式** | `app.rs` → `ResizeMode` | Original / BestFit / LargestFit |
| **指数缩放** | `app.rs` → zoom logic | 以鼠标位置为中心的指数缩放 |
| **平移** | `app.rs` → drag delta | Cursor drag → `image.position` |
| **旋转** | `app.rs` → Q/E 键 | 90° 旋转 |
| **翻转** | `app.rs` | 水平/垂直镜像 |

### 2.5 裁剪 (`shader/crop.frag`)

| 原子功能 | 实现 |
|----------|------|
| **外部暗化** | alpha 0.7 覆盖层 |
| **蚂蚁线** | 交替黑白虚线边框 |
| **角手柄** | 蓝色角标记 (半径 5px) + alpha 渐变 |

### 2.6 其他

| 原子功能 | 实现位置 | 说明 |
|----------|----------|------|
| **CLI** | `cli.rs` | `-f` 全屏, `-z` 禅模式, `--no-cache` |
| **stdin 管道** | `main.rs` | 从管道读取图像字节 |
| **Ctrl+C 处理** | `main.rs` | 发送 UserEvent::Exit |
| **崩溃报告** | `main.rs` | 回追踪写入 `panic.txt` |
| **GIF 播放** | `app.rs` + util | 帧动画 + 播放控制条 |

---

## 三、代码实现要点

### 3.1 wgpu 渲染架构

```rust
pub struct WindowHandler {
    wgpu: WgpuState,           // window, adapter, surface, device, queue, config
    event_loop: EventLoop<UserEvent>,
    egui_winit: State,         // winit 集成
    egui_renderer: Renderer,   // egui -> wgpu
    app: App,
}
```

### 3.2 自定义用户事件

```rust
enum UserEvent {
    Exit,
    LoadBytes(Vec<u8>),   // stdin 管道数据
}
```

通过 `EventLoop<UserEvent>` 的 proxy 发送。

### 3.3 GPU 着色器中的图像处理

与 lap 和 oculante 不同, simp 将颜色调整 (色调/对比度/饱和度/亮度/灰度/反相) 全部放在 GPU 片段着色器中实时执行, 无需 CPU 重建像素数据。这是 GPU 原生渲染的独特优势。

---

## 四、对 Steno 图片查看器的启示

### 可借鉴的设计:

1. **图像加载器优先级链**: 多种加载器按顺序尝试, 提高兼容性
2. **BestFit/LargestFit 缩放模式**: 两种核心适应模式
3. **以鼠标为中心的缩放**: 指数缩放 + 鼠标位置锚定
4. **禅模式**: 隐藏所有 UI 元素, 纯图像显示
5. **命令行参数 + 管道输入**: CLI 友好的设计

### 技术栈差异:

simp 的 GPU 着色器图像处理在 Web 环境中不可用 (Steno 用 CSS/DOM)。但缩放、导航、格式加载的设计模式仍然适用。
