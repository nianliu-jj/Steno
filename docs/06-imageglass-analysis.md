# ImageGlass 项目分析报告

> **技术栈**: C# .NET 10 + WinForms + Direct2D + WebView2  
> **定位**: Windows 平台功能最丰富的图片查看器  
> **许可证**: GPL-3.0  
> **与 Steno 的关联度**: ⭐⭐⭐ (功能设计参考)

---

## 一、项目架构

```
ImageGlass/
├── Source/
│   ├── ImageGlass.slnx              # 解决方案 (9 个项目)
│   ├── Components/
│   │   ├── ImageGlass.Base/         # 基础层: 类型, Win32 API, 图像编解码, 缓存
│   │   │   ├── Photoing/Codecs/     # PhotoCodec.cs — 图像 I/O 中枢
│   │   │   ├── Photoing/Services/   # ImageBooster.cs — 异步预缓存
│   │   │   ├── Photoing/Animators/  # 动画引擎 (GIF/WebP)
│   │   │   ├── WinApi/             # P/Invoke 包装 (剪贴板, 桌面, 打印, DPI)
│   │   │   ├── Types/              # Const.cs (100+ 扩展名), Enums.cs
│   │   │   ├── BHelper/            # 扩展方法
│   │   │   ├── InstanceManagement/ # 单实例管理
│   │   │   ├── Cache/              # DiskCache, StringCache
│   │   │   └── Update/             # GitHub 自动更新
│   │   ├── ImageGlass.Views/       # 图像查看画布
│   │   │   ├── ViewerCanvas.cs     # 3639行 — Direct2D 渲染核心
│   │   │   ├── ViewerCanvas_Webview2.cs
│   │   │   ├── ViewerCanvas_Touch.cs
│   │   │   └── SelectionResizer.cs
│   │   ├── ImageGlass.Settings/    # 配置 + WebUI 设置界面
│   │   │   ├── Config.cs           # 2333行 — 100+ 配置项
│   │   │   └── WebUI/              # TypeScript/SCSS WebApp
│   │   ├── ImageGlass.UI/          # 自定义 WinForms 控件库
│   │   │   └── Modern*.cs          # 深色模式 + Mica/Acrylic 主题
│   │   ├── ImageGlass.Gallery/     # 缩略图条 (基于 ImageListView)
│   │   ├── ImageGlass.WebP/        # libwebp P/Invoke
│   │   └── ImageGlass.WinTouch/    # 触摸手势 (Pan/Zoom/Rotate)
│   ├── ImageGlass/                 # 主 EXE (FrmMain, FrmSettings, 工具)
│   └── igcmd/                      # CLI 工具 (壁纸, 锁屏, 幻灯片)
├── Setup/                          # 安装程序
└── Tools/                          # 代码签名
```

**依赖图**:
```
ImageGlass (EXE)
  ├── ImageGlass.Base      ← 基础
  ├── ImageGlass.Gallery   ← 缩略图
  ├── ImageGlass.Settings  ← 配置
  ├── ImageGlass.UI        ← 控件
  ├── ImageGlass.Views     ← 画布
  │   └── ImageGlass.WinTouch
  └── ImageGlass.WebP
```

---

## 二、功能模块分析（按原子功能划分）

### 2.1 图像加载与解码

| 原子功能 | 实现位置 | 关键技术 |
|----------|----------|----------|
| **格式支持** | `PhotoCodec.cs` | 100+ 图像扩展名 |
| **主解码引擎** | Magick.NET (ImageMagick) | 元数据/加载/保存 |
| **快速解码** | WIC (Windows Imaging Component) | 系统原生编解码 |
| **高质量缩放** | PhotoSauce.MagicScaler | 专业级缩放算法 |
| **背景预缓存** | `ImageBooster.cs` | 异步队列, 可配置缓存数/尺寸/大小 |

### 2.2 图像显示 (`ViewerCanvas.cs` — 3639 行)

| 原子功能 | 关键技术 |
|----------|----------|
| **渲染后端** | Direct2D (硬件加速) |
| **缩放模式** | AutoZoom, ScaleToFit, ScaleToFill, ScaleToWidth, ScaleToHeight, LockZoom |
| **缩放范围** | 1% ~ 10,000% 无限缩放 |
| **平移/旋转/翻转** | Direct2D 变换矩阵 |
| **通道隔离** | R, G, B, A, RGBA 单通道查看 |
| **反相** | 颜色反转 |
| **背景** | 棋盘格图案 |
| **选择框** | 裁剪区域选择 |
| **触摸** | Pan, Zoom, Rotate, TwoFingerTap |

### 2.3 动画支持

| 原子功能 | 实现 |
|----------|------|
| **GIF 播放** | `GifAnimator.cs` |
| **WebP 动画** | `AnimatedImgAnimator.cs` |
| **通用动画** | `ImgAnimator.cs` |
| **帧控制** | 播放/暂停/帧导航 |

### 2.4 导航与浏览

| 原子功能 | 实现 |
|----------|------|
| **目录扫描** | `FileFinder.cs` + 自然排序 |
| **缩略图条** | `ImageGallery.cs` — 虚拟化渲染, Shell 缩略图提取 |
| **幻灯片** | 可配置间隔 + 过渡效果 |

### 2.5 编辑工具

| 工具 | 实现 |
|------|------|
| **颜色选择器** | HSV 六边形 + 滑块 |
| **裁剪** | 选择框 → 裁剪 |
| **缩放** | 预设/自定义尺寸 |
| **旋转/翻转** | 0/90/180/270, 水平/垂直 |

### 2.6 UI 特色

| 特性 | 实现 |
|------|------|
| **深色/浅色主题** | ModernForm + Mica/Acrylic 背景 |
| **设置界面** | WebView2 + TypeScript/SCSS (WebApp 模式) |
| **自定义控件库** | ModernButton/ModernMenu/ModernTextBox/... 全套 |
| **单实例** | 命名管道转发 |
| **CLI 工具** | `igcmd` — 壁纸/锁屏/文件关联 |

### 2.7 平台集成

| 功能 | 实现 |
|------|------|
| **壁纸设置** | `DesktopApi` — Win32 系统调用 |
| **锁屏图片** | 系统 API |
| **文件关联** | 注册表操作 |
| **系统主题** | `WinColorsApi` — 暗/亮模式检测 |
| **触摸手势** | WinTouch — WM_GESTURE |

---

## 三、代码实现要点

### 3.1 多引擎图像加载

```
PhotoCodec.Load()
  ├── WIC (快速, 系统原生)
  ├── Magick.NET (全面, 格式支持广)
  └── MagicScaler (高质量缩放)
```
多引擎 fallback 策略确保兼容性和性能。

### 3.2 Direct2D 渲染

ViewerCanvas 继承自 `D2Phap.DXControl`, 使用 Direct2D 硬件加速进行图像渲染。所有变换 (缩放/平移/旋转/通道) 全部在 GPU 完成。

### 3.3 WebUI 设置界面

创新性地使用 WebView2 + TypeScript 构建设置界面, 而非传统 WinForms 控件。现代前端技术栈在桌面应用中的嵌入式使用。

---

## 四、对 Steno 图片查看器的启示

### 可借鉴的设计:

1. **多引擎 fallback**: WIC/Magick.NET/MagicScaler 三级策略, Steno 可用 `image` crate + libjpeg-turbo + FFmpeg
2. **缩放模式分类**: AutoZoom/ScaleToFit/Fill/Width/Height/LockZoom 六种模式
3. **通道隔离查看**: R/G/B/A 单通道渲染
4. **可配置缓存**: 数量和尺寸的预缓存策略
5. **缩放范围**: 1%-10000% 宽范围, 适合专业查看
6. **WebView2 设置面板**: Tauri 本身就是 WebView, 这个模式天然适配
7. **CLI 工具分离**: 主程序和命令行工具分开
8. **单实例模式**: 命名管道转发命令行参数

### 技术栈差异:

ImageGlass 是 WinForms + Direct2D, Steno 是 Tauri + Web。但功能设计、缩放模式分类、缓存策略等方面可以大量借鉴。
