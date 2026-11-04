# 统一编排、持续协作与恢复验收记录

日期：2026-11-04，Asia/Shanghai。基线 43dd7bdc / 0.0.44。工作区 /Users/liuyue/.codex/worktrees/dawn-orchestration-20261104/dawn-science，分支 codex/unified-orchestration。

## 实际交付

- 新增父会话作用域的版本化状态库与协调服务，原子保存身份、执行状态、epoch、消息和结果回执。普通子任务、旧 Team 和 Bot 复用既有执行后端，共享活动名额与关闭排空机制。
- 新增后台启动、发送、列出、等待、中断五个主 agent 工具。普通子级后续指令续同一份 Pi 转录；用户侧续问保持原语义。队列消息明确不是实时 Steer。
- 新增持久消息去重、暂停、重启中断对账、父结果 outbox 与宿主回执确认。结果先进入父上下文，再按正常结果决定是否唤醒。取消/中断不自动唤醒父 agent 重跑。
- 旧记录恢复索引不改写原转录。旧 Team 运行中任务中断后需核对产物，不自动重放。新成员独立 UUID 防止同名移除重加串线；旧成员兼容 joinedAt 地址。
- 中止/超时等待子进程 close 后结算，避免进程仍在退出时就释放共享名额；保存失败不能阻止取消资源。

## 验证过程

基线定向：28 文件 / 219 项通过。新增测试按先失败再实现执行，包含真实临时文件、状态损坏、共享容量、关闭排空、去重、暂停恢复、取消后迟到结果、回送期间新结果、成员身份及实际进程退出。

首次完整回归：594 文件，6027 通过、11 跳过、1 失败。失败为 Bot 项目范围用例在新调度结算前读旧快照；补充等待真实 completed/idle 后再核对原范围断言，独立复现及修正后定向通过。没有放宽范围保护断言。

Electron 首轮新用例真实发现 Pi nextTurn 只入队、不立即记录回执的问题；已用真实 Pi Native 会话补失败回归，改为 triggerTurn=false 立即追加。后续单条 Electron 后台验收通过。

真实 Pi 集成：后台启动与模型发起续问使用同一子转录、两条消息分别完成与确认回送，通过。只有模型 HTTP 是本地确定性替身；进程、Pi、文件和回执走真实实现，不使用服务商或用户真实凭证。

最终 typecheck 与 build 已运行通过。构建保留既有 browser/tools.ts direct-eval 和 UI 大 chunk 提示。

父会话身份收紧后完整回归：594 文件，6032 通过、11 跳过（6043 项）。随后补入暂停保存失败时回退不能永久 busy 的红绿回归，真实 Native 定向 4 项与 typecheck/build 通过，最终源码整体验证：594 个文件全部通过，6033 项通过、11 项跳过（6044 项），162.08 秒。

Electron 组合验收：orchestration / subagent / team / bot-collaboration 共 10 项通过；另外 subagent-view 的用户侧续问与关掉重开 2 项通过，共 12 个独立场景。父会话身份收紧后，后台控制、用户续问与重开 3 项再次通过；最终构建后台用例再次通过。

新增父会话 ID 纳入 childId 的测试，确认不同聊天相同后端地址不能产生可互换 ID。新增磁盘写入失败时关闭仍取消所有活动后端、取消通知不触发父轮次、回送期间新结果不会丢唤醒、SIGKILL 后等待真实 close 等回归。

## 审查方式与限制

依项目“仅用户明确要求才委派”约定，本轮单主线实施并按 requesting-code-review 的检查项自行审查，没有声称独立第三方审查。重点复核取消、关闭、原子写、父范围、消息去重、旧转录、成员重建与模型工具实际装配。

未验证真实服务商协作质量、实际任务耗时/费用收益、原始科研数据分析正确性及原生 Windows/Linux 清理。没有修改真实用户数据、已安装应用、凭证、配置或 Git 主目录；没有推送、合并或发布。

## Git 与交付

原主目录 main 仍为 43dd7bdc 且无工作区修改。用户已明确选择“本地提交到专项分支”，满足长期路线图第 7 节的授权要求；交付在专项分支 codex/unified-orchestration 本地提交，不合并、推送、发布或替换安装应用。

## 最终证据入口

归档输出仅去除行尾空白及末尾多余空行，保留测试数量、错误提示与构建记录。

- [完整单测原始输出](../validation/unified-orchestration-20261104/unit-final.txt)
- [Electron 主路径 10 项](../validation/unified-orchestration-20261104/electron-core.txt)
- [后台、续问、重开 3 项](../validation/unified-orchestration-20261104/electron-resume.txt)
- [最终构建后台、续问与重开验收](../validation/unified-orchestration-20261104/electron-final.txt)
- [最终构建输出](../validation/unified-orchestration-20261104/build-final.txt)

以上共 12 个独立 Electron 场景。最终审查补充磁盘回执确认后，完整回归为 594 文件 / 6034 项通过、11 项跳过（6045 项），154.72 秒；类型检查、构建及后台/续问/重开 3 项再次通过。git diff --check 通过。源码验证后只更新证据文档，无新增行为变更。

## 目标逐项完成审计

| 目标 | 实现与证据 |
|---|---|
| 分阶段计划与复用边界 | 设计、实施计划、长期路线图专项入口；P0/P1/P2 已交付，P3 仅为后续路线 |
| 统一身份、容量与关闭 | store/service、SubagentExecutor、Team scheduler 共用；跨父身份、串行、取消及真实进程 close 测试 |
| 主 agent 持续协作 | 五个控制工具、持久 mailbox、同一转录续问；Native 集成与 Electron 后台场景 |
| 保留原界面和旧会话 | 原 chip/坞/事件复用；旧索引恢复不改写转录；Electron 用户续问与重开场景 |
| 恢复且不重放不明操作 | running → interrupted、暂停、epoch、消息去重、旧团队恢复测试 |
| 结果持久回执 | outbox 与当前 Pi 分支、磁盘日志双重确认；写入失败、延迟落盘红绿回归 |
| 本地交付与保护范围 | 原 main 保持 43dd7bdc 且 clean；专项分支本地提交，不推送/合并/安装 |

最终审查发现 Pi 会在首次 assistant 消息前延迟创建日志，也会在 append 失败时留下内存条目。因此仅检查内存分支会错误确认送达。新增两条真实 Pi 回归先复现失败，再加入只读磁盘日志核对；回执必须同时属于当前分支并已写入磁盘，不调用可能改写文件的 SessionManager.open。未确认的结果仍保留在 outbox。

## 后续二次审查

首次提交后的复核、补充修复及用户授权的本地 main 集成另记于 [第二轮审查](2026-11-04-unified-orchestration-second-review.md)；以上数量与 Git 状态保留为首次交付时点的记录。
