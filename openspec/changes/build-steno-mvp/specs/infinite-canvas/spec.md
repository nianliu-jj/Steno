## ADDED Requirements

### Requirement: 画布窗口
Steno SHALL 提供独立无限画布窗口，用于整理笔记卡片。

#### Scenario: 打开画布
- **WHEN** 用户从托盘菜单或应用界面选择“打开画布”
- **THEN** 系统 SHALL 打开画布窗口
- **AND** 系统 SHALL 加载已有笔记卡片

### Requirement: 卡片展示
Steno SHALL 在画布中以卡片形式展示笔记。

#### Scenario: 卡片内容
- **WHEN** 画布渲染一条笔记卡片
- **THEN** 卡片 SHALL 显示标题、内容预览、标签和置顶状态

#### Scenario: 双击编辑卡片
- **WHEN** 用户双击画布卡片
- **THEN** 系统 SHALL 打开该笔记的完整编辑浮窗或编辑视图

### Requirement: 拖拽排列
Steno SHALL 支持用户在画布上拖拽卡片并持久化位置。

#### Scenario: 移动画布卡片
- **WHEN** 用户拖拽卡片到新位置并释放
- **THEN** 系统 SHALL 更新该笔记的 `canvas_position`
- **AND** 系统 SHALL 在重启后恢复该位置

### Requirement: 缩放与平移
Steno SHALL 支持画布缩放和平移。

#### Scenario: 缩放画布
- **WHEN** 用户使用滚轮、触控板或控件缩放画布
- **THEN** 系统 SHALL 更新画布缩放比例
- **AND** 系统 SHALL 保持卡片相对位置正确

#### Scenario: 平移画布
- **WHEN** 用户拖动画布背景
- **THEN** 系统 SHALL 平移当前视图
- **AND** 系统 SHALL 保存最近的视图状态

### Requirement: 搜索过滤与视口渲染
Steno SHALL 支持画布内搜索、标签过滤和视口内渲染。

#### Scenario: 按关键词搜索
- **WHEN** 用户在画布搜索框输入关键词
- **THEN** 系统 SHALL 只突出或显示匹配标题、内容或标签的卡片

#### Scenario: 按标签过滤
- **WHEN** 用户选择一个或多个标签过滤条件
- **THEN** 系统 SHALL 只显示匹配标签的卡片

#### Scenario: 只渲染视口附近卡片
- **WHEN** 画布包含大量卡片
- **THEN** 系统 SHOULD 只渲染当前视口及缓冲区内的卡片
- **AND** 系统 MUST 保持拖拽和缩放交互流畅
