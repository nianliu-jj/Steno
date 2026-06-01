# JarkViewer 项目分析报告

> **技术栈**: C++23 + Win32 + Direct3D 11 + OpenCV + FFmpeg  
> **定位**: Windows 平台高性能本地图片查看器  
> **许可证**: 未知  
> **与 Steno 的关联度**: ⭐⭐⭐ (图像格式支持参考)

---

## 一、项目架构

```
JarkViewer/
├── JarkViewer.slnx              # 解决方案
├── JarkViewer.vcxproj           # MSVC 项目 (v145, C++23, x64)
├── JarkViewer/
│   ├── include/                 # 所有公共头文件
│   │   ├── D3D11App.h           # Win32 窗口 + D3D11 基类
│   │   ├── ImageDatabase.h      # 图像加载 + 格式分发 + LRU 缓存
│   │   ├── ColorManager.h       # ICC 色彩管理 (lcms2)
│   │   ├── Printer.h / Setting.h # 打印 / 设置 UI
│   │   ├── videoDecoder.h       # FFmpeg 视频帧解码
│   │   ├── exifParse.h          # EXIF/XMP 解析 (Exiv2)
│   │   ├── TextDrawer.h         # STB Truetype 文字渲染
│   │   ├── SVGPreprocessor.h    # SVG 光栅化 (lunasvg)
│   │   ├── LRU.h                # LRU 缓存模板
│   │   ├── MatWindow.h          # OpenCV 窗口包装
│   │   ├── FileAssociationManager.h # 文件关联
│   │   ├── blpDecoder.h         # BLP 格式解码器
│   │   ├── jarkUtils.h          # 共享工具
│   │   └── stringRes.h          # 多语言字符串
│   ├── src/                     # 实现文件 (11 .cpp)
│   │   ├── main.cpp             # 入口, JarkViewerApp, DrawScene()
│   │   ├── ImageDatabase.cpp    # 图像加载器, 格式分发
│   │   ├── D3D11App.cpp         # 窗口/设备初始化, 暗色主题菜单
│   │   ├── ColorManager.cpp     # ICC 配置
│   │   ├── videoDecoder.cpp     # FFmpeg 帧提取
│   │   ├── exifParse.cpp        # 元数据
│   │   ├── TextDrawer.cpp       # 文字渲染
│   │   ├── blpDecoder.cpp       # BLP 解码
│   │   ├── jarkUtils.cpp        # 工具
│   │   ├── stringRes.cpp        # 多语言
│   │   └── tinyxml2.cpp         # XML 解析
│   └── lib/                     # 静态库目录
│       ├── libavif/             # AVIF (aom + dav1d + libyuv)
│       ├── libexiv2/            # EXIF 元数据
│       ├── libffmpeg/           # 视频解码
│       ├── libjxl/              # JPEG XL
│       ├── libopencv/           # OpenCV 4.13.0
│       └── libwebp2/            # WebP2
```

---

## 二、功能模块分析

### 2.1 图像格式支持

**格式加载分发** (`ImageDatabase.h:39-149`):

| 格式类别 | 格式 | 解码库 | 加载优先级 |
|----------|------|--------|-----------|
| JPEG XL | `.jxl` | libjxl 0.11.1 | 1 |
| WebP2 | `.wp2` | libwebp2 0.0.1 | 2 |
| AVIF | `.avif` | libavif 1.3.0 | 3 |
| HEIC/HEIF | `.heic/.heif` | libheif 1.20.1 + libde265 + x265 | 4 |
| RAW | 30+ 格式 | libraw 0.21.4 | 5 |
| PSD | `.psd` | psdsdk | 6 |
| SVG | `.svg` | lunasvg 3.5.0 | 7 |
| BLP | `.blp` | 自定义 blpDecoder | 8 |
| QOI | `.qoi` | qoi.h (header-only) | 9 |
| 通用光栅 | PNG/JPEG/BMP/... | OpenCV `imdecode()` | 默认 |
| STB fallback | PNG/JPEG/BMP/... | stb_image.h | 备用 |
| 视频 | MP4/MOV/MKV/... | FFmpeg (libavformat/libavcodec) | 单独处理 |

### 2.2 渲染管线

```
CPU 缓冲区 (cv::Mat mainCanvas)
  → D3D11App::PresentCanvas()
  → D3D11 staging texture upload
  → SwapChain Present
```

### 2.3 核心功能

| 功能 | 实现 |
|------|------|
| **缩放** | 鼠标滚轮缩放 (OpenCV resize) |
| **平移** | 鼠标拖拽 |
| **旋转** | OpenCV rotate |
| **适应窗口** | 计算缩放因子适配窗口尺寸 |
| **1:1 像素** | 100% 缩放 |
| **全屏** | Win32 全屏模式 |
| **动画** | GIF/APNG/WebP 帧播放 + 暂停 |
| **视频** | FFmpeg 帧提取, YUV→RGB 转换 (libyuv) |
| **EXIF** | Exiv2 完整元数据解析 |
| **色彩管理** | lcms2 ICC 配置变换 |
| **打印** | OpenCV 窗口打印预览 |
| **暗/亮主题** | uxtheme API hook (`D3D11App.cpp`) |

### 2.4 缓存策略

| 策略 | 实现 |
|------|------|
| **LRU 缓存** | `LRU.h` 模板类 |
| **邻图预取** | 预加载相邻图像 |

### 2.5 事件处理架构

```
鼠标/键盘/拖放 → ActionENUM → OperateQueue → DrawScene()
```

所有用户输入映射为 `ActionENUM` 枚举值, 经过 `OperateQueue` 队列处理, 最终在 `DrawScene()` 中消费并渲染。

---

## 三、代码实现要点

### 3.1 格式分发优先级

按扩展名精确匹配到特定解码库, 避免通用解码器的兼容性问题:
```cpp
if (is_jxl) return load_jxl();
if (is_wp2) return load_wp2();
if (is_avif) return load_avif();
// ... 9 种特殊格式
return opencv_imdecode(); // 通用 fallback
```

### 3.2 全部静态链接

所有第三方库 (OpenCV, FFmpeg, libavif, libjxl, etc.) 均以 `.lib` 静态链接, 生成单个便携 EXE, 无运行时 DLL 依赖。

### 3.3 色彩管理

`ColorManager` 从图像读取嵌入 ICC 配置 + 从系统获取显示器 ICC, 通过 lcms2 执行实时色彩变换。

---

## 四、对 Steno 图片查看器的启示

### 可借鉴的设计:

1. **格式分发优先级**: 按扩展名精确匹配 → 通用 fallback 的两级策略
2. **LRU + 邻图预取**: 缓存策略设计
3. **事件队列架构**: Action → Queue → DrawScene 的解耦模式
4. **便携单文件**: 所有依赖静态链接 (Rust 天然支持)
5. **色彩管理**: ICC 配置读取 (lap 也已实现类似功能)

### 与 Steno 的差异:

JarkViewer 使用 Win32 + D3D11 + OpenCV 原生渲染, Steno 使用 WebView 渲染。但格式支持列表、缓存策略、事件架构可以借鉴。
