/**
 * @file Steno 即时渲染插件
 *
 * 移植自 PureMark `src/core/plugins/instant-render.ts`（146 行）。
 *
 * 核心插件，实现 Typora 风格的即时渲染：语法标记是真实文本内容，光标可在其内
 * 自由移动，根据光标位置动态显示/隐藏语法标记（实际显隐由 decorations 插件做，
 * 本插件负责对外暴露「当前活跃语法区域」状态与开关）。
 *
 * Steno 适配说明：import 路径改为相对 `../decorations`；`any` 改具体类型。
 */

import { type EditorState, Plugin, PluginKey, type Transaction } from 'prosemirror-state';
import {
  createDecorationPlugin,
  findSyntaxMarkerRegions,
  type SyntaxMarkerRegion,
} from '../decorations';

/** 即时渲染插件状态 */
export interface InstantRenderState {
  enabled: boolean;
  activeRegions: SyntaxMarkerRegion[];
  lastCursorPos: number;
}

/** 即时渲染插件 Key */
export const instantRenderPluginKey = new PluginKey<InstantRenderState>('steno-instant-render');

/** 插件配置 */
export interface InstantRenderConfig {
  enabled?: boolean;
  /** 初始是否处于源码模式（传递给 decorations 插件） */
  sourceView?: boolean;
}

const defaultConfig: Required<Omit<InstantRenderConfig, 'sourceView'>> = {
  enabled: true,
};

/**
 * 创建即时渲染插件（返回 [装饰插件, 控制插件] 两个 Plugin）
 */
export function createInstantRenderPlugin(config: InstantRenderConfig = {}): Plugin[] {
  const mergedConfig = { ...defaultConfig, ...config };

  const decorationPlugin = createDecorationPlugin(config.sourceView ?? false);

  const controlPlugin = new Plugin<InstantRenderState>({
    key: instantRenderPluginKey,

    state: {
      init() {
        return {
          enabled: mergedConfig.enabled,
          activeRegions: [],
          lastCursorPos: 0,
        };
      },

      apply(tr, state, _oldEditorState, newEditorState) {
        const meta = tr.getMeta(instantRenderPluginKey) as { enabled?: boolean } | undefined;

        if (meta?.enabled !== undefined) {
          return { ...state, enabled: meta.enabled };
        }

        const cursorPos = newEditorState.selection.head;
        if (cursorPos !== state.lastCursorPos || tr.docChanged) {
          const regions = findSyntaxMarkerRegions(newEditorState.doc);
          const activeRegions = regions.filter(r => cursorPos >= r.from && cursorPos <= r.to);
          return { ...state, activeRegions, lastCursorPos: cursorPos };
        }

        return state;
      },
    },
  });

  return [decorationPlugin, controlPlugin];
}

/** 启用即时渲染 */
export function enableInstantRender(
  state: EditorState,
  dispatch?: (tr: Transaction) => void,
): boolean {
  if (dispatch) {
    dispatch(state.tr.setMeta(instantRenderPluginKey, { enabled: true }));
  }
  return true;
}

/** 禁用即时渲染 */
export function disableInstantRender(
  state: EditorState,
  dispatch?: (tr: Transaction) => void,
): boolean {
  if (dispatch) {
    dispatch(state.tr.setMeta(instantRenderPluginKey, { enabled: false }));
  }
  return true;
}

/** 切换即时渲染 */
export function toggleInstantRender(
  state: EditorState,
  dispatch?: (tr: Transaction) => void,
): boolean {
  const pluginState = instantRenderPluginKey.getState(state);
  if (!pluginState) return false;
  if (dispatch) {
    dispatch(state.tr.setMeta(instantRenderPluginKey, { enabled: !pluginState.enabled }));
  }
  return true;
}

/** 获取当前即时渲染状态 */
export function getInstantRenderState(state: EditorState): InstantRenderState | undefined {
  return instantRenderPluginKey.getState(state) ?? undefined;
}

/** 获取当前活跃的语法区域 */
export function getActiveRegionsFromState(state: EditorState): SyntaxMarkerRegion[] {
  return instantRenderPluginKey.getState(state)?.activeRegions ?? [];
}
