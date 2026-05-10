## ADDED Requirements

### Requirement: SQLite 本地数据库
Steno SHALL 将用户笔记和设置默认保存到本机 SQLite 数据库。

#### Scenario: 首次启动创建数据库
- **WHEN** 用户首次启动 Steno
- **THEN** 系统 SHALL 在用户主目录下创建 `.steno/data.db`
- **AND** 系统 SHALL 创建 `notes` 和 `settings` 表

#### Scenario: 离线读写
- **WHEN** 设备没有网络连接且用户创建、编辑、搜索或导出笔记
- **THEN** 系统 SHALL 正常完成本地操作
- **AND** 系统 MUST 不要求登录或联网

### Requirement: Notes 表结构
Steno SHALL 用 `notes` 表保存 Markdown 笔记内容及其窗口和画布状态。

#### Scenario: 保存笔记字段
- **WHEN** 系统保存一条非空笔记
- **THEN** `notes` 记录 SHALL 包含 `id`、`title`、`content`、`html_content`、`tags`、`is_pinned`、`pinned_window_config`、`canvas_position`、`created_at`、`updated_at` 和 `word_count`

#### Scenario: 标签自动解析
- **WHEN** 用户在内容或标签输入中输入 `#tag`
- **THEN** 系统 SHALL 将标签解析并保存到 `tags`
- **AND** 标签 MUST 去重

### Requirement: Settings 表结构
Steno SHALL 用 key-value `settings` 表保存用户偏好。

#### Scenario: 初始化默认设置
- **WHEN** 数据库初始化完成
- **THEN** 系统 SHALL 写入默认全局快捷键、浮窗大小、失焦关闭延迟、主题模式、编辑器模式和备份策略

#### Scenario: 更新设置
- **WHEN** 用户在设置界面修改偏好
- **THEN** 系统 SHALL 持久化该 key-value
- **AND** 需要即时生效的设置 MUST 立即应用

### Requirement: 自动备份
Steno SHALL 定期备份本地 SQLite 数据库。

#### Scenario: 每日备份
- **WHEN** 当天第一次发生会修改数据库的保存操作
- **THEN** 系统 SHALL 将数据库复制到 `.steno/backup/` 目录
- **AND** 备份文件名 MUST 包含日期时间

#### Scenario: 修改次数备份
- **WHEN** 距离上次备份已经累计 10 次数据库修改
- **THEN** 系统 SHALL 创建新的数据库备份

### Requirement: 同步接口预留
Steno SHALL 在本地数据层预留未来同步接口，但 MVP MUST 不上传用户数据。

#### Scenario: MVP 不触发云同步
- **WHEN** 用户保存、搜索、编辑或导出任何笔记
- **THEN** 系统 MUST 只访问本地数据库和本地文件系统
- **AND** 系统 MUST 不向远程服务器发送笔记内容
