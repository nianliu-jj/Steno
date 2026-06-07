## ADDED Requirements

### Requirement: 笔记列表右键菜单 MUST 提供"进入 Zen 模式"项

笔记列表卡片的右键上下文菜单中，原"编辑"项 SHALL 替换为"进入 Zen 模式"。点击该项 SHALL 打开 Zen 模式页面并回显当前笔记内容，退出 Zen 后返回笔记列表。

#### Scenario: 右键进入 Zen 模式

- **WHEN** 用户在某正式笔记卡片上右键并选择"进入 Zen 模式"
- **THEN** 应用导航到 Zen 模式页面，并在编辑区回显该笔记内容

#### Scenario: 退出 Zen 返回列表

- **WHEN** 用户在通过右键进入的 Zen 模式中按退出/Esc
- **THEN** 应用返回笔记列表页

### Requirement: 未保存徽章 MUST 使用红色底色

笔记卡片左上角的"未保存"标记 SHALL 使用红色底色（搭配可读的浅色文字），以更醒目地提醒用户该笔记尚未保存。

#### Scenario: 草稿卡片显示红色徽章

- **WHEN** 笔记列表中存在 `isDraft` 为真的草稿卡片
- **THEN** 该卡片左上角"未保存"徽章以红色底色渲染，文字清晰可读
