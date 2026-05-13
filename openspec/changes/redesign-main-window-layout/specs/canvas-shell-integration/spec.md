## ADDED Requirements

### Requirement: 画布接入主窗口工作台
Steno SHALL 将画布页面作为主窗口工作台中的一个内容页展示，而不是保留独立的页面级壳层。

#### Scenario: 从侧边栏进入画布
- **WHEN** 用户点击工作台侧边栏中的“画布”
- **THEN** 系统 SHALL 在主窗口内容区展示画布页面
- **AND** 主窗口标题区 MUST 更新为画布对应的页面信息

#### Scenario: 画布页面共享工作台壳层
- **WHEN** 画布页面被显示
- **THEN** 系统 SHALL 复用主窗口统一的标题栏和侧边导航
- **AND** 画布页面 MUST 不再额外渲染与工作台重复的顶层页头

### Requirement: 画布核心功能保持不变
Steno MUST 在布局改造后保留现有画布的卡片展示、拖拽、缩放、平移和过滤能力。

#### Scenario: 改版后继续拖拽卡片
- **WHEN** 用户在新布局中的画布页拖拽笔记卡片
- **THEN** 系统 SHALL 继续更新并持久化 `canvas_position`
- **AND** 卡片位置恢复行为 MUST 与改版前一致

#### Scenario: 改版后继续缩放和平移
- **WHEN** 用户在新布局中的画布页执行缩放或平移操作
- **THEN** 系统 SHALL 保持当前画布交互能力可用
- **AND** 工作台壳层 MUST 不遮挡或破坏画布交互区域

### Requirement: 画布内容区占满剩余空间
Steno SHALL 在工作台壳层内为画布保留完整的剩余内容区，避免双重滚动和裁切。

#### Scenario: 主窗口尺寸变化时重排画布
- **WHEN** 用户调整主窗口大小或折叠侧边栏
- **THEN** 系统 SHALL 让画布内容区跟随剩余可用空间重排
- **AND** 画布交互区域 MUST 始终填满内容区
