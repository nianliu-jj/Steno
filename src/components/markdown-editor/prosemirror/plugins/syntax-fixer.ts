/**
 * @file Steno 语法修复插件
 *
 * 移植自 PureMark `src/core/plugins/syntax-fixer.ts`（271 行）。
 * 监听文档变化，检测并修复不完整的语法结构：例如删除 `**a**` 的后两个 `**`
 * 之后，应移除残留的 strong / syntax_marker mark。
 *
 * Steno 适配说明：`any` 替换为 `Node` / 具体类型；逻辑与 PureMark 一致。
 */

import { Plugin, PluginKey } from 'prosemirror-state';
import type { Node } from 'prosemirror-model';

/** 语法定义 */
interface SyntaxDef {
  markType: string;
  markers: string[]; // 可能的语法标记，如 ['**', '__'] 对应 strong
}

/** 支持的语法列表（链接前后缀不同，需特殊处理，这里不含） */
const SYNTAX_DEFS: SyntaxDef[] = [
  { markType: 'strong', markers: ['**', '__'] },
  { markType: 'emphasis', markers: ['*', '_'] },
  { markType: 'code_inline', markers: ['`'] },
  { markType: 'strikethrough', markers: ['~~'] },
  { markType: 'highlight', markers: ['=='] },
  { markType: 'math_inline', markers: ['$'] },
];

/** 插件 Key */
export const syntaxFixerPluginKey = new PluginKey('steno-syntax-fixer');

/** 语法标记信息 */
interface SyntaxMarkerInfo {
  from: number;
  to: number;
  text: string;
  syntaxType: string;
  semanticMark: string | null;
}

/** 无效范围 */
interface InvalidRange {
  from: number;
  to: number;
  markType: string;
}

/**
 * 收集文本块中的所有语法标记
 */
function collectSyntaxMarkers(node: Node, basePos: number): SyntaxMarkerInfo[] {
  const markers: SyntaxMarkerInfo[] = [];

  let offset = 0;
  node.forEach(child => {
    if (child.isText) {
      const syntaxMark = child.marks.find(m => m.type.name === 'syntax_marker');
      if (syntaxMark) {
        // 跳过 escape 类型的 syntax_marker
        if (syntaxMark.attrs.syntaxType === 'escape') {
          offset += child.nodeSize;
          return;
        }

        const semanticMark = child.marks.find(
          m => m.type.name !== 'syntax_marker' && SYNTAX_DEFS.some(s => s.markType === m.type.name),
        );

        markers.push({
          from: basePos + offset,
          to: basePos + offset + child.nodeSize,
          text: child.text ?? '',
          syntaxType: syntaxMark.attrs.syntaxType as string,
          semanticMark: semanticMark?.type.name ?? null,
        });
      }
    }
    offset += child.nodeSize;
  });

  return markers;
}

/**
 * 检查语法标记是否成对，返回需要移除 marks 的范围
 */
function findUnpairedMarkers(node: Node, basePos: number): InvalidRange[] {
  const markers = collectSyntaxMarkers(node, basePos);
  const invalidRanges: InvalidRange[] = [];

  // 按语法类型分组
  const markersByType = new Map<string, SyntaxMarkerInfo[]>();
  for (const marker of markers) {
    const key = marker.syntaxType;
    if (!markersByType.has(key)) {
      markersByType.set(key, []);
    }
    markersByType.get(key)!.push(marker);
  }

  for (const [syntaxType, typeMarkers] of markersByType) {
    const syntaxDef = SYNTAX_DEFS.find(s => s.markType === syntaxType);
    if (!syntaxDef) continue;

    typeMarkers.sort((a, b) => a.from - b.from);

    // 检查是否成对（相同的标记文本）
    const stack: SyntaxMarkerInfo[] = [];
    const paired = new Set<SyntaxMarkerInfo>();

    for (const marker of typeMarkers) {
      if (stack.length > 0) {
        const top = stack[stack.length - 1];
        if (top.text === marker.text && syntaxDef.markers.includes(marker.text)) {
          paired.add(top);
          paired.add(marker);
          stack.pop();
          continue;
        }
      }
      stack.push(marker);
    }

    // 未配对的标记需要移除 marks
    for (const marker of typeMarkers) {
      if (!paired.has(marker)) {
        const region = findSemanticRegion(node, basePos, marker, syntaxType);
        if (region) {
          invalidRanges.push(region);
        }
      }
    }
  }

  return invalidRanges;
}

/**
 * 找到语法标记所在的整个语义区域
 */
function findSemanticRegion(
  node: Node,
  basePos: number,
  marker: SyntaxMarkerInfo,
  markType: string,
): InvalidRange | null {
  let offset = 0;
  let regionStart = -1;
  let regionEnd = -1;
  let foundMarker = false;

  node.forEach(child => {
    if (child.isText) {
      const hasMark = child.marks.some(m => m.type.name === markType);
      const childStart = basePos + offset;
      const childEnd = basePos + offset + child.nodeSize;

      if (hasMark) {
        if (regionStart === -1) {
          regionStart = childStart;
        }
        regionEnd = childEnd;

        if (childStart <= marker.from && childEnd >= marker.to) {
          foundMarker = true;
        }
      } else if (regionStart !== -1 && foundMarker) {
        // 区域结束且已找到 marker —— 保持当前区域（forEach 无法 break，靠下方判定）
      } else if (regionStart !== -1) {
        // 区域结束但未找到 marker，重置
        regionStart = -1;
        regionEnd = -1;
      }
    }
    offset += child.nodeSize;
  });

  if (regionStart !== -1 && regionEnd !== -1 && foundMarker) {
    return { from: regionStart, to: regionEnd, markType };
  }

  return null;
}

/**
 * 创建语法修复插件
 */
export function createSyntaxFixerPlugin(): Plugin {
  return new Plugin({
    key: syntaxFixerPluginKey,

    appendTransaction(transactions, _oldState, newState) {
      const docChanged = transactions.some(tr => tr.docChanged);
      if (!docChanged) return null;

      // 跳过本插件自身产生的 transaction，避免循环
      if (transactions.some(tr => tr.getMeta('syntax-plugin-internal'))) return null;

      const invalidRanges: InvalidRange[] = [];

      newState.doc.descendants((node, pos) => {
        if (node.isTextblock) {
          invalidRanges.push(...findUnpairedMarkers(node, pos + 1));
        }
        return true;
      });

      if (invalidRanges.length === 0) return null;

      const uniqueRanges = invalidRanges.filter(
        (range, index, self) =>
          index ===
          self.findIndex(
            r => r.from === range.from && r.to === range.to && r.markType === range.markType,
          ),
      );

      let tr = newState.tr;
      tr = tr.setMeta('syntax-plugin-internal', true);
      for (const range of uniqueRanges) {
        const markType = newState.schema.marks[range.markType];
        if (markType) {
          tr = tr.removeMark(range.from, range.to, markType);
        }
        const syntaxMarkerType = newState.schema.marks.syntax_marker;
        if (syntaxMarkerType) {
          tr = tr.removeMark(range.from, range.to, syntaxMarkerType);
        }
      }

      return tr.docChanged ? tr : null;
    },
  });
}
