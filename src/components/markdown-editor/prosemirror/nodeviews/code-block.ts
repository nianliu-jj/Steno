/**
 * @file code-block NodeView（内嵌 CodeMirror 6）
 *
 * 移植自 PureMark `src/core/nodeviews/code-block.ts`。核心是「在 ProseMirror NodeView
 * 内挂一个 CodeMirror 6 EditorView」的经典嵌套编辑器方案（PM 官方 codemirror 示例同构）：
 *   - 编辑态语法高亮交给 CM；
 *   - 内外 selection / focus / undo 协同（PM→CM 用 setSelection，CM→PM 用 forwardSelection）；
 *   - CM 文档变更回写 PM（onCMUpdate），PM 文档变更同步进 CM（update）；
 *   - 方向键 / Backspace 在 CM 边界处「跳出」到外层 PM。
 *
 * Steno 相对 PureMark 的关键适配：
 * - 不实现 source-view 模式、Mermaid 预览、右键菜单、行内搜索高亮（Steno 有独立的
 *   mermaid-block NodeView，且尚无 source-view / search 插件），仅保留代码块编辑 + 复制 + 语言标签。
 * - 语言包改用 `@codemirror/language-data` 的 `languages` + `LanguageDescription.matchLanguageName(...).load()`
 *   动态加载（PureMark 是一堆静态 import + 自维护映射表）。
 * - 暗色主题由外层 CSS（`.app-theme-root.dark`）驱动，这里不做 JS 层暗色检测；
 *   CM 主题仅给一个适配 CSS 变量的透明 `EditorView.theme`，配色由外层 CSS 覆盖。
 * - 语言选择器降级为只读「语言标签」（PureMark 是自定义下拉选择器，依赖大量交互/样式）。
 * - `any` 一律换成 `unknown` / 具体类型（oxlint 严格模式）。
 */

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { EditorView as ProseMirrorView, NodeView } from 'prosemirror-view';
import { Selection, TextSelection } from 'prosemirror-state';
import {
  EditorView,
  keymap as cmKeymap,
  lineNumbers,
  // 类型 ViewUpdate：记录模块边界的数据形状，帮助调用方理解字段来源和约束。
  type ViewUpdate
} from '@codemirror/view';
import { EditorState as CMEditorState, Compartment } from '@codemirror/state';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { syntaxHighlighting, defaultHighlightStyle, LanguageDescription } from '@codemirror/language';
import { languages as cmLanguages } from '@codemirror/language-data';

/**
 * 创建 CodeMirror 主题扩展（移植自 PureMark createThemeExtension，去掉 isDark 分支）。
 *
 * Steno 适配：暗色由外层 `.app-theme-root.dark` CSS 驱动，这里只给一个透明背景、
 * 用 CSS 变量取色的基础主题，具体配色（含暗色）交给外层样式覆盖。
 */
function createThemeExtension() {
  // 局部常量 baseTheme：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const baseTheme = EditorView.theme({
    '&': {
      backgroundColor: 'transparent',
      color: 'var(--text-color)'
    },
    '.cm-content': {
      caretColor: 'var(--text-color)'
    },
    '.cm-cursor, .cm-dropCursor': {
      borderLeftColor: 'var(--text-color)'
    },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
      backgroundColor: 'var(--selected-background-color)'
    },
    '.cm-activeLine': {
      backgroundColor: 'transparent'
    },
    '.cm-gutters': {
      backgroundColor: 'transparent',
      color: 'var(--text-color-3)',
      border: 'none'
    },
    '.cm-activeLineGutter': {
      backgroundColor: 'transparent'
    },
    '.cm-lineNumbers .cm-gutterElement': {
      color: 'var(--text-color-3)'
    }
  });
  return [baseTheme, syntaxHighlighting(defaultHighlightStyle)];
}

/**
 * 根据语言名（attrs.language，可能是别名如 ts/py）查 `@codemirror/language-data` 描述符。
 * 返回值同时用于：动态加载语言扩展、以及显示用的标签文本。
 */
function matchLanguageDescription(language: string): LanguageDescription | null {
  // 函数式常量 name：以闭包形式组织逻辑，便于在组件、store 或测试中传递。
  const name = (language ?? '').trim();
  if (!name) return null;
  return LanguageDescription.matchLanguageName(cmLanguages, name, true);
}

/** 语言标签显示文本：能匹配到描述符就用其规范名，否则回退到原始字符串或「纯文本」。 */
function languageLabel(language: string): string {
  // 局部常量 desc：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
  const desc = matchLanguageDescription(language);
  if (desc) return desc.name;
  return (language ?? '').trim() || 'plain text';
}

/**
 * 代码块 NodeView 类（移植自 PureMark CodeBlockView）。
 */
export class CodeBlockView implements NodeView {
  dom: HTMLElement;
  cm: EditorView | null = null;
  node: ProseMirrorNode;
  view: ProseMirrorView;
  getPos: () => number | undefined;
  /** 标记「正在由一侧驱动另一侧更新」，避免 PM↔CM 双向同步形成回环。 */
  updating = false;
  languageCompartment: Compartment;
  headerElement: HTMLElement;
  langLabelElement: HTMLElement;
  editorContainer: HTMLElement;
  readonlyElement: HTMLPreElement | null = null;
  isEditable: boolean;
  /** 当前已加载语言名的 token，避免异步 load 竞态把旧语言扩展写回。 */
  private loadedLanguageToken = '';

  constructor(node: ProseMirrorNode, view: ProseMirrorView, getPos: () => number | undefined) {
    this.node = node;
    this.view = view;
    this.getPos = getPos;
    this.languageCompartment = new Compartment();
    this.isEditable = view.editable;

    const language: string = node.attrs.language ?? '';

    // 容器
    this.dom = document.createElement('div');
    this.dom.className = 'steno-code-block';
    if (!this.isEditable) this.dom.classList.add('is-readonly');

    // 头部（语言标签 + 复制按钮）
    this.headerElement = document.createElement('div');
    this.headerElement.className = 'steno-code-block-header';

    this.langLabelElement = document.createElement('span');
    this.langLabelElement.className = 'steno-code-block-lang-label';
    this.langLabelElement.textContent = languageLabel(language);
    this.headerElement.appendChild(this.langLabelElement);

    this.headerElement.appendChild(this.createCopyButton());
    this.dom.appendChild(this.headerElement);

    this.editorContainer = document.createElement('div');
    this.editorContainer.className = 'steno-code-block-editor';
    this.dom.appendChild(this.editorContainer);

    if (this.isEditable) {
      this.mountCodeMirror(node);
      // 异步加载语言扩展（动态 import 语言包）
      void this.loadLanguage(language);
    } else {
      this.renderReadonlyCode();
    }
  }

  private mountCodeMirror(node: ProseMirrorNode): void {
    this.cm = new EditorView({
      state: CMEditorState.create({
        doc: node.textContent,
        extensions: [
          history(),
          cmKeymap.of([
            {
              // 在列表中按 Ctrl-Enter 退出代码块（保留 PureMark 行为）
              key: 'Ctrl-Enter',
              run: () => {
                // 局部常量 pos：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
                const pos = this.getPos();
                if (pos !== undefined) {
                  const $pos = this.view.state.doc.resolve(pos);
                  let inList = false;
                  for (let d = $pos.depth; d > 0; d--) {
                    // 局部常量 ancestor：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
                    const ancestor = $pos.node(d);
                    if (ancestor.type.name === 'list_item' || ancestor.type.name === 'task_item') {
                      inList = true;
                      break;
                    }
                  }
                  if (inList) {
                    this.exitCodeBlockAndCreateListItem();
                    return true;
                  }
                }
                this.exitCodeBlock(1);
                return true;
              }
            },
            {
              // 在最后一行按 ↓ 跳出到代码块下方
              key: 'ArrowDown',
              run: cmView => {
                const { state } = cmView;
                const { main } = state.selection;
                // 局部常量 line：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
                const line = state.doc.lineAt(main.head);
                if (line.number === state.doc.lines) {
                  this.exitCodeBlock(1);
                  return true;
                }
                return false;
              }
            },
            {
              // 在第一行按 ↑ 跳出到代码块上方
              key: 'ArrowUp',
              run: cmView => {
                const { state } = cmView;
                const { main } = state.selection;
                // 局部常量 line：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
                const line = state.doc.lineAt(main.head);
                if (line.number === 1) {
                  this.exitCodeBlock(-1);
                  return true;
                }
                return false;
              }
            },
            {
              // 在开头按 ← 跳出到代码块上方
              key: 'ArrowLeft',
              run: cmView => {
                const { main } = cmView.state.selection;
                if (main.head === 0 && main.empty) {
                  this.exitCodeBlock(-1);
                  return true;
                }
                return false;
              }
            },
            {
              // 在开头/末尾按 → 分别跳出代码块上/下方
              key: 'ArrowRight',
              run: cmView => {
                const { state } = cmView;
                const { main } = state.selection;
                if (main.head === 0 && main.empty) {
                  this.exitCodeBlock(-1);
                  return true;
                }
                if (main.head === state.doc.length && main.empty) {
                  this.exitCodeBlock(1);
                  return true;
                }
                return false;
              }
            },
            {
              // 空代码块按 Backspace 删除整个代码块
              key: 'Backspace',
              run: cmView => {
                if (cmView.state.doc.length === 0) {
                  this.deleteCodeBlock();
                  return true;
                }
                return false;
              }
            },
            ...defaultKeymap,
            ...historyKeymap
          ]),
          createThemeExtension(),
          this.languageCompartment.of([]),
          lineNumbers(),
          EditorView.updateListener.of(update => this.onCMUpdate(update)),
          EditorView.domEventHandlers({
            focus: () => this.forwardSelection()
          })
        ]
      }),
      parent: this.editorContainer
    });
  }

  private renderReadonlyCode(): void {
    this.editorContainer.replaceChildren();

    // 局部常量 pre：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const pre = document.createElement('pre');
    pre.className = 'steno-code-block-readonly';
    // 局部常量 code：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const code = document.createElement('code');

    // 局部常量 lines：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const lines = this.node.textContent.split('\n');
    // 局部常量 visibleLines：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const visibleLines = lines.length > 0 ? lines : [''];
    for (const line of visibleLines) {
      // 局部常量 row：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
      const row = document.createElement('span');
      row.className = 'steno-code-block-line';

      // 局部常量 content：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
      const content = document.createElement('span');
      content.className = 'steno-code-block-line-content';
      content.textContent = line || ' ';
      row.appendChild(content);
      code.appendChild(row);
    }

    pre.appendChild(code);
    this.editorContainer.appendChild(pre);
    this.readonlyElement = pre;
  }

  /** 复制按钮：把代码块的完整 Markdown 写入剪贴板，点击后短暂提示「已复制」。 */
  private createCopyButton(): HTMLButtonElement {
    // 局部常量 copyBtn：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const copyBtn = document.createElement('button');
    copyBtn.className = 'steno-code-block-copy-btn';
    copyBtn.type = 'button';
    copyBtn.title = '复制代码块';
    copyBtn.textContent = '复制';
    copyBtn.addEventListener('click', e => {
      e.stopPropagation();
      void this.copyCodeBlock();
      copyBtn.classList.add('copied');
      copyBtn.textContent = '已复制';
      setTimeout(() => {
        copyBtn.classList.remove('copied');
        copyBtn.textContent = '复制';
      }, 1500);
    });
    return copyBtn;
  }

  /** 代码块完整 Markdown（含围栏，移植自 PureMark getCodeBlockMarkdown）。 */
  private getCodeBlockMarkdown(): string {
    const language: string = this.node.attrs.language ?? '';
    // 局部常量 content：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const content = this.cm?.state.doc.toString() ?? this.node.textContent;
    return `\`\`\`${language}\n${content}\n\`\`\``;
  }

  /** 写入剪贴板（容错：jsdom / 非安全上下文下 clipboard 可能缺失）。 */
  private async copyCodeBlock(): Promise<void> {
    try {
      await navigator.clipboard?.writeText(this.getCodeBlockMarkdown());
    } catch {
      // 剪贴板不可用时静默失败，不影响编辑
    }
  }

  /**
   * 动态加载语言扩展并 reconfigure 进 CM。
   *
   * 用 token 防竞态：发起加载前记下目标语言，await 完成后若 token 已变（语言又被改了），
   * 则丢弃本次结果。
   */
  private async loadLanguage(language: string): Promise<void> {
    // 函数式常量 token：以闭包形式组织逻辑，便于在组件、store 或测试中传递。
    const token = (language ?? '').trim();
    this.loadedLanguageToken = token;
    // 局部常量 desc：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const desc = matchLanguageDescription(token);
    if (!desc) {
      // 无匹配语言：清空语言扩展
      this.cm?.dispatch({ effects: this.languageCompartment.reconfigure([]) });
      return;
    }
    try {
      // 局部常量 support：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
      const support = await desc.load();
      if (this.loadedLanguageToken !== token) return; // 已被后续切换覆盖
      this.cm?.dispatch({ effects: this.languageCompartment.reconfigure(support) });
    } catch {
      // 语言包加载失败（如对应 lang-* 未安装），降级为无高亮，不抛错
      if (this.loadedLanguageToken === token) {
        this.cm?.dispatch({ effects: this.languageCompartment.reconfigure([]) });
      }
    }
  }

  /**
   * CodeMirror 文档变更回写 ProseMirror（移植自 PureMark onCMUpdate）。
   */
  private onCMUpdate(update: ViewUpdate): void {
    if (this.updating) return;
    // 选区变化（无文档变更）也要前向同步，保证外层 selection 跟随 CM 光标
    if (!update.docChanged) {
      if (update.selectionSet && this.cm?.hasFocus) this.forwardSelection();
      return;
    }

    // 局部常量 pos：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const pos = this.getPos();
    if (pos === undefined) return;

    // 局部常量 newText：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const newText = update.state.doc.toString();
    // 局部常量 tr：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const tr = this.view.state.tr;
    // 局部常量 start：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const start = pos + 1;
    // 局部常量 end：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const end = pos + 1 + this.node.content.size;
    tr.replaceWith(start, end, newText ? this.view.state.schema.text(newText) : []);
    this.view.dispatch(tr);
  }

  /**
   * 把 CM 选区转发到 ProseMirror（移植自 PureMark forwardSelection）。
   * CM 偏移 + (pos + 1) 即 PM 文档坐标。
   */
  private forwardSelection(): void {
    if (!this.cm) return;
    // 局部常量 pos：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const pos = this.getPos();
    if (pos === undefined) return;

    const { from, to } = this.cm.state.selection.main;
    // 局部常量 start：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const start = pos + 1 + from;
    // 局部常量 end：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const end = pos + 1 + to;
    // 局部常量 selection：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const selection = TextSelection.create(this.view.state.doc, start, end);

    if (!this.view.state.selection.eq(selection)) {
      this.view.dispatch(this.view.state.tr.setSelection(selection));
    }
  }

  /**
   * 跳出代码块（移植自 PureMark exitCodeBlock）。
   * direction=1 向下、-1 向上；若目标侧没有可落点则插入空段落。
   */
  private exitCodeBlock(direction: 1 | -1): void {
    // 局部常量 pos：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const pos = this.getPos();
    if (pos === undefined) return;

    const { state } = this.view;
    // 局部常量 nodeEnd：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const nodeEnd = pos + this.node.nodeSize;

    if (direction === 1) {
      // 局部常量 isLastNode：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
      const isLastNode = nodeEnd >= state.doc.content.size;
      if (isLastNode) {
        // 局部常量 paragraph：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
        const paragraph = state.schema.nodes.paragraph.create();
        // 局部常量 tr：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
        const tr = state.tr.insert(nodeEnd, paragraph);
        tr.setSelection(TextSelection.create(tr.doc, nodeEnd + 1));
        this.view.dispatch(tr);
        this.view.focus();
        return;
      }
      // 局部常量 selection：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
      const selection = Selection.near(state.doc.resolve(nodeEnd), 1);
      this.view.dispatch(state.tr.setSelection(selection));
      this.view.focus();
    } else {
      // 局部常量 selection：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
      const selection = Selection.near(state.doc.resolve(pos), -1);
      // 前方无可用位置则在代码块前插入段落
      if (selection.from >= pos) {
        // 局部常量 paragraph：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
        const paragraph = state.schema.nodes.paragraph.create();
        // 局部常量 tr：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
        const tr = state.tr.insert(pos, paragraph);
        tr.setSelection(TextSelection.create(tr.doc, pos + 1));
        this.view.dispatch(tr);
        this.view.focus();
        return;
      }
      this.view.dispatch(state.tr.setSelection(selection));
      this.view.focus();
    }
  }

  /**
   * 在列表中跳出代码块并创建新列表项（移植自 PureMark exitCodeBlockAndCreateListItem）。
   */
  private exitCodeBlockAndCreateListItem(): void {
    // 局部常量 pos：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const pos = this.getPos();
    if (pos === undefined) return;

    const { state } = this.view;
    const $pos = state.doc.resolve(pos);

    let listItemDepth = -1;
    for (let d = $pos.depth; d > 0; d--) {
      // 局部常量 ancestor：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
      const ancestor = $pos.node(d);
      if (ancestor.type.name === 'list_item' || ancestor.type.name === 'task_item') {
        listItemDepth = d;
        break;
      }
    }
    if (listItemDepth === -1) {
      this.exitCodeBlock(1);
      return;
    }

    // 局部常量 listItemAfter：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const listItemAfter = $pos.after(listItemDepth);
    // 局部常量 newListItem：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const newListItem = state.schema.nodes.list_item.create(null, state.schema.nodes.paragraph.create());

    // 局部常量 tr：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const tr = state.tr;
    tr.insert(listItemAfter, newListItem);
    tr.setSelection(TextSelection.create(tr.doc, listItemAfter + 2));
    this.view.dispatch(tr);
    this.view.focus();
  }

  /**
   * 删除整个代码块（移植自 PureMark deleteCodeBlock）。
   */
  private deleteCodeBlock(): void {
    // 局部常量 pos：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const pos = this.getPos();
    if (pos === undefined) return;

    const { state } = this.view;
    // 局部常量 nodeEnd：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const nodeEnd = pos + this.node.nodeSize;
    // 局部常量 tr：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const tr = state.tr.delete(pos, nodeEnd);

    if (tr.doc.content.size === 0) {
      // 局部常量 paragraph：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
      const paragraph = state.schema.nodes.paragraph.create();
      tr.insert(0, paragraph);
      tr.setSelection(TextSelection.create(tr.doc, 1));
    } else {
      const $pos = tr.doc.resolve(Math.min(pos, tr.doc.content.size));
      tr.setSelection(Selection.near($pos, -1));
    }

    this.view.dispatch(tr);
    this.view.focus();
  }

  /**
   * ProseMirror 节点更新（移植自 PureMark update）。
   * 文档变更同步进 CM（updating 标记防回环），语言变更触发重新加载语言扩展。
   */
  update(node: ProseMirrorNode): boolean {
    if (node.type !== this.node.type) return false;

    const prevLanguage: string = this.node.attrs.language ?? '';
    this.node = node;
    // 局部常量 newText：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const newText = node.textContent;

    if (this.cm && newText !== this.cm.state.doc.toString()) {
      this.updating = true;
      this.cm.dispatch({
        changes: { from: 0, to: this.cm.state.doc.length, insert: newText }
      });
      this.updating = false;
    } else if (!this.cm) {
      this.renderReadonlyCode();
    }

    const language: string = node.attrs.language ?? '';
    if (language !== prevLanguage) {
      this.langLabelElement.textContent = languageLabel(language);
      if (this.cm) void this.loadLanguage(language);
    }

    return true;
  }

  /**
   * ProseMirror→CodeMirror 选区同步（移植自 PureMark setSelection）。
   * PM 在选区进入本节点时调用，anchor/head 为相对 CM 文档的偏移。
   */
  setSelection(anchor: number, head: number): void {
    if (!this.cm) return;
    this.cm.focus();
    this.updating = true;
    this.cm.dispatch({ selection: { anchor, head } });
    this.updating = false;
  }

  /** 节点被选中时把焦点交给 CM（移植自 PureMark selectNode）。 */
  selectNode(): void {
    this.cm?.focus();
  }

  /**
   * 阻止事件冒泡给 PM（移植自 PureMark stopEvent）。
   * 头部区域（语言标签 / 复制按钮）的事件放行，其余（CM 内编辑）由 CM 自行处理。
   * 返回 true 让 PM 忽略该事件，从而把编辑控制权完全交给内嵌 CM——
   * 这也是保证 IME（compositionstart/end）在 CM 内正常工作的关键。
   */
  stopEvent(event: Event): boolean {
    if (event.target instanceof HTMLElement) {
      // 局部常量 isInHeader：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
      const isInHeader = event.target.closest('.steno-code-block-header');
      if (isInHeader) return false;
    }
    return true;
  }

  /** 忽略 CM 自身对 DOM 的 mutation，避免 PM 误判（移植自 PureMark ignoreMutation）。 */
  ignoreMutation(): boolean {
    return true;
  }

  /** 销毁内嵌 CM（移植自 PureMark destroy）。 */
  destroy(): void {
    this.cm?.destroy();
  }
}

/**
 * 创建代码块 NodeView 工厂函数。
 * 签名与同目录 image / mermaid-block 等保持一致。
 */
export function createCodeBlockNodeView(
  node: ProseMirrorNode,
  view: ProseMirrorView,
  getPos: () => number | undefined
): NodeView {
  return new CodeBlockView(node, view, getPos);
}
