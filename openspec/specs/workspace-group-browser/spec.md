## ADDED Requirements

### Requirement: 工作区与文件夹 MUST 只承载文档层级
Steno SHALL 用工作区和文件夹来承载 `document` 的磁盘层级，并允许用户在工作区中递归进入多层文件夹。

#### Scenario: 在工作区内进入子文件夹
- **WHEN** 用户在主列表或右侧结构栏中打开某个文件夹
- **THEN** 系统 SHALL 进入该文件夹上下文
- **AND** 当前工作区 MUST 保持不变

#### Scenario: 工作区内文件夹可以继续嵌套
- **WHEN** 当前文件夹下仍然存在子文件夹
- **THEN** 系统 SHALL 允许继续进入子文件夹
- **AND** 系统 SHALL 支持递归进入多层，直到没有更多子文件夹

### Requirement: 分组与文本 MUST 独立于工作区存在
Steno SHALL 让分组与文本在结构归属上独立于工作区和文件夹存在，其中分组允许拥有子分组，文本只能属于一个分组。

#### Scenario: 分组切换不改变工作区
- **WHEN** 用户浏览某个分组或子分组
- **THEN** 系统 SHALL 保留当前工作区上下文
- **AND** 分组和文本 MUST 不因工作区切换而改变归属

#### Scenario: 文本只能属于单一分组
- **WHEN** 系统保存或更新一条 `text`
- **THEN** 该文本 SHALL 只关联一个分组
- **AND** 系统 MUST 不允许同一条文本同时挂到多个分组

### Requirement: 主列表 MUST 混合显示当前工作区内容与全局分组内容
Steno SHALL 在主列表中同时显示当前工作区/文件夹下的文件夹与文档，以及全局分组树或当前分组上下文下的分组与文本。

#### Scenario: 位于工作区根目录时显示混合列表
- **WHEN** 用户当前停留在某个工作区根目录
- **THEN** 主列表 SHALL 显示该工作区根下的直接文件夹和直接文档
- **AND** 主列表 SHALL 同时显示全局分组与文本内容

#### Scenario: 位于子文件夹时显示混合列表
- **WHEN** 用户当前停留在某个子文件夹
- **THEN** 主列表 SHALL 显示该子文件夹下的直接文件夹和直接文档
- **AND** 主列表 SHALL 同时显示全局分组与文本内容

### Requirement: 右侧结构栏 MUST 只展示当前工作区树
Steno SHALL 用右侧结构栏展示当前工作区中的文件夹与文档结构，而不将全局分组树混入其中。

#### Scenario: 展开右侧结构栏
- **WHEN** 用户点击主页面底部或边缘的结构栏展开入口
- **THEN** 系统 SHALL 展示当前工作区的文件夹/文档树
- **AND** 该结构栏 MUST 不显示分组或文本树

#### Scenario: 在无工作区时打开结构栏
- **WHEN** 用户当前没有选定任何工作区且尝试展开右侧结构栏
- **THEN** 系统 SHALL 展示空状态或工作区提示
- **AND** 系统 MUST 不伪造不存在的文件夹/文档结构

### Requirement: 主页面底部 MUST 显示当前工作区与切换入口
Steno SHALL 在主页面底部显示当前工作区信息，并提供切换工作区入口。

#### Scenario: 当前存在工作区
- **WHEN** 用户当前处于某个工作区上下文
- **THEN** 底部栏 SHALL 显示当前工作区名称或路径
- **AND** 底部栏 SHALL 提供切换工作区入口

#### Scenario: 当前没有工作区
- **WHEN** 用户当前没有选定任何工作区
- **THEN** 底部栏 SHALL 明确显示未选工作区状态
- **AND** 底部栏 SHALL 提供选择工作区入口

### Requirement: 文档落点 MUST 跟随当前主页面工作区上下文
Steno SHALL 根据当前主页面所在的工作区或文件夹上下文，决定新建文档与文本转文档的磁盘落点。

#### Scenario: 当前处于工作区根目录
- **WHEN** 用户在某个工作区根目录下新建 `document` 或将 `text` 转为 `document`
- **THEN** 系统 SHALL 将文档保存到该工作区根目录

#### Scenario: 当前已进入子文件夹
- **WHEN** 用户当前停留在某个子文件夹下新建 `document` 或将 `text` 转为 `document`
- **THEN** 系统 SHALL 将文档保存到该子文件夹中

#### Scenario: 在文件夹卡片上触发右键新建
- **WHEN** 用户在某个文件夹卡片上通过右键菜单触发新建文档
- **THEN** 系统 SHALL 将文档保存到该文件夹中
- **AND** 系统 MUST 不将其保存到当前工作区根目录

#### Scenario: 当前没有工作区时尝试创建文档
- **WHEN** 用户当前没有工作区且尝试新建 `document` 或将 `text` 转为 `document`
- **THEN** 系统 SHALL 先提示用户选择工作区
- **AND** 用户完成选择后，系统 SHALL 将文档保存到所选工作区下
