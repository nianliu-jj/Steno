## Context

Steno 是 Tauri 2 + Vue 3 桌面速记应用，后端 Rust（SQLite via rusqlite）、前端 Pinia + Naive UI，编辑器为基于 ProseMirror 的 Typora 风格 WYSIWYG（`src/components/markdown-editor/prosemirror/`）。本次变更来自《待实现功能》清单，横跨后端（日志、清理调度）与前端（编辑器插件、视图布局、列表交互、设置）。

关键现状约束：
- 数据根目录由 `Db::data_dir()` 解析为 `~/.steno`，数据库在 `~/.steno/data.db`；清理与日志复用此根，但日志按需求落在 `~/.steno/data/logs`。
- 已有 `reminder_scheduler.rs`：`tauri::async_runtime::spawn` + `loop { tick; sleep }` 的后台任务范式，在 `lib.rs::setup` 启动并持有 `Db` 克隆。清理调度直接复用该范式。
- `Cargo.toml` 当前**无任何日志 crate**，代码中用 `eprintln!` 打印。
- 未保存草稿即 `notes` 表 `is_draft=1`，`updated_at` 为最后修改时间；粘贴板为 `clipboard_history` 表，含 `created_at/updated_at/last_used_at/pinned_at`。
- 设置项需同时改前端 `src/stores/settings.ts`（接口/默认值/decode）与后端 `db.rs::ensure_default_settings`。
- 编辑器即时渲染由 input-rules（输入触发）+ decorations（按光标显隐标记）协作；`input-rules.ts` 显式注明"标题不走 input rule，由解析时渲染"——这正是标题不即时渲染的根因。
- `ZenMode.vue` 声明了本地 `title/content/tags` 空 ref 并绑定给编辑器，却从未与 `useWritingSession` 同步——这是 Zen 回显为空的根因。

## Goals / Non-Goals

**Goals:**
- 后端落地满足"按日期目录 + 10MB 切分 + 30 天保留"的文件日志，并迁移现有 `eprintln!` 到日志宏（至少调度/清理/启动关键路径）。
- 一个后台清理调度器统一清理过期草稿与过期粘贴板条目，保留天数可配。
- 修复编辑器三处缺陷（标题即时渲染、图片粘贴光标、Ctrl+数字标题快捷键）。
- 修复编辑/Zen 页布局三处缺陷（固定顶/底栏 + 内容滚动、大纲按钮悬浮与面板定位、Zen 回显）。
- 笔记列表：右键"进入 Zen 模式" + 红色未保存徽章。

**Non-Goals:**
- 不引入重型日志框架（如 `tracing` 全家桶）或结构化/JSON 日志；保持"能用、简单"。
- 不实现需求中建议的"每次编辑后注册/更新 per-draft 定时任务"的精确机制（见 Decisions，改用周期性扫描）。
- 不改动数据库 schema（不新增列/表），仅新增清理 SQL 与设置键。
- 不重构编辑器内核或既有渲染管线，只补缺失的 input rule 与光标处理。

## Decisions

### D1. 日志：`log` facade + 轻量自定义文件 Logger，不用 tracing/log4rs

采用 `log` crate 作为门面（`log::info!/warn!/error!`），实现一个自定义 `log::Log`：写入 `~/.steno/data/logs/<YYYY-MM-DD>/steno-<n>.log`，按需切换日期目录、按 10MB 滚动序号、启动时清理 >30 天目录，并同时 echo 到 stderr。用 `Mutex<Option<Writer>>` 维护当前文件句柄与已写字节数。

- **为什么**：需求是高度定制的"按天分目录 + 同日按大小切分 + 按天数保留"，`tracing-appender` 只支持按时间滚动（无同日大小切分、目录结构不符），`log4rs` 的 size+window 滚动也不天然支持"每天一个目录 + 按天保留"。自定义实现 ~150 行即可精确满足且零额外重依赖（仅加 `log`，`chrono` 已在依赖中）。
- **替代方案**：`flexi_logger`（功能足够但引入较大依赖与配置面）；`tracing` 全家桶（过重，且团队约定"简单优先"）。均被否决。
- **初始化时机**：`lib.rs::setup` 最早期（在打开 DB 之前或之后均可，但要在第一条业务日志前）。日志目录用 `Db::data_dir()?.join("data/logs")` 解析，避免依赖运行中的 DB State。

### D2. 清理：单一周期性扫描调度器，而非 per-draft 定时器

新增 `cleanup_scheduler.rs`，复用 `reminder_scheduler` 范式：`spawn` 后台任务，启动延迟若干秒先跑一轮，之后每隔固定周期（如 6 小时）跑一轮。每轮读取设置中的保留天数，计算 RFC3339 截止时间，执行两条删除 SQL（草稿、粘贴板），并对删除数量/条目写日志。

- **为什么**：需求建议的"每次编辑后在关闭浮窗时注册/更新定时任务"在进程重启后会丢失，且实现复杂、易漏触发。周期性扫描幂等、健壮、覆盖"启动时补清理"，与现有 reminder 调度器一致，维护成本低。最终用户可见效果（超期即被清理）完全等价。
- **草稿过期判定**：`is_draft=1 AND updated_at < cutoff`，cutoff = `now - retention_days`。
- **粘贴板过期判定**：`pinned_at IS NULL AND COALESCE(last_used_at, updated_at) < cutoff`（以"最近使用"为基准，置顶豁免）。
- **读取设置**：调度器内用 `db.get_setting(key)` 读取保留天数字符串并解析为正整数，失败回退默认（草稿 30、粘贴板 7）。
- **替代方案**：在保存/关闭浮窗的命令里即时清理——会与用户操作耦合、难以覆盖启动场景，否决。

### D3. 标题即时渲染：补 ATX 标题 input rule

在 `input-rules.ts` 增加标题规则（`textblockTypeInputRule(/^(#{1,6})\s$/, headingType, match => ({ level: match[1].length }))`，或等价手写 InputRule），并在 `createInputRulesPlugin` 装配；保留 source-view 守卫。这样行首输入 `# `~`###### ` + 空格即把当前段落 setBlockType 为对应 level 的 heading。

- **为什么**：根因是标题未走 input rule（仅解析时渲染）。补该规则即对齐其它块级语法（blockquote/list/hr/code 都已有 input rule）的即时行为。
- **影响范围**：笔记编辑页与速记浮窗共用 `MarkdownEditor`，一处修复两处生效。
- **风险**：需确认 `schema.nodes.heading` 的 `level` attr 命名与现有 schema 一致；并保证不破坏既有"光标进入显示 `#` 标记"的 decorations 行为（input rule 只负责块类型转换，标记显隐仍由 decorations 处理）。实现期用 systematic-debugging 验证一次真实输入路径。

### D4. 图片粘贴光标：插入后显式定位到图片之后并按需补段落

修改 `paste.ts::handleImagePaste`：插入 image 节点后，构造一个把选区设到图片节点之后的 transaction；若图片后没有可承载光标的块/位置，则插入一个空段落再定位。用 `tr.insert` 后基于映射后的位置 `TextSelection`/`Selection.near` 设定到图片后侧。

- **为什么**：当前 `tr.insert($from.pos, node)` 未设选区，PM 默认把光标留在插入点之前，导致后续换行/输入跑到图片前。显式 setSelection 到图片后可修复。
- **细节**：image 在 schema 中的 inline/block 属性决定"下一行"的实现（block 图片天然独占行，只需把光标移到其后段落；inline 图片需在其后插入硬换行/新段落）。实现期先确认 schema 中 image 节点类型再选具体策略。

### D5. 布局：编辑页改为 header/scroll-body/footer 三段式，FAB 锚定滚动容器

`NoteEditorView.vue`：`.note-editor-root` 改 `height: 100%`（替代 `min-height`），`.note-editor-header`/`.note-editor-footer` 加 `flex-shrink: 0`，`.note-editor-body` 用 `flex: 1; min-height: 0; overflow: auto` 作为唯一滚动容器；`MarkdownEditor` 自身已 `height:100%`，让内部内容随 body 滚动。大纲 FAB 改为相对"滚动视口"固定在右下角（保持 `position: absolute` 但其定位上下文 body 不滚动、内容在 body 内滚动；或将 FAB 提到非滚动层），并把大纲面板从 `top:18px` 改为锚定在 FAB 上方（`bottom` 对齐 FAB 顶部）。

- **为什么**：根因是 `.note-editor-root: min-height:100%` 使整页随内容增高、产生页面级滚动，header/footer 随之滚走。改为固定高度 + body 内滚动即修复，且 FAB（absolute 于 body）不再随内容滚动。
- **Zen 模式**：`ZenMode` 的大纲面板已在 FAB 上方（`bottom:72px`），与目标一致，按需仅微调；主要修复见 D6。
- **替代方案**：用 `position: sticky` 固定 header/footer——可行但与现有 flex 布局改动量相近，且 sticky 在跨浏览器/transform 容器下易踩坑，选 flex 三段式更稳。

### D6. Zen 回显：删除本地空 ref，统一绑定 writing session

`ZenMode.vue`：移除本地 `title/content/tags` 空 ref，改为直接使用 `session.title/session.content/session.tags`（与 `NoteEditorView` 一致）；`wordCount`/`outlineNodes`/`displayTitle`/`isEmpty` 全部基于 session。`<MarkdownEditor v-model="session.content">`。

- **为什么**：根因是本地 ref 从未 hydrate；session 已正确 `onMounted` 从 DB 加载。统一到 session 即修复回显与保存。
- **风险**：注意 `useWritingSession` 的 `content` 是 `Ref<string>`，`v-model` 直接绑定即可；标题编辑、退出 flush 等逻辑改为读 session。

### D7. 列表交互：菜单项替换 + 徽章配色

`MainView.vue`：右键菜单 `context-edit` 项文案从"编辑"改为"进入 Zen 模式"，`onContextEdit` 改为 `ui.navigateTo('zen', note.id, { mode: 'main', noteId: null })`（草稿同样支持进入 Zen）。`.note-card-draft-tag` 背景改红色（如 `oklch` 红 / `#d92d20` 系），文字改白/浅色，保证对比度（呼应暗色模式既有约定）。

- **为什么**：需求明确替换菜单语义与徽章配色；Zen 导航复用 ui store 既有 `navigateTo('zen', id, returnRoute)`。
- **依赖**：进入 Zen 后回显依赖 D6 修复，二者配套。

### D8. 设置项：前后端各加两键

前端 `settings.ts`：`StenoSettings` 加 `unsavedNoteRetentionDays: number`、`clipboardRetentionDays: number`；`DEFAULTS` 加 `30`/`7`；`decode` 加两键的正整数解析（沿用 `Number.parseInt`，`>0` 校验，否则默认）。后端 `db.rs::ensure_default_settings` 加 `("unsavedNoteRetentionDays","30")`、`("clipboardRetentionDays","7")`。SettingsView 增加对应输入控件（NInputNumber）。

- **为什么**：保留天数需用户可配；遵循项目"前后端默认值对齐"约定。

## Risks / Trade-offs

- [自定义日志并发写] → 用 `Mutex` 串行化写入；日志非高频，锁开销可忽略；写失败仅降级为 stderr，不影响主流程。
- [周期性清理误删用户仍想要的草稿] → 仅清理 `is_draft=1` 且超保留期者；保留天数可配且默认较长（30 天）；删除写日志可追溯。
- [粘贴板"最近使用"时间语义] → 以 `COALESCE(last_used_at, updated_at)` 为基准，复制/粘贴会 touch `last_used_at`，符合"活跃即保留"；置顶豁免避免误删收藏项。
- [标题 input rule 与 decorations 交互] → 仅做块类型转换，不动标记显隐；实现期单元测试 + 真实输入验证，防止回归既有渲染。
- [布局改动影响其它入口] → `MarkdownEditor` 被 FloatingEditor/Zen/NoteEditor 复用，布局改动集中在各 View 容器层（非编辑器组件本身），降低连带影响；改完跑现有 vitest 视图测试回归。
- [日志路径 `~/.steno/data/logs` 与现有 `~/.steno/*` 子目录约定略不一致] → 按需求原文落在 `data/logs`；如后续需统一可再迁移，成本低。

## Migration Plan

- 纯增量：新增文件目录与设置键，不改 schema、不动既有数据。无需数据迁移。
- 回滚：移除调度器注册与日志初始化即可恢复旧行为；新增设置键对旧版本无副作用（被忽略）。

## Open Questions

- 清理调度周期取值（建议 6 小时）与启动延迟（建议复用 reminder 的数秒延迟）——实现期定常量即可，无需用户决策。
- 粘贴板过期基准用 `last_used_at` 还是 `created_at`：本设计取 `COALESCE(last_used_at, updated_at)`（活跃即保留），若用户更希望"按首次复制时间"再调整。
