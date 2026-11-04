# 统一编排与子任务契约全链路复查

日期：2026-11-04，Asia/Shanghai。起点：本地 main `dbf4e26b`。用户要求“从头到尾，再检查一下”，沿用本轮已明确的发现问题修复补测、验证后本地提交合并、不推送不发布的范围。

按仓库单主线约定自行复核，不宣称独立第三方审查。隔离分支 codex/orchestration-e2e-review，工作区 /Users/liuyue/.codex/worktrees/dawn-e2e-review-20261104/dawn-science。保留此前专项分支、记录及工作区。

## 需求到入口的核对

| 能力与不变量 | 实际入口 | 本轮复核重点 |
|---|---|---|
| 普通子任务、Team、Bot 共享父级准入；单身份串行 | orchestration/service、executor、scheduler | 容量、排队取消、epoch、close 排空、成员身份代数 |
| 后台协作沿用转录，消息持久去重 | orchestration/mailbox、subagent/orchestration | 新 requestId 才解除暂停；不把持久排队称实时 Steer；旧续问不回写主结果 |
| 结果先落盘、投递后按真实父历史确认 | orchestration/delivery、runtime/orchestration-receipt | 当前 Pi 分支和磁盘双确认；停止/回退代数；父忙与补送 |
| 契约验收只取最终答复，文件和真实执行证据均核对 | task-contract、child-task、Bot backend、Team 结算 | 输入未就绪不启动、JSON、声明输出、执行/审阅证据、阻塞与下游门、队长接手 |
| 权限和工具范围不能被续问或定义扩大 | task-tools、child、team/runner、Native 外层门 | 内置工具与 RPC 均经过门；本地 Bot 冻结范围；原始路径和声明输入保护 |
| 子任务写者共享占用，后端清理与验收后释放 | bot/output-locks、executor、scheduler、backend | 规范路径/硬链接、独占与不相交并行、Bot idle 先于清理的时序 |
| 重启对账，不自动重放未知副作用 | store、run-dir、team/recovery、bot/recovery | interrupted、回执与冻结设置、部分索引、损坏记录、已完成结果补送 |
| UI 消费公共事实，旧流程仍可用 | taskTeamSnapshot、events、现有 chip/坞/Bot 展示 | 无内部 settings 泄入严格协议；single/parallel/chain、旧 Team、Bot 交流、用户续问及重开 |

核对原始设计、实施计划、两阶段审查记录、生产接线和相应测试，未把设计文档或旧测试结果直接当作当前行为证明。

## 本轮发现并修复

1. **P1 · 托管 Bot 把中途说明混入最终契约 JSON。** 普通子进程已取最终 assistant 文本，Bot runBotTurn 仍拼接整轮输出。真实 Workbench 后端、SQLite、Native/Pi 和本地模型复现：write 前说一句话后，合法最终 JSON 被判 invalid。为严格 Bot 契约增加显式最终文本读取端口，复用实际 Pi 当前用户轮次中的最后 assistant 答复；中途说明仍保存在原转录。旧文本 Bot 维持整轮输出，原 64 KiB 边界不放宽。
2. **P1 · Bot 提前到达的 idle/exited 会在清理完成前释放执行所有权。** 取消、超时、输出超限三种路径均可能在 opts.abort 返回 Promise 前收到 idle，原处理器直接 finish。增加统一、幂等的停止阶段，等待 abort 和宿主 waitForIdle 的整段清理 Promise 完成；其间不因重复 idle/exited、再次 abort 或超时重复结算。停止失败仍保留原停止原因并报告错误，订阅和计时器随后释放。因此外层产物占用和统一准入也保持到真实清理完成。
3. **P1 · 队长文本结算可以跳过严格契约验收。** team_update_task 原先凭 attemptId 与文本就能将任务标 completed。成功结算现在要求宿主 accepted 回执，并与任务状态在同一次持久变更中保存；scheduler 将真实回执传入统一结算入口。尚无严格验收适配的 captain 任务声明/转派明确拒绝，旧无契约接手流程保留。既有 captain 严格记录不能凭伪造 JSON 文本放行，下游继续阻塞；明确失败和取消仍可处理。

三类问题均先复现再修复。本轮新增真实后端 Bot 用例、三个停止时序用例，以及声明/转派、状态结算、实际队长工具回归。此前的权限冻结、硬链接、普通回执恢复和部分索引保护继续纳入回归。

## 验证

最终固定源码的验证全部通过，本轮检查未发现剩余阻塞项：

- `npm test -- --maxWorkers=4`：602 文件，6088 项通过、11 跳过（6099 项），197.99 秒；本轮新增 7 项回归。
- 定向测试：45 文件 / 305 项通过，包含普通子进程、Team/Bot、持久恢复、真实 Workbench/SQLite/Pi 契约路径和停止时序。
- Electron：8 文件 / 22 场景通过（1.6 分钟），覆盖 single、parallel、chain、后台回送、旧 Team、严格契约、Bot 组队/持续交流/直接聊天、用户续问及重开。
- `npm run typecheck`、`npm run build`、`git diff --check` 通过。构建保留既有 eval/chunk 提示，完整测试保留 jsdom canvas 提示。
- 8 个变更源码/测试文件的 SHA256 清单在最终完整测试前后核对一致；运行中未修改源码。

证据：[Bot 红灯](../validation/orchestration-e2e-review-20261104/bot-red.txt) / [Bot 绿灯](../validation/orchestration-e2e-review-20261104/bot-green.txt)、[队长旁路红灯](../validation/orchestration-e2e-review-20261104/captain-red.txt) / [修复回归](../validation/orchestration-e2e-review-20261104/captain-green.txt)、[定向回归](../validation/orchestration-e2e-review-20261104/targeted.txt)、[完整测试](../validation/orchestration-e2e-review-20261104/unit.txt)、[Electron](../validation/orchestration-e2e-review-20261104/electron.txt)、[类型检查](../validation/orchestration-e2e-review-20261104/typecheck.txt)、[构建](../validation/orchestration-e2e-review-20261104/build.txt)、[已测源码](../validation/orchestration-e2e-review-20261104/tested-source-sha256.json)。

## 本地集成

沿用本轮已明确授权：验证通过后在专项分支提交，主目录干净且仍在预期基线时快进合并 main，随后在 main 重建并核对源码及关键回归。合并后结果另在本文补记；不拉取、不推送、不发布，不删除专项分支或隔离工作区。

修复已本地提交为 `6a3c2fe4`（fix(orchestration): close Bot cleanup and contract acceptance gaps），main 从 `dbf4e26b` 快进到该提交，无合并冲突。合并前主目录干净，合并后 main 的 8 个变更源码/测试哈希与已完整验证版本一致，src/tests/e2e 与专项分支无差异。

main 上再次运行完整构建、类型检查均通过，45 文件 / 305 项关键回归通过（7.34 秒）。本补记与合并后日志作为单独本地文档提交，不改变运行代码。此前各专项分支及隔离工作区均保留，未修改已安装应用或真实会话/科研数据。

合并后证据：[构建](../validation/orchestration-e2e-review-20261104/main-build.txt)、[类型检查](../validation/orchestration-e2e-review-20261104/main-typecheck.txt)、[关键回归](../validation/orchestration-e2e-review-20261104/main-targeted.txt)、[源码一致性](../validation/orchestration-e2e-review-20261104/main-source-match.txt)。

## 范围边界

严格契约当前覆盖本地普通子任务、Team 成员和托管 Bot；严格 captain 文本结算与远端严格契约明确不支持。workspace-exec 仍使用原有风险规则，并非 OS/网络沙箱。产物锁只协调同一规范工作目录、同一宿主进程中已接入的子任务写者，不提供输入快照或阻止外部编辑。测试使用临时文件与确定性本地模型；真实服务商协作质量、原生 Windows/Linux 进程清理和科学准确性未由此证明。实时 Steer、任意 JSON Schema、条件工作流及跨进程租约仍属后续独立能力，没有在本轮冒称完成。
