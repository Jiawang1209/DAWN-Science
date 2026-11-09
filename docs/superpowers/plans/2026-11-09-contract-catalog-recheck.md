# 科研契约目录生产接入与真实收益复验实施计划

> 使用 superpowers:executing-plans 按任务单线执行，修复遵循 test-driven-development，收口遵循 verification-before-completion。按仓库路线图，本轮不委派子 agent。用户已确认范围；不再重复要求方向确认。当前按计划执行；本轮新增最多300次真实请求已获授权，代码冻结后才联网，不自动提交、合并、推送或发布。

**Goal:** 让日常本地科研任务复用宿主可信契约目录，减少手抄冻结字段；在同题同预算实测中确认最新交付引导是否减少提交摩擦，并诚实记录收益或无收益。

**Architecture:** 用户确认现有模板参数，宿主生成并保存 owner 绑定的规划来源，模型只读查询并引用；展开完整合同后继续原方案簿、批准快照、Team DAG、工具证据、产物锁、内容版本和恢复。复验沿现有请求门与科学评测，不另建调度器或用量账本。

**Tech Stack:** TypeScript、Zod、React、Electron、pi、Vitest、Playwright，以及现有 research evaluation/request gate。

## 0. 工作区、依据与本轮边界

- 基线：main 5e64595b；旧交付功能 ad23c80f。
- 专项工作区：/Users/liuyue/.codex/worktrees/dawn-contract-catalog-recheck-20261109/dawn-science。
- 分支：codex/contract-catalog-recheck-20261109。
- 设计：docs/superpowers/specs/2026-11-09-contract-catalog-recheck-design.md。
- 证据根：docs/validation/contract-catalog-recheck-20261109/；阶段分目录 a-baseline、b-product、c-frozen、d-live、e-review。每次试验新建目录，不覆盖原报告。
- 已核对现状：planningContracts 当前仅由 scripts/research-auto-arrangement.ts 注入；主产品已有完整 contract、deliveryGuide、补信息闭环、任务轨迹、批准冻结、版本验收、取消排空与恢复。
- 以前的 7083 通过/11 跳过是上一轮验收快照，不冒充本轮新鲜测试。

本轮做：P1 真实收益复验、P2 可信目录生产接入、必要入口/反馈与评测接线。

本轮不做：固定任务块数、增加默认 Agent 数量、嵌套后代、提供方重构、新调度器、完整会话轨迹重做、自动批准/扩权、自动推送或发布、替换正式 App。第 3 项统一轨迹与导航另立后续计划。

## 1. 阶段顺序与展示节点

| 阶段 | 交付 | 向用户展示 | 阶段门 |
| --- | --- | --- | --- |
| A：复验口径与基线 | 题目、分组、预算、指标、旧失败类型与离线基线 | 一页基线表，指出已知事实和本轮要验证的假设 | 不改旧成绩；没有新调用授权则 0 真实请求 |
| B：生产接入 | 确认模板 → 宿主目录 → 方案引用 → 原批准执行 | 真实候选窗口的确认来源、引用方案及采纳前不执行 | 来源准确、owner/版本隔离、科学合同不降级 |
| C：反馈、离线闭环与冻结 | 必要 UI、恢复/取消/旧入口、同路径评测、冻结清单 | 缺单位、来源变更、取消、版本与返回四类效果 | 类型/构建、专项、完整 Vitest、相关 Electron 与自审通过 |
| D：真实复验 | 一轮冻结候选、12 组同题同预算报告 | 按题结果、提交摩擦、有效配对开销与失败解释 | 已获得本轮额度；不边改候选边测 |
| E：收口 | 审查、证据索引、效果说明与历史风险表 | 能力改变、实际收益或无收益、仍未完成事项 | 未验证部分如实保留；不自动提交或合并 |

先锁定 P1 口径，再做 P2，最后只对冻结后的同一产品候选执行一轮联网复验。这样不会默认耗费“改前 300 + 改后 300”两轮；历史结果仅作参考。等待额度时可推进 A/B/C，不能先调用后补授权。

## 2. Task A：基线、指标与新增额度提案

**复用文件：** scripts/evaluate-current-api.ts、scripts/evaluate-research.ts、scripts/evaluation-request-gate.ts、scripts/research-trial-budget.ts、src/evaluation/research-{tasks,budget,batch,manifest,submissions}.ts。

**新证据：** a-baseline/baseline.json、a-baseline/metrics.md、live-proposal.md；必要时新增 tests/evaluation/research-catalog-recheck.test.ts。

- [x] 核对 main 干净、读取上一轮真实/离线报告和产品接入点，创建隔离 worktree。
- [x] 写明设计、执行顺序、风险与预算提案；不重复消费旧额度。
- [x] 在本轮执行前保存源码/依赖/构建身份及正式 profile 三文件哈希；只读哈希，不复制或输出凭证。
- [x] 新建离线输出目录，跑当前 6 题基线及本轮三题中的缺单位待确认分支，记录原始输入、实际文件、版本哈希和宿主判据。
- [x] 冻结指标：有效方案/编译率，完整交付率、错误放行，正式提交次数/退回次数/原因，无正式提交、awaiting-info、正确 blocked、失败和取消；规划/执行/审阅请求、耗时、已知/未知用量。
- [x] 用同一 taskId/repeat 配对；失败早停成本留在全部试验账内，只有双方合格配对比较交付成本。不把请求次数叫 token 预算，不把 token 叫费用。
- [x] 展示基线表及本轮假设：漏 acceptance、指标键/证据引用退回是否减少；不预承诺多 Agent 优于单执行者。

**新增指标测试的明确判据：**

```ts
expect(awaitingInfo.success).toBe(false)
expect(awaitingInfo.falseAcceptance).toBe(false)
expect(awaitingInfo.terminal).toBe('awaiting-info')
// 与既有 summarizeResearch 同口径：不完整配对不能成为 qualifiedPair。
expect(summary.qualifiedPairs).toBe(0)
```

真实请求提案详见同目录验证根 live-proposal.md；收到明确答复后才记录 authorization.json。拒绝/未答复不妨碍离线工作，但 D 不标完成。

## 3. Task B1：可信来源模型与目录工厂

**新增：** src/protocol/planning-contract-source.ts、src/runtime/planning-contract-context.ts、tests/runtime/planning-contract-context.test.ts。

**复用/修改：** src/protocol/science-template.ts、src/team/science-templates.ts、src/team/science-pipeline.ts 的 pipelineStageContract、src/tools/plan-contract-bindings.ts。没有必要时不改这些科学算法。

- [x] 先补红测：同一已确认模板生成的 check/analyze/review 合同与原 pipelineStageContract 完全一致；没有确认时无可信目录。
- [x] 规划来源 schema 定义 version、ownerSessionId、确认修订、可选 routeId/revision/stepId、输入、输出根、dataPath、tabular-ecology@1 参数、独立审阅要求；路径继续复用 WorkspaceRelativePathSchema。
- [x] 用户输入从确认操作进入；模型参数、路线描述、主对话文本不能直接成为可信目录。路线只提供可核对候选，不推断单位、阈值或方法。
- [x] 工厂先 ScienceTemplateSchema.parse，再 scienceTemplate 展开，最后复用 pipelineStageContract 生成合同，交 planContractCatalog 得到内容引用。所有返回值克隆，外部修改不能改变来源或旧方案。
- [x] 输出根/输入重复、缺少声明 dataPath、同输入写入、非法路径或不存在的路线修订明确拒绝，不静默回退为弱合同。
- [x] 目录仅为候选合同：简单任务可选单任务；增加核查/审阅必须由实际依赖或确认要求决定。目录有三项不等于固定三个 Agent。
- [x] 跑定向 red/green 并输出 b-product/catalog-effect.json，展示精确合同和来源，不发送真实数据。

目录工厂建议接口在本任务实现并测试，后续任务只调用这一份：

```ts
type ConfirmedPlanningSource = z.infer<typeof ConfirmedPlanningSourceSchema>
// 输入仅为宿主验证后的确认记录；目录构造不读写科研文件、不启动执行。
function buildPlanningContractContext(source: ConfirmedPlanningSource): {
  ownerSessionId: string
  revision: number
  contracts: Record<string, TaskContract>
}
```

命令：`npx vitest run tests/runtime/planning-contract-context.test.ts tests/team/science-templates.test.ts tests/team/science-pipeline.test.ts tests/tools/plan-contract-bindings.test.ts`。预期先因新增能力缺失失败，最小实现后通过；不得降低旧合同的断言。

## 4. Task B2：保存来源、只读查询与方案绑定

**新增：** src/tools/get-plan-contracts.ts、tests/tools/get-plan-contracts.test.ts。

**修改：** src/runtime/plan-book.ts、src/runtime/native.ts、src/runtime/types.ts、src/protocol/plan.ts、src/protocol/operations.ts、src/workbench/backend.ts、src/electron/wiring.ts、src/tools/propose-plan.ts。

**测试：** tests/runtime/plan-book.test.ts、tests/runtime/plan-mode.test.ts、tests/runtime/approved-plan.test.ts、tests/tools/plan-contract-bindings.test.ts；新增 tests/workbench/planning-contract-source.test.ts。

- [x] 先测新建/读取/替换确认来源与旧 plans.json 兼容，损坏新字段不能丢弃旧批准记录或启用弱合同。
- [x] planningContext 作为 plans.json 的可选规划元数据原子保存。宿主从已解析 sessionId 的本会话簿读取 owner，不接受调用参数指定另一个 owner。读取错误显式反馈。
- [x] 在已认证会话的现有串行/写权门下增加来源确认与读取操作；运行/停止排空中禁止替换来源。确认只写会话元数据，不启动 Team、不写分析脚本或结果。
- [x] Native 创建会话时装配只读 get_plan_contracts 和同一来源回调；方案期之外不可调用；无确认来源返回明确 unavailable。有目录时列出来源修订与当前引用，不输出科研文件正文。
- [x] 避免 session.reload()；不能以 reload 重设权限、模型或扩展。目录通过只读工具动态查询，propose_plan 在实际执行时重新解析引用，不依赖建会话时的一份陈旧提示。
- [x] 确认来源存在时，引用和完整合同两种输入都必须保持确认的科学约束与独立审阅要求。普通无目录完整合同继续可用。
- [x] 提案内部记录来源修订与指纹；公开展示只投影摘要，不把内部来源变成模型可写字段。批准及手工编辑批准前再次核对来源；变化后要求重新安排，不静默沿用或换合同。
- [x] 已批准 executionSnapshot 保持不变；调整已冻结任务走停止 → 新方案/批次 → 再验收，不允许 running steer 修改科学合同。
- [x] 添加本轮新增协议的共享 mock 分支，使用 scripts/mock-inference-server.mjs 及 scripts/mock-auto-arrangement.mjs；dev:mock 和 Electron 不维护两套行为。

必须复现并通过的反例：A 会话引用送往 B、来源修订变化后的旧引用、完整合同绕开数值验收、删独立审阅、旧方案批准时来源已改、确认等待期间切换会话、取消后的迟到确认、损坏 planningContext、旧 plans.json 无新字段。

命令：`npx vitest run tests/runtime/planning-contract-context.test.ts tests/tools/get-plan-contracts.test.ts tests/tools/plan-contract-bindings.test.ts tests/runtime/plan-book.test.ts tests/runtime/approved-plan.test.ts tests/runtime/plan-mode.test.ts tests/workbench/planning-contract-source.test.ts`。

## 5. Task C1：必要入口和反馈

**新增：** src/ui/planning-contract-source-form.tsx、tests/ui/planning-contract-source-form.test.tsx、e2e/planning-contract-source.spec.ts。

**修改：** src/ui/orchestration-advisor.tsx、src/ui/team-panel.tsx、src/ui/auto-arrangement-request.ts、src/ui/run-overview.tsx、src/ui/i18n/en.ts；仅必要时改 src/ui/styles.css。

- [x] 在现有自动安排区增加默认收起的“科研任务约束”，从已选路线填充可核对的路径候选；方法、单位、缺失策略与验收条件必须由用户确认。
- [x] 显示模板、来源版本、输入/产物摘要和确认状态，不要求用户先填任务块数。
- [x] 将“确认约束”和“采纳方案执行”分开。确认成功后可以生成新安排，但不能自动点击 approve/execute。
- [x] 缺关键字段时保留草稿并显示缺项；来源变化时说明需重新安排；目录不可用时明确原因并保留普通任务入口。
- [x] 复用 owner + 来源/方案身份隔离草稿，所有异步回调校验当前 owner/请求代次；发送与中止沿现有 requester/stopAutoArrangement，不另建锁。
- [x] 对 get_plan_contracts 失败、来源确认失败、无新方案、取消收尾分别给反馈，不显示假“已生效”或假成功。
- [x] 900×640 与常用宽屏实际验证入口、可见下一步、成果详情、顶部编排入口、Esc/按钮返回、旧团队/文件/产物/记录入口，不靠只检查 DOM 节点存在。
- [ ] 展示三张实拍：未确认且没有执行；确认后有来源的方案；来源变化/取消后没有启动旧执行。记录演示用本地模拟，不冒充真实模型。

命令：`npx vitest run tests/ui/planning-contract-source-form.test.tsx tests/ui/orchestration-advisor.test.tsx tests/ui/auto-arrangement-request.test.ts tests/ui/orchestration-entry.test.tsx tests/ui/design-contract.test.ts tests/ui/i18n.test.ts`；构建后运行 `npx playwright test e2e/planning-contract-source.spec.ts e2e/delivery-guidance.spec.ts e2e/orchestration-entry.spec.ts`，证据通过环境变量定向到本轮新目录。

## 6. Task C2：评测与产品同路径，离线验收及冻结

**修改：** scripts/research-auto-arrangement.ts、scripts/mock-research.mjs、scripts/evaluate-research.ts、src/evaluation/research-manifest.ts；只在新增观测确有必要时改 src/evaluation/research-tasks.ts。

**测试：** tests/evaluation/research-auto-arrangement.test.ts、tests/evaluation/research-runner.test.ts、tests/evaluation/research-planning-questions.test.ts；新增 tests/evaluation/research-catalog-product-path.test.ts。

- [ ] 让评测规划调用 B 的确认来源/目录工厂及只读查询；不再只注入 opts.contracts 就宣称产品贯通。旧 planningContracts 入口保留兼容，不删除旧报告或夹具。
- [ ] 自制题配置确认参数，完整合同须与原科学判据相同；unknown-unit 不把评测期望答案偷填进单位，不建立虚假已确认目录。
- [ ] manifest 记录 catalog 来源模式、候选源码/构建/依赖指纹、模型声明、题目与预算，避免把不同接入路径混成一次比较。
- [ ] 六题离线实际工具执行、Python 真值独立复算、输入字节保留、产物版本核对通过。模型 fixture 的 token 回执只用于账目测试，不代表真实费用。
- [ ] awaiting-info、blocked、失败、无正式提交、取消和 not-run 独立记录；不改冻结成功标准来换高分。
- [ ] 全量前冻结源码，不在 full Vitest/research fixture 运行时继续改同一候选；变更使观察失效则保留旧日志并重新冻结，不覆盖原失败。
- [ ] 执行 `npm run typecheck`、`npm run build`、`npx vitest run --maxWorkers=4`；通过后跑相关 Electron，发现问题只复验受影响范围及必要全量，不反复无目的跑全套。
- [ ] 审查 source revision / planId / attempt / epoch 隔离、权限冻结、取消排空、产物锁、内容版本、旧恢复与入口。问题先复现修复补测试，再冻结 candidate-final.json。

相关桌面范围：planning-contract-source、delivery-guidance、orchestration-entry、approved-plan-execution、auto-arrangement、collaboration-outcome、collaboration-workbench、science-pipeline、science-batch、run-explanation-budget。生产来源接入不覆盖的远端/ACP保留原路由，不能隐式降级。

## 7. Task D：一轮冻结真实模型复验

**只复用：** scripts/evaluate-current-api.ts、scripts/evaluation-request-gate.ts、scripts/research-trial-budget.ts 及 C 的真实产品接入路径。

- [x] 读取本轮明确授权并保存 authorization.json；未确认前真实模型请求必须为 0。
- [ ] 凭证由原只读安全入口读取，仅在系统钥匙串提示处理；密码、密钥、完整端点和原始凭证不写聊天或日志。预检失败不自动重试联网。
- [ ] 使用当前本地目录支持的同一 API 模型；不支持的 API 或模型明确停止，不隐式换模型。记录模型/推理配置，保留原上限与超时。
- [ ] 冻结候选后运行 short-known-mean、carbon-missing、unknown-unit，各单/自动各重复2次，12组；总上限300，每组25，自动组18工作/7审阅。
- [ ] 全部实际推理请求计数，含规划、工具查询后的下一轮与失败；失败不自动重跑，组间不借额度，完成即停，不为用满300追加调用。
- [ ] 运行期间不修改同一候选源码、题目、模型配置或子进程构建。身份变化由现有 guard 停止后续试验并取消比较资格，不绕过冻结检查。
- [ ] 结束/取消都先排空，再读取请求门、累计用量、正式提交观测和转录；inFlight=0 后才收口。保留未运行/用量未知，不用缺测冒充零。
- [ ] 对实际 CSV 与结果独立复算，核对全部已验收版本；缺单位题检查没有推断结果，不以占位 JSON 混过标准。
- [ ] 输出 d-live/research.json、research.md、research-manifest.json、request-gate.json、independent-file-check.json、benefit-summary.md，附逐题解释。
- [ ] 展示：本轮完整交付/误验收/待确认数量，提交退回原因，合格配对的请求/耗时/已知用量。即使无改善也完整交付报告，不继续加功能以制造正结果。

300 是待新增的本轮请求上限，不是预计一定消耗，不是金额。历史148次报告作为参考列单独日期、模型和候选，不能拼接本轮样本。当前三题不证明大型并行科研收益，新增复杂题另列后续提案。

## 8. Task E：审查、效果和完成判据

- [ ] 写 docs/reviews/2026-11-09-contract-catalog-recheck.md 与验证索引，逐项列覆盖、失败、修复、限制及正式profile核对。
- [ ] 正常路径：确认模板 → 目录查询 → 引用方案 → 用户采纳 → 原冻结执行 → 正式提交 → 文件/版本/科学验收，逐环有证据。
- [ ] 反例路径：缺信息不执行；来源过期不批准；跨会话引用拒绝；停止未排空不放锁；旧代次回调不影响新代；重启不自动重放；旧普通任务和旧批准记录可用。
- [ ] 汇总本轮退出诊断，历史退出超时与 PTY 清理保持 OPEN。正常样本只记样本，1500/4000ms不变；出现异常保留现场，按根因修复，不加大阈值掩盖。
- [ ] 展示主对话、来源反馈、展开返回和真实复验报告；清楚区分模拟效果、真实文件验证与真实模型收益。
- [ ] 核对 main、正式三文件哈希及候选源码，保留旧证据。用户本轮未授权集成，完成后保留专项分支，不自动 commit/merge/push/release。
- [ ] 全部适用阶段完成后才将 goal 标为 complete；D 未获得额度或未执行时明确仍未完成，不用离线通过代替真实收益结论。

## 9. 后续第 3 项，仅作交接

在本轮收口后另立计划：基于已有任务阶段轨迹、工具记录和版本关联，补按请求/步骤组织的会话级统一轨迹、父子面包屑、搜索与时间定位，改善长历史浏览。当前不实现新轨迹面板、后端注册表或嵌套 Agent。最终收益报告用于决定第 3 项先展示哪些真实高频阻碍。

## 当前进度

- [x] 已确认范围并创建隔离分支，main 保持 5e64595b 干净。
- [x] 设计、详细计划和300次新增额度提案已落盘，未发模型请求。
- [x] 已创建与本计划绑定的 /goal，状态 active。
- [x] A基线：6个离线合格配对；缺单位分支 awaiting-info，不计交付收益。证据 a-baseline/。
- [x] 本轮最多300次授权已保存 authorization.json；真实请求仍为0，未读凭证。
- [x] B1可信工厂和B2核心：Native专项196项通过，后端/协议43项通过，界面/共享mock等61项通过；不同运行有重叠，不相加成总数。
- [ ] C正式接线已跑通真实文件/Python/两阶段验收、展开返回与重启；修复草稿后新增117项相关专项通过，最终4工作进程全量和相关桌面收口仍在进行。
- [ ] D联网及E收口未完成。历史退出超时/PTY仍OPEN。

### 实施中核对出的边界

- 单靠contractRef不能标识全部来源变化：方法文字与独立审阅要求也可能变化。因此propose_plan需带当前只读目录的catalogFingerprint，宿主仍自行写入私有绑定，模型不能授予权限。
- 清除来源保留修订代次并使用空指纹；防止“确认→清除”后旧未绑定提案复活。此前已批准快照保持原样。
- 取消发生在确认写入前时不继续发送；若宿主已原子接受确认，取消不会伪装成回滚，重新读取以宿主状态为准。界面切会话只忽略迟到响应，不修改新会话。
- Electron不另注入planningContracts；Native本身动态读取当前方案簿，避免第二份来源状态。


### 阶段证据补充

- b-product/offline-comparison.json：改前/改后均6个合格配对；单位明确的5道题，自动组各增加1次目录查询后的推理请求。全部仍为localhost模拟，不是模型收益结论。
- b-product/fixture-product-first/independent-file-check.json：独立Python只读复算12个试验目录、核对输入与已验收文件SHA；不执行模型脚本。
- 来源表单草稿和展开状态复用原collaboration-view，按owner及来源修订隔离；不构成已确认来源，更不构成批准。
- c-frozen/vitest-final.log：默认并发并行跑桌面时，旧24组科学批测撞到60秒；保留现场，不提高阈值。收口沿用此前maxWorkers=4，桌面独立执行。
- 截图测试曾沿旧默认目录落图，已把本次生成证据复制入c-frozen/legacy-evidence-generated，并按HEAD恢复34个旧跟踪证据文件。后续桌面命令统一显式指定本轮目录。


### C阶段收口与D阶段现状

- 固定候选：c-frozen/candidate-final.json；1757个源码/测试/夹具文件与624个构建文件，最终比对未变化。
- 类型检查、完整构建通过；完整Vitest 728文件/7135通过/11跳过，maxWorkers=4。日志 vitest-bounded-final.log。
- 23项相关Electron全部通过，日志 desktop-bounded-final.log；截图显式保存本轮目录。35次退出观察最大200.29ms、0错误事件；历史问题仍OPEN。
- 本轮宿主已按授权启动，deepseek/deepseek-flash、3题×单/自动×2重复、各25次，自动18工作/7审阅。当前停在钥匙串SecItemCopyMatching，尚无live-attempt或请求门，真实0/300；等待系统允许，不自动重启或换凭证路径。
- D真实调用、收益报告和E最终收口尚未完成，goal继续active。未提交、合并、推送、发布或替换正式App。

## 2026-11-10：当前授权与复审插入

用户本轮明确授权修复、补测后本地提交并合并main，覆盖前文“不自动提交合并”的默认限制；仍不推送、不发布、不替换正式App。审查报告：docs/reviews/2026-11-10-contract-catalog-merge-review.md。

审查发现方案写盘回滚、重复调用标识、非默认容差、未确认反馈和连接/取消代次等遗漏，均补红测后修复。旧候选的钥匙串等待宿主0请求，已停止，避免源码修改期间恢复联网；不自动重启。D真实收益复验尚未完成，原goal不能因本地合并而标complete。

当前固定候选和最终验证移至docs/validation/contract-catalog-review-20261110/。本轮代码验证与真实收益待办分开记录；历史超时/PTY仍OPEN。
