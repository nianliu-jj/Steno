/**
 * @file 项目自动化脚本 - constant
 *
 * 组织 constant 的核心逻辑、类型和协作边界，供 项目自动化脚本 模块复用。
 * 注释重点标明数据入口、状态边界、事件通道和协作风险点，便于逐行阅读时快速判断代码意图。
 */

export const VERSION_REG = /^v\d+\.\d+\.\d+(-(beta|alpha)\.\d+)?/;
// 导出常量 VERSION_REG_OF_MARKDOWN：为其他模块提供稳定配置、选项或 helper 入口。
export const VERSION_REG_OF_MARKDOWN = /## \[v\d+\.\d+\.\d+(-(beta|alpha)\.\d+)?]/g;
// 导出常量 VERSION_WITH_RELEASE：为其他模块提供稳定配置、选项或 helper 入口。
export const VERSION_WITH_RELEASE = /release\sv\d+\.\d+\.\d+(-(beta|alpha)\.\d+)?/;
