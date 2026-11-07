# 协作工作台复审与本地集成

## 授权及范围

用户明确授权：再审查会话隔离、状态准确性、展开返回和旧功能入口，修复补测试，无阻塞后本地提交并合并 main，不推送、不发布，展示实际效果，历史偶发超时保留跟踪。沿用codex/evidence-evaluation-20261107工作区；组合候选包含上一轮尚未提交的代表性任务评测/证据交接，以及对话协作台/流程工作台。

## 确认并修复的问题

1. **Team身份未绑定。** 旧task:t1选择可能在同一会话新Team的t1上自动生效。现在任务键包含teamId和taskId，默认任务板与展开DAG统一使用，外会话Team仍拒绝混入；新团队不会继承旧任务选中。
2. **保留结果被当成本轮结果。** 原协调器续跑时保留上轮result/observation，界面曾将其计为本轮accepted、tokens和产物。显示层现在只在可确认的结算态使用本轮回执；在途、排队取消、中断均不冒称旧验收通过。原结果和额度账本不删除、不改调度；用量引导查看会话额度，历史版本留在记录页；阶段耗时明确为累计结算。真实OrchestrationService第二代执行回归证明store仍保留上次accepted，而新一代显示计数为0。
3. **原生modal阻断旧命令/文件入口。** ⌘K曾在inert背景打开不可输入的命令面板。现在展开时由文档捕获监听协调原K/P/G组合键：先退出展开，再进入原入口，卸载移除监听；组词时只阻止这些组合键进入背景，不阻止输入法默认动作。IME辅助函数仅类型放宽，原组词判定逻辑不改。
4. **详情关闭后的焦点遗漏。** 新增真实桌面往返测试发现，从旧子对话返回并收起详情后焦点可能落BODY，使只挂dialog的键盘捕获失效。现在收起详情先返回所选成员卡/任务图/网络节点，文档级捕获也覆盖临时BODY目标。普通⌘K、IME、⌘P、Esc与子转录往返均实际验证。
5. **旧入口引导及验收路径。** 无Team时恢复原/team提示；旧Team管理仍在显式展开入口中。原Team/侧边Team用例补上该点击步骤，原依赖、成员模型、任务输出、磁盘记录、侧会话归属等断言全部保留。

独立只读reviewer复现并复核Team键、modal/IME及焦点问题；最后2文件16项测试与Chromium实际组件检查通过，未发现剩余P1/P2阻塞。实现者另验会话迟到回复、共享轮询、主/侧会话隔离、历史态、取消排空和旧预算/子对话入口。

## 最终验收

证据根：docs/validation/collaboration-rereview-20261107。

| 检查 | 结果 | 原始证据 |
|---|---|---|
| Node/UI完整复跑 | 646文件，6386通过，10既有跳过；最多4worker，未放宽超时 | full-unit-final.log |
| 真实内核 | 12文件，50通过、1条件跳过；优先/usr/local/bin | kernel.log |
| 类型检查 | 通过 | typecheck-final.log |
| 全构建及UI重建 | 通过 | build-final.log、build-ui-final.log、build-frozen.log |
| 最终真实Electron | 53个场景全部通过，4.5分钟 | desktop-frozen.log |
| 退出 | 62次native/管道退出核对正常，0清理错误、0意外watchdog | exit-summary.json、timelines.md |
| 源码/测试候选 | 57文件，零漂移（组合两轮改动） | candidate-manifest.json |
| 正式文件 | providers.yaml、credentials.json、dawn.db SHA前后相同 | formal-before/after.json |

桌面覆盖：8项真实子执行/锁等待、搜索筛选与窄窗口、旧子转录往返/续聊、IME/命令/文件/审阅入口、Esc/焦点、主会话切换及重启、主侧对话/侧Team归属、原Team/依赖/模型/任务结果、后台结果回传、v1/v2交接冻结、预算限额/取消排空、科研流水线通过/纠偏/受阻、结构化契约、Bot重试与主任务退出。

模型响应使用既有本地mock，但Electron/Pi/进程/落盘/锁是真实链路；本轮真实API请求为0。上一轮30次API额度及零完整配对的结论保持，不据UI或离线通过宣称科研质量收益。未声称完整桌面全套、跨平台、签名安装或正式升级均已验收。

## 失败与历史跟踪

原红灯与失败截图/trace全部保留。空态引导先在旧真实Team测试复现；首轮广泛桌面52通过/1失败，定位为侧Team用例未走新展开入口；适配入口后保留所有原语义断言。新增旧子转录往返又暴露BODY焦点分支，先失败后修复，最后完整53通过。没有删用例、改视觉基线或提高超时。

上一轮未修改远端PTY清理期1000ms等待失败、一次约11.8秒Electron原生/管道关闭延迟，以及更早Close context timeout/页面提前关闭继续开放跟踪。本轮正常退出不构成历史根因解决证明。诊断脚本区分受控before-quit veto观察与意外watchdog，不把强杀记为成功。

## 本地集成

已通过无阻塞验收，准备按本轮授权本地提交并快进main；随后追加main构建/定向测试/真实界面及指纹核对结果。不推送、不发布、不替换正式App，保留隔离分支与工作区。先前报告中的“未提交/合并”是当时状态，本次授权以此记录及最后集成附记为准。


## 本地集成附记

代码提交 **2885470a5ad3bbec43356178d6ef536b625dcac9** 已从f685a56122ee快进本地main，无冲突。main重新执行类型检查、Electron/CLI/UI全构建、12文件191项定向测试及1个真实Electron完整网络/旧子转录往返/IME/快捷键场景，均通过。main源与已验收候选57文件逐字节相同，正式三文件指纹仍相同。

main实际界面见[展开工作台](../validation/collaboration-rereview-20261107/desktop-main/phase-b-network-dark-completed.png)和[日常对话](../validation/collaboration-rereview-20261107/desktop-main/phase-b-conversation-dark.png)，由主仓库dist/ui真实运行截取，不是设计稿或安装版替换。main证明见main-integration.json、main-typecheck.log、main-build.log、main-targeted.log、main-desktop.log；原生退出累计最终冻结62次+main1次=63次全部核验正常。

后续仅提交验收资料并快进main，不再改源码。保留专项分支/工作区，不推送、不发布、不替换正式App。历史偶发超时继续开放跟踪；不因本轮未复现而关闭风险。

原始日志和baseline.patch按原字节保留，其中工具生成的行尾空格/空行不被整理。源码和非原始证据文档的git diff --check通过；没有为消除日志格式提示改写失败证据。
