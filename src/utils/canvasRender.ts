import { applyAdjustments, isNeutralAdjust, NEUTRAL_ADJUST, type AdjustParams, type EditOp } from './imageOps';

/** 把 op 链渲染到一个 canvas（几何变换 + 末尾像素调整）。getContext 不可用时返回降级 canvas。 */
export function renderOps(
  source: CanvasImageSource,
  srcW: number,
  srcH: number,
  ops: readonly EditOp[],
  doc: Document = document,
): HTMLCanvasElement {
  let canvas = doc.createElement('canvas');
  canvas.width = srcW;
  canvas.height = srcH;
  let ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.drawImage(source, 0, 0, srcW, srcH);

  let adjust: AdjustParams = NEUTRAL_ADJUST;

  for (const op of ops) {
    if (op.type === 'adjust') {
      adjust = op.params;
      continue;
    }

    const next = doc.createElement('canvas');
    const nctx = next.getContext('2d');
    if (!nctx) return canvas;

    if (op.type === 'crop') {
      next.width = op.rect.w;
      next.height = op.rect.h;
      nctx.drawImage(canvas, op.rect.x, op.rect.y, op.rect.w, op.rect.h, 0, 0, op.rect.w, op.rect.h);
    } else if (op.type === 'resize') {
      next.width = op.w;
      next.height = op.h;
      nctx.drawImage(canvas, 0, 0, canvas.width, canvas.height, 0, 0, op.w, op.h);
    } else if (op.type === 'rotate') {
      const n = ((op.deg % 360) + 360) % 360;
      const swap = n === 90 || n === 270;
      next.width = swap ? canvas.height : canvas.width;
      next.height = swap ? canvas.width : canvas.height;
      nctx.translate(next.width / 2, next.height / 2);
      nctx.rotate((n * Math.PI) / 180);
      nctx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
    } else if (op.type === 'flip') {
      next.width = canvas.width;
      next.height = canvas.height;
      nctx.translate(op.axis === 'h' ? next.width : 0, op.axis === 'v' ? next.height : 0);
      nctx.scale(op.axis === 'h' ? -1 : 1, op.axis === 'v' ? -1 : 1);
      nctx.drawImage(canvas, 0, 0);
    }

    canvas = next;
    ctx = nctx;
  }

  if (ctx && !isNeutralAdjust(adjust)) {
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    img.data.set(applyAdjustments(img.data, adjust));
    ctx.putImageData(img, 0, 0);
  }

  return canvas;
}

export function renderToDataUrl(
  source: CanvasImageSource,
  srcW: number,
  srcH: number,
  ops: readonly EditOp[],
  type = 'image/png',
  doc: Document = document,
): string {
  return renderOps(source, srcW, srcH, ops, doc).toDataURL(type);
}
