## ADDED Requirements

### Requirement: 设置入口弹出模态框
Steno SHALL 在主窗口点击“设置”入口时打开设置模态框，并保持主窗口内容作为背景上下文。

#### Scenario: 从主窗口打开设置
- **WHEN** 用户点击主窗口的“设置”入口
- **THEN** 系统 SHALL 在当前主窗口内显示设置模态框
- **AND** 系统 MUST 不因该点击切换到独立设置页面或创建新的设置窗口

#### Scenario: 关闭设置模态框
- **WHEN** 用户点击设置面板关闭按钮、确认按钮或模态框外部允许关闭区域
- **THEN** 系统 SHALL 隐藏设置模态框
- **AND** 主窗口 SHALL 保持打开设置前的内容状态

### Requirement: 设置分类信息架构
设置模态框 SHALL 使用分类标签组织设置项，分类至少包含常规、外观、快捷键、隐私安全、存储和关于。

#### Scenario: 切换设置分类
- **WHEN** 用户点击某个设置分类标签
- **THEN** 系统 SHALL 显示该分类对应的设置内容
- **AND** 系统 SHALL 保持设置模态框打开

#### Scenario: 设置内容过高
- **WHEN** 当前分类内容高度超过模态框内容区
- **THEN** 系统 SHALL 只滚动内容区
- **AND** 模态框头部分类标签与底部操作栏 MUST 保持可见

### Requirement: 现有设置自动保存
设置模态框 SHALL 保留现有主题、快捷键、速记浮窗、编辑器和备份偏好的真实保存行为。

#### Scenario: 修改主题模式
- **WHEN** 用户在外观分类中选择 Light、Dark 或 System 主题模式
- **THEN** 系统 SHALL 立即保存该主题偏好
- **AND** 当前窗口主题 SHALL 按既有主题逻辑更新

#### Scenario: 修改全局快捷键
- **WHEN** 用户修改主窗口快捷键或速记浮窗快捷键并提交输入
- **THEN** 系统 SHALL 保存新的快捷键字符串
- **AND** 系统 MUST 触发全局快捷键重新注册

#### Scenario: 修改速记浮窗设置
- **WHEN** 用户修改速记浮窗宽度、高度或失焦关闭延迟
- **THEN** 系统 SHALL 保存新的数值
- **AND** 下一次打开速记浮窗时 SHALL 使用新设置

#### Scenario: 修改编辑器与备份设置
- **WHEN** 用户修改编辑器模式或备份触发阈值
- **THEN** 系统 SHALL 保存对应偏好
- **AND** 系统 MUST 在保存失败时向用户显示可理解的错误信息

### Requirement: 存储路径展示
设置模态框 SHALL 显示当前数据目录、数据库文件和备份目录，并允许用户复制路径。

#### Scenario: 加载存储路径
- **WHEN** 用户打开设置模态框或切换到存储分类
- **THEN** 系统 SHALL 请求当前数据路径信息
- **AND** 系统 SHALL 显示数据目录、数据库文件和备份目录

#### Scenario: 复制存储路径
- **WHEN** 用户点击某条存储路径的复制按钮
- **THEN** 系统 SHALL 将该路径写入剪贴板
- **AND** 系统 SHALL 显示复制成功或失败反馈

#### Scenario: 路径渲染不触发代码高亮警告
- **WHEN** 设置模态框渲染存储路径
- **THEN** 系统 MUST 不调用需要 highlight.js 配置的 Naive UI 代码块渲染能力
- **AND** 控制台 MUST 不出现 `hljs is not set` 警告

### Requirement: 规划中设置项边界
设置模态框 SHALL 展示原型中的隐私安全、强调色、便签纸和应用排除名单等规划中设置项，但不得伪装成已持久化能力。

#### Scenario: 查看规划中设置项
- **WHEN** 用户查看尚未接入后端 schema 的设置项
- **THEN** 系统 SHALL 通过禁用态、只读态或说明文本标识该设置当前不可保存
- **AND** 系统 MUST 不向后端写入不存在的设置键

### Requirement: 关于信息展示
设置模态框 SHALL 提供关于分类，展示应用版本、技术栈、本地优先说明和项目链接入口。

#### Scenario: 查看关于信息
- **WHEN** 用户切换到关于分类
- **THEN** 系统 SHALL 显示 Steno 的版本、运行时、本地数据说明或项目链接信息
- **AND** 系统 SHALL 保持该分类为只读内容
