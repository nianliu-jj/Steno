## ADDED Requirements

### Requirement: Steno MUST 区分文本与文档两类内容条目
Steno SHALL 将内容条目明确区分为 `text` 与 `document` 两类，并根据入口决定默认类型。

#### Scenario: 速记保存为文本
- **WHEN** 用户通过速记浮窗创建并保存一条内容
- **THEN** 系统 SHALL 将该内容创建为 `text`
- **AND** 系统 MUST 不将其默认创建为 `document`

#### Scenario: 主窗口新建笔记保存为文档
- **WHEN** 用户通过主窗口“新建笔记”创建并保存一条内容
- **THEN** 系统 SHALL 将该内容创建为 `document`
- **AND** 系统 MUST 不将其默认创建为 `text`

### Requirement: 文本正文 MUST 保存在数据库中并受 10KB 限制
Steno SHALL 将 `text` 的正文 Markdown 保存在数据库中，并以正文 Markdown 的 UTF-8 真实字节数作为 `10KB` 上限。

#### Scenario: 文本内容在 10KB 内时允许保存
- **WHEN** 用户保存一条正文 Markdown 字节数不超过 `10KB` 的 `text`
- **THEN** 系统 SHALL 成功保存该文本内容到数据库
- **AND** 系统 SHALL 更新对应条目的标题、标签和更新时间

#### Scenario: 文本内容超过 10KB 时拒绝保存
- **WHEN** 用户保存一条正文 Markdown 字节数超过 `10KB` 的 `text`
- **THEN** 系统 MUST 拒绝保存该文本内容
- **AND** 系统 SHALL 返回包含当前体积和上限的失败提示
- **AND** 系统 MUST 保留用户当前未保存的编辑内容

### Requirement: 文档正文 MUST 保存在磁盘文件中
Steno SHALL 将 `document` 的正文 Markdown 保存在磁盘文件中，并仅在数据库中保留索引和元信息。

#### Scenario: 创建文档时写入磁盘文件
- **WHEN** 用户成功创建或保存一条 `document`
- **THEN** 系统 SHALL 将正文写入目标 Markdown 文件
- **AND** 系统 SHALL 在数据库中保存该文档的路径、标题、标签和更新时间等索引信息

#### Scenario: 文档不受 10KB 限制
- **WHEN** 用户保存一条正文 Markdown 字节数超过 `10KB` 的 `document`
- **THEN** 系统 SHALL 允许保存该文档
- **AND** 系统 MUST 不套用 `text` 的 `10KB` 限制规则

### Requirement: 文本 MUST 默认归入系统分组
Steno SHALL 为没有显式分组上下文的速记文本提供系统默认分组容器。

#### Scenario: 速记在没有手动选中分组时保存
- **WHEN** 用户通过速记浮窗保存 `text` 且当前没有手动指定分组
- **THEN** 系统 SHALL 将该文本归入系统默认分组
- **AND** 该默认分组 MUST 对用户可见

### Requirement: 文本转文档 MUST 采用原地转换
Steno SHALL 提供 `text -> document` 的原地转换能力，而不是复制生成第二条内容。

#### Scenario: 文本成功转为文档
- **WHEN** 用户对一条 `text` 执行“转为文档”且目标工作区/文件夹有效
- **THEN** 系统 SHALL 复用当前正文内容创建目标 Markdown 文件
- **AND** 系统 SHALL 将该条目的类型更新为 `document`
- **AND** 系统 MUST 不再保留原来的 `text` 类型记录

#### Scenario: 文档条目上不执行文本转文档
- **WHEN** 用户在一条已经是 `document` 的条目上触发“转为文档”
- **THEN** 系统 MUST 不执行类型转换
- **AND** 系统 SHALL 将该动作视为不可用或无效
