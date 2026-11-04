# 子任务契约与执行范围验收

日期：2026-11-04（Asia/Shanghai）。基线 d99d9e95；分支 codex/subagent-task-contracts。隔离工作区 /Users/liuyue/.codex/worktrees/dawn-task-contracts-20261104/dawn-science。原 main 与已安装应用、真实会话和科研数据未改。

以上及本文 Git 状态为首次交付时的记录；用户随后授权二次审查、本地提交与合并。最新结果见 [二次审查与本地集成](2026-11-04-subagent-task-contracts-rereview.md)。

## 交付与复用

- 固定 version=1 任务契约，inputs/outputs/access/requireExecution/requireReview。普通同步、parallel/chain、后台、续问、旧 Team 与本地托管 Bot 使用同一设置/验收词汇。旧文本调用保留；严格远端契约明确拒绝。
- execution、verification 和相对路径 schema 从分析路线原定义导出复用；宿主验收复用 validateRouteEvidence 与 routeDeliverableEvidence。accepted 不等于科学正确；文件 exists 与本轮 observed 分开，必要执行/审阅状态不足时阻塞，下游不自动启动。
- 普通子级在现有 Pi 工具工厂外装配冻结门；既有 parent gate 可继续收紧。read-only 拒绝执行/写入；workspace-write 仅可写声明文件，拒绝 shell、输入覆盖、越界、符号链接和输入硬链接别名。窄范围也不能通过队友消息转交执行。
- 权限档、工具范围与契约随身份/任务保存，普通运行元数据保留可恢复副本；恢复时不扩大权限，不用未知/冲突状态覆盖记录。取消和未知副作用保持不自动重放。
- 复用 BotOutputLocks 的同一进程共享实例和规范化路径，占用贯穿普通子进程、旧 Team 和 Bot。类型化写入按声明路径占用；允许 shell 或写集合未知时保守独占目录；真正退出与验收结束后才释放。
- Bot 的严格验收在 backend 的产物占用内完成；接回 scheduler 时不重复放行或丢失回执。验收成功的结构化文件列表再经原 Bot 产物核验入口提取。
- 公共契约/回执 schema 放在无 Node 依赖的协议模块；协议 8.40 的 Team 快照只带公共契约和回执，不带内部 settings/taskSettings。原 UI 与事件路径复用。

## 红绿测试与审查修正

基线：35 文件 / 252 项通过。新增用例在实现前复现了缺失能力，随后逐项实现与验证。覆盖契约格式/路径、无实际证据的完成声明、缺失/未声明产物、阻塞、要求执行/审阅、冻结设置重开与不可扩大、只读/限定写入、真实工具和 shell 执行观察、共享占用与排队取消、真实进程关闭、恢复旧运行索引以及 Native/Bot/Team 接线。

审查中另发现并修正：

1. 结构化最终输出必须取最后一条 assistant 文本，不能混入中途叙述。
2. 已报告执行失败/审阅问题的结果不能作为 accepted 放行下游；调用方要求的执行/审阅状态也必须满足。
3. 声明输入的硬链接别名也可能被覆盖；使用 dev/ino 核对补充真实路径检查。
4. 冻结 scope 必须与契约一致，窄范围工具集合不能混入执行工具。
5. 新索引缺失时，普通 meta 中的原设置必须恢复，不能退回更宽默认范围。
6. 带原始 evidence 的 Team 后端结果不能直接交给严格 Outcome 持久 schema；验证后只发布公共回执及结果。
7. 真实 Electron 发现内部 settings 被传入严格 UI 协议，导致团队快照拒收；新增纯投影与协议回归，公共字段仍保留。

8. 声明输入未就绪时，合法最终 JSON 也不能放行。补启动前输入文件检查和验收复核，缺失/越界/非文件输入返回 blocked，子进程和模型不启动。

9. Bot 的已结算任务重建待送队列时也必须携带宿主回执；补真实后端/SQLite 重开回归，恢复消息保留回执，不重跑任务。

一轮完整测试在协议版本调整后仅旧版本断言失败（8.39 → 8.40），已同步说明与断言，没有放宽兼容规则。真实占用测试的首次夹具误把 /var 路径与规范化 /private/var 路径混用，修正为与实际 Bot 调用相同的 canonicalOutputPaths，并补充 finally；仅清理了本用例留下的自有进程。

依仓库单主线约定，本轮自行按 requesting-code-review 检查项复核，未宣称独立第三方审查。检查了权限快照、真实工具装配、结果入口、锁顺序/释放、取消和迟到结果、旧记录、协议消费方及真实 UI。

## 验证结果

最终源码：601 个文件全部通过，6070 项通过、11 项跳过（6081 项），148.53 秒；相对本次基线新增 28 项回归场景。类型检查、构建与 diff 检查通过。

- 19 个独立 Electron 场景通过。主路径组合 18 项通过；新增输入未就绪场景后，最终源码上的契约与 Bot 重点 5 项再次通过：新普通子任务/旧 Team 契约场景，以及既有 subagent、后台、Bot 协作、待回答问题、用户续问和重开。
- 构建通过；保留既有 direct-eval 与大 chunk 提示。单测保留既有 jsdom canvas 未实现提示。
- 测试仅用本地确定性模型与临时数据；真实走 Pi、文件、子进程、Electron 和持久回执，不调用服务商，不运行真实科研数据。

## 能力边界

1. schema、文件和工具证据通过不等于独立科学验收；实际方法、数值和结论需要另行核验。
2. workspace-exec 复用现有权限规则，不是 OS/网络沙箱；shell 无法可靠按声明文件集合封闭，因此保守独占工作目录。
3. 锁只协调已接入的子任务写者；不阻止用户编辑器、未接入占用的主会话写操作或外部进程，也不提供读取一致快照。
4. 本轮严格契约覆盖本地后端；远端新契约明确拒绝，原有远端文本路径不在新增范围保证内。原生 Windows/Linux 真机清理未验证。
5. 固定科学任务回执尚非任意用户 JSON Schema 引擎；本轮不实现条件工作流、Steer、外部子 agent provider、跨进程租约或真实模型收益评测。

## Git 与证据

本轮先保留专项工作区的可审阅 diff，未自动提交或合并，未推送、发布或替换安装应用。原 main 仍为 d99d9e95；不修改既有专项分支与历史。此前提交/合并的记录保留。

证据（输出只去除行尾空白和末尾多余空行）：

- [完整单测](../validation/subagent-task-contracts-20261104/unit-final.txt)
- [类型检查](../validation/subagent-task-contracts-20261104/typecheck-final.txt) / [构建](../validation/subagent-task-contracts-20261104/build-final.txt)
- [Electron 主路径 18 项](../validation/subagent-task-contracts-20261104/electron-core.txt) / [最终契约与 Bot 5 项](../validation/subagent-task-contracts-20261104/electron-final.txt)
- [真实进程占用/取消回归](../validation/subagent-task-contracts-20261104/lock-lifecycle.txt)
- [UI 协议故障复现](../validation/subagent-task-contracts-20261104/ui-protocol-red.txt) / [输入检查红灯](../validation/subagent-task-contracts-20261104/input-red.txt) / [Bot 恢复回执红灯](../validation/subagent-task-contracts-20261104/bot-receipt-red.txt)
- [已验证源码 SHA256](../validation/subagent-task-contracts-20261104/tested-source-sha256.json)：38 个 src/tests/e2e 变更文件；最终核对无漂移。
