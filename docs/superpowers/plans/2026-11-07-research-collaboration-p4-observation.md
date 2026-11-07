# P4：成员上下文与消耗观测 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox syntax.

**Goal:** 清楚区分每个成员当前上下文、累计用量、组成估算、费用和未知状态。

**Architecture:** 扩展既有 contextUsage/子进程事件/RunOverview，只传数值与身份；当前读数不写进累计计费账本，不复制隐私正文。

**Tech Stack:** TypeScript、Zod、Pi、React、Vitest、Playwright。

---

## Task D1：有来源的上下文读数

**Files:**
- Create: `src/protocol/agent-context-observation.ts`、`tests/protocol/agent-context-observation.test.ts`。
- Modify: `src/runtime/native.ts`（复用 contextUsage 入口）、`src/subagent/protocol.ts`、`src/subagent/child-events.ts`、`src/subagent/child.ts`、`src/protocol/run-overview.ts`、`src/orchestration/run-overview.ts`。
- Test: `tests/subagent/child-events.test.ts`、`tests/orchestration/run-overview.test.ts`。

协议最小约定：

```ts
interface AgentContextObservation {
  childId: string
  epoch: number
  observedAt: number
  provider: string
  model: string
  source: 'provider' | 'sdk-estimate' | 'unknown'
  usedTokens?: number
  contextWindow?: number
  contextWindowSource?: 'model-config' | 'provider'
  breakdown?: {system: number; tools: number; messages: number; source: 'estimate'}
}
```

ownerSessionId 由外层 RunOverview 验证，后端不得信任子进程自称的 owner。字段都需有限非负数，epoch 匹配当前尝试；未知读数不包含伪造的 usedTokens=0。source 描述 usedTokens 的来源；contextWindow 的来源独立标明，不能把模型配置上限伪称服务商实测。当前数据不可用与字段值确为零分别测试。

- [x] 用量未知、旧epoch、外会话、晚到事件、换模型、缺模型上限写失败测试。
- [x] 从 Native 已有读数和实际请求/保留 surface 采样，事件中只发送数字、模型身份与来源，不包含 prompt/tool结果/隐藏推理。
- [x] 不从 TaskUsage 累计值生成 context occupancy；老协议没有新字段时照常运行，显示 unknown。
- [x] 磁盘历史不标实时；取消、换模型与恢复时撤销不匹配的“当前”读数，保留最后观测时间作历史说明。

测试要求示意：

```ts
expect(unknown.usedTokens).toBeUndefined()
expect(lateEpochApplied).toBe(false)
expect(otherOwnerApplied).toBe(false)
expect(restoredLiveReading).toBeUndefined()
```

Run: `./node_modules/.bin/vitest run --project node tests/protocol/agent-context-observation.test.ts tests/subagent/child-events.test.ts tests/orchestration/run-overview.test.ts`。

## Task D2：累计消耗与费用口径

**Files:**
- Reuse: `src/protocol/task-observation.ts`、`src/runtime/session-usage.ts`、`src/store/usage.ts`、`src/ui/usage.tsx`。
- Modify only needed projection/formatting: `src/ui/collaboration-network.tsx`、`src/ui/collaboration-task-detail.tsx`。
- Test: `tests/runtime/session-usage.test.ts`、`tests/usage.test.ts`、`tests/ui/collaboration-model.test.ts`。

- [x] 累计 input/output/cacheRead 与当前 occupancy 各用独立标签，partial 与 unknown 不变成零。
- [x] 第一版只使用已有费用或明确已有单价配置；没有价格来源不做外部价格查询、不新建价目管理或汇率模块。
- [x] 能估算时注明币种、单价来源/版本和用量是否完整；否则显示“费用未记录/无法估算”。不得用评测占位 cost=0 宣称免费。
- [x] 复用现有 budget token 口径，不把 context observation 算作新的付费调用或重复 chargeObservation。

## Task D3：成员观测展示和实机核对

**Files:**
- Modify: `src/ui/context-meter.tsx`（复用渲染/格式）、`src/ui/collaboration-network.tsx`、`src/ui/collaboration-task-detail.tsx` 及现有 i18n。
- Test: `tests/ui/context-meter.test.tsx`、`tests/ui/collaboration-workbench.test.tsx`、`e2e/context-usage.spec.ts`、`e2e/collaboration-workbench.spec.ts`。

- [x] 卡片只放当前上下文总读数/累计 token 摘要；详情展开系统/工具/消息“估算组成”、时间和来源。数字未知时不显示伪百分比/费用。
- [x] 验证主/子/另一会话读数互不借用，当前尝试与历史耗时不混合。
- [x] 用真实 Electron + 本地模型夹具展示数值、未知、取消、切会话和恢复失效，核对请求/日志所支持的口径。此展示不是计费服务实测。
- [x] 独立复审身份、隐私、旧协议和计费重复；完整构建/类型/Node/UI，相关 Electron。保留新退出诊断和历史 OPEN。

Run: `./node_modules/.bin/vitest run --project ui tests/ui/context-meter.test.tsx tests/ui/collaboration-workbench.test.tsx tests/ui/collaboration-model.test.ts`。重建后：

```sh
DAWN_COLLABORATION_EVIDENCE_DIR=/tmp/dawn-research-collaboration-p1-p4-20261107/p4/desktop DAWN_TRACE_VERIFY=1 ./node_modules/.bin/playwright test e2e/context-usage.spec.ts e2e/collaboration-workbench.spec.ts --output=/tmp/dawn-research-collaboration-p1-p4-20261107/p4/desktop-results
```

已有结果的目录先分配新的 runId 子目录并记录，不覆盖旧结果。


## 实施前核实的复用路径（只读探索）

- 现有 Native `contextUsage()` 使用 SDK `AgentSession.getContextUsage()`，后者依赖有效 usage 锚点及后续消息估算；它不是服务商独立的当前占用接口。共享采样须校验 provider/model 和最新 compaction 边界，避免旧模型数据串给新模型。
- child 已有真正的 Pi session，但尚无上下文输出。增加独立、仅计数的 stdout `context_observation`，不混入 TaskObservation 或 chargeObservation，也不写原始 prompt/隐藏推理。
- 扩展 AsyncLocalStorage ExecutionContext 的 reportContext 回调，在 executor 与 team runner 创建子进程时捕获宿主 owner/child/epoch；不要依赖仅部分后端具有的 steering binding。
- 宿主校验活动代次、模型、取消标记和时间顺序；磁盘保存的最后数值只能作为历史，current 资格由本进程持有，重启不得恢复成实时。沿 C 的观察版本通知刷新。
- 可用性、来源、是否当前分开：available 有有限非负 usedTokens；unknown 不带 usedTokens。capacity 有独立 model-config/provider 来源；历史、取消、换模型和压缩后的未知原因可见。
- 现有 retained bytes 是保留内容的序列化字节，不是 token 分解或实际 provider 请求大小。若展示组成，使用“组成估算·保留内容字节”，排除 thinking/隐藏字段，仅传数字，不按字节比例拆 token 占用。
- 现有原生运行时没有有来源的可显示费用，TaskObservation 也无可靠金额；首版显示费用未记录/无法估算，不能采信模型配置占位零价格。
- 网络卡当前把 input+output+cacheRead 相加的口径需改为“累计输入+输出”及“缓存读取”分列，分别标 partial/unknown；预算账本计量不在本阶段暗改。
- 预计新增 `src/protocol/agent-context-observation.ts` 与共享 sampler；接通 runtime/native/types、subagent/protocol/child/child-task/executor、team/runner、orchestration/execution-context/service/store/run-overview，以及 C 完成后的成员/详情组件和 ContextMeter。
- 红测必须覆盖旧 child 兼容、无 steering 后端、两 owner/child/epoch/model 隔离、晚到/逆序样本、压缩/重启失效、unknown 与有效零、缺 capacity、费用未知，以及观测不改变原预算/调度/提交和取消排空。

### D2 追加核实：累计来源的必要扩展

`ChildRecord.result.observation` 仅保存最后一个 epoch；child 的用量函数按本轮新消息计算增量，普通无契约任务目前还可能不输出 observation。因此不能直接把现有 result 标成“成员累计”。实施时在同一 Store、同一有效 `settleRun()` 原子变更中新增可选的已结算累计，复用原有 owner/child/epoch 防重守卫，不再调用一次预算结算。

- 每个字段保留已知 input/output/cacheRead、partial 和未知轮次；新 child 从第一轮覆盖，旧 child 缺累计时标记 legacyHistory，不把未覆盖历史当零。
- 普通子任务、续问、无 taskSettings 的托管 Bot 也捕获本轮 delta。取消强杀、崩溃恢复和缺 observation 记未知；重复 settle/recovery 不重复累加。未准入队列取消不计执行消耗。
- 同 child 的两轮执行或同一成员两次 assignment 累加；同名成员移除后重建按新 generation 创建新累计，不扫描整个同名成员目录。不能把被多团队复用的 Bot 主会话总量归给一个成员。
- 首版 UI 写“已结算累计输入+输出”，缓存读取单列。当前上下文是独立读数；若增加当前轮 delta 快照，只能按 epoch 替换，不能每次刷新相加，结算后撤去避免双算。
- 旧转录若无可靠绑定不做回填；只读补充来源也须与 epoch 累计分列，不能把绝对快照再次加进计数。

补充失败测试：同 child 两 epoch 求和、重复结算、普通续问 delta、多 assignment、成员 generation 替换、恢复幂等、legacy/partial/unknown、上下文更新不改变累计或预算。

现有口径须分开保留：`src/store/usage.ts` 的展示总量明确是 input+output，cacheRead 单列；`src/orchestration/budget.ts` 的既有委派账本逐项累加 input/output/cacheRead。D 改成员展示，不暗改账本算法，也不调用第二次 chargeObservation。普通任务新增 delta 采集可能使原先 unknown 的结算变为可核验，需用预算回归验证仍只结算一次、缺失缓存读不变成零。

D1 规格与质量复审通过：最终定向 86 文件/835 项，复审 43 项及独立 lease/isolation 探针通过；类型/构建通过。证据见 p4/d1-delivery.md 及 p4/evidence/d1/independent-reviews。成员 UI 与累计消耗仍待 D2/D3，不把旧 C3 窗口截图作为 D1 实机证明。

D2 累计来源已于 11 月 8 日通过规格与质量复审：107 文件/914 项，类型与构建通过；独立复审覆盖事务失败重试、取消继任、2000 epoch 数值边界。先前“无回执失败被忽略”P2 已复现修复，原失败保留。UI/费用标签仍由 D3 实现。为遵守新获批 A3“失败不自动重试”，D3 前先固定隔离评测 SDK 设置并独立复审，再冻结候选运行一次配对；不更改正式配置和产品默认行为。

### D3 实施细化（复用已完成的 D1/D2 协议）

- 卡片保持两类数值：有资格的“当前上下文”及“已结算累计输入+输出”；缓存读取独立标注。未知、部分、旧历史未覆盖和有效零分别表达，累计两个安全整数求和仍须检查溢出。卡片避免堆叠身份和技术字段，来源与时间在详情展开。
- 当前上下文必须来自同一 owner/child/epoch 的 `contextObservation.current`，并与 live、活动代次一致；磁盘、结束、取消、重启和换模型后的旧样本只显示历史/等待，不画当前占用条。缺上限不造百分比，SDK estimate 始终标估算，上限标模型配置来源。
- 任务详情沿 `teamTaskTimeline` 的精确尝试绑定查成员；旧任务不可借用该成员新任务的当前读数。成员累计若出现在任务详情，明确是跨任务的成员累计，不能称本任务消耗；本任务 observation 单列。
- 组成仅展示 `retained-bytes-estimate` 的系统/工具/消息保留内容字节；不能按字节拆 token，不能称实际请求大小或隐藏推理。provider/model、时间、历史资格和缺失原因可以折叠显示，不再获取主助手的 contextUsage 来填成员。
- 首版没有可靠费用来源，显示“费用未记录/无法估算”；不得采信评测占位零价格。网络卡增加数值时同步调整行距/节点高度，保持 900px 摘要与展开工作台可读，保留现有成果优先/工具/版本/交接/展开返回入口。
- 先写 UI 失败测试，再实现；实际 Electron 使用隔离本地模型夹具展示 known/unknown/历史/取消/切会话和累计两轮，深浅主题及窄窗口截图由 root 实际查看。独立 SPEC、QUALITY 后跑最终 Node/UI 与相关 Electron，首个失败和未验证边界保留。A3 运行中不修改这些源码。

D3 实现及本批验证已于 11 月 8 日交付，见 `p4/d3-delivery.md`：最终类型/构建、671 文件 6813 passed / 10 skipped、最终 5 条 Electron 及 disk 来源补验通过；15 条旧行为回归与最终候选仅不透明底色 CSS 差异。独立 SPEC/QUALITY 与整批最终审计未勾选，卡片累计标签是否需直接写 input+output 交由 SPEC 核对。

D3 及最终整轮独立复审完成：SPEC 115 软件 tests +42 probe cases，QUALITY 346 软件 tests +18 跨阶段 cases，冻结真实配对只读 115 checks；source634/build625无漂移。卡片短标签为P3非阻塞建议，详情已有input+output/cache分列与跨task范围。验证边界、实际图与历史OPEN见 p4/d3-delivery.md。
