/**
 * @file 第三方 markdown-it 插件类型声明。
 *
 * 这些插件未在 DefinitelyTyped 提供官方类型，或仅提供 CJS 默认导出
 * 与 ESM import 形式不兼容，故在此手写最小声明，仅覆盖项目实际调用面。
 */

declare module 'markdown-it-mark' {
  import type { PluginSimple } from 'markdown-it';
  const mark: PluginSimple;
  export default mark;
}

declare module 'markdown-it-task-lists' {
  import type { PluginWithOptions } from 'markdown-it';
  // 类型 TaskListsOptions：记录模块边界的数据形状，帮助调用方理解字段来源和约束。
  interface TaskListsOptions {
    enabled?: boolean;
    label?: boolean;
    labelAfter?: boolean;
  }
  const taskLists: PluginWithOptions<TaskListsOptions>;
  export default taskLists;
}

declare module '@vscode/markdown-it-katex' {
  import type { PluginWithOptions } from 'markdown-it';
  // 类型 KatexOptions：记录模块边界的数据形状，帮助调用方理解字段来源和约束。
  interface KatexOptions {
    throwOnError?: boolean;
    errorColor?: string;
    output?: 'html' | 'mathml' | 'htmlAndMathml';
    enableMathBlockInHtml?: boolean;
    enableMathInlineInHtml?: boolean;
    enableBareBlocks?: boolean;
    enableFencedBlocks?: boolean;
  }
  const katex: PluginWithOptions<KatexOptions>;
  export default katex;
}
