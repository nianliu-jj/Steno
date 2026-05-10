## ADDED Requirements

### Requirement: 全局搜索
Steno SHALL 提供全局搜索窗口，用于快速查找历史笔记。

#### Scenario: 打开搜索
- **WHEN** 用户按下搜索快捷键或从托盘菜单选择“搜索”
- **THEN** 系统 SHALL 打开搜索窗口
- **AND** 搜索输入框 MUST 自动获得焦点

#### Scenario: 搜索笔记
- **WHEN** 用户输入关键词
- **THEN** 系统 SHALL 返回标题、正文或标签匹配的笔记
- **AND** 用户 SHALL 能从结果中打开编辑、钉住或进入 Zen 模式

### Requirement: 设置管理
Steno SHALL 提供设置界面管理快捷键、浮窗、主题、编辑器和备份偏好。

#### Scenario: 修改浮窗设置
- **WHEN** 用户修改默认浮窗尺寸、失焦关闭延迟或编辑器模式
- **THEN** 系统 SHALL 保存设置
- **AND** 下一次打开速记浮窗时 MUST 使用新设置

#### Scenario: 查看数据目录
- **WHEN** 用户打开设置中的存储区域
- **THEN** 系统 SHALL 显示当前 SQLite 数据库和备份目录路径

### Requirement: 主题跟随
Steno SHALL 支持 Light、Dark 和 System 主题模式。

#### Scenario: 跟随系统主题
- **WHEN** 用户选择 System 主题模式
- **THEN** 系统 SHALL 跟随操作系统浅色或深色模式
- **AND** 系统 SHALL 在所有窗口中应用一致主题

#### Scenario: 切换主题立即生效
- **WHEN** 用户选择 Light 或 Dark 主题
- **THEN** 系统 SHALL 立即更新当前窗口主题
- **AND** 系统 SHALL 保存该偏好

### Requirement: Markdown 与 PDF 导出
Steno SHALL 支持将笔记导出为 Markdown，并提供 PDF 导出入口。

#### Scenario: 导出 Markdown
- **WHEN** 用户导出一条笔记为 Markdown
- **THEN** 系统 SHALL 创建 `.md` 文件
- **AND** 文件 MUST 包含标题、正文、标签、创建时间和更新时间

#### Scenario: 导出 PDF
- **WHEN** 用户导出一条笔记为 PDF
- **THEN** 系统 SHALL 尝试创建 `.pdf` 文件
- **AND** 如果当前平台适配器不可用，系统 SHALL 显示明确失败原因

#### Scenario: 导出失败不影响原数据
- **WHEN** 导出过程中发生文件系统或适配器错误
- **THEN** 系统 MUST 保留原始笔记数据不变
- **AND** 系统 SHALL 向用户显示可理解的错误信息
