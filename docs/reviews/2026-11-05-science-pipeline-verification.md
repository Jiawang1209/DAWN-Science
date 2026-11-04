# 正式提交、科研流水线与轻量观测：实施及审查

日期：2026-11-04 至 2026-11-05（Asia/Shanghai）。基线 5c88414e，专项分支 codex/science-pipeline，隔离工作区 `/Users/liuyue/.codex/worktrees/dawn-science-pipeline-20261104/dawn-science`。

用户要求方案后创建 /goal 并执行前两项：正式结构化结果提交、可恢复科研小流程，同步轻量观测，尽量复用契约、路线、证据与恢复机制；完成测试与代码审查，不推送、不发布。本次未授权新的提交/合并，按仓库约定保留可审阅 diff，main 不变。

## 最终实现

- TaskSubmission 共用原 TaskResultSchema/acceptTaskResult；invalid 可当轮修正；accepted/合法 blocked 封存结果与证据。活动工具/授权未排空时不能提交，成功后所有后续工具受终结门约束。tool 模式父端也要求实际宿主提交标记，文本 JSON 不能绕过。
- 保持旧契约兼容，增加 data-summary/model-metrics/review 三类有界载荷。科学核查/审阅必须逐个真实读取声明文件，并引用本轮 read callId。
- 普通 Pi、后台/续问、旧 Team 和持久 Bot 共用提交与观测；真实 Pi 使用公开 shouldStopAfterTurn，在成功提交后结束本轮。Bot 在原后端产物占用内复核验收。
- 固定 check→analyze→review，明确 revise 时至多 0–2 次修正。作为 Team reducer 推进，不另建执行循环。创建时冻结三阶段契约/范围，保留路线快照和既有 attempt/DAG/共享准入/恢复；不允许通用 Team 入口修改活动流程。
- 首次创建先持久后调度，异步目录查询后再次同步核对请求身份、当前团队和取消。指针原子保存，异常中间态保留 interrupted。重开不重放，显式恢复保留 accepted 阶段；未知效果先核对并 acknowledgeInterrupted。最多 16 个阶段尝试，耗尽明确 blocked。
- 复用共享 BotOutputLocks；科学只读核查/审阅预约声明输入，直到宿主验收结束，协调已接入的任务写者。
- 路线仅在原身份/版本匹配时按 accepted 阶段事实写回，来源标记去重；新路线不被覆盖，冲突明确显示。公共协议升至 8.41，排除内部冻结 settings。
- observation 随 done/Outcome/meta/task 保存，状态工具聚合，团队面板显示。只统计宿主 elapsedMs、提交/格式退回和实际新增 assistant usage；缺失保持未知/partial，无费用估算或遥测上传。

## 实质审查发现及修复

实施主线自行审查，并按 requesting-code-review 技能安排一个只读 reviewer；reviewer 不修改代码，不再分派。以下问题均以确定性临时状态或真实本地入口复现后补测修复：

1. **并发启动覆盖冻结定义（P2）**：模型目录 await 前去重不足，同请求不同内容可双成功并覆盖。改为 await 后无异步间隙的第二次准入检查；不同请求也受当前团队互斥约束。
2. **等待目录时取消仍启动（P2）**：信号只在进入工具时检查。改为传递信号并在写入/调度前复核；调度异常请求停止，不留下静默 running。
3. **写快照、保存指针、发快照之间的孤儿流程（P2）**：重试只返回旧 running，既未关联也无法 resume；实际 Native setter 还先改内存、吞保存错误。现在指针 tmp+rename 成功后才发布内存，失败报错；同步异常窗口写 interrupted，孤儿重试关联并恢复检查点，仍不自动执行。回归包含真正的 current 路径为目录导致 rename 失败、onChange 抛错。
4. **初始核查中断后引用旧失败依赖（P2）**：恢复核查成功后分析仍依赖首个失败核查。改取最新 completed+accepted 核查，其回执与依赖一致。补 reducer 回归；真实重开验收另覆盖分析中断。
5. **只读审阅与已接入写者没有协调占用**：复用原锁预约科学 readonly inputs，持有到验收后 finally 释放。锁回归先确认旧行为红灯，再验证排队、别名和取消既有路径。
6. **观测恢复遗漏与部分总量**：后台初次失败结果也保留已有 observation；整阶段缺 usage 时聚合标 unknownUsageTasks，并将可见总量标 partial。未收到 done 的被杀尝试仍可没有观测，不补造。

7. **有真实进展时仍被重复调用守卫中止（P2）**：主会话逐阶段 status→team_wait，在五阶段返工流程中因相同 status 参数累计五次被原守卫 abort。真实子进程红灯复现后，改为仅在持久 pipeline 身份/stateRevision 变化时重置守卫；纯读取和 working 快照不重置。真实等待流程及原守卫回归通过。

Reviewer 独立运行三个对应恢复回归全部通过，另核对 20 项针对性验证；最后实际运行原 StuckGuard 与流水线边界测试，2 文件/18 项通过，未发现新增阻塞问题。验证包含 0/2 次修正与 16 次阶段尝试上限。

## 验证记录

最终固定源码的验证结果：

- `npm run typecheck`、`npm run build` 通过；构建保留原有 eval/chunk 提示。
- `npm test -- --maxWorkers=4`：608 文件全部通过，6120 项通过、11 跳过（共 6131），205.91 秒；保留既有 jsdom canvas 提示。
- Electron 15 场景全部通过，48.9 秒；与最终完整单测串行运行。
- 真实 Pi 与原守卫专项 2 文件/14 项通过；恢复/启动/锁边界专项 4 文件/26 项通过；Workbench/SQLite Bot 及其他适配验收 4 文件/18 项通过。
- 56 个变更代码、测试和夹具的 SHA256 清单无漂移，diff 空白检查通过；主目录仍为干净 main@5c88414e，未提交、合并、推送或发布。

完整单测先前一次在既有 remote-terminal 测试 afterEach 等待 PTY 退出时超过默认等待，当时与 Electron 并行运行。保留原失败输出 `unit-with-pty-cleanup-timeout.txt`；未修改该测试或远端终端代码，单独复跑 19 项通过，最终串行验收的全套也通过。仅记录观察，不声称消除了该既有时序波动。

原始输出保留在 [证据目录](../validation/science-pipeline-20261104/)。带 red 的文件为刻意失败复现；progress/pre-review 不代表最终通过。`progress-guard-green.txt` 曾写错原守卫测试路径，只运行两个匹配文件；`progress-guard-final.txt` 已使用正确路径覆盖真实 Pi 和原守卫，reviewer 也独立验证。

已完成的真实本地覆盖：

- Pi 子进程：正常交付、一次审阅返工、数据核查阻塞、分析中断→停止排空→宿主重开→拒绝无确认重放→显式确认恢复；保留已验收核查和冻结设置。
- Workbench + SQLite + 持久 Native Bot：旧最终 JSON 与新 tool 模式两条路径；实际写入、封存结果、token 回执和 Bot 结果持久化。
- Electron：新流水线三场景以及旧普通子任务、chain、Team、Bot、后台编排、契约和缺输入路径。严格公共快照被实际 UI 消费。

## 实际边界

只用临时/合成数据和确定性 localhost 模型。没有真实服务商成功率、费用对照或科学正确性结论。科学审阅为不同执行者的只读判断，不等于独立统计验证或发表认证。

产物锁仍是已接入写者之间的进程内协调，不能约束人工编辑、未接锁的主会话工具或其他进程；workspace-exec 不是路径沙箱。没有远端严格验收、通用脚本工作流、任意 JSON Schema、跨进程租约或实时 Steer。未运行原生 Windows/Linux 清理验收，未推送、发布、替换已安装应用或改动用户科研数据。
