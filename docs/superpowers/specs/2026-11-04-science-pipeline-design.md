# 结构化提交与可恢复科研流水线设计

基线：5c88414e。用户明确要求先制定方案、创建 /goal 并直接执行第 1、2 项，同时补轻量观测。专项工作区 /Users/liuyue/.codex/worktrees/dawn-science-pipeline-20261104/dawn-science，分支 codex/science-pipeline。遵循仓库单主线；保留可审阅 diff，不推送、不发布或替换安装应用。

## 方案选择

选择现有契约 + Team 状态机的增量方案：普通子进程与持久 Bot 共用提交状态；Team 继续拥有 attempt、依赖、调度和落盘；分析路线提供已确认的目的、案例与版本，完成后按版本核对投影结果。

另两个方案是仅加强最终 JSON 提示词（不能在本轮修正坏格式，也不能可靠冻结提交后的工具），以及独立 JavaScript workflow 引擎（重复调度/恢复，扩大执行面）。本轮不采用这两种方案，不引入任意脚本、任意 JSON Schema、自动科学方法选择或无限自我修正。

## A. 结构化提交

- 增加任务控制工具 submit_task_result，参数复用 TaskResultSchema。宿主复用 acceptTaskResult 检查实际工具证据、输入及产物；invalid 返回可修正的工具错误，当前轮继续，不重跑整个分析。
- accepted 或有合法阻塞/审阅问题的 blocked 回执一经提交，保存不可变快照并关闭本轮后续工具；重复提交、提交后写入/执行/队友消息、授权等待结束后迟到的调用均拒绝。工具在执行时登记活动计数，有其他调用未排空时拒绝提交，避免尚未完成的写入越过验收。
- 新契约可指定 submission: "tool"；该模式必须有成功的宿主提交，不能用最后一段 JSON 绕过。旧契约继续兼容原最终 JSON；存在真实提交时优先使用已提交快照。普通同步/后台/续问、旧 Team 与本地 Bot 均接入；严格远端能力继续拒绝。
- 增加有限 resultType 与 data：data-summary（行数、列描述、问题），model-metrics（方法、有限数值指标、样本数、说明），review（pass/revise/blocked、具体意见、审阅文件）。未指定类型的旧结果仍可读。模型不能填写 host metrics。
- review 要求真实读取声明的审阅文件并引用实际 read callId；revise/blocked 需要具体意见。格式正确、工具执行及文件存在均不证明科学结论正确。

## B. 固定科研流程

- 新增 start_science_pipeline、science_pipeline_status、resume_science_pipeline、cancel_science_pipeline。主会话需要已存在的分析路线与精确 routeId/revision/stepId；snapshot 冻结该步骤目的、用户选择的案例及数据背景。
- 调用明确提供输入/输出文件、核查/分析/审阅三个执行者（现有 agent 或 Bot）、分析任务要求和 maxRevisions（0–2，默认 1）。核查和审阅只读，分析沿用冻结执行范围。审阅与分析须不同执行者，避免同一子会话冒充独立审阅。
- 状态流：check → analyze → review → delivered；审阅明确 revise 时，至多 maxRevisions 次创建新的 analyze/review 任务。缺输入、未知失败、invalid、需补资料、审阅 blocked 或次数耗尽都转 blocked，不放行交付。
- 每阶段复用加任务、领取、attemptId、共享准入、产物占用、宿主回执与结算。每次推进与新任务创建在同一次 team.json 原子写入中完成；失败的旧审阅任务保留，新修正任务不依赖已失败审阅节点。
- Team 的 pipeline 字段保存版本、requestId、冻结定义、路线快照、当前阶段/轮数、全部阶段任务 ID、状态/原因与时间。相同请求重试只返回原记录，不重新执行；同 requestId 不同内容报冲突。
- 用户取消立即关闭准入、请求停止并持久 cancelled；旧结果继续受 attempt/信号保护。宿主重开后 pipeline 记 interrupted，不自动执行。显式 resume 复用已 accepted 阶段；尚未开始的任务可继续。结果不明的中断尝试必须显式 acknowledgeInterrupted 后新建尝试，不伪装无副作用重放。blocked 不自动重试，用户可取消并在补齐条件后另建流程。
- 活动 pipeline 通过专用控制入口管理；通用 Team 改任务/转派/加减成员/派消息不能绕过冻结定义。原 Team 无 pipeline 时行为不变。阶段尝试总数上限为 16，耗尽明确受阻并保留最后检查点。
- 成功投影到原分析路线只在版本仍匹配时进行；保留原路线字段/案例，加入子任务回执来源和交付事实。版本冲突保留新路线并明确显示 conflict。跨 team/route 文件写入用稳定 pipeline 标记去重，重开不重复添加历史。路线投影不改变产物或声称科学认证。

## C. 轻量观测

- 每个后端轮次记录宿主测得 elapsedMs、提交尝试数与 invalid 次数；token 从现有 sessionUsage 的实际新增 assistant 记录读取，缺失字段省略/标 partial，不用 0 或费用估计冒充观测。
- 观测随子进程 done、编排 Outcome、运行元数据与 Team task 保存；pipeline_status 从阶段记录聚合任务数、修正轮数、验收失败、可见 token、不可见任务数与整体经过时间，不另建数据库或上传遥测。
- 公共协议只投影展示事实，不输出内部 settings、完整冻结执行配置或凭据。复用现有团队快照与界面；状态工具提供详细本地观测。

## 验收与边界

先红灯后实现，覆盖提交校验可修正、终结不可重开、并发/授权窗口、三种后端接线；流程顺序、审阅返工边界、无证据/文件缺失、请求去重、取消、部分写入/重开、显式恢复、路线冲突及观测缺失。运行真实本地 Pi/子进程/SQLite/文件/Electron，随后类型检查、构建、全量单测与代码审查。仅使用临时/合成数据和确定性模型，不调用真实服务商或真实科研数据。

本轮不提供 OS 沙箱、跨进程租约、远端严格契约、任意脚本工作流、实时 Steer 或自动方法选择。是否科学正确、真实模型成功率及耗费收益仍需独立任务评测。计划执行完毕后保留准确测试证据和已知限制。
