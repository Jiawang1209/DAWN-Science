# 证据提交引导与独立审阅预算

任务轨迹已按授权复审、本地提交并快进 main：`81bf54a6`。本文记录该轮交付候选及真实试验；当时留在 `codex/delivery-efficiency-20261107`。后续用户已明确授权再次复审、本地提交和合并，收口记录见 [合并复审](2026-11-07-delivery-efficiency-merge-review.md)。未推送、发布或替换正式应用。

## 改动与用途

- 原上轮真实核查退回：把失败的 ENOENT read 混入 verification.reviewed；分析退回：把 write 混入 execution.completed。沿用冻结契约和宿主真实工具证据，阶段专用 schema 只暴露本阶段的 data 类型，工具标签增列允许的正向引用类型，失败反馈分组列出可用的完整、唯一 ID。失败 ID、写入充当执行/审阅、跨任务证据仍被拒绝。标签不是科学认证，不自动改写模型引用。
- 评测专用：同题每臂 15 次请求，多 Agent 在臂内分为核查+分析 11、审阅 4；不能互借、不能从单 Agent 借用。父层关闭会中止并排空全部子层。保留审阅额度不等于保证阶段成功，前序失败不会伪造或跳过阶段。
- 没有新增编排器、放宽产物验收、改变锁或恢复协议。正式用户会话的预算没有改成这个试验配比。

## 审查发现与修复

独立审查发现 P1：模型 provider 别名配上 loopback 地址后，Pi 不能识别原 DeepSeek 请求方言。原配置只拷贝模型 ID，导致别名发送 max_completion_tokens、store，与单 Agent 的 max_tokens 不同。真实 SDK 离线 fetch 捕获 JSON，先复现失败，再沿用底层模型的显式 compat；三个 provider 与原 DeepSeek 的完整序列化相同。未验证的 provider/API 在读取凭证前拒绝。

补充父配额关闭时的子层未完整请求体、活动 upstream 两项取消排空测试，确认另一个臂和未用审阅额度不受影响。独立复审未发现剩余阻断问题。测试代码曾漏用 Pi normalizeContext，被类型检查发现，已使用正式 SDK 构造器修正，保留首次失败。

## 验证证据

证据目录：[delivery-efficiency-20261107](../validation/delivery-efficiency-20261107/)。

- 完整构建通过；修复后的类型检查通过。
- 完整 Node/UI：651 文件，6446 通过、10 跳过（在最后三项新增审查测试加入前）；其后最终相关测试 6 文件 30 项通过，并单独通过规范化后的序列化测试。不将两轮数字相加当作全量总数。
- Electron：14 项通过；覆盖提交失败后修正、宿主流水线、预览展开返回、锁等待、预算、取消、恢复、旧 Team 入口。实际 Pi/文件/进程/持久化执行，推理为本地夹具。
- 14 个观测宿主退出码全部 0，退出诊断没有异常等待；历史偶发关闭超时继续 **OPEN**，相关回归不构成历史根因已解决的证明。[历史跟踪](2026-11-07-electron-exit-investigation.md)。
- 实例：[模型可见的标签与退回反馈](../validation/delivery-efficiency-20261107/model-visible-example.json)，夹具故意先用错误 ID，真实子进程第二次提交被接收；此例证明反馈通路，不是减少真实模型请求的成绩。

## 真实复验与实际收益边界

用户明确授权新增最多 30 次请求。第一次系统钥匙串操作错误后，原宿主在 credential-read 退出，未建立请求门或 inference attempt；按用户「再弹一遍」明确指令重新触发，沿用相同限额。第二个宿主通过钥匙串后完成本轮试验，真实调用 **27 次**，4 次门拒绝均未转发；结束 0 在途请求，不再试跑剩余额度。原始合成转录保留于 `/tmp/dawn-throughput-20261107/live`。

[原始配对报告](../validation/delivery-efficiency-20261107/live/research.md) · [原始机器报告](../validation/delivery-efficiency-20261107/live/research.json) · [请求门](../validation/delivery-efficiency-20261107/live/request-gate.json) · [上轮对照](../validation/delivery-efficiency-20261107/live/before-after.json)。报告、模型、输入指纹、构建指纹及部分实测前源码快照单独保留，不把末轮修复冒充实测候选。

| 观察 | 上轮 | 本轮真实试验 |
|---|---|---|
| 单 Agent | 10 次，50.2 秒，accepted | 14 次，56.8 秒，accepted |
| 多 Agent | 15 次，99.3 秒，未交付 | 13 次，103.2 秒，未交付 |
| 多 Agent 核查+分析宿主退回 | 各一次 | 两阶段均一次提交通过 |
| 独立审阅 | 额度不足，没有完成正式提交 | 真实读完四个文件，4 次额度内未完成正式提交 |

本轮 work 消耗 9/11、review 4/4，工作额度剩余不能借给审阅。两组实际文件数值均为 n=41、mean=13.870731707317074 mg/g，输入保持；但多 Agent 缺少最终正式审阅，不能凭数值相同放行。没有完整合格配对，不作普遍质量、速度、费用收益结论。单 Agent 的请求数也有波动，不能把跨轮差异全归于改造。

### 审阅失败根因和末轮离线修复

[提交逐次分析](../validation/delivery-efficiency-20261107/live/multi-submission-analysis.json)：第一次工具参数过长碰到 4096 输出上限而未执行；第二次由 SDK 拒绝漏填 `data.reviewedPaths`；第三次到达宿主，但把契约外 `input.csv` 加入 reviewedPaths，被正确拒绝。机器报告的宿主计数为 3 次提交/1 次退回，只覆盖 check、analyze、第三次 review；不包括前两次未到达宿主的失败，不能解读成只有一次模型提交问题。

末轮继续复用冻结契约，工具 schema 明确 reviewedPaths 必填且恰为 inputs 集合：枚举冻结路径、数量一致、不可重复、顺序不限；额外读取的背景文件仅在说明中提及。summary 和 prompt 引导简洁、不在字段间重复整份报告；不增加输出上限，不自动填数据或替换引用，不放宽宿主真实读取验收。实际生成的 [最终工具 schema](../validation/delivery-efficiency-20261107/final-review-tool-schema.json) 可直接核对。

同时修复汇总遗漏：审阅子配额 4/4 且有明确拒绝，父配额 13/15 未满，旧汇总误写 exhausted=0。新增离线测试后，汇总正确识别为阶段额度耗尽；保留原始报告，并另存 [离线重算](../validation/delivery-efficiency-20261107/live/research-accounting-corrected.json)，不改写原始试验行、终态、推理或指纹。

新增约束和简洁指引在真实试验结束后完成，**尚未经另一轮真实模型复验**。本轮只证明前两阶段的原引用错误未再出现、审阅确实得到额度，不证明多 Agent 已稳定交付。下一步优先验证审阅一次性完整、简洁地正式提交，再决定是否需要调整预算配比；不能靠挪用别臂额度或放宽验收包装为成功。

末轮独立只读复审未发现阻断问题。最终构建、类型通过；652 文件、6451 项 Node/UI 通过、10 跳过，14 项相关 Electron 通过。14 个观测宿主退出码 0 且无异常等待，当前均走同步收尾；这不代表历史偶发关闭超时已定位，继续 OPEN。最终证据为 final-build.txt、final-typecheck.txt、final-node-ui.txt、final-desktop.txt、final-exit-summary.json 和 final-source-manifest.json。
