# 交付引导、冻结集合与审阅预算合并复审

本轮明确授权：修复提交引导、冻结文件集合、审阅预算、取消排空和恢复的实际遗漏；验收及复审无阻断后本地提交并合并 main。不推送、不发布、不替换正式 App。复用专项分支 codex/delivery-efficiency-20261107，基线 81bf54a6。

## 发现、复现与修复

| 问题 | 原行为与证据 | 修复 |
|---|---|---|
| 响应背压取消 | 本地客户端 pause，res.write=false 后父 close 等待不能排空；boundary-red.txt 父关闭回归失败 | abort 同时销毁 ServerResponse，解除 drain 等待；正常 finally 先移除销毁监听再取消上游，避免截断正常数据 |
| 契约与版本引用 | 创建提交器后外部追加 inputs/清空 versions，会改变 schema/验收或丢掉绑定；boundary-red/snapshots-red | 构造时深拷贝 contract 与 versions |
| 证据封存漂移 | 异步内容核验期间清空/修改原证据，旧实现 accepted 但 sealedEvidence=[]；snapshots-red | 同一次深拷贝贯穿宿主验收、内容验收和最终封存 |
| 审阅文件重复 | schema 拒绝重复，但直接调用宿主仍 accepted；boundary-red | 宿主增加唯一性检查，仍要求完整冻结集合及真实 read |
| 持久 Bot schema | Bot 仍使用通用 schema，缺少本轮阶段及文件集合引导；bot-schema-red-confirmed | scope 进入后给 Pi declaration 与实际 AgentTool 同一份新 schema，finally 恢复。避免按 schema identity 缓存校验器沿用上一轮 |

新增 Bot 测试用实际 NativeRuntime + Pi + 本地推理夹具，捕获真正请求中的 tools；连续两轮文件集合 A 与 B/C、SDK 参数校验、setActiveToolsByName 刷新、异常、取消返回、停止重开后新阶段均得到正确 schema。它不是付费真实模型推理，不能据此认定模型提交已经稳定。

三路独立只读复审确认上述修复，无剩余可证实阻断；审查代理分别独立执行契约/Native 34 项、请求门/模型兼容 12 项，以及 Bot 新用例 2 项。代理未运行全量构建或真实外部 API。另离线普通响应 450000 字节、异步流 4194304 字节校验完整；最终验收仍以主代理保存的当前候选日志和源码指纹为准。

本轮只修复可达边界。Native 当前禁用扩展且不调用 SDK reload；执行期间主动替换 SDK 注册表未作为已验收功能。常规工具启停复用同一注册表对象，已有新增回归。未新建编排器，未放宽权限、产物锁、文件版本或恢复验收。

## 实测与历史边界

本轮不新增真实 API 请求。上轮 27 次真实请求、single accepted / multi failed 的原始报告仍保留于 [delivery-efficiency](2026-11-07-delivery-efficiency.md)。末轮引导修复和本轮修复均不能冒充那次实测结果，也未宣称多 Agent 整体提效。

历史偶发 Electron 关闭超时继续 **OPEN**。[历史跟踪](2026-11-07-electron-exit-investigation.md)。本轮请求门的背压遗漏是独立复现的评测层问题，不将其强行归因为历史 Electron 问题。不提高原等待上限，不更新视觉阈值或基线；故意 veto 退出测试的五秒诊断须单独标记。

## 验收与本地集成

证据目录：[delivery-efficiency-merge-review-20261107](../validation/delivery-efficiency-merge-review-20261107/)。完整构建、类型、Node/UI、串行 kernel、相关真实 Electron 与退出时间线，本地提交/快进和合并后检查将逐项记录。正式 App 配置、凭证和数据没有替换。


最终候选验证：完整构建、类型检查通过；653 文件、6459 项 Node/UI 通过，10 既有跳过；串行内核 12 文件、50 项通过、1 条条件跳过；27 项相关真实 Electron 通过，3.3 分钟。新增 Bot 工具刷新断言最后单独通过。原始输出全部保留。

退出记录：31 个宿主退出码均为 0；28 次同步收尾、3 次异步 drained，没有内层 drain-timeout/failure 或外层 fallback。但有两次非注入 still-waiting-5s：Bot 协作等待答复用例约 7.35 秒、slash Bot 派单约 20.69 秒才报告 OS child-close。两例在此前已记录 shutdown-sync-complete 和 Node process-exit，故当前只能把延迟区间定位于应用退出事件与 OS 退出通知之间，不能据此判定原因。五秒时进程仍活着，采样因命令上限未取得有效堆栈，原始诊断保留。另一次五秒等待来自明确的 before-quit-veto 故障注入，单独标记。

停止其他回归后，对两条实际出现延迟的用例各单独复测一次：2 项通过，关闭分别约 136.8ms、147.9ms，无再次告警。复测不能抹掉首轮延迟，历史问题继续 OPEN。本轮请求门响应背压修复不冒充该退出延迟的根因修复。

本地集成按用户授权进行：候选源码和子进程构建逐个校验无漂移，仅本地 commit + ff-only main，保留专项分支/工作区。合并后再核验主分支源码、构建/类型及相关回归；具体提交和最终主分支状态以 Git 及本轮交付消息为准，不执行远端动作。


本地集成已完成：功能提交 `c5d4d568028fc4626557c79dd919514c8f268256`，从 81bf54a6 快进到 main。主分支重新完整构建、类型检查通过；21 项定向 Node 测试和 10 项 Electron 通过。8 个实际 Electron 宿主退出码 0，此轮未记录新的五秒等待。当前候选源码均与主分支一致；子进程构建的 SHA 不同，经逐字比较仅因工作区 node_modules 软链接造成 esbuild 模块路径标签不同，规范化标签后全部相同，不声称原二进制逐字相同。[合并后证据](../validation/delivery-efficiency-merge-review-20261107/main-verification/verification.json)。截图 task-timeline-during-review.png 为主分支实际桌面、分析阶段已验收且右侧轨迹可联动工具/产物；抓图时概览仍显示审阅处理中，不把该帧宣称为三阶段完成截图。模型推理为本地夹具。

验证后 main 与专项分支工作区均干净，未推送、未发布。补充本段与验证日志仅记录已有结果，不更改产品代码；专项分支与工作区继续保留。
