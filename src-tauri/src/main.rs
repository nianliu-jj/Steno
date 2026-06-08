//! Steno 应用入口点。
//!
//! 在非 debug 构建时隐藏 Windows 控制台窗口（`windows_subsystem = "windows"`）。
//! 实际初始化逻辑在 [`steno_lib::run()`] 中。

// 在非 debug 模式下隐藏 Windows 命令行窗口
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

/// 执行 main 流程，集中处理 main 相关的输入、错误和返回值。
fn main() {
    steno_lib::run()
}
