## ADDED Requirements

### Requirement: 置顶便签窗口
Steno SHALL 允许任意笔记成为独立置顶便签窗口。

#### Scenario: 钉住笔记
- **WHEN** 用户从速记浮窗、画布或搜索结果中钉住一条笔记
- **THEN** 系统 SHALL 将该笔记 `is_pinned` 设为 true
- **AND** 系统 SHALL 打开始终置顶的便签窗口

#### Scenario: 取消钉住
- **WHEN** 用户在便签窗口中取消置顶
- **THEN** 系统 SHALL 将该笔记 `is_pinned` 设为 false
- **AND** 系统 SHALL 关闭对应便签窗口

### Requirement: 便签编辑模式
Steno SHALL 支持置顶便签的阅读模式和编辑模式。

#### Scenario: 双击进入编辑
- **WHEN** 用户双击便签内容区域
- **THEN** 系统 SHALL 进入编辑模式
- **AND** 编辑器 SHALL 自动获得焦点

#### Scenario: 再次双击保存退出编辑
- **WHEN** 用户在编辑模式下再次双击便签背景或触发完成编辑
- **THEN** 系统 SHALL 保存便签内容
- **AND** 系统 SHALL 返回阅读模式

### Requirement: 便签实时同步
Steno SHALL 将置顶便签修改实时同步到数据库。

#### Scenario: 便签内容防抖保存
- **WHEN** 用户编辑便签内容并停止输入至少 1 秒
- **THEN** 系统 SHALL 更新对应 `notes` 记录
- **AND** 其他视图下次加载该笔记时 MUST 显示最新内容

### Requirement: 便签样式与窗口状态
Steno SHALL 保存每个置顶便签的位置、尺寸、透明度、主题颜色和字体大小。

#### Scenario: 调整透明度
- **WHEN** 用户修改便签透明度
- **THEN** 系统 SHALL 立即应用窗口透明度
- **AND** 系统 SHALL 将配置保存到 `pinned_window_config`

#### Scenario: 重启恢复便签
- **WHEN** Steno 重启并加载已置顶笔记
- **THEN** 系统 SHALL 按保存的位置、尺寸、透明度、颜色和字体大小恢复便签窗口
