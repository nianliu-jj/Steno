## ADDED Requirements

### Requirement: 速记浮窗显示
Steno SHALL 在全局快捷键或托盘菜单触发时显示轻量速记浮窗。

#### Scenario: 默认尺寸和位置
- **WHEN** 用户打开速记浮窗
- **THEN** 系统 SHALL 创建默认 `400x300` 的置顶窗口
- **AND** 系统 SHALL 优先显示在当前鼠标所在屏幕的鼠标附近
- **AND** 当鼠标位置不可用时系统 SHALL 显示在当前屏幕中央

#### Scenario: 浮窗标题栏控制
- **WHEN** 速记浮窗显示
- **THEN** 系统 SHALL 提供可拖拽标题栏、关闭按钮和置顶按钮

### Requirement: Markdown 编辑
Steno SHALL 在速记浮窗中提供轻量 Markdown 编辑能力。

#### Scenario: Markdown 快捷语法
- **WHEN** 用户输入 Markdown 语法
- **THEN** 系统 SHALL 保留 Markdown 源码
- **AND** 系统 SHALL 支持粗体、斜体、列表和代码块的预览或基础渲染

#### Scenario: 底部状态
- **WHEN** 用户在浮窗中输入内容
- **THEN** 系统 SHALL 显示字数、最近保存时间和标签快捷输入

### Requirement: 自动保存
Steno SHALL 对速记浮窗内容执行防抖自动保存。

#### Scenario: 输入后防抖保存
- **WHEN** 用户停止输入至少 1 秒
- **THEN** 系统 SHALL 保存当前非空内容到 SQLite
- **AND** 系统 SHALL 更新保存状态

#### Scenario: 空内容丢弃
- **WHEN** 用户关闭浮窗且标题、正文和标签均为空
- **THEN** 系统 SHALL 丢弃该草稿
- **AND** 系统 MUST 不创建空笔记

### Requirement: 失焦保存并关闭
Steno SHALL 在速记浮窗失去焦点后自动保存并关闭。

#### Scenario: 失焦关闭
- **WHEN** 速记浮窗失去焦点且达到配置的关闭延迟
- **THEN** 系统 SHALL 保存非空内容
- **AND** 系统 SHALL 关闭或隐藏速记浮窗

#### Scenario: 保存失败保留窗口
- **WHEN** 失焦自动保存失败
- **THEN** 系统 MUST 保留速记浮窗
- **AND** 系统 SHALL 显示保存失败原因

### Requirement: 固定速记为便签
Steno SHALL 允许用户将当前速记固定为置顶便签。

#### Scenario: 点击置顶按钮
- **WHEN** 用户在速记浮窗中点击置顶按钮
- **THEN** 系统 SHALL 保存当前内容
- **AND** 系统 SHALL 将对应笔记标记为置顶
- **AND** 系统 SHALL 创建或聚焦该笔记的置顶便签窗口
