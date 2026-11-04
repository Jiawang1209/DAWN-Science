# 子任务契约、证据验收与执行范围设计

日期：2026-11-04。基线 d99d9e95；分支 codex/subagent-task-contracts；工作区 /Users/liuyue/.codex/worktrees/dawn-task-contracts-20261104/dawn-science。用户明确要求制定方案、创建 /goal 后直接实施；不重复开工确认。不推送、不发布、不替换安装应用、不自动合并。仓库默认不自动提交，本轮先保留可审阅 diff。

## 选择与目标

选择在现有统一编排和执行器上增加任务设置与验收层。仅依赖提示词不足以保证字段和范围；重写工作流/沙箱引擎会扩大回归面。复用 Pi 工具工厂、分析路线 execution/verification/deliverable 词汇及证据校验、BotOutputLocks，不另建任务调度器。

## 契约和验收

任务可带 version=1 的 contract：inputs、outputs（工作区相对文件路径）、requireExecution/requireReview（缺省 false）、access（read-only / workspace-write / workspace-exec）。新结构化派单默认 read-only；旧无 contract 调用保留文本接口，执行工具仍受父策略和占用保护。只读契约不允许 outputs；workspace-write 必须声明 outputs。inputs 是任务输入声明，不冒充逐文件读取沙箱；启动前要求这些文件已就绪，验收时再核对，缺失或无法安全核验则阻塞且不启动后端。

结构化最终答案为 JSON：summary、blockers、deliverables，以及复用路线词汇的 execution/verification。主机验证格式、声明路径、所引用的真实工具证据、文件状态以及调用方要求的执行/审阅状态，形成 accepted / blocked / invalid 回执。accepted 只表示本契约检查通过，不表示独立科学验收。文件存在、工具观察到写入、科学结论正确是三件事。被拒工具不能提供执行证据；无匹配证据的 completed/reviewed 声明拒绝。失败/取消/结构错误不自动重跑。

契约与冻结权限快照随子身份、任务记录持久化；后续消息沿用原范围，不能通过重新发送扩大。旧记录字段缺失可读；未知或畸形新字段明确拒绝且保留文件。主会话可见结果保留回执，不只保留成功摘要。普通同步、后台与续问走同一验收；旧 Team 与本地 Bot 的派单也复用。远端必须明确拒绝无法兑现的本地路径验收/范围能力，不检查本机同名路径。

## 执行范围和冲突

read-only 只装配只读工具与已有通信工具，不提供 bash/write/edit 或具有未知副作用的工具。workspace-write 只允许声明 outputs 上的类型化 write/edit；拒绝 bash 等不能按路径约束的执行。两档均检查真实路径、工作区边界、符号链接及 data/raw，拒绝输入文件覆盖。workspace-exec 沿用父权限快照和既有风险判据；需要额外批准的操作由子级拒绝并交还主级处理，不从子级扩大授权。主机可再施加当前父门限制。

这不是 OS 沙箱；workspace-exec 的 shell 仍可能有未声明副作用。显式说明此能力边界，不宣称逐文件隔离或网络隔离。项目 agent 定义不能扩大冻结权限；普通子级不开放嵌套委派。

复用同一进程共享的 BotOutputLocks，以规范化工作区作为本地冲突范围：只读无需写占用；workspace-write 锁定规范化的声明输出；允许 shell 或旧未知写集合保守独占整个工作目录。跨会话、普通子级、旧 Team 与 Bot 共享同一锁实例；读者不被承诺可获得一致快照。占用持有到后端真正退出及验收结束。排队取消不启动后端，失败/取消/关闭均归还占用；不引入跨进程分布式锁。

## 验收顺序

先测试契约解析、共享证据与文件核验；再测权限冻结、符号链接/原始数据/输入覆盖；再测共享占用、排队取消、恢复和三类后端接线。使用临时数据和本地确定性模型，执行真实 Pi/进程/Electron 主路径。完整单测、类型检查、构建、代码审查和证据归档后交付；不据 mock 结果声称真实模型成功率提升。

## 实施审查补充

公共契约和回执 schema 单列 src/protocol/task-contract.ts，避免 UI 引入宿主文件系统实现；内部冻结设置只留在持久任务记录中。产物占用只协调接入的子任务写者，不阻止未接入占用的主会话或外部编辑。完整证据和边界见 ../../reviews/2026-11-04-subagent-task-contracts-verification.md。
