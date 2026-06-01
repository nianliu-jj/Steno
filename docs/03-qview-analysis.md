# qView 项目分析报告

> **技术栈**: C++17 + Qt6 (Widgets/SVG) + qmake  
> **定位**: 跨平台轻量级图片查看器 (Win/macOS/Linux)  
> **许可证**: GPL-3.0  
> **版本**: 8.0  
> **与 Steno 的关联度**: ⭐⭐⭐ (功能设计参考，技术栈不同)

---

## 一、项目架构

```
qView/
├── qView.pro               # qmake 项目文件
├── src/
│   ├── main.cpp             # 入口
│   ├── qvapplication.h/cpp  # QApplication 子类, 全局管理器
│   ├── mainwindow.h/cpp     # 主窗口 (QMainWindow) — UI 编排
│   ├── qvimagecore.h/cpp    # 图像核心: 加载、解码、缓存、色彩管理
│   ├── qvgraphicsview.h/cpp # 自定义 QGraphicsView: 缩放、平移、旋转、触摸
│   ├── qvfileenumerator.h/cpp # 目录文件列表、排序、过滤
│   ├── actionmanager.h/cpp  # 动作管理器、菜单栏构建
│   ├── shortcutmanager.h/cpp # 快捷键定义与路由
│   ├── settingsmanager.h/cpp # 集中化设置管理
│   ├── qvmovie.h/cpp        # 动画图像播放 (GIF/APNG)
│   ├── scrollhelper.h/cpp   # 动画滚动 + 边界约束
│   ├── axislocker.h/cpp     # 滚动轴锁定
│   ├── logicalpixelfitter.h/cpp # HiDPI 像素对齐
│   ├── openwith.h/cpp       # 跨平台"打开方式"
│   ├── qvinfodialog.h/cpp   # 文件信息对话框
│   ├── qvoptionsdialog.h/cpp # 设置对话框 (多标签页)
│   ├── qvwelcomedialog.h/cpp # 欢迎对话框
│   ├── qvaboutdialog.h/cpp  # 关于对话框
│   ├── qvshortcutdialog.h/cpp # 快捷键自定义
│   ├── qvrenamedialog.h/cpp  # 内联重命名
│   ├── qvnamespace.h         # 枚举和常量
│   ├── qvcocoafunctions.h/.mm  # macOS 平台桥接
│   ├── qvwin32functions.h/.cpp # Windows 平台桥接
│   ├── qvlinuxx11functions.h/.cpp # Linux 平台桥接
│   └── qvwindows11style.h/.cpp   # Win11 样式代理
├── resources/               # 字体、图标、QRC 资源文件
├── i18n/                    # 8 种语言翻译
└── tests/                   # 单元测试
```

**数据流**:
```
main.cpp → QVApplication → MainWindow → QVGraphicsView → QVImageCore → QVFileEnumerator
                            ↕              ↕
                       ActionManager   QVMovie (动画)
                          ↕
                    ShortcutManager
                     SettingsManager
```

---

## 二、功能模块分析（按原子功能划分）

### 2.1 图像核心 (`qvimagecore.h/cpp`)

| 原子功能 | 关键实现 | 技术细节 |
|----------|----------|----------|
| **异步加载** | `readFile()` 在 `QtConcurrent::run` 中运行 | 不阻塞 UI 线程 |
| **格式支持** | `QImageReader` 自动处理 | BMP, GIF, JPG, PNG, PBM, PGM, PPM, XBM, XPM, SVG, WebP, TIFF, ICO, HEIC, AVIF |
| **EXIF 方向** | `setAutoTransform(true)` | QImageReader 自动应用 |
| **SVG 缩放** | 渲染到 `largestDimension` | 高质量矢量渲染 |
| **多帧选择** | ICO 等多帧格式选择最大帧 | |
| **色彩空间** | `handleColorSpaceConversion()` | 自动检测显示器 ICC / sRGB / Display P3 |

### 2.2 缓存与预加载

| 原子功能 | 实现 | 技术细节 |
|----------|------|----------|
| **LRU 缓存** | 静态 `QCache<QString, ReadData>` | 300 MiB (Adjacent) / 900 MiB (Extended) |
| **缓存键** | `filePath + fileSize + colorSpaceHash` | 避免过期缓存 |
| **预加载** | `requestCaching()` 预加载 ±1/±4 邻图 | 即时切换无等待 |

### 2.3 图像显示 (`qvgraphicsview.h/cpp`)

| 原子功能 | 实现 | 技术细节 |
|----------|------|----------|
| **缩放** | 9 种缩放模式 | Fit, 1:1, Width, Height, 固定百分比 (25%-800%), 自定义 |
| **平移** | 鼠标拖拽 + 滚动条 | ScrollHelper 动画平滑 |
| **旋转** | `QGraphicsView::rotate()` | 0°/90°/180°/270° |
| **镜像翻转** | `QTransform` 缩放 -1 | 水平/垂直翻转 |
| **背景** | 棋盘格图案 | `QPainter` 绘制 |
| **HiDPI** | `LogicalPixelFitter` | 像素级对齐 |

### 2.4 导航

| 原子功能 | 实现 | 技术细节 |
|----------|------|----------|
| **目录枚举** | `QVFileEnumerator` | 自然排序、扩展名过滤、实时监控更新 |
| **前后翻页** | `goToFile()` → `Previous/Next/First/Last/Random` | 文件夹循环模式 |
| **幻灯片** | `QTimer` + `slideshowAction()` | 可配置间隔、随机模式 |

### 2.5 窗口管理

| 原子功能 | 实现 | 技术细节 |
|----------|------|----------|
| **标题栏模板** | 5 种模式 (Basic/Minimal/Practical/Verbose/Custom) | `%n %z %i %c %w %h %s` 变量 |
| **窗口自适应** | `setWindowSize()` | 匹配图像尺寸 (可配置最大/最小百分比) |
| **全屏** | `QMainWindow` 全屏模式 | 隐藏标题栏防混淆 |
| **会话持久化** | `getSessionState()` / `loadSessionState()` | JSON 序列化窗口状态 |

### 2.6 文件操作

| 原子功能 | 实现 | 技术细节 |
|----------|------|----------|
| **删除** | `deleteFile()` → `QFile::moveToTrash()` | 回收站回收, 可撤销 |
| **重命名** | `QVReNameDialog` | 内联重命名对话框 |
| **打开方式** | `openwith.h/cpp` | 跨平台外部程序打开 |
| **拖放** | URL drops | 多文件同时打开 |
| **URL 打开** | `openUrl()` 下载到临时文件 | QNetworkAccessManager |

### 2.7 快捷键系统

| 原子功能 | 实现 | 技术细节 |
|----------|------|----------|
| **动作注册** | `ActionManager` | 集中化动作库 |
| **快捷键绑定** | `ShortcutManager` | 默认绑定表 + 可自定义 |
| **虚拟菜单** | 不可见菜单捕获快捷键 | 即使菜单隐藏也响应 |

---

## 三、代码实现要点

### 3.1 异步图像加载模式

```cpp
// 加载请求 → 后台线程
QtConcurrent::run(&readFile, ...)
  → QFutureWatcher 回调到主线程
  → loadPixmap() 解码并发射 fileChanged() 信号
```

### 3.2 缓存分层策略

```
文件请求
  ├── 缓存命中 → 直接返回
  ├── 等待预加载 (waitingOnPreloadPath) → 阻塞到预加载完成
  └── 缓存未命中 → 触发完整加载 + 周围文件预加载
```

### 3.3 基于场景的渲染架构

使用 `QGraphicsScene` + `QGraphicsView` 框架, 图像作为 `QGraphicsPixmapItem` 添加到场景中, 由 View 处理所有变换 (缩放、旋转、平移)。

---

## 四、对 Steno 图片查看器的启示

### 可借鉴的设计:

1. **异步加载 + 缓存 + 预加载** 三级策略 — 这是流畅浏览体验的核心
2. **可配置窗口标题栏** — 用户可选择信息密度
3. **会话持久化** — 记住上次打开的文件和窗口状态
4. **分级缓存 (Adjacent/Extended)** — 内存管理策略
5. **快捷键系统架构** — ActionManager → ShortcutManager 分层

### 技术栈差异:

qView 使用 Qt Graphics View 框架做图像渲染, Steno 使用 Web 技术 (CSS/DOM/Canvas), 渲染层的实现方式完全不同, 但功能设计和架构分层可以借鉴。
