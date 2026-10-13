# Bot 实际协作验收 — 2026-10-13

> 历史阶段记录：本报告对应一次请求/一次回应的协作版本。连续团队对话、嵌套追问、用户插话及头像气泡的后续实现与最新验收，见 [Bot Team 连续对话验收](2026-10-13-bot-team-conversation-verification.md)。

## 本轮纠正的目标

上一轮证明了“固定 Bot + 依赖任务流水线”，不足以证明成员主动协作。用户明确批准继续在 `codex/bot-team` 完成实际请求、回应、交接、继续原任务及坞内过程展示，先不合并。

本轮采用有 ID 的持久 exchange：调用 `bot_message` 后原任务保持 in_progress 并释放本轮执行/文件锁；队友接收自包含请求并实际处理，最终回应自动返回。发起者收到关联回应后沿用原 task/attempt 继续，最后才交付。`handoff` 表示委托队友完成一段工作，发起者核验并汇报结果，不改变原任务负责人。

## 已实施

- `src/bot/collaboration.ts`：稳定请求 ID、身份/范围校验、请求/回应提示、生命周期核对。
- `src/team/scheduler.ts`：请求→队友执行→回应→原任务接回；请求期间不结算、不重复送达，同一执行会话串行，旧消息/成员执行路径保留。
- `src/runtime/native.ts`：成员工具 `bot_colleagues` / `bot_message`；真实工具调用 ID 不接受模型覆盖；只在已绑定团队成员的执行上下文内可发送。
- `src/ui/bot-collaboration.tsx`：Bot 坞增加“助手 / 协作过程”，直接读取当前主会话的持久 exchange，显示双方、请求/交接、状态、时间、原文、实际回应，能打开实际成员执行对话。
- `src/ui/bot-member-view.ts`：查看协作会话不取用户写权，不提供停止、改模型/配置、回退、压缩、发送等控制；保留人明确回答成员权限/问题的入口。显示“协作执行对话，仅供查看”，不把活动执行误说成结束。
- 同 owner 换项目/本机目录/远端 CWD 时，已选 Bot 视图与异步回执按 scope 失效；打开/补充入口同时核对 backend 的成员 scope、team binding、真实 session 及 owner。
- 协议 8.14，新操作 `openBotMember` 与可选 `team.collaboration` 严格 schema，旧 team 文件无需迁移；SQLite 仍为本分支迁移 17。

## 数据分析证据

测试入口：`e2e/bot-collaboration.spec.ts`。推理剧本由 e2e 和 dev:mock 共用的 `scripts/mock-bot-collaboration.mjs` 提供；实际会话、工具调用、文件、计算、调度和 UI 为真。

1. 输入六行 `input.csv`，第六行 y=-999；另有真实数据字典说明此值表示缺失。原始 CSV 最终逐字不变。
2. 统计 Bot 实际读取输入发现异常，查询队友，通过 `bot_message` 向数据 Bot 发起核查。E2E 在其 processing 阶段验证原任务尚未 completed。
3. 数据 Bot 实际读取字典，生成 clean.csv 和 data-check.md，返回 `CONFIRMED_MISSING_CODE=-999; excluded=1`。回应由引擎关联原请求送回，不经主对话手工转发。
4. 统计 Bot 新一轮读取该回应及核查文件，用五行数据实际运行 OLS 脚本，结果 n=5、slope=2、intercept=1、excluded=1；CSV 精确两行。
5. 统计 Bot 向绘图 Bot 发出 handoff；绘图 Bot 读取实际模型/clean.csv，生成带数据点与回归线的 SVG 和 plot.py，再自动返回实际产物路径。
6. 统计 Bot 第三轮接回交付，检查脚本/表/说明/图形均存在，才完成原任务。持久记录只有 **一个原始任务、attempt=1、两次已回应且已接回的 exchange**；统计 3 轮、数据和绘图各 1 轮。
7. E2E 展开坞中的实际请求/回应，打开数据 Bot 的真实执行对话，确认只读且未调用 acquireLease 取得它的写权；关闭/切换面板后记录仍在。点击 model.py 打开原脚本预览。

产物：`scripts/model.py`、`scripts/plot.py`、`results/model.json`、`results/model.csv`、`results/clean.csv`、`notes/data-check.md`、`notes/method.md`、`figures/regression.svg`。

## 失败与边界

- 仅当前同团队、同 scope 的活动 Bot 互调，拒绝自己、非成员、范围不一致或失效原任务。
- 每原任务最多 8 次、每团队最多 64 次；单条消息 16 KiB。处理队友请求时不能递归转托，避免循环群聊。
- 取消、转派、停止会中止正在执行的受托轮；旧回应不继续旧 attempt。明确的新任务可重新开启团队调度，但停止过的原 attempt 仍被隔离。
- 接收者失败/移除时向仍有效的发起任务返回明确失败，发起者处理；重启把未接回协作标为 interrupted，不自动重放写入。
- 主对话/direct 私聊历史保留，私聊内容不自动共享。没有增加 Bot 自动长期记忆、跨项目通讯或自由无限群聊。

## 验证状态

- 新协作 E2E 已通过（7.6 秒），含真实文件运算、handoff、只读 IPC 写权断言、亮暗及 280px 检查。
- 引擎与原调度器 focused 30 项通过；独立 UI/Native/协议/后端复验 28 项通过；最终类型检查及完整构建通过。
- 最终全量 Vitest **388 文件、4373 项通过、10 项原设置跳过**（86.30 秒），无未处理异常。最终相关 Electron **44/44** 通过（2.3 分钟），覆盖新协作、旧 Bot、Team、侧边对话、自适应坞、文件及脚本预览/收起/菜单。
- 初次全量仅协议版本断言仍为 8.13 而失败；按新增 8.14 契约更新断言后定向 39 项和整轮全量重新通过。新 E2E 的首轮复验曾发现定位器匹配两个 exchange、只读框占位符及 fixture 未以明确路径格式交付，分别校正定位、增加真实只读提示及交付路径格式后复验通过；未降低功能断言。
- 构建仍有既有 chunk-size 提示，Vitest 有 jsdom canvas 提示，旧英文场景有“简洁”缺译回落提示；没有屏蔽失败或修改阈值。
- 日志、红阶段证据、截图位于 `tmp/bot-collaboration-verification/`，生成文件不提交。没有修改视觉基线、容差或 mask。

两阶段独立审查均已通过。修复了：协作查看误取写权及提供修改控制、same-owner scope 改变及迟到回执、模型覆盖真实调用 ID、停止后旧请求续跑、取消原任务未停受托工具。此处记录实际验证，不把测试通过等同于模型质量。

## 使用与未验证范围

新版隔离窗口：`DAWN-Science · codex/bot-team · Bot 协作演示`，项目 `Bot-Collaboration-Demo`。进入 Bot→协作过程查看核查和交接；助手页仍可创建/管理和直接交流，主对话 `/` 仍可指定 Bot 调遣。

此窗口使用固定演示推理，适合查看机制及已执行产物；自由分析需要用户已有真实 API 配置。真实模型分工/科学判断质量、真实 SSH/网络断连及远端内核仍未端到端验收。六行示例是协作机制验收，不能用作统计方法有效性评测。

继续停留在 `codex/bot-team` 工作树；未提交、合并、推送或替换安装版。
