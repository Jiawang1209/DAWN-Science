# 科研协作 P1—P4 验证记录

基线 `main 9cc757cc`；专项分支 `codex/research-collaboration-p1-p4-20261107`。本目录记录新一轮实现证据，历史通过数不代表本轮已验收。

| 阶段 | 状态 | 已验证与待完成 |
|---|---|---|
| A 交付诊断与对照 | [离线](p1/README.md)、[真实配对完成](p1/live-delivery.md) | 24/30 次：single 10、multi 14，两组文件核验通过；独立审阅读齐实际产物。multi 较慢，多用 4 次请求，SDK 一次拒绝及工具失败保留；115 项独立结果检查通过。 |
| B 正式审阅预留 | [本地验收完成](p2/README.md) | 6586 Node/UI 通过、10 跳过；9+1 相关 Electron 通过，类型/构建通过，规格与质量复审无阻断。 |
| C 成果优先界面 | [本地验收完成](p3/c3-delivery.md) | 6728 Node/UI 通过、10 跳过；最终构建 8 项相关 Electron 通过，规格/质量复审通过。实际长 Bot/MCP stopping 未验证，历史退出仍 OPEN。 |
| D 上下文观测 | [D1](p4/d1-delivery.md)、[D2](p4/d2-delivery.md)、[D3](p4/d3-delivery.md) 本地验收完成 | 当前/历史 SDK 估算与已结算累计、缺失/部分统计分开；两轮累计 80 与历史末值 29 实机可见；独立 SPEC/QUALITY 与最终集成复审通过。 |

设计与完整步骤见 [主计划](../../superpowers/plans/2026-11-07-research-collaboration-p1-p4.md)。

阶段 A 首次证据根：`/tmp/dawn-p14-stage-a-20261107.w9n6LN`。首次失败保留，包括未实现导致的集成失败、类型检查中测试访问不存在字段，以及转录读取边界失败；最终检查另存，不覆盖首次记录。离线链使用本机夹具推理和实际 Pi 子进程、文件、Python 执行、宿主验收与 Team 流水线，不能据此推断真实模型质量或速度收益。

历史退出问题仍 **OPEN**。既往曾有 7.35 秒与 20.69 秒的延迟 OS 退出；隔离重复测得 136.8/147.9 毫秒不代表已找出历史根因。本轮不提高 1500/4000 毫秒收尾预算。保留[最近历史退出记录](../delivery-efficiency-20261107/final-exit-summary.json)，后续新证据另增。

本轮未提交、未合并、未推送、未发布；正式 App、配置、凭证和数据库均不在本轮修改范围。

## 这轮实际增加的能力

- 交付诊断：宿主验收、SDK 拒绝、输出截断分别计量；真实单/多对照与冻结版本可追溯。
- 可选审阅轮次预留：复用原子预算账本，覆盖并发、取消排空、修订和恢复；执行轮次不等于模型 HTTP 请求。
- 成果优先协作台：目标、阶段、阻塞、下一步与产物版本首屏可见，保留流程工作台和旧入口。
- 成员观测：当前上下文、历史末值和已结算累计分开，来源/组成估算/缓存缺失可展开；不借父会话数据或伪造费用。

最终本地验证：671 文件、6813 Node/UI tests passed、10 skipped，类型/构建通过。15 条 Electron 行为回归通过；最后 UI 仅选中背景 CSS 差异后，重建并通过 5 条针对性桌面检查和 1 条磁盘可见来源补验。两候选区别和完整日志见 D3 报告，不能混称 21 条均运行于最后 CSS 构建。独立最终审查新跑 346 tests、18 个跨阶段 cases、115 项冻结配对只读 checks，通过且无可复现 P1/P2 阻断。

[当前与历史状态的实际 Electron 窗口](p4/evidence/d3/final-electron/evidence/members/expanded-current-1440-dark.png)；[两轮累计与历史读数详情](p4/evidence/d3/final-electron/evidence/members/settled-two-epochs-partial-1440-dark.png)；[停止后磁盘历史](p4/evidence/d3/disk-ui-electron/evidence/members/retired-disk-history-1440-dark.png)。截图为 localhost 模型夹具，真实模型结果另见 A3。

保留一项非阻塞 P3 文案建议：卡片短标签“已结算累计”，input+output 和 cache 单列口径在详情明确。历史退出延迟仍 OPEN；长 Bot/MCP stopping、跨平台、全 kernel 和完整桌面全功能未在本轮重新实测。source/build 后验及 main 保护状态见 [最终审计](final-audit.json)。专项工作区保留，本轮没有提交、合并、推送、发布或替换正式 App。

## 2026-11-08 本地整合更新

以上是上一轮交付时的历史快照。随后再次复审修复了“验收期间取消丢失已知用量”的P2，新增回归并完成6816 Node/UI、50内核与15相关桌面验证，功能提交6906b622已快进合并本地main；main重新构建、类型检查和两条实机验收通过。完整记录见[本地复审与整合](../research-collaboration-merge-review-20261108/README.md)。原索引字节副本保留为该目录prior-goal-index.md，旧final-audit哈希仍可核对。不推送、不发布，历史退出仍OPEN。
