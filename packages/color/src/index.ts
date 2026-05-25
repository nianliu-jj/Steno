/**
 * @file @sa/color — 调色板与颜色工具
 *
 * 导出：
 * - `colorPalettes` — 预定义调色板常量
 * - `palette/` — Ant Design 推荐色板及生成算法
 * - `shared/` — colord 颜色实例工厂、颜色名称映射
 * - `types/` — 颜色相关类型定义
 */

import { colorPalettes } from './constant';

export * from './palette';
export * from './shared';
export { colorPalettes };

export * from './types';
