## ADDED Requirements

### Requirement: 全局快捷键唤起浮窗
系统 SHALL 在用户按下已注册的全局快捷键时切换 `todo-panel` 浮窗的显示状态。快捷键默认为 `CommandOrControl+Shift+T`，并可在设置面板内重新绑定。当快捷键注册失败（被其它应用占用）时，系统 MUST 向用户给出可见的失败提示。

#### Scenario: 首次启动注册默认快捷键
- **WHEN** 应用首次启动且用户未自定义快捷键
- **THEN** 系统注册 `CommandOrControl+Shift+T` 为 `todo-panel` 的切换快捷键，并将其写入 settings

#### Scenario: 按下快捷键唤起浮窗
- **WHEN** `todo-panel` 当前处于隐藏状态，用户按下已注册的全局快捷键
- **THEN** 系统在 ≤200 毫秒内显示浮窗，并自动 focus 浮窗内的"添加新任务"输入框

#### Scenario: 再次按下快捷键隐藏浮窗
- **WHEN** `todo-panel` 当前可见且处于 focus，用户再次按下已注册的全局快捷键
- **THEN** 系统隐藏浮窗（仅 `hide()` 不 destroy）

#### Scenario: 快捷键被占用
- **WHEN** 系统在启动时调用 `register` 注册全局快捷键并返回失败（已被其它进程占用）
- **THEN** 系统在主窗口前台或托盘弹出通知，提示用户在设置中重新绑定，并保留浮窗本身可被托盘菜单 / 主窗口按钮唤起

### Requirement: 浮窗窗口属性
浮窗 `todo-panel` MUST 是一个独立的 Tauri `WebviewWindow`，具备透明背景、无系统装饰边框、置顶、不在任务栏显示、默认尺寸 320×480、用户可拖拽移动；窗口关闭按钮 MUST 仅触发隐藏而非销毁。

#### Scenario: 浮窗默认外观
- **WHEN** `todo-panel` 显示
- **THEN** 窗口 decorations=false、transparent=true、alwaysOnTop=true、skipTaskbar=true、宽 320 高 480

#### Scenario: 关闭按钮只隐藏不销毁
- **WHEN** 用户点击浮窗右上角的关闭（×）按钮
- **THEN** 系统调用 `window.hide()` 隐藏浮窗，进程内窗口实例仍存在，下次按快捷键唤起时无需重新加载前端

### Requirement: 今日任务列表
浮窗 MUST 仅展示"今天"维度的任务，包含未完成任务（`status != 'done'` 且 `due_date` 在今日或 `due_date IS NULL` 且 `created_at` 在今日）以及今日已完成任务（用于显示完成数）。

#### Scenario: 显示今日未完成任务
- **WHEN** 浮窗被唤起且数据库中存在符合"今日"判定的任务
- **THEN** 浮窗中部按 `created_at` 升序列出这些任务，每项展示左侧勾选框、文本（最多两行折行）、右侧悬浮显示的删除按钮

#### Scenario: 空态显示
- **WHEN** 今日没有任何未完成任务
- **THEN** 浮窗显示一个圆形 ✓ 图标 + "太棒了！" + "所有任务都已完成" 的空态卡片

#### Scenario: 计数实时更新
- **WHEN** 用户在浮窗或主窗口完成 / 删除 / 新增了任意符合今日条件的任务
- **THEN** 浮窗顶部 "今天 N" 计数在 ≤1 秒内更新为最新未完成任务数

### Requirement: 浮窗内快速添加
浮窗顶部 MUST 提供一个"添加新任务"输入框，用户按 `Enter` 即提交新任务；提交成功后输入框 MUST 自动清空并保持 focus，任务立即出现在列表顶部（其 `due_date` 为空，归入"今天"）。

#### Scenario: 按 Enter 添加任务
- **WHEN** 用户在输入框输入文本"写周报"并按下 `Enter`
- **THEN** 系统创建一条 `status='todo'`、`content='写周报'`、`due_date=NULL`、`created_at=now` 的任务，输入框清空，新任务出现在列表，"今天 N" 计数 +1

#### Scenario: 输入为空时按 Enter 不提交
- **WHEN** 输入框内文本去除首尾空白后为空字符串，用户按下 `Enter`
- **THEN** 系统不创建任务、不报错、保留焦点

#### Scenario: 超长文本截断
- **WHEN** 用户输入超过 500 字符的文本并按下 `Enter`
- **THEN** 系统拒绝提交并在输入框下方显示"任务文本最多 500 字符"的红色提示

### Requirement: 浮窗内勾选与删除
浮窗 MUST 支持仅两种快速操作：勾选切换完成状态、删除任务；其它高级操作（修改文本、改截止日期、暂停等）引导用户回主窗口处理。

#### Scenario: 勾选未完成任务
- **WHEN** 用户点击一个 `status='todo'` 任务左侧的勾选框
- **THEN** 系统将该任务 `status` 置为 `done`、`completed_at=now`，该项立即从"未完成区域"消失，"今天 N" 计数 -1

#### Scenario: 取消勾选已完成任务
- **WHEN** 用户点击一个 `status='done'` 任务的勾选框
- **THEN** 系统将该任务 `status` 置为 `todo`、`completed_at=NULL`，该项重新出现在未完成列表中，计数 +1

#### Scenario: 删除任务
- **WHEN** 用户将光标悬停在某任务上、点击出现的删除按钮
- **THEN** 系统将该任务 `is_deleted=1`，浮窗中立即移除该项，无确认对话框；该任务在主窗口"已删除"分类中可见（本期 UI 暂不暴露）

### Requirement: 浮窗位置与显示行为
浮窗 MUST 根据用户设置在指定位置弹出；用户可自由拖拽浮窗，`position` 设置为 `'last'` 时下次唤起在用户上次拖拽到的位置。

#### Scenario: 默认右下角
- **WHEN** 用户设置 `todoQuickPanelPosition='bottom-right'`，用户按下快捷键
- **THEN** 浮窗显示在当前主显示器工作区右下角，距右边距 16px、下边距 48px（避开任务栏）

#### Scenario: 跟随光标
- **WHEN** 用户设置 `todoQuickPanelPosition='cursor'`，用户按下快捷键
- **THEN** 浮窗左上角显示在当前鼠标光标位置；如位置使窗口超出屏幕，系统自动调整使其完全可见

#### Scenario: 记住上次位置
- **WHEN** 用户设置 `todoQuickPanelPosition='last'`，用户上次拖拽到坐标 (X, Y)
- **THEN** 下次唤起浮窗时显示在 (X, Y)
