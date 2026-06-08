/**
 * @file Tauri IPC 命令调用封装层
 *
 * 设计原则：把每个 `invoke` 调用包成 typed function，前端不再到处写
 * 魔法字符串。这里只做"参数 → command 名 → 类型化返回值"的薄薄一层，
 * **不持有任何业务状态**。状态留给 Pinia stores。
 *
 * 命令命名与 `src-tauri/src/lib.rs` 的 `invoke_handler!` 列表一一对应。
 */

import { invoke } from '@tauri-apps/api/core';

import type {
  CanvasPosition,
  ClipboardEntry,
  ConvertTextToDocumentRequest,
  CreateTodoRequest,
  CreateWorkspaceRequest,
  EditorEntry,
  LibraryEntry,
  MainListContext,
  Note,
  PinnedWindowConfig,
  SaveDocumentEntryRequest,
  SaveNoteRequest,
  SaveTextEntryRequest,
  SearchNotesRequest,
  Todo,
  TodoActivityPoint,
  TodoDailyTrendRequest,
  TodoStatsRange,
  TodoTrendPoint,
  UpdateTodoRequest,
  Workspace
} from '@/types/steno';

/**
 * 创建数据库访问对象 — 所有 Tauri IPC 调用的聚合。
 *
 * 返回一个包含全部 note/setting/export/path 操作的对象。
 * 每个方法都是 `invoke<T>(command, args)` 的薄封装，只负责类型推导和参数传递。
 *
 * @returns 数据库操作方法的集合
 *
 * @example
 * ```ts
 * const db = useDb();
 * const note = await db.getNote('some-uuid');
 * await db.setSetting('themeMode', 'dark');
 * ```
 */
export function useDb() {
  // ----- notes ---------------------------------------------------------

  /**
   * 保存/新建笔记。
   *
   * @param input - 保存请求体；`id` 存在则更新，否则新建
   * @returns 保存后的笔记；返回 `null` 表示后端识别为"空内容草稿"主动跳过写库
   */
  function saveNote(input: SaveNoteRequest) {
    return invoke<Note | null>('save_note', { input });
  }

  // 函数 savePastedImage：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
  function savePastedImage(dataUrl: string) {
    return invoke<{
      markdownUrl: string;
      relativePath: string;
      absolutePath: string;
    }>('save_pasted_image', { input: { dataUrl } });
  }

  /**
   * 按 ID 获取单条笔记。
   *
   * @param id - 笔记 UUID
   * @returns 笔记对象；不存在返回 `null`
   */
  function getNote(id: string) {
    return invoke<Note | null>('get_note', { id });
  }

  /**
   * 获取最近笔记列表（按 `updated_at` 降序，草稿优先）。
   *
   * @param limit - 返回条数上限，默认 200
   */
  function listNotes(limit = 200) {
    return invoke<Note[]>('list_notes', { limit });
  }

  /**
   * 全文搜索笔记。
   *
   * @param input - 搜索条件（关键词 + 标签交集 + 置顶限定 + 数量上限）
   */
  function searchNotes(input: SearchNotesRequest) {
    return invoke<Note[]>('search_notes', { input });
  }

  /**
   * 删除笔记（硬删除，不可恢复）。
   *
   * @param id - 笔记 UUID
   */
  function deleteNote(id: string) {
    return invoke<void>('delete_note', { id });
  }

  /**
   * 设置笔记置顶状态。
   *
   * @param id - 笔记 UUID
   * @param isPinned - `true` 置顶，`false` 取消置顶
   * @returns 更新后的笔记
   */
  function setNotePinned(id: string, isPinned: boolean) {
    return invoke<Note>('set_note_pinned', { id, isPinned });
  }

  /** 获取所有置顶笔记列表（`is_pinned=1 AND is_draft=0`）。 */
  function listPinnedNotes() {
    return invoke<Note[]>('list_pinned_notes');
  }

  /**
   * 把指定的"未保存草稿"原子地提升为一条正式笔记。
   *
   * 后端操作：分配新 UUID → 清掉 `is_draft` 标记 → 删掉原草稿行。
   *
   * @param id - 草稿笔记 UUID
   * @returns 新笔记对象；若 id 不存在或不是草稿则返回 `null`
   */
  function promoteDraft(id: string) {
    return invoke<Note | null>('promote_draft', { id });
  }

  /**
   * 获取最新一份未保存草稿（按 `updated_at` 降序取首条）。
   *
   * @returns 最新草稿；无草稿返回 `null`
   */
  function getLatestDraft() {
    return invoke<Note | null>('get_latest_draft');
  }

  /**
   * 仅更新 `pinned_window_config` 列（StickyNote 调整透明度/颜色/字号时使用）。
   *
   * 比 `saveNote` 轻很多 — 只写一列，不走整行 INSERT OR REPLACE，
   * 适合拖滑块等高频调用场景。
   *
   * @param id - 笔记 UUID
   * @param config - 窗口配置
   */
  function updatePinnedWindowConfig(id: string, config: PinnedWindowConfig) {
    return invoke<Note>('update_pinned_window_config', { id, config });
  }

  /**
   * 仅更新 `canvas_position` 列（Canvas 拖卡片释放后使用）。
   *
   * @param id - 笔记 UUID
   * @param position - 世界坐标位置
   */
  function updateCanvasPosition(id: string, position: CanvasPosition) {
    return invoke<Note>('update_canvas_position', { id, position });
  }

  // ----- workspaces & library entries ---------------------------------

  /**
   * 保存/新建 Text 类型条目（Inbox 速记）。
   *
   * `id` 缺省 → 新建；存在 → 更新。
   */
  function saveTextEntry(input: SaveTextEntryRequest) {
    return invoke<LibraryEntry>('save_text_entry', { input });
  }

  /**
   * 保存/新建 Document 类型条目（工作区中的 .md 文件）。
   *
   * 必填 `workspaceId`；`folderEntryId` 为空时落到工作区根目录。
   */
  function saveDocumentEntry(input: SaveDocumentEntryRequest) {
    return invoke<LibraryEntry>('save_document_entry', { input });
  }

  /**
   * 将 Text 条目"晋升"为工作区 Document（写入磁盘文件）。
   */
  function convertTextToDocument(input: ConvertTextToDocumentRequest) {
    return invoke<LibraryEntry>('convert_text_to_document', { input });
  }

  /**
   * 加载编辑器视图所需的条目（含正文）。
   *
   * @returns 编辑器条目；不存在返回 `null`
   */
  function getEditorEntry(id: string) {
    return invoke<EditorEntry | null>('get_editor_entry', { id });
  }

  /**
   * 列出主列表条目（按 `MainListContext` 筛选）。
   *
   * 上下文三个 id 字段互斥：同时只允许其中一个非空（或全空表示全局 Inbox）。
   */
  function listLibraryEntries(context: MainListContext) {
    return invoke<LibraryEntry[]>('list_library_entries', { context });
  }

  /**
   * 列出指定工作区的层级树（按 `parentId` 嵌套，前端自行组装）。
   */
  function listWorkspaceTree(workspaceId: string) {
    return invoke<LibraryEntry[]>('list_workspace_tree', { workspaceId });
  }

  /**
   * 列出所有工作区元数据。
   */
  function listWorkspaces() {
    return invoke<Workspace[]>('list_workspaces');
  }

  /**
   * 创建新工作区。`name` 为空时后端从 `rootPath` 末段派生。
   */
  function createWorkspace(input: CreateWorkspaceRequest) {
    return invoke<Workspace>('create_workspace', { input });
  }

  // ----- clipboard -----------------------------------------------------

  function listClipboardEntries(args?: { limit?: number; contentType?: string | null; query?: string | null }) {
    return invoke<ClipboardEntry[]>('list_clipboard_entries', {
      limit: args?.limit ?? 200,
      contentType: args?.contentType ?? null,
      query: args?.query ?? null
    });
  }

  // 函数 deleteClipboardEntry：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
  function deleteClipboardEntry(id: string) {
    return invoke<void>('delete_clipboard_entry', { id });
  }

  // 函数 clearClipboardEntries：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
  function clearClipboardEntries() {
    return invoke<void>('clear_clipboard_entries');
  }

  // 函数 copyClipboardEntry：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
  function copyClipboardEntry(id: string) {
    return invoke<void>('copy_clipboard_entry', { id });
  }

  // 函数 pasteClipboardEntry：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
  function pasteClipboardEntry(id: string) {
    return invoke<void>('paste_clipboard_entry', { id });
  }

  // 函数 updateClipboardEntry：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
  function updateClipboardEntry(args: { id: string; content: string; htmlContent?: string | null }) {
    return invoke<ClipboardEntry>('update_clipboard_entry', {
      id: args.id,
      content: args.content,
      htmlContent: args.htmlContent ?? null
    });
  }

  // 函数 addImageClipboardEntry：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
  function addImageClipboardEntry(dataUrl: string) {
    return invoke<ClipboardEntry>('add_image_clipboard_entry', { dataUrl });
  }

  // 函数 copyEditedImageToClipboard：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
  function copyEditedImageToClipboard(dataUrl: string) {
    return invoke<void>('copy_edited_image_to_clipboard', { dataUrl });
  }

  // 函数 pinClipboardEntry：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
  function pinClipboardEntry(id: string) {
    return invoke<ClipboardEntry>('pin_clipboard_entry', { id });
  }

  // 函数 unpinClipboardEntry：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
  function unpinClipboardEntry(id: string) {
    return invoke<ClipboardEntry>('unpin_clipboard_entry', { id });
  }

  // 函数 countClipboardEntries：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
  function countClipboardEntries(args?: { contentType?: string | null; query?: string | null }) {
    return invoke<number>('count_clipboard_entries', {
      contentType: args?.contentType ?? null,
      query: args?.query ?? null
    });
  }

  // ----- todos ---------------------------------------------------------

  /** 列出全部未删除待办（按状态 + 截止日 + 创建时间排序）。 */
  function listTodos() {
    return invoke<Todo[]>('list_todos');
  }

  /**
   * 取"今日"维度的待办。
   *
   * @param includeCompleted - 是否包含当日已完成；默认 `false`
   */
  function getTodayTodos(includeCompleted = false) {
    return invoke<Todo[]>('get_today_todos', {
      input: { includeCompleted }
    });
  }

  /** 新增待办；后端会校验 content 长度（1..=500）。 */
  function createTodo(input: CreateTodoRequest) {
    return invoke<Todo>('create_todo', { input });
  }

  /** 部分字段更新待办；状态转换 done ⇄ 非 done 会自动维护 completedAt。 */
  function updateTodo(input: UpdateTodoRequest) {
    return invoke<Todo>('update_todo', { input });
  }

  /** 标记为已完成 — 等价于 `updateTodo({ id, status: 'done' })` 的快捷路径。 */
  function completeTodo(id: string) {
    return invoke<Todo>('complete_todo', { id });
  }

  /** 逻辑删除（is_deleted=1），列表查询会自动跳过。 */
  function deleteTodo(id: string) {
    return invoke<void>('delete_todo', { id });
  }

  /** 查询最近一段时间的每日完成活跃度。 */
  function getTodoActivity(input: TodoStatsRange) {
    return invoke<TodoActivityPoint[]>('get_todo_activity', { input });
  }

  /** 查询每日创建 / 开始 / 完成趋势。 */
  function getTodoDailyTrend(input: TodoDailyTrendRequest) {
    return invoke<TodoTrendPoint[]>('get_todo_daily_trend', { input });
  }

  /** 永久删除已完成和已删除任务，返回删除条数。 */
  function resetTodoStats() {
    return invoke<number>('reset_todo_stats');
  }

  // ----- 待办浮窗窗口控制 ----------------------------------------------

  /**
   * 显示待办浮窗。
   *
   * @param position - 可选位置策略；缺省时从 settings 读 `todoQuickPanelPosition`
   */
  function showTodoPanel(position?: 'bottom-right' | 'cursor' | 'last') {
    return invoke<void>('show_todo_panel', { position: position ?? null });
  }

  // 函数 hideTodoPanel：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
  function hideTodoPanel() {
    return invoke<void>('hide_todo_panel');
  }

  // 函数 toggleTodoPanel：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
  function toggleTodoPanel() {
    return invoke<void>('toggle_todo_panel');
  }

  // ----- settings ------------------------------------------------------

  /**
   * 读取一项设置值。
   *
   * @param key - 设置键名（如 `"themeMode"`、`"floatingWidth"`）
   * @returns 存储的字符串值；未设置返回 `null`
   */
  function getSetting(key: string) {
    return invoke<string | null>('get_setting', { key });
  }

  /**
   * 写入一项设置值（UPSERT 语义 — 存在则更新，不存在则插入）。
   *
   * @param key - 设置键名
   * @param value - 字符串值（所有设置在后端都以 TEXT 存储）
   */
  function setSetting(key: string, value: string) {
    return invoke<void>('set_setting', { key, value });
  }

  // 函数 setLaunchAtStartup：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
  function setLaunchAtStartup(enabled: boolean) {
    return invoke<void>('set_launch_at_startup', { enabled });
  }

  // 函数 isLaunchAtStartupEnabled：封装可复用流程，集中处理输入校验、状态转换或外部模块调用。
  function isLaunchAtStartupEnabled() {
    return invoke<boolean>('is_launch_at_startup_enabled');
  }

  // ----- 全局快捷键 ----------------------------------------------------

  /**
   * 通知 Rust 端重新注册全局快捷键。
   *
   * SettingsView 改完 `mainWindowShortcut` / `quicknoteShortcut` 后调用。
   * 后端会 `unregister_all` + 用新值 `register`。
   */
  function reloadShortcuts() {
    return invoke<void>('reload_shortcuts');
  }

  // ----- 导出 ----------------------------------------------------------

  /**
   * 导出笔记为 Markdown 文件到 `<data_dir>/exports/<title>-<short_id>.md`。
   *
   * @param id - 笔记 UUID
   * @returns 写入的完整文件路径
   * @throws 笔记不存在或 IO 错误时 invoke 抛错
   */
  function exportNoteMarkdown(id: string) {
    return invoke<string>('export_note_markdown', { id });
  }

  /**
   * 导出笔记为 HTML 文件到 `<data_dir>/exports/<title>-<short_id>.html`。
   *
   * @param id - 笔记 UUID
   * @returns 写入的完整文件路径
   * @throws 笔记不存在或 IO 错误时 invoke 抛错
   */
  function exportNoteHtml(id: string) {
    return invoke<string>('export_note_html', { id });
  }

  /**
   * 导出笔记为 PDF 文件。
   *
   * **MVP 状态**：当前没有跨平台 PDF 适配器，总是返回失败。
   * 返回的错误字符串用于前端展示"PDF 不可用"提示。
   *
   * @param id - 笔记 UUID
   * @throws 总是抛出错误（PDF 导出未实现）
   */
  function exportNotePdf(id: string) {
    return invoke<string>('export_note_pdf', { id });
  }

  // ----- 存储路径（SettingsView 展示） ---------------------------------

  /**
   * 获取数据存储路径信息。
   *
   * @returns 包含 `dataDir`（数据目录）、`dbPath`（SQLite 文件路径）、
   *          `backupDir`（备份目录）的对象
   */
  function getDataPaths() {
    return invoke<{ dataDir: string; dbPath: string; backupDir: string }>('get_data_paths');
  }

  return {
    saveNote,
    savePastedImage,
    saveTextEntry,
    getNote,
    getEditorEntry,
    listNotes,
    searchNotes,
    listLibraryEntries,
    listWorkspaceTree,
    listWorkspaces,
    createWorkspace,
    saveDocumentEntry,
    convertTextToDocument,
    deleteNote,
    setNotePinned,
    listPinnedNotes,
    promoteDraft,
    getLatestDraft,
    updatePinnedWindowConfig,
    updateCanvasPosition,
    listClipboardEntries,
    deleteClipboardEntry,
    clearClipboardEntries,
    copyClipboardEntry,
    pasteClipboardEntry,
    updateClipboardEntry,
    addImageClipboardEntry,
    copyEditedImageToClipboard,
    pinClipboardEntry,
    unpinClipboardEntry,
    countClipboardEntries,
    listTodos,
    getTodayTodos,
    createTodo,
    updateTodo,
    completeTodo,
    deleteTodo,
    getTodoActivity,
    getTodoDailyTrend,
    resetTodoStats,
    showTodoPanel,
    hideTodoPanel,
    toggleTodoPanel,
    getSetting,
    setSetting,
    setLaunchAtStartup,
    isLaunchAtStartupEnabled,
    reloadShortcuts,
    exportNoteMarkdown,
    exportNoteHtml,
    exportNotePdf,
    getDataPaths
  };
}
