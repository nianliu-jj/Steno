/**
 * @file 前端工具函数 - image Ops
 *
 * 组织 image Ops 的核心逻辑、类型和协作边界，供 前端工具函数 模块复用。
 * 注释重点标明数据入口、状态边界、事件通道和协作风险点，便于逐行阅读时快速判断代码意图。
 */

export interface AdjustParams {
  /** -100..100，0 = 不变 */
  brightness: number;
  contrast: number;
  saturation: number;
  grayscale: boolean;
  invert: boolean;
}

// 导出常量 NEUTRAL_ADJUST：为其他模块提供稳定配置、选项或 helper 入口。
export const NEUTRAL_ADJUST: AdjustParams = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
  grayscale: false,
  invert: false
};

/** 判断调整参数是否等价于"无变化"（按值比较，用于跳过逐像素处理）。 */
export function isNeutralAdjust(p: AdjustParams): boolean {
  return p.brightness === 0 && p.contrast === 0 && p.saturation === 0 && !p.grayscale && !p.invert;
}

// 类型 CropRect：记录模块边界的数据形状，帮助调用方理解字段来源和约束。
export interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

// 类型 EditOp：记录模块边界的数据形状，帮助调用方理解字段来源和约束。
export type EditOp =
  | { type: 'crop'; rect: CropRect }
  | { type: 'rotate'; deg: number } // 本期 UI 仅 ±90° 步进；模型支持任意角(预留)
  | { type: 'flip'; axis: 'h' | 'v' }
  | { type: 'resize'; w: number; h: number }
  | { type: 'adjust'; params: AdjustParams };

// 局部常量 LUMA_R：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const LUMA_R = 0.299;
// 局部常量 LUMA_G：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const LUMA_G = 0.587;
// 局部常量 LUMA_B：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
const LUMA_B = 0.114;

/** 逐像素应用基础调整，返回新数组（不修改入参）。Uint8ClampedArray 自动裁剪到 0..255。 */
export function applyAdjustments(data: Uint8ClampedArray, p: AdjustParams): Uint8ClampedArray {
  // 局部常量 out：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const out = new Uint8ClampedArray(data.length);
  // 函数式常量 bright：以闭包形式组织逻辑，便于在组件、store 或测试中传递。
  const bright = (p.brightness / 100) * 255;
  // 局部常量 cf：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const cf = 1 + p.contrast / 100;
  // 局部常量 sf：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const sf = 1 + p.saturation / 100;

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];

    r += bright;
    g += bright;
    b += bright;

    r = (r - 128) * cf + 128;
    g = (g - 128) * cf + 128;
    b = (b - 128) * cf + 128;

    // 局部常量 luma：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const luma = LUMA_R * r + LUMA_G * g + LUMA_B * b;
    r = luma + (r - luma) * sf;
    g = luma + (g - luma) * sf;
    b = luma + (b - luma) * sf;

    if (p.grayscale) {
      // 局部常量 gray：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
      const gray = LUMA_R * r + LUMA_G * g + LUMA_B * b;
      r = gray;
      g = gray;
      b = gray;
    }

    if (p.invert) {
      r = 255 - r;
      g = 255 - g;
      b = 255 - b;
    }

    out[i] = r;
    out[i + 1] = g;
    out[i + 2] = b;
    out[i + 3] = data[i + 3];
  }

  return out;
}

/** 按 op 链推导最终输出像素尺寸（纯计算，不渲染）。 */
export function computeOutputSize(ops: readonly EditOp[], srcW: number, srcH: number): { w: number; h: number } {
  let w = srcW;
  let h = srcH;
  for (const op of ops) {
    if (op.type === 'crop') {
      w = op.rect.w;
      h = op.rect.h;
    } else if (op.type === 'resize') {
      w = op.w;
      h = op.h;
    } else if (op.type === 'rotate') {
      // 函数式常量 n：以闭包形式组织逻辑，便于在组件、store 或测试中传递。
      const n = ((op.deg % 360) + 360) % 360;
      if (n === 90 || n === 270) {
        // 局部常量 t：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
        const t = w;
        w = h;
        h = t;
      }
    }
  }
  return { w, h };
}

/** 把裁剪框约束到图像范围内，最小边长 1。 */
export function clampCropRect(rect: CropRect, srcW: number, srcH: number): CropRect {
  // 局部常量 x：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const x = Math.min(Math.max(Math.round(rect.x), 0), Math.max(srcW - 1, 0));
  // 局部常量 y：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const y = Math.min(Math.max(Math.round(rect.y), 0), Math.max(srcH - 1, 0));
  // 局部常量 w：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const w = Math.min(Math.max(Math.round(rect.w), 1), srcW - x);
  // 局部常量 h：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const h = Math.min(Math.max(Math.round(rect.h), 1), srcH - y);
  return { x, y, w, h };
}

/** 裁剪选框的归一化表示（相对当前图像的 [0,1] 比例），用于把屏幕交互与像素坐标解耦。 */
export interface CropFraction {
  fx: number;
  fy: number;
  fw: number;
  fh: number;
}

/** 把归一化裁剪选框换算为像素裁剪矩形（相对当前画布尺寸 baseW×baseH），并约束到边界内。 */
export function cropRectFromFraction(sel: CropFraction, baseW: number, baseH: number): CropRect {
  return clampCropRect({ x: sel.fx * baseW, y: sel.fy * baseH, w: sel.fw * baseW, h: sel.fh * baseH }, baseW, baseH);
}
