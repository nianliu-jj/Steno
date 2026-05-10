# Steno MVP 规格增量

## ADDED Requirements

### Requirement: 状态栏常驻

Steno SHALL 在 macOS 状态栏中提供常驻入口，并在默认状态下保持安静待命。

#### Scenario: 状态栏打开浮窗

- WHEN 用户点击状态栏 Steno 图标
- THEN 系统 SHALL 显示速记浮窗或主菜单
- AND 不应切换到一个全屏应用窗口

#### Scenario: 默认不打扰

- WHEN 用户没有主动操作 Steno
- THEN 系统 SHALL 不主动弹出通知或抢占输入焦点

### Requirement: 全局快捷键

Steno SHALL 支持用户通过全局快捷键呼出速记浮窗。

#### Scenario: 呼出速记浮窗

- GIVEN Steno 正在后台运行
- WHEN 用户按下已配置的快捷键
- THEN 系统 SHALL 在当前屏幕显示速记浮窗
- AND 输入框 SHALL 自动获得焦点

#### Scenario: 快捷键冲突

- GIVEN 用户设置的快捷键已被系统或其他应用占用
- WHEN 用户保存该快捷键
- THEN 系统 SHALL 提示冲突
- AND 要求用户重新选择快捷键

### Requirement: 浮窗速记

Steno SHALL 允许用户在当前屏幕上快速记录文本，并在保存后自动收起。

#### Scenario: 保存速记

- GIVEN 速记浮窗已打开
- WHEN 用户输入内容并保存
- THEN 系统 SHALL 将内容写入本地 Inbox
- AND 浮窗 SHALL 自动收起
- AND 焦点 SHALL 返回原应用

#### Scenario: 恢复未保存草稿

- GIVEN 用户在浮窗中输入内容但未保存
- WHEN 浮窗被关闭后再次打开
- THEN 系统 SHALL 恢复未保存草稿

### Requirement: 剪贴板历史

Steno SHALL 自动记录剪贴板文本历史，并允许用户搜索、过滤、标记和置顶。

#### Scenario: 记录剪贴板文本

- WHEN 用户复制文本、链接或代码
- THEN 系统 SHALL 在本地保存一条剪贴板历史
- AND 记录捕获时间和来源应用

#### Scenario: 搜索剪贴板历史

- GIVEN 本地存在剪贴板历史
- WHEN 用户输入关键词
- THEN 系统 SHALL 返回匹配内容
- AND 支持按类型、时间、来源应用、标签和 Pin 状态过滤

#### Scenario: 清理历史

- WHEN 历史条目超过用户设置的保留期限或最大条数
- THEN 系统 SHALL 自动清理可过期条目
- AND 不应删除用户 Pin 的条目，除非用户明确选择删除

### Requirement: 置顶笔记

Steno SHALL 支持将笔记或剪贴板条目标记为置顶。

#### Scenario: 置顶内容优先展示

- GIVEN 用户已 Pin 某条内容
- WHEN 用户打开主界面或浮窗
- THEN 系统 SHALL 在置顶区域优先展示该内容

#### Scenario: 取消置顶

- WHEN 用户取消某条内容的 Pin 状态
- THEN 系统 SHALL 将其从置顶区域移除
- AND 保留原始内容和标签

### Requirement: 无限画布

Steno SHALL 提供无限画布，用于自由组织便签卡片。

#### Scenario: 移动画布卡片

- GIVEN 用户在画布上看到便签卡片
- WHEN 用户拖拽卡片
- THEN 系统 SHALL 更新卡片位置
- AND 在重启后保持该位置

#### Scenario: 缩放和平移画布

- WHEN 用户执行缩放或平移操作
- THEN 系统 SHALL 更新画布视图
- AND 保存当前缩放与平移状态

#### Scenario: 智能排列

- WHEN 用户触发智能排列
- THEN 系统 SHALL 按标签、Pin 状态或时间重新排列卡片

### Requirement: 主题设置

Steno SHALL 支持 Light、Dark、System 主题模式和强调色选择。

#### Scenario: 切换主题

- WHEN 用户选择新的主题模式
- THEN 系统 SHALL 立即应用该主题
- AND 在下次启动时保持该设置

### Requirement: 本地存储

Steno SHALL 默认将全部用户数据保存在本机。

#### Scenario: 离线使用

- GIVEN 设备没有网络连接
- WHEN 用户创建、搜索、编辑或导出笔记
- THEN 系统 SHALL 正常工作

#### Scenario: 查看本地数据目录

- WHEN 用户打开设置
- THEN 系统 SHALL 显示本地数据目录

### Requirement: Markdown 导出

Steno SHALL 支持将笔记、画布分组或全部数据导出为 Markdown。

#### Scenario: 导出单条笔记

- WHEN 用户导出一条笔记
- THEN 系统 SHALL 创建 Markdown 文件
- AND 文件 SHALL 包含标题、正文、标签、创建时间和更新时间

#### Scenario: 导出失败

- WHEN 文件系统写入失败
- THEN 系统 SHALL 显示失败原因
- AND 保留原始数据不变

### Requirement: Zen 模式

Steno SHALL 提供隐藏干扰的 Zen 写作模式。

#### Scenario: 进入 Zen 模式

- WHEN 用户进入 Zen 模式
- THEN 系统 SHALL 隐藏侧边栏、画布、剪贴板和主题面板
- AND 只显示标题、正文、字数/保存状态和退出入口

#### Scenario: Zen 模式自动保存

- WHEN 用户在 Zen 模式编辑正文
- THEN 系统 SHALL 自动保存为本地草稿
