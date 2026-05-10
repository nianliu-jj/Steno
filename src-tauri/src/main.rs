// 在非 debug 模式下隐藏 Windows 命令行窗口
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    steno_lib::run()
}
