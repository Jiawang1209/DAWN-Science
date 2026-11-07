# P1—P4 合并前复审与本地整合

日期：2026-11-08（Asia/Shanghai）。用户明确授权：重新审查、发现问题修复补测，无阻塞后本地提交并合并 main；不推送、不发布。基线 main/专项分支 HEAD 均为 `9cc757cc`。

## 发现并修复的 P2

模型已返回用量后，在宿主文件版本验收阶段取消，`finalizeTaskVersions(signal)` 抛异常。普通子任务、团队成员和托管 Bot 三个适配器丢掉此前 result.observation，使已知 `input=10/output=2/cacheRead=1` 变成完全未知，预算 knownTokens 从应有 13 变成 0。并非免费或双算，但丢失了可复核下界。

仅改三个适配器：`src/subagent/executor.ts`、`src/team/scheduler.ts`、`src/workbench/backend.ts`。在结果已到达后，复用 `childDiagnostics` 保留 schema 校验后的 observation/trace；验收取消或异常只返回失败和诊断，拒绝 output/receipt/versions。原 finally 锁释放、Service/Store、权限、预算口径与上下文绑定未改。

回归覆盖：合法结果先确认可接受，再于真实验收边界取消；普通/团队真实 Node 子进程保留 13，真实 Native/Pi/localhost Bot 保留 input24/output16 与缓存 partial；均拒绝迟到验收、重复结算，重开计数不变，Bot 产物锁可重新获得。另有独立 receipt 保存异常探针。

原审查者独立复跑相同合法 JSON 探针确认 **knownTokens 0 → 13**，结果仍取消、output为空、无 receipt/versions。新增两条回归与 Bot 四种模式共6项独立通过。首次RED与修后首次fixture错误完整保留：成功 child 应提供 evidence 而非 failure-only trace；修正只涉及测试夹具，原 usage RED 有效。

## 新鲜验证

| 验证 | 结果 |
|---|---|
| 原始三分工审查 | 预算71 tests；隔离195 tests；用量83 tests，并发现上列P2 |
| 修复及相邻契约/用量定向 | 5文件38 tests，通过 |
| 原审查者修后独立复审 | 原失败探针、新增6 tests、receipt保存异常探针通过，无剩余P1/P2 |
| typecheck / 全构建 | exit 0 |
| 完整 Node/UI | 672文件，6816 passed /10 skipped，170.84秒，exit 0 |
| 串行真实内核 | 12文件，50 passed /1 skipped，48.38秒，exit 0 |
| 同一新构建的相关 Electron | 15 passed，3.2分钟，exit 0 |

本次 Electron 覆盖审阅预留、取消排空、预算与恢复、并行检查点、观测会话切换/两轮累计/重启、成果/工具版本入口、网络筛选、展开返回和主上下文。不是完整桌面全部功能或跨平台验收。所有测试 profile、DB、工作区、evidence和退出记录均隔离；没有新增外部模型请求，旧24/30试验关闭且余量不滚存。

## 退出跟踪与边界

新22次关闭分别记录 app.close 返回、真实OS child-exit与child-close，最大285.067/282.985/283.370ms；无1500/4000ms超限。历史 **7350/20690ms OPEN**，不以此次正常记录关闭，不提高原1500/4000ms收尾预算。真实长 Bot/MCP stopping 尚未实测；保留原P3短标签建议，详情已经明确input+output/cache单列及跨任务范围。

## 证据与整合

- `reviews/`：预算、用量、隔离独立报告/原始日志/可运行探针；`logs/`保存RED、fixture错误和最终验证。
- `premerge-desktop/`：修复后同构建实机截图、对应JSON与退出原始记录；`premerge-exit-summary.json`分列退出指标。
- `review-fix-source-delta.json`：相对上一轮最终候选，生产源码只改上述3文件；旧阶段清单不覆盖。
- `precommit-src-sha256.json`：完整634源码文件；`precommit-app-build-sha256.json`：624个实际App构建文件。忽略 dist 中仅供先前试验留存的历史 evaluation helper，不以旧helper宣称本次源码重编译。
- 本地提交与快进合并完成后，将在 `post-merge.json` 记录实际提交、main身份与合并后的新构建/验收；本文是合并前验收记录。正式 App、配置、凭证与数据库不替换，不推送、不发布。

## 原始证据与 Git 格式检查

原始 diff、Playwright错误上下文、测试stdout以及故意追加空白的settings-drift夹具包含上下文空格/末尾空行，完整提交的git whitespace检查会报告这些原始证据。全部产品源码、测试实现、脚本、规划与文档正文另行检查通过。为保持原始字节和已记录SHA，不清洗证据、不修改gitattributes或阈值。暂存阶段初次命令未在原始证据格式提示后停下，创建了尚未合并的本地提交；已明确核查范围并保留记录后再继续整合。

仓库默认忽略*.log，本次仅对两个本批验证目录中的313份原始日志显式纳入Git，无凭证样式命中，确保main可读取这些证据。详情见raw-evidence-whitespace-review.json及raw-log-preservation.json。
