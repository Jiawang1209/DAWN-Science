# 正式提交反馈与协作证据贯通

用户授权本轮先做正式提交反馈、任务到工具/证据/产物导航并补轻量观测。代码基于本地 main 77aeae71，在 codex/submission-evidence-workbench-20261107 的独立工作区开发；本轮不自动提交、合并、推送或发布，不替换正式 App。

## 交付

1. Pi 冻结契约工具与托管 Bot 共用宿主证据正文标签。标签来自实际调用记录，不来自模型参数；原始工具结果和科学验收证据不混入标签。正式提交失败返回字段问题、冻结输入/允许输出、实际读取要求与最近 8 条证据目录。反馈按 JSON 转义后的 UTF-8 字节限制，截断身份不能当完整引用。正式提交仍由原 TaskSubmission 唯一验收，成功或 blocked 后冻结、并行排空与取消判断保留。
2. 统一编排增加至多 64 条工具元数据摘要，省略数量可见；不保存完整工具结果/命令到第二份转录。初始后台启动、续接、冷恢复、Team 和独立 Team 适配器均接回真实摘要。协作详情可查看工具 ID/状态/文件路径、完整宿主验收逐项原因、版本 SHA 和字节数，直接复用当前文件 FilePreview 及只读历史留存面板。
3. 当前预览与历史指纹明确分开；有指纹不表示字节已留存。历史入口按文件筛选已有留存副本，不暗示副本一定与该次验收一致。没有副本时如实为空。查看不会启动、恢复或重新批准任务，也不会改产物锁。
4. 轻量观测复用 submissionAttempts、invalidSubmissions、elapsedMs 和既有 token/预算记录；不新增费用估算和上下文占用猜测。重跑期间遮罩上次回执/版本；异步预览按 owner/任务/执行代次隔离，并保留返回焦点。
5. 评测增加重复与交替顺序，真实请求使用独立等额分区，在整轮原子上限 30 内每组最多 15；结束组的迟到请求不能借用另一组额度。分区关闭会中止并排空尚未收完请求体的调用。

## 测试与阶段演示

- typecheck、完整 build 通过；源码 diff whitespace 检查通过。
- 最终冻结源码后的 Node/UI 全套：648 文件、6408 项通过、10 项既有跳过，见 [最终完整日志](../validation/submission-evidence-20261107/full-node-ui-closure.log)。最终完整 build 和 typecheck 通过。44 份变更源文件冻结期间零漂移，见 [源文件核对](../validation/submission-evidence-20261107/source-frozen-check.json)；先前 6406 项通过的结果保留作过程证据。
- 第一轮真实 Electron 链路及夹具边界：9 个用例通过（其中 2 个为纯夹具断言），见 [定向桌面日志](../validation/submission-evidence-20261107/desktop-phase-ab-final.log)。扩大回归 60 个相关用例，59 通过、1 个默认解释器路径在新工作区不存在而跳过，见 [桌面回归](../validation/submission-evidence-20261107/desktop-regression-final.log)。随后显式指定既有 Python 和 /usr/local/bin/R，真实解释器场景及最终产物预览/留存链路 2 项补验均通过，见 [补验日志](../validation/submission-evidence-20261107/desktop-closure.log)。契约字段澄清后 9 项桌面用例也再次通过，见 [冻结契约桌面验证](../validation/submission-evidence-20261107/desktop-contract-frozen.log)。
- 共享模型夹具、真实 Pi 子进程：先引用 forged-id，被宿主拒绝；再引用正文标签中的真实 read ID，accepted；记录 2 次提交、1 次退回。见 [模型实际可见反馈](../validation/submission-evidence-20261107/phase-a-model-visible-example.json)。
- 历史留存桌面场景：实际留存 contract output 后修改当前合成文件，历史入口仍显示原副本，再返回原按钮并恢复焦点。当前文件预览始终标明读取当前工作区。
- 离线科研对照运行两轮、四个完整配对：均值任务正确交付，缺单位任务正确阻塞，没有错误放行。共享 localhost 模型不构成真实质量/费用收益。见 [离线明细](../validation/submission-evidence-20261107/offline/research.json) 与 [复现脚本](../validation/submission-evidence-20261107/run-offline.ts)。

## 审查与修复证据

独立 spec review 发现历史入口误走来源信息分支；新增失败测试后切换到已有 RetainedHistory，补实际副本读取和返回断言。随后 code quality review 发现初始后台启动漏接摘要、独立 Team 缺摘要，以及分区取消不能及时中止半截请求体；均已修复并复核。审查者的本地复现从等待约 704 ms 缩短到约 2 ms，0 转发、另一组 0 消耗。这只证明本地请求门取消行为。

首次桌面失败还发现两个测试夹具问题：Pi 用户正文可为文本数组；请求记录位于 request.body.messages。已补夹具形状与证据引用拒绝回归，不延长等待、不绕过生产验收。原失败素材保留在 [阶段证据目录](../validation/submission-evidence-20261107/)。

最终截图检查还发现按文件筛选历史留存时，若只保存过其他文件，面板会空白。已先补失败测试，再将列表与空态统一按 filteredGroups 判断；提示只说明“当前已读取的留存中没有此文件”，不对未加载的分页下结论。独立复核无阻塞。相关 UI、评测与设计/双语检查 8 文件 146 项通过。

一次收尾全量运行与上述空态/双语补充发生重叠，读到改动前后不一致的源码，2 项失败；该日志 [原样保留](../validation/submission-evidence-20261107/full-node-ui-frozen.log)。不采用这一轮作最终结论。之后重新冻结 44 份源文件并重建，最终运行按冻结指纹验收，不在测试期间修改源码。

## 真实模型与开放项

用户新增授权最多 30 次。只读核对最近 API 会话最后选择为 deepseek/deepseek-flash，使用既有只读凭证接口。首次试验宿主曾在 macOS 钥匙串读取处等待；用户在系统提示中处理后，同一宿主继续运行，未重置额度。采样栈见 [宿主采样](../validation/submission-evidence-20261107/live-host-sample.txt)，没有改凭证或绕过钥匙串。

实际转发 18 次，拒绝 4 次，最终 inFlight=0。单 Agent 用满独立 15 次额度（约 74.1 秒），未正式提交：实际工具调用为 bash 8、read 5、write 2，无工具报错；不能将最终未验收的文件算成功。多 Agent 核查阶段用 3 次（约 29.6 秒），正式提交 1 次、格式退回 0 次，宿主 blocked，未启动分析/审阅。共 0 个完整配对、1 个不完整配对，未证明质量、耗时或费用收益。剩余 12 次属于未使用的组内额度，未重新分配或继续联网。

多 Agent 原始回执说明“无结构级 blockers”，却在 data.issues 写入已批准的 NA 处理规则及说明性发现。宿主按照既定规则阻塞是正确的；模型契约说明有歧义。本轮随后补清 prompt 与 JSON-schema：issues 仅填未解决的阻塞问题，普通说明放 summary/columns，无阻塞用 issues=[]；宿主仍阻塞非空 issues，没有自动删字段或把 blocked 改为 accepted。此补充经过失败/通过回归和独立复核，**没有再次调用真实模型验证**。真实原始报告与当时已列出的源文件快照原样保留，不能把后续澄清说成本次实测收益。见 [真实对照](../validation/submission-evidence-20261107/live/research.md)、[请求门](../validation/submission-evidence-20261107/live/request-gate.json)、[试验源码快照](../validation/submission-evidence-20261107/live-evaluator-source.zip)。

另修正离线报告元数据：两轮夹具共 36 个 localhost 请求，不消耗用户真实 API 额度；未使用分区门，因此 requestLimit/perArmLimit 明确为 null，不再将整轮真实调用上限 30 错标为离线执行限制。测试先复现再修正。

60 项相关回归批次的 67 个桌面宿主退出记录均为 exitCode=0、无 cleanup problem。唯一 5 秒观察来自 exit-lifecycle 中故意延迟退出的诊断用例，属于预期触发；没有意外观察。见 [退出汇总](../validation/submission-evidence-20261107/exit-summary.json)。

历史 Close context timeout、页面提前关闭、PID1953 应用退出事件后父侧约 11.8 秒才收管道关闭，以及 remote-terminal afterEach 事件延迟均继续 OPEN。本轮通过不构成历史根因解决证明。沿用 [既有跟踪记录](2026-11-07-collaboration-merge-review.md)，保留双侧退出诊断。本轮钥匙串前置等待与上述退出异常分开。

未执行全桌面 919 项、跨平台、正式安装升级或发布验证。正式配置、凭证、数据库和 App Info.plist 哈希当前均保持一致，见 [保护检查](../validation/submission-evidence-20261107/protected-check.json)。main 保持原提交，变更留在专项工作区待用户验收。

## 后续复审与本地集成授权

2026-11-07 用户在后续轮次明确授权：再次审查提交反馈、会话隔离、版本预览、取消排空和恢复，修复补测后本地提交并合并 main；仍不推送、不发布。该后续轮次的缺陷修复与最终集成证据见 [复审与集成记录](2026-11-07-submission-evidence-merge-review.md)。本文先前“未提交/未合并”表示首次交付时状态，不能替代后续记录。
