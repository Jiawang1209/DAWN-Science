# P3：成果与阻塞优先的协作界面 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox syntax.

**Goal:** 用户从协作主视图直接了解当前状态、阻塞、下一步和已验收产物，展开后仍可追踪执行。

**Architecture:** 单一只读 selector 消费已有 RunOverview/Team 与阶段预算，不在组件中重做调度或乐观标记完成。既有事件通知触发合并拉取，轮询作为兼容兜底。

**Tech Stack:** React、TypeScript、现有 UI primitives/i18n、Vitest、Playwright。

---

## Task C1：统一成果与动作投影

**Files:**
- Create: `src/ui/collaboration-outcome.ts`、`tests/ui/collaboration-outcome.test.ts`。
- Modify: `src/ui/collaboration-model.ts`、`src/ui/collaboration-summary.tsx`、`src/ui/collaboration-task-detail.tsx`。

只读输出约定：

```ts
type OutcomeAction =
  | 'inspect-feedback' | 'inspect-inputs' | 'inspect-findings'
  | 'inspect-artifacts' | 'wait-for-drain' | 'inspect-recovery'
interface OutcomeView {
  state: 'active' | 'accepted' | 'blocked' | 'failed' | 'stopping' | 'history' | 'unverified' | 'cancelled'
  blocker?: string
  action?: OutcomeAction
  acceptedPaths: string[]
}
```

- [x] 同一成员不同任务/epoch、queued 时保留旧结果、review未提交、blocked/invalid、disk历史和停止排空写失败测试。
- [x] selector 只采本任务、当前合法尝试的结果和版本；acceptedPaths 来自宿主 accepted 回执，不从“执行结束”或模型正文提取。
- [x] 动作只打开已有反馈、输入、发现、产物和恢复检查视图；不在 selector 新增自动重试或扩大权限。

C1 已经独立规格与质量复审通过，真实 reducer 反例与红绿证据见 `docs/validation/research-collaboration-p1-p4-20261107/p3/README.md`。这不代表 C2 数据接线或 C3 产品界面已完成。

测试要求示意：

```ts
expect(queuedWithOldReceipt).toMatchObject({state: 'active', acceptedPaths: []})
expect(waitingForDrain).toMatchObject({state: 'stopping', action: 'wait-for-drain'})
expect(unsubmittedReview.state).not.toBe('accepted')
```

Run: `./node_modules/.bin/vitest run --project ui tests/ui/collaboration-outcome.test.ts tests/ui/collaboration-model.test.ts tests/ui/collaboration-workbench.test.tsx`。

## Task C2：使四处显示使用同一修订

**Files:**
- Modify: `src/ui/use-run-overview.ts`、`src/protocol/run-overview.ts`、`src/protocol/operations.ts`，以及现有 runtime 事件/后端通知适配 `src/runtime/types.ts`、`src/runtime/native.ts`、`src/workbench/backend.ts` 的实际事件入口。
- Test: `tests/ui/collaboration-workbench.test.tsx`、`tests/orchestration/run-overview.test.ts`；新增 owner/revision 通知与合并拉取单测到同目录。

- [x] 先查清现有推送入口，再增加只含 owner/revision 的通知；通知不携带执行能力或原始 prompt。
- [x] run overview 使用单调观测修订；相同 client/session 共享读取。通知到达 pending 期间只安排一次尾随刷新。
- [x] 保留 2 秒兜底；旧后端没有通知时继续可读。切会话、卸载、迟到请求和 out-of-order revision 不污染其他会话。
- [x] 任务图、成员、顶部计数和详情来自同一完整快照，不分别拼出不同终态。

## Task C3：界面与实际展示

**Files:**
- Modify: `src/ui/collaboration-expanded.tsx`、`src/ui/collaboration-summary.tsx`、`src/ui/collaboration-task-detail.tsx`、`src/ui/collaboration-workflow.tsx` 和对应现有样式/i18n。
- Test: `tests/ui/collaboration-workbench.test.tsx`、`tests/ui/collaboration-workflow.test.tsx`、`e2e/collaboration-workbench.spec.ts`、`e2e/submission-evidence-review.spec.ts`、`e2e/science-pipeline.spec.ts`。

- [x] 首屏依照设计中的文字线框布局：目标/阶段验收 → 阻塞/下一步 → 已验收成果 → 展开视图。首次布局实现前在隔离 HTML/组件预览中给用户看具体效果，留出反馈机会；延续已选定的对话协作台与展开视图方向，不要求重复确认该既定方向。
- [x] 使用现有组件与设计 token，保留过程/交接/产物/记录页签、成员搜索、状态过滤、原团队管理与子会话入口。
- [x] 选中/页签按 session 隔离；展开返回、Esc 与焦点恢复保持。结果图片/脚本/报告复用已有只读预览和版本校验。
- [x] 正常交付、阻塞、等待审阅、取消排空、恢复历史各展示一次；dark/light 与 900px 窄窗口真实截图。明示截图的夹具来源与抓取时阶段。
- [x] 独立复审会话/代次归属与旧功能入口，收尾构建/类型、完整 Node/UI 和相关 Electron。

重建后 Run：

```sh
DAWN_SUBMISSION_EVIDENCE_DIR=/tmp/dawn-research-collaboration-p1-p4-20261107/p3/desktop DAWN_COLLABORATION_EVIDENCE_DIR=/tmp/dawn-research-collaboration-p1-p4-20261107/p3/desktop DAWN_TRACE_VERIFY=1 ./node_modules/.bin/playwright test e2e/collaboration-workbench.spec.ts e2e/submission-evidence-review.spec.ts e2e/science-pipeline.spec.ts --output=/tmp/dawn-research-collaboration-p1-p4-20261107/p3/desktop-results
```

已有结果的目录先分配新的 runId 子目录并记录；不覆盖原始截图或视觉基线。


## 执行前核实的数据流（只读探索结论）

- `RunOverview` 增加可选 `team?: TeamSnapshot | null`、`observation?: {observerId, revision}`，单项增加 `resultEpoch?`。新后端明确 `team:null` 清除旧父组件团队；字段缺失才进入旧后端兼容路径，并注明不是统一快照。
- Native 同步捕获预算、当前团队、运行和观察版本；disk 只读团队指针并校验 owner，不调用会触发恢复写入的 Store 构造器。团队读取失败单列 `teamIssue`。
- 成果 selector 从同一 snapshot 查找选择项；直接运行要求 `completed + accepted + resultEpoch===epoch`。缺代次证明显示未核验，旧检查入口保留。团队历史已结算任务采用自身回执，不用成员后来任务的新 epoch 覆盖。
- 分析已验收的产物仍注明“阶段已验收，待独立审阅”；整条流水线未完成时不称已交付。最终验收与路线同步 pending/conflict 分开呈现。
- 独立 `RunOverviewChanged` 推送仅含 owner、observerId、revision、协议版本；`SessionTranscripts` 增加独立监听，Electron 复用现有 IPC。新增 `client.subscribeRunOverviewChanges`；旧 `subscribeUpdates` 识别后直接忽略，不能再次推进共享的转录 lastRevision。
- 服务观察订阅与 one-shot `wait()` 分开，观察者异常不能阻止执行/持久化；旧实例迟到回调校验仍为当前实例。团队写入也推进观察修订。
- 共用 Entry：单个在途读取 + 一个 trailing 标记，推送/手动刷新都不能丢；保留 2 秒兜底。observerId 更换允许 revision 重起，旧实例/低修订/跨 owner 响应丢弃。
- 接线还涉及 `src/workbench/events.ts`、`src/electron/main.ts`、`src/ui/client.ts` 与对应协议导出/测试。优先做 selector 与数据源，再落版式。
- 布局草案是合成状态预览，不是已实现产品；优先让用户看清阶段、阻塞、下一步和版本，保留四个检查页签与展开返回。

预算状态补充：普通新准入被预留阻止，不意味着现有分析已经停止或受保护审阅不能执行；selector 须区分这三者。预算文案改为“新的普通阶段暂不准入”，不得用全局 `budget.blocked` 直接推断整个流程 blocked。当前合成布局草案在本会话中展示，尚未接入产品。

### C2 接线拆分与刷新边界

为缩小复审范围，先完成 C2a 宿主快照/只读团队/独立通知，再做 C2b 客户端共用订阅/合并读取。C2a 两轮独立审查通过后再开始 C2b 实现。

- 已选通知类型 `runOverviewChanged`，载荷为 ownerSessionId、observerId、revision 与协议版本；runtime 独立事件为 `run_overview_changed`，不进入正常转录修订。
- Service 提供稳定 observation、subscribeObservation、invalidateObservation 与当前活动任务绑定只读 getter。团队和当前指针变化只使观察失效，不改变调度 wait 的代次。
- 纯磁盘投影使用保留观察标识 `disk`、revision 0；服务关闭且身份守卫通过后发出同一磁盘通知。此读数只表示只读来源，不是磁盘文件变更计数；2 秒兜底仍须接收相同观察修订下的最新文件/历时。
- 客户端须验证 owner；同 Service 较低修订忽略。服务 UUID 更换允许 revision 重新计数；已退役 Service 的通知/响应不能回写。保留磁盘标识允许 `disk → Service A → disk → Service B → disk` 多次切换。
- 一个 Entry 一次在途读取与一个 trailing 标记。通知或手动刷新发生在读取中必须尾随再读；通知序列/读取代次用于拒绝新通知前发出的迟到旧响应，不能只按 UUID 字符串判断新旧。
- 多组件共用 client/owner Entry 和事件订阅；最后订阅卸载后清 timer/事件监听、作废未完成请求。迟到 refresh 不创建没有订阅者的孤立 Entry。
- 测试先覆盖合并读取、重复通知、在途手动刷新、跨 owner/client、逆序修订、实例更换、重复 live/disk 过渡、卸载与 StrictMode、旧 get-only 客户端，再接产品布局。

### C3 产品布局的证明边界

已经展示的 `dawn-outcome-preview.html` 仅规定视觉层次，不将其中合成数字或句子复制为生产事实。首屏采用目标、阶段/结果、需要关注、下一步、对应版本与展开入口；使用现有 DAWN token 和 Button。具体约束：

- 整体成果与当前检查任务分别投影；选中历史分析不会把整体流程改为最终交付。
- 阶段标签来自当前流水线明确字段；没有当前周期的验收证明时不画伪造 `2/3` 或绿色勾选，不依靠任务名称、轮次后缀猜测。
- “实际执行”“持有产物锁”“独立审阅通过”各自需要已有宿主字段证明，不从合成布局文案或进程结束推出。停止中只在没有更精确证据时显示通用排空提示。
- 成果按钮保留版本 SHA 和阶段/最终范围，导航到既有产物与留存检查；当前工作区预览仍明确“当前文件”，不能伪称冻结验收版本的内容。
- 预算摘要直接使用宿主 ordinaryRemainingRuns/reviewReservedRuns/reviewRecoveryRuns，不在组件重做额度算法；未知不填零，普通阶段准入受限不等于现有执行已经停止。
- 保留原团队管理、子会话、预算调整、完整历史、四页签、搜索过滤与展开返回。沿用会话级选择与页签，刷新不重置；Esc/收起/版本预览返回焦点仍须实测。

C3 完成：最终全量 6728 passed、10 skipped，662 文件；最终冻结构建 8 项相关 Electron 通过。独立规格与质量复审通过。真实窗口覆盖取消且已核验排空；CLI SIGKILL 路径未抓到瞬态 stopping，宿主门闩/界面测试覆盖该状态，长时 Bot/MCP 实机路径仍未验证。完整证据见 p3/c3-delivery.md。历史退出仍 OPEN。
