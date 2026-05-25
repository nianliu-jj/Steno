## ADDED Requirements

### Requirement: Markdown 编辑器支持所见即所得实时渲染
Steno SHALL 在主窗口编辑页与速记浮窗使用同一个 Markdown 编辑器组件，并 SHALL 在用户键入 Markdown 语法时在原位渲染最终样式，而不再要求用户切换到只读视图查看效果。

#### Scenario: 原位渲染常用语法
- **WHEN** 用户在编辑器中输入 `# 一级标题` 并按下空格
- **THEN** 系统 SHALL 在原位将该行渲染为一级标题的视觉样式
- **AND** 系统 MUST 保留这段内容在内部表示为 Markdown 源文本

#### Scenario: 光标移入语法标记区
- **WHEN** 用户的光标移入已渲染的语法标记区（例如已渲染的粗体文本）
- **THEN** 系统 SHALL 在该区域显示其原始 Markdown 符号（如 `**`），便于用户继续编辑
- **AND** 系统 SHALL 在光标移出后将符号重新隐藏，仅保留样式

### Requirement: 编辑器提供常用键盘快捷键
Steno SHALL 为编辑器提供至少覆盖标题、强调、列表、链接、撤销/重做的快捷键，并 SHALL 在 macOS 与 Windows / Linux 上分别响应 `Cmd` 与 `Ctrl` 修饰键（统称 `Mod`）。

#### Scenario: 通过快捷键设置标题级别
- **WHEN** 用户在编辑器中将光标定位到一个段落，并按下 `Mod+3`
- **THEN** 系统 SHALL 将该段落转换为 H3 标题，并立即在原位渲染为 H3 样式

#### Scenario: 通过快捷键应用强调样式
- **WHEN** 用户选中一段文本并按下 `Mod+B`
- **THEN** 系统 SHALL 将该段文本标记为粗体并在原位渲染加粗样式
- **AND** 系统 MUST 在内部把该段文本表示为 `**...**` 形式的 Markdown 源

#### Scenario: 撤销与重做
- **WHEN** 用户依次按下 `Mod+Z` / `Mod+Shift+Z`
- **THEN** 系统 SHALL 分别撤销与重做最近一次编辑操作
- **AND** 系统 MUST 保证撤销栈跨越同一编辑会话内的所有变更（含快捷键产生的命令）

### Requirement: 编辑器对外接口与现有自动保存契约保持兼容
Steno SHALL 维持 `MarkdownEditor` 现有对外接口契约，包括 `v-model` 输入输出 Markdown 字符串、`focus()`、`scrollToLine(line: number)`，以保证 `useAutosave`、跨窗口 `steno:note-saved` 事件、`scrollToLine` 与大纲跳转链路不受影响。

#### Scenario: v-model 双向绑定保持为 Markdown 字符串
- **WHEN** 父组件向编辑器写入字符串 `"# 标题\n正文"`
- **THEN** 系统 SHALL 在编辑器中渲染对应内容
- **AND** 用户后续修改后，编辑器 MUST 通过 `update:value` 事件回传更新后的 Markdown 字符串而非内部 AST 或 HTML

#### Scenario: scrollToLine 跳转
- **WHEN** 父组件（例如大纲面板）调用 `editorRef.scrollToLine(12)`
- **THEN** 系统 SHALL 滚动编辑器视图，使第 12 行对应的标题或段落出现在视图中
- **AND** 系统 MUST 优先把目标行滚动到接近视图顶部的位置（不强制要求精确到像素）

### Requirement: 速记浮窗内嵌同一 WYSIWYG 编辑器
Steno SHALL 在速记浮窗 `FloatingEditor` 中复用同一个 `MarkdownEditor` 组件，并在视觉上提供更紧凑的密度，但 SHALL NOT 改变浮窗现有的自动保存、失焦关闭、置顶为便签的业务逻辑。

#### Scenario: 浮窗输入即时渲染
- **WHEN** 用户在浮窗中输入 `- 列表项`
- **THEN** 系统 SHALL 在原位将该行渲染为无序列表项
- **AND** 失焦关闭、置顶为便签、保存按钮等浮窗交互 MUST 保持现有行为
