//! Tauri 构建配置 - build。
//!
//! 实现 build 相关的后端能力，连接 Tauri 命令、系统资源和本地数据持久化。
//! 注释重点标明命令入口、数据持久化边界、线程/锁使用和与前端交互的风险点。

fn main() {
    tauri_build::build()
}
