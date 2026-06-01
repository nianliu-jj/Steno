# FlowVision 项目分析报告

> **技术栈**: Swift + AppKit + AVFoundation + FFmpegKit  
> **定位**: macOS 平台高性能图片查看器  
> **许可证**: 未知  
> **与 Steno 的关联度**: ⭐⭐ (macOS 设计参考)

---

## 一、项目架构

```
FlowVision/
├── FlowVision.xcodeproj/            # Xcode 项目
├── Base.xcconfig                    # 共享构建配置
├── FlowVision/
│   ├── Info.plist
│   ├── FlowVision.entitlements
│   ├── Resources/
│   │   ├── Assets.xcassets/         # App 图标, 强调色
│   │   ├── Base.lproj/Main.storyboard
│   │   └── Localizable.xcstrings    # 本地化
│   └── Sources/
│       ├── AppDelegate.swift        # @main 入口, 窗口创建, 菜单处理
│       ├── WindowController.swift   # NSWindowController + 工具栏 + 全屏
│       ├── ViewController.swift     # 主 VC: 文件数据库, 布局, 大图像, 集合
│       └── Common/
│           ├── Common.swift         # Atomic 包装, MyTimer, 日志
│           ├── DataModel.swift      # SortKey, DatabaseModel, TreeNode, 文件数据库
│           ├── Enum.swift           # FileType, LayoutType, SortType
│           ├── GlobalVariable.swift # 全局状态, THUMB_SIZES 常量
│           ├── ImageProcess.swift   # NSImage 扩展 (旋转, 翻转, 缩放)
│           ├── VideoProcess.swift   # AVPlayer 包装, 循环合成
│           └── FFmpegKit.swift      # FFmpegKit 动态加载
```

---

## 二、功能模块分析

### 2.1 核心功能

| 功能 | 实现 |
|------|------|
| **图像渲染** | NSImageView (AppKit 原生) |
| **缩放** | NSScrollView 内置缩放 |
| **旋转** | `ImageProcess.swift` → NSImage 变换 |
| **翻转** | 水平/垂直镜像 |
| **全屏** | NSWindow 全屏模式 |
| **工具栏** | NSToolbar + 自定义项目 |
| **布局模式** | LayoutType 枚举 (多种视图排列) |

### 2.2 文件管理

| 功能 | 实现 |
|------|------|
| **文件数据库** | `DatabaseModel` — 内存中文件树 |
| **排序** | SortKey: name/date/size/type |
| **缩略图** | `THUMB_SIZES` 预定义尺寸集合 |

### 2.3 视频支持

| 功能 | 实现 |
|------|------|
| **视频播放** | AVPlayer (AVFoundation) |
| **循环播放** | `VideoProcess.swift` → AVMutableComposition |
| **FFmpeg** | `FFmpegKit.swift` 动态加载 |

### 2.4 平台特性

| 特性 | 实现 |
|------|------|
| **原生菜单** | AppDelegate 菜单处理 |
| **文件关联** | Info.plist CFBundleDocumentTypes |
| **本地化** | Xcode String Catalogs (.xcstrings) |

---

## 三、代码实现要点

### 3.1 AppKit 原生渲染

FlowVision 使用 AppKit 的 `NSImageView` + `NSScrollView` 组合, 利用系统原生组件实现图像显示、缩放和平移。这是最"标准"的 macOS 图片查看器实现方式。

### 3.2 文件数据库模型

```swift
struct DatabaseModel {
    var tree: TreeNode
    // 内存中的文件层次结构
}
```

不是持久化数据库, 而是内存中的文件树表示。

---

## 四、对 Steno 图片查看器的启示

### 可借鉴的设计:

1. **文件树模型**: 内存中的层次化文件表示 (vs lap 的 SQLite)
2. **布局模式**: LayoutType 枚举支持多种视图排列
3. **缩略图尺寸**: 预定义尺寸集合 (THUMB_SIZES)
4. **视频集成**: AVPlayer 包装 (Tauri 可用 HTML5 Video)

### 技术栈差异:

FlowVision 是纯 AppKit 原生应用, 与 Tauri WebView 完全不同。但其轻量级设计思路（无数据库, 内存文件树）适合简单图片查看场景。
