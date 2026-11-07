# D3 成员上下文与已结算累计 UI 交付

状态：实现与本批验证完成，等待独立复审；独立 SPEC、QUALITY 和整个 P1–P4 最终集成审计均已通过；完整原始记录见末尾归档。

## 口径与接点

新增 `src/ui/agent-observation.ts` 纯投影与 `agent-observation-view.tsx` 小组件，接入普通 roster、网络节点、编队成员卡和 direct/task 详情。所有数据来自已有共享 `useRunOverview` 快照，不新增 poller、父会话上下文请求、转录扫描或 compaction 操作。

- 当前上下文只接受 live、running state/phase、exact owner/child/epoch、宿主 current/reason 与 SDK available 来源；停止、取消、恢复、route-changed、旧 epoch、disk 均不画当前占比。只有可靠模型配置容量才有比例，超容量保留真实数字、条形视觉 clamp。
- 同 owner/child 且 sample epoch 不大于 run epoch 的 available SDK 末值明确写“上次上下文 · 历史（估算）”，无样本/unknown 不标 SDK 估算。外 owner/child、future epoch 不显示历史。模型身份来自样本，容量来源独立标模型配置。
- 已结算累计只读 D2 `usageTotals`，摘要合计 input+output；cacheRead 在详情单列。部分字段写“至少”，缺失不补零，legacy 无覆盖与新成员尚未结算分开；跨字段不安全整数合计明确不可呈现。详情说明这是成员跨轮次、跨任务累计，非本 task/attempt 费用。预算原 input+output+cacheRead 公式与结算入口未改。
- 组成仅标“组成估算 · 保留内容字节”，注明排除隐藏推理、不是 token 分解或真实请求字节。时间超出 Date 范围显示“未知时间”。没有可靠费用来源统一“费用未记录”，没有价格查询或 cost=0 免费推断。
- task 详情先使用 `teamTaskTimeline(... exact attempt).current`，再核对当前快照成员 epoch 与完整 taskAttempt 四字段；不沿 assignee 借新 assignment。direct-run 也核对快照成员身份/epoch。
- 保留成果优先界面、展开返回、网络、成员筛选、依赖、工具证据、版本、交接、预算预留/恢复入口。网络改为 210px 节点、252px 行距；仅选中网络卡增加实底与 inset 强调色，修复原半透明背景透线。App 整体 grid 不变。

## 失败与修复证据

首个语义 RED 是既有 `usageLabel` 在成员下一 epoch 运行时返回“本轮用量以会话额度记录为准”，未显示 D2 已结算累计。日志 `evidence/d3/logs/dawn-d3-first-red-20261108.log`。

新增模块尚不存在时的 import error 单独保留为搭建阶段，不把它当作行为 RED。之后 roster/task 入口、日期范围、历史来源标签、future epoch 与 detached direct epoch 都有明确行为 RED→GREEN。

首个实际 Electron 在 46.5s 失败：测试错误假定未核验 cacheRead 应显示“至少 0”。真实宿主 D2 将该字段保留为 absent + partial，UI 正确显示“未记录”。修正后的 fixture 明确同时断言 cacheRead absent、partial 含 cacheRead 和 UI 未记录；未修改生产数据处理来迎合测试。原完整 stdout、trace、截图保留于 `evidence/d3/first-electron` 和 logs。

root 图审发现单列选中网络卡透出 SVG。`git show HEAD:src/ui/styles.css` 已证实是既有半透明 selected 规则，D3 卡宽使单列更常见；仅追加该节点选中态实底规则。保留原图作为视觉 RED，最终针对性截图验证修复。未更新视觉基线或放宽预算。

## 验证与实机

最终生产候选类型检查、`npm run build` exit 0；`npm test -- --project node --project ui` exit 0，671 文件、6813 passed / 10 skipped，134.57s。完整 stdout 见 `evidence/d3/logs/dawn-d3-*-release-candidate-20261108.log`。Node/UI 不包含 kernel 项目，本批不声称 kernel / Windows / Linux 实机覆盖。

实际 Electron 分开记录，不混候选：

| 集合 | 结果 | 对应候选 |
|---|---|---|
| D3、network、outcome pass/blocked、stopping、workbench、context 2、budget 6、science-parallel | 15 passed，exit 0，2.8m | 最后选中卡不透明 CSS 之前；host/metrics src 与最终完全一致，只有 styles.css 差异，见 `behavior-to-final-source-delta.json` |
| D3、network、workbench、context 2 | 5 passed，exit 0，55.9s | 最终不透明 CSS build；完整目录 `final-electron` |
| D3 disk UI 来源 capture 补验 | 1 passed，exit 0，22.6s | 同一最终生产候选，仅测试等待既有共享刷新到达后拍摄，未改刷新参数 |

前两次 disk 截图出现“host JSON 已 disk、UI 仍是前一次 live 历史界面”的 capture 时序问题，原图与 JSON 保留。补验同时等待 host.source=disk、UI 显示“磁盘记录只读”及详情“磁盘历史快照”，不把 IPC 变化等同可见 UI 变化。

最终 src 和 dist 全量 manifest 已留存，最终 full 与 5 条结束后核对均未漂移。构建仅保留既有大 chunk 提示；全量 Node/UI 有既有 jsdom Canvas getContext 提示，无失败。

退出诊断按 candidate 分开：15 条行为集合含 22 次 close，app.close 返回最大 209.228ms / OS child-exit 208.732ms / child-close 209.041ms；最后 5 条含 7 次 close，分别最大 143.207 / 141.850 / 142.240ms。三类 >1500ms 和 >4000ms 均为 0，native shutdown timeout/failed/fallback 标记均无。原始 jsonl 和分列汇总保留；这些新结果不清除历史 OPEN。

实际 D3 fixture 使用 `e2e/fixtures.ts` 的隔离 profile、构建 Electron、真实宿主工具/回执/子进程与 localhost inference。新 `observation` scenario 仅在 owned workspace 的 Bash fixture 等待 `.d3-observation-release` 以便拍照，再释放并完成修正轮；没有伪造 IPC 响应或改生产等待/取消策略。

实测同 analyze 成员两 epoch：input 48、output 32，累计摘要 80 tokens；cacheRead absent、partial=['cacheRead']、settledEpochs=2、unknownEpochs=2。这里 unknownEpochs 是包含不完整字段的已追踪结算轮数，不把 cache 缺失解释成输入/输出未知。当前有效 SDK 样本曾为 20 / 128000 tokens；结算后保留 29 tokens 历史末值，绝不与 80 累计混用。

## 身份、范围和保留边界

相对真实 pilot 的 632 个 src 文件，最终 634 个 src 文件只改/新增 8 个 UI 文件；完整 manifest 和 pilot delta 在 `evidence/d3`。冻结子进程 bundle SHA256 仍为 `96b1f3e966c391d88fb45fa9524dbb61d4b0203da6ac4cbf69ae41f577d7063e`。D1/D2 和 pilot 历史证据不重写。

D3 没有外部 API 调用，没有新增依赖、提交、合并、推送、发布、安装替换，没有使用正式 profile、凭证或数据库。localhost 合成流程验证软件接线，不证明科研准确性。

实际 CLI fixture 已验证取消后宿主 drained 和 owned process tree 退出；长 Bot/MCP stopping 尚未实际捕获，停止中资格由纯 UI 测试覆盖。历史 Electron 7.35s / 20.69s OPEN 保留，不用本批正常退出抹除，不改 1500 / 4000 ms 预算。

## D3 文件变化清单

生产代码共 8 个 UI 文件：新增 `agent-observation.ts`、`agent-observation-view.tsx`；修改 `collaboration-network.tsx`、`collaboration-workflow.tsx`、`collaboration-task-detail.tsx`、`run-overview.tsx`、`i18n/en.ts`、`styles.css`。

测试与 fixture：新增 `tests/ui/agent-observation.test.tsx`（26 条）和 `e2e/agent-observation.spec.ts`；修改 `tests/ui/collaboration-model.test.ts` 的旧累计口径断言、`tests/ui/collaboration-workflow.test.tsx` 的 missing 文案断言；`e2e/collaboration-stopping.spec.ts` 增加取消后无 current 条断言；`e2e/fixtures.ts` 仅增加 observation mode 类型；`scripts/mock-science-pipeline.mjs` 仅增加 owned observation 模式和释放文件 gate（其他既有未提交改动保留）。

交付记录：本文、D3 plan checkbox、`p4/evidence/d3` 的命令日志/原失败/截图/host 数字快照/源与构建哈希/增量/退出诊断、两个可复现 evidence 汇总脚本。没有重置或覆盖 A/B/C/D1/D2 的未提交内容。


## 卡片标签取舍（SPEC 已接受）

计划描述为“已结算累计输入+输出”，当前卡片摘要只写“已结算累计”；输入+输出的范围、跨轮次/跨任务性质与 cacheRead 单列在展开详情明确说明。该设计让卡片保持两类紧凑指标，但是否需要把“输入+输出”直接写入卡片标签，独立 SPEC 已判断为 P3 非阻塞建议；root 接受保留，见下文独立结果。


## 最终截图索引与后验一致性

以下路径均相对 `p4/evidence/d3`；每张图旁同名 JSON 保存真实宿主数字快照、viewport 和 localhost 标记。

| 场景 | 证据路径 |
|---|---|
| 当前 SDK 已知 + 已完成历史 + 从未执行未知，1440 light | `final-electron/evidence/members/expanded-current-1440-light.png` |
| 同场景 1440 dark | `final-electron/evidence/members/expanded-current-1440-dark.png` |
| 900 expanded，卡片不重叠 | `final-electron/evidence/members/expanded-current-900-light.png` |
| 900 详情来源、模型、时间、组成字节 | `final-electron/evidence/members/detail-current-900-light.png` |
| 900 summary 保留展开返回入口 | `final-electron/evidence/members/summary-current-900-light.png` |
| 两轮累计 80 / 历史末值 29 / cacheRead 缺失 partial，选中单列卡不透线 | `final-electron/evidence/members/settled-two-epochs-partial-1440-dark.png` |
| 重启后历史详情，1440 | `disk-ui-electron/evidence/members/restarted-history-1440-dark.png` |
| 真实 disk 来源与可见 UI 同时刷新到历史，1440 | `disk-ui-electron/evidence/members/retired-disk-history-1440-dark.png` |
| 真实取消排空及 owned process tree 退出 | `behavior-electron/outcome/cancellation/actual-cancelled-drained.png` / `fixture.json` |

实现者实际逐图查看过最终 1440 light/dark、900 expanded/详情、两轮累计、restart 与 corrected disk。卡片可读，无重叠，选中卡不透出 SVG；内部滚动仍按原工作台设计。root 已实际查看最后实底修复后的历史/restart 图及 corrected disk 图，确认可见磁盘来源、历史 29 / 累计 80 与无 current bar；这次图审不替代后续独立 SPEC/QUALITY。

补验 2 次 close 的退出诊断单独存于 `disk-capture-exit-summary.json`；完整 src 634 项、dist 625 项的路径集合和 SHA256 在所有检查后逐项相等，见 `post-verification-identity.json`。新增测试/fixture/交付文件另列于 `d3-files-sha256.json`。所有原失败和 capture 错位图保留，不更新阈值、快照基线或历史 OPEN。

## 独立 SPEC 结果

SPEC PASS，无 P1/P2；独立 UI 8 文件/115 tests，42 个投影/真实宿主快照/timeline cases/assertions 通过（不是另外 42 个软件 tests）。634 src 与 625 dist 全路径和哈希均匹配，复审前后无漂移。报告与完整原始输出位于 `evidence/d3/independent-reviews/spec/`。

卡片短标签列为 P3 非阻塞建议：详情已明确 input+output、cache 单列和跨任务范围，数值/资格无歧义。root 接受该取舍，不为 copy-only 建立新实现循环；最终代码质量与跨阶段集成审查仍待完成。

## 最终独立质量与集成审计

D3 QUALITY PASS；P1–P4 最终集成审计未发现可复现 P1/P2 阻断。独立 26 文件/346 软件 tests、18 个 Store/Service→观测/轨迹/取消/预留/恢复集成 cases、115 项冻结真实配对只读核验通过；typecheck、diff-check exit 0。634 src、625 dist 与冻结清单一致，复审前后源码、测试、构建与 main 状态未变化。

完整报告、stdout、探针、清单及首个审阅器 fixture 错误已归档 `evidence/d3/independent-reviews/quality-final/`，报告 SHA256 `c2bdfd54171eb1eef3a05639932445323340ed88c76810a47b77ee7ba8013c2e`。该审查未新增 API、依赖或修改源码。

退出 22+7+2 组原始 OS 记录分列核对一致；历史 7.35s/20.69s OPEN、长 Bot/MCP stopping 未实测与 P3 短标签建议继续保留。未因此降低测试要求、提高等待预算或宣称全平台、全 kernel、完整桌面全功能实测。

说明：`d3-files-sha256.json` 保留实现者交接时的测试/fixture/文档身份，未覆盖写；之后 root 仅追加复审结果、更新文档状态与 verification-results，最终文件身份由 final-audit.json 中的收口记录说明。生产源码与 dist 清单始终未变。
