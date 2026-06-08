/**
 * @file Lint 规则配置 - shared
 *
 * 组织 shared 的核心逻辑、类型和协作边界，供 Lint 规则配置 模块复用。
 * 注释重点标明数据入口、状态边界、事件通道和协作风险点，便于逐行阅读时快速判断代码意图。
 */

export async function interopDefault<T>(m: T | Promise<T>): Promise<T> {
  // 函数式常量 resolved：以闭包形式组织逻辑，便于在组件、store 或测试中传递。
  const resolved = (await m) as { default?: T } & T;
  return ((resolved as { default?: T }).default || resolved) as T;
}
