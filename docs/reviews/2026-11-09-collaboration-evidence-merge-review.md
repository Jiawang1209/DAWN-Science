# 协作台与评测能力：再次审查及本地集成

本轮用户明确授权：再次审查、修复补测试，无阻塞后本地提交并合并main，不推送、不发布。基线main899463dd，工作分支codex/collaboration-evidence-20261108。遵循长期路线图单线执行，本次是代码自审，不冒充独立审查者。原始148次模型试验不重跑，本轮新增真实请求0。

## 发现并修复

1. **旧直接命令静默失效。** evaluate-research-fixture改为导出函数时丢失直接入口。原命令退出0却没有产物。恢复直接执行判断、显式输出参数、独立research-fixture-*目录和报告路径输出；import不启动评测。缺参和真实六题CLI用例先失败后通过。
2. **失败夹具可以成功返回。** 原直接脚本检查qualifiedPairs，新函数仅返回报告，新增统一入口也会打印JSON后退出0。现在由共享函数检查预期合格配对，不达标抛错；报告、请求门和清理都保留。验证失败报告拒绝返回、原报告保留、inFlight=0。
3. **离线命令取消没有接入排空。** 用实际分离Pi子进程复现SIGINT父进程直接被信号结束。两个命令共用runResearchFixtureCommand，将SIGINT/SIGTERM传给既有research runner；等待原有子进程/请求排空和报告落盘再退出。新增真实PID树用例核对退出码、旧执行PID消失、cancelled记录与inFlight=0。没有修改1500/4000ms收尾阈值。

red/green日志位于docs/validation/collaboration-evidence-merge-review-20261109。旧真实模型结果属于原冻结候选；上述修复仅离线命令入口及其结果/取消处理，不冒充新模型收益。

## 逐项审查

| 检查点 | 源码与验收 |
|---|---|
| 方案执行绑定 | NativeRuntime.answerPlan/executeApprovedArrangement校验owner、plan/version、归档SHA、团队指针和当前分支；重复开始幂等，编辑/撤销分开。tests/runtime/approved-plan、tests/team/approved-plan与真实Electron批准方案路径 |
| 权限冻结 | freezeApprovedPlan克隆执行者与TaskSettings，检查契约文件一致、独立只读审阅、工具能力、符号链接/共写/输入依赖和输入版本；批准后改名册不改变执行。新UI只消费plan.status，没有新调度或权限门 |
| 会话/执行代次 | requester显式owner与isCurrent检查；Advisor按sessionId挂载；工具详情按session/task/attemptId挂载；原始记录/任务结果继续沿既有宿主作用域。阶段用量按team/task/attempt/attemptId去重 |
| 取消排空 | Runtime停止代在await前改变，批准流程signal+guard阻止迟到启动；新离线入口复用同一runner abort/drain，最终采样计数和usage后关闭门。Core取消/接收/用量回归和实际CLI SIGINT |
| 恢复 | 批准方案恢复先暂停，已中断副作用不自动重放，继续前核对外部输入及前驱产物验收版本；持久记录核验期间变化会拒绝覆盖。tests/runtime/approved-plan、team/recovery、subagent/task-recovery |
| 产物占用 | 未改BotOutputLocks或scheduler；冻结路径别名/嵌套/共写拒绝，实际锁等待与取消仍由原机制处理。56项相关Electron含锁等待、版本变化与恢复 |
| 旧入口 | 普通方案、ACP拒绝原因、Bot协作/反问、subagent过程/续问、两种终端、旧CLI与新增统一CLI。新增修复对缺参/失败/取消不会伪报成功 |

## 验证与限制

专项5项已通过，typecheck/build退出0；源码冻结后正在执行同一完整Vitest集合（maxWorkers=4，保留原超时），随后相关Electron与main构建/冒烟。最终数字在下方追加，以原始日志为准。

历史7350/20690ms退出、长Bot/MCP收尾、PTY及旧宿主重载截图失真继续OPEN。上轮默认并行24组长测试60s超时也保留跟踪；不因本次正常退出关闭历史问题。上轮真实试验的模型提交摩擦继续保留，没有降低正式验收或追加真实请求。

正式配置/凭证/数据库只核对哈希；所有桌面和命令验收使用独立自制工作区。旧证据不覆盖。源分支和工作区保留，本轮仅本地集成。

## 合并前最终验证

712个Vitest文件7057通过/11跳过（4worker，266.19秒），typecheck/build退出0；56项相关Electron全部通过（4.6分钟），含MCP流取消、向导/旧状态、普通/ACP方案、Bot/subagent、版本/恢复与两类终端退出。全量后仅把新增CLI测试的路径断言改为平台原生basename，3项直接CLI用例再次通过；应用代码不变，差异与最终冻结另存。实际旧命令运行另留legacy-cli-demo，六题6合格配对。正式profile及main再次核对不变。历史退出/PTY与默认高并行长测试超时仍OPEN，阈值不变。

## 本地集成及 main 复验

代码提交 `e57d6b66` 已从 `899463dd` 快进到本地 main，无冲突。main 重新构建、类型检查退出 0，4 项 Electron 冒烟通过（17.1 秒），覆盖批准方案执行及展开返回、单块自动安排、旧跳过状态与可用模型入口。1666 个冻结源文件逐一核对无差异；正式配置、凭证、数据库哈希与基线一致。

main 隔离演示使用 localhost 模拟模型（11 次模拟请求，0 次真实请求），Electron/文件工具/契约与版本验收实际执行：3 项宿主验收通过、clean.csv 与 model.csv 两个验收产物；展开流程工作台后 Escape 返回成功。实际截图为 main-approved-arrangement.png、main-expanded-overview.png、main-conversation-demo.png。未推送、发布或替换安装版；专项分支与 worktree 保留。历史偶发退出超时、Bot/MCP 长收尾、PTY 清理和默认高并行长测试超时继续 OPEN。
