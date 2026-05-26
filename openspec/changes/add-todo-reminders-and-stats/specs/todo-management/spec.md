## MODIFIED Requirements

### Requirement: 任务列表的 CRUD
任务列表 MUST 支持完整的增删改查：行内编辑任务文本、切换状态（todo↔doing↔paused↔done）、设置 / 清除截止日期、设置 / 清除提醒时间、删除（逻辑删除）。当 `status` 首次从非 `doing` 切换为 `doing` 时，系统 SHALL 自动写入 `started_at = now()`（已有 `started_at` 时不覆盖）。当 `reminder_time` 被修改（含清空）时，系统 SHALL 同步把 `reminder_fired` 重置为 0，以保证新时间能被调度器再次触发。

#### Scenario: 行内编辑文本
- **WHEN** 用户双击某任务的文本区域
- **THEN** 该任务文本变为可编辑 `<input>`，失焦或按 `Enter` 后保存到数据库；按 `Esc` 取消编辑回退原文本

#### Scenario: 状态切换下拉
- **WHEN** 用户点击任务行内的状态徽章（如 "todo"）
- **THEN** 弹出下拉菜单展示四种状态，选择后立即更新数据库并刷新分类计数

#### Scenario: 首次切换到进行中填充 started_at
- **WHEN** 用户将一个 `started_at=NULL` 的任务从 `todo` 切换为 `doing`
- **THEN** 系统 SHALL 把 `started_at` 设为当前时刻 RFC3339；该值在后续状态切换中不再被改写

#### Scenario: 反复切换不重置 started_at
- **WHEN** 任务先后经历 `todo -> doing -> paused -> doing` 状态切换
- **THEN** `started_at` SHALL 保留首次进入 `doing` 时的时间戳，不被第二次进入 `doing` 覆盖

#### Scenario: 设置截止日期
- **WHEN** 用户点击任务行内的日期按钮（默认显示"无日期"或现存 `due_date`）
- **THEN** 弹出日期选择器，选择日期后保存到 `due_date`，任务自动归入对应分类（"今天"或"计划中"）

#### Scenario: 设置提醒时间清空已触发标记
- **WHEN** 用户对一个 `reminder_fired=1` 的任务重新选择"30 分钟后"作为提醒
- **THEN** `reminder_time` 更新为 `now()+30min`、`reminder_fired` 同步置 0，调度器 SHALL 在新时间到达时再次触发

#### Scenario: 清空提醒时间
- **WHEN** 用户在编辑器把"提醒"切到"无"
- **THEN** `reminder_time=NULL`、`reminder_fired=0`，调度器跳过该任务

#### Scenario: 删除任务
- **WHEN** 用户点击任务行末尾的删除按钮
- **THEN** 系统将 `is_deleted=1`，任务从列表移除（无二次确认）；分类计数同步减少
