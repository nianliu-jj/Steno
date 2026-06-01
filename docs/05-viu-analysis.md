# Viu 项目分析报告

> **技术栈**: 纯 Rust + 终端渲染  
> **定位**: 终端内图片查看器 (CLI)  
> **许可证**: MIT  
> **版本**: 1.6.1  
> **与 Steno 的关联度**: ⭐⭐ (图像处理管线参考)

---

## 一、项目架构

```
viu/
├── Cargo.toml              # 依赖定义
├── src/
│   ├── main.rs             # 入口: clap CLI 参数解析 (~94行)
│   ├── app.rs              # 核心逻辑: 文件迭代, GIF 动画, Ctrl-C (~160行)
│   └── config.rs           # Config 结构: CLI 参数 → viuer::Config
└── img/                    # 演示图像
```

### 关键依赖

| Crate | 用途 |
|-------|------|
| `clap` | CLI 参数解析 |
| `viuer` | 图像渲染后端 (终端协议) |
| `image` | 图像解码, GIF 帧提取 |
| `crossterm` | 终端光标移动, 清屏 |
| `ctrlc` | 信号处理 |

---

## 二、功能模块分析

### 2.1 终端渲染协议

viu 本身不渲染 — 全部委托给 `viuer` crate, 支持 4 种协议:

| 协议 | 触发条件 | 能力 |
|------|----------|------|
| **Kitty Graphics** | Kitty 终端检测 | 全分辨率, GIF 动画原生支持 |
| **iTerm2** | iTerm2 检测 | 全分辨率 |
| **Half-Block (▄)** | fallback | 2 像素/字符, TrueColor/ANSI-256 |
| **Sixel** | feature 启用 | 传统终端图形 |

### 2.2 CLI 接口

| 参数 | 类型 | 说明 |
|------|------|------|
| `[file]...` | 位置参数 | 图像路径, `-` 表示 stdin |
| `-w, --width` | u32 | 目标宽度 |
| `-h, --height` | u32 | 目标高度 |
| `-x, -y` | u16/i16 | 偏移量 |
| `-a, --absolute-offset` | bool | 相对于终端角落 |
| `-r, --recursive` | bool | 递归目录 |
| `-b, --blocks` | bool | 强制 half-block 模式 |
| `-n, --name` | bool | 输出文件名前缀 |
| `-c, --caption` | bool | 输出文件名后缀 |
| `-t, --transparent` | bool | 显示透明度 |
| `-f, --frame-rate` | u8 | GIF 帧率覆盖 |
| `-1, --once` | bool | GIF 只播放一次 |
| `-s, --static` | bool | 仅显示 GIF 第一帧 |

### 2.3 GIF 动画循环

```rust
// app.rs:117-149
loop {
    for frame in frames.iter() {
        viuer::print(&frame, &config);  // 渲染帧
        sleep(delay);                    // 等待帧延迟
        // 光标上移覆盖重绘 (避免滚屏)
    }
    if !loop_gif { break; }
}
```

### 2.4 图像缩放策略

- **Kitty/iTerm**: 保持原始分辨率 (终端负责缩放)
- **Half-block**: `viuer::resize()` 缩放到 `--width`/`--height` (单边指定时保持宽高比)
- **自动适配**: 无 `-w`/`-h` 时自动适配终端尺寸 (通过 crossterm 查询)

### 2.5 stdin 管道

```rust
// app.rs:44-57
if arg == "-" {
    let buf = read_stdin_all();
    if is_gif(&buf) { decode_gif_frames(&buf) }
    else { viuer::print(&buf, &config) }
}
```

---

## 三、代码实现要点

### 3.1 极简架构

viu 示范了"最小可行图像查看器": 总共 3 个源文件, ~350 行代码, 无 GUI 框架, 专注于核心功能。

### 3.2 信号处理

```rust
// 双向通道协调 GIF 循环和 Ctrl-C
let (tx_ctrlc, rx_print) = channel();  // Ctrl-C → 动画循环
let (tx_print, rx_ctrlc) = channel();  // 动画循环 → Ctrl-C handler
```
优雅处理 BrokenPipe (如 piped to `head`)。

---

## 四、对 Steno 图片查看器的启示

### 可借鉴的设计:

1. **最小化图像查看器架构**: 3 文件即可实现核心功能
2. **图像尺寸自适应**: 单边约束 + 保持宽高比
3. **GIF 帧控制**: `--once`/`--static`/`--frame-rate` 三种播放模式
4. **stdin 管道支持**: 从管道读取图像数据

### 与 Steno 的差异:

viu 是纯 CLI 工具, 不涉及 GUI 框架。其价值在于示范了图像查看器核心功能的最小实现。
