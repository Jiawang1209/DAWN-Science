# 协作台与自动安排收益验证实施计划

> 给执行者：采用 superpowers:executing-plans 单线按任务实施、superpowers:test-driven-development 先失败后修复；每阶段自审并展示真实Electron或可复查报告。用户已确认方向并要求直接开始，无需再次选择执行方式。不要自动commit/merge/push/发布。

**Goal:** 让现有协作台准确、完整地呈现方案与执行事实，并用扩充评测和分阶段用量验证自动安排的实际收益。

**Architecture:** UI只消费既有方案/RunOverview；评测复用真实Native、冻结Team、同预算请求门和科学真值；用量基于互斥宿主作用域归类，不新增调度、授权或恢复状态机。

**Tech Stack:** TypeScript、React、Electron、pi、Vitest、Playwright、现有evaluate:science。

**工作区:** `/Users/liuyue/.codex/worktrees/dawn-collaboration-evidence-20261108/dawn-science`，分支 `codex/collaboration-evidence-20261108`。

**设计:** `docs/superpowers/specs/2026-11-08-collaboration-evidence-design.md`。证据统一在 `docs/validation/collaboration-evidence-20261108/`；保留red、green、最终日志、截图和失败trace。旧证据不覆盖。

## 阶段0：冻结边界与建立goal

- [x] 核实main899463dd干净、读取长期路线图与最近验收；不把旧勾选当当日验证。
- [x] 创建独立worktree，复用已安装依赖，不更改正式App。
- [x] baseline.json只保存正式providers.yaml、credentials.json、dawn.db哈希及main身份；不复制凭证正文。
- [x] 写设计和本计划，检查范围/类型/验收，沿用用户设计批准。
- [x] 创建/goal：完成A/B/C、测试和自审，逐阶段展示；联网只在本轮明确新增额度后执行。

## 阶段A：方案状态及可见性

**修改文件:** `src/ui/task-arrangement-view.tsx`、`src/ui/plan-card.tsx`、`src/ui/orchestration-advisor.tsx`、`src/ui/i18n/en.ts`、必要的`src/ui/styles.css`。
**测试文件:** `tests/ui/task-arrangement-view.test.tsx`、`tests/ui/plan-card.test.tsx`、现有advisor测试、`e2e/approved-plan-execution.spec.ts`、`e2e/collaboration-network.spec.ts`。

- [x] 先加失败用例：同一安排从proposed切为approved后，待执行说明消失；superseded/discarded显示其实际方案状态；不能因approved显示验收通过。
- [x] 运行`npx vitest run tests/ui/task-arrangement-view.test.tsx tests/ui/plan-card.test.tsx`，保存red.log，确认是状态矛盾而非定位错误。
- [x] TaskArrangementView加入可选status，默认proposed；两个调用方传plan.status。每种方案状态各有说明，批准态提示冻结并引导查看执行记录。所有新文案经t/tf及en字典。
- [x] 把任务摘要、角色、执行者与依赖排列为一致的紧凑卡片，长文本换行/详情展开，保留完整身份与输入输出。只改展示。
- [x] 重跑专项单测、typecheck/build；实际Electron生成/采纳方案，核对主区与协作台文案一致。
- [x] 窄/宽窗口与长内容回归：node.bottom<=canvas.bottom；逐卡完整进入视口；footer命中当前卡；实际点击选择/记录/Escape返回；双会话隔离。
- [x] 自审状态来源、旧普通方案、remote入口、只读与编辑路径；展示阶段A实拍和限制。

## 阶段B1：任务驱动的规划质量评价

**新增文件:** `src/evaluation/arrangement-scenarios.ts`、`tests/evaluation/arrangement-scenarios.test.ts`。
**修改文件:** `src/ui/auto-arrangement-request.ts`（仅必要提示）、`tests/ui/auto-arrangement-request.test.ts`、`scripts/evaluate-research.ts`或现有评测报告入口（输出规划场景结果）。

- [x] 定义六类自制场景及明确输入/目标/禁止事项；简单任务期待single，独立输入各自产物期待parallel，前置产物约束期待chain，显式审阅必须有独立角色与依赖，信息不足须questions，禁止写入不能建议写权限。
- [x] 先构造合法但语义不符的TaskArrangement测试，分别捕获无意义拆分、串并混淆、审阅漏覆盖、缺确认及越权。任务数只作为方案结果；不以固定3个判优。
- [x] 实现纯评价函数，输出passed/findings/mode/taskCount/reviewCovered，不执行方案、不改变生产合法性或权限门。
- [x] 检查现有自动安排提示，补充“简单任务优先少拆、按独立产物并行、保留明确审阅”指导；继续不预填数字、不自动执行。
- [x] 通过本地模型夹具走真实propose_plan，生成并评估不同mode，提供场景×通过/发现表；明确这是离线规划路径证据。

## 阶段B2：扩题与多题同预算入口

**修改文件:** `src/evaluation/research-tasks.ts`、`scripts/research-cli.ts`、`scripts/evaluate-current-api.ts`、`scripts/evaluate-research.ts`、`src/evaluation/research-manifest.ts`及其测试。

- [x] 先加科学边界题真值测试：负值/零均值必须按n/unit/mean接受；重复站点仍保留所有行，不能去重或改输入。现有四题继续通过。
- [x] 扩到六题，继续共用实际文件、Python stdlib、冻结科学契约和judgeResearch；不把科学正确性降成“文件存在”。
- [x] CLI增加显式批次参数，列明taskIds/repeats/perArmLimit；重复/未知题ID、非法次数及总分配超过上限，在esbuild、Electron和凭证读取前失败。
- [x] Electron评测宿主从已验证批次派生同一分组额度，传给runResearchEvaluation；manifest冻结taskIds、重复、组上限、18/7等派生分区及模型设置。默认旧单题入口保留。
- [x] localhost执行多题多次，验证交替顺序、失败/阻塞/未运行、取消排空、分区不能借用、来源改变后停止后续试验；报告按题列完整配对与耗时/请求，不把全体均值当分工收益。
- [x] 获本轮额度后，冻结三题(short-known-mean/carbon-missing/unknown-unit)×2组×2次×25=300的proposal和候选，使用当前受支持模型；失败不重跑，完成即停，不为用满额度继续调用。
- [x] 没有授权时只完成离线，并明确真实收益未验证；旧额度不滚存，不读取钥匙串。联网中钥匙串只在系统提示操作，绝不请求用户在聊天里交密码。
- [x] 展示阶段B规划场景表与同预算报告；说明真实/模拟、题目和样本量及无法推论的范围。

## 阶段C：规划/执行/审阅用量与收口

**新增文件:** `src/evaluation/research-usage.ts`、`tests/evaluation/research-usage.test.ts`。
**修改文件:** `scripts/research-auto-arrangement.ts`、`scripts/evaluate-research.ts`、`src/evaluation/research-tasks.ts`及runner测试。

- [x] 先用互斥作用域造测试：规划10、执行20、审阅30应总60而不是50或70；一个scope partial/缺失须传播未知；未启动没有虚构0成本。
- [x] generateResearchArrangement在排空后用NativeRuntime.sessionUsage采集planner宿主用量，并连同失败/cancel诊断持久化；不读私有思考正文或凭证。
- [x] attempted Team任务按冻结resultType归入execution/review；planner独立计入planning。同一scope只计一次，失败前已完成用量保留。
- [x] 报告新增phaseUsage/totalUsage，保留旧usage字段兼容并说明其覆盖范围；输入/输出/缓存分别列，partial未知不计算金额。
- [x] 各阶段专项通过后只做一轮最终`npm run typecheck`、`npm test`、`npm run build`和相关Electron。涉及新失败再针对性复验；不无目的重复全套。
- [x] 自审会话/代次、旧字段、评测可信度、预算与取消；发现问题先修复补测试，报告自审不冒充独立审查。
- [x] 独立复算真实产物及version hash；再次核对main、正式配置/凭证/DB与旧证据边界，保留工作树，更新进度。
- [x] 最终展示主/展开协作台、任务状态和评测/分阶段用量，清晰标注真实与模拟。历史退出/PTY仍OPEN，1500/4000ms不变。

## 完成判据

A/B/C均有实现、当日验证与阶段效果；没有状态互相矛盾、卡片不可滚到、跨会话数据混入或预算计量重复的阻塞问题。真实复验按获批范围执行并诚实报告成败，不以测试通过或预算花完代替收益结论。候选保留专项分支，未获本轮明确授权不提交/合并/推送/发布。

## 阶段A进度（已实现，等待最终集成复核）

3项失败测试先复现状态矛盾；修正两个调用方后，44项UI单测通过，typecheck/build退出0，3项真实Electron通过（35.1秒）。包含主区与自动安排批准状态一致、900×640任务卡/依赖图完整显示和点击、展开返回、取消恢复及八成员网络。实拍在stage-a目录。尚未宣称真实模型收益，未提交/合并。

## B/C进度（最终验证前）

- 六类规划声明评价与真实Native/propose_plan的localhost场景均通过；题目不要求固定块数，实际样例出现1/2块与single/parallel/chain。不会将夹具判作模型收益。
- 科研题集从4扩至6；两题×两组的真实文件/冻结方案本地集成已通过，并确认规划用量加入总量。旧全题测试已扩为六题各两次（24组、12配对）并通过；初次组合验证唯一失败是旧CLI测试仍把新增第7个批次参数当非法，已调整为第8个非法参数，未放宽请求上限或验收。
- 增加批次taskIds/repeats/perArmLimit预检和先于宿主启动的总量检查，空批次文件名被明确拒绝。
- 规划缺少usage的模拟响应正确返回未知；补有供应方回执的夹具后，已验证planner.sessionUsage在stop前读取并独立归属，缺回执另测未知。观测不新增科学验收权限。
- 真实调用仍等待本轮明确新增授权；当前0次。最终源码冻结、全量测试、桌面回归与保留报告随后完成。

## 最终本地验收

源码冻结后 typecheck/build 退出 0；完整 Vitest 710 文件、7050 通过/11 跳过；14 个 Electron 规格文件 41 项全通过（3.9 分钟）。六题本地配对报告与独立 CSV/版本哈希复算均通过，51 个关闭退出样本最大 406.48ms、无非零退出或原生收尾异常。main、正式配置/凭证/DB与1659个冻结源文件保持不变；候选留专项工作树未提交。独立候选 Electron 演示已打开，使用 localhost 模拟，已实际生成/批准3任务、宿主验收3项，并演示 Escape 返回。阶段截图和用量报告已展示。

尚未完成且未宣称完成：本轮真实模型新增额度待答复，当前 0 次，不读钥匙串；因此真实收益复验子项保留未勾选，/goal仍待该条件结果，不以离线通过冒充真实模型结果。历史退出/Bot/MCP/PTY持续 OPEN，阈值不变。

## 继续验收补充

按目标逐项审计时补齐B1承诺的reviewCovered独立报告字段（red两处失败后修复，green八项通过）；增加长内容实际Electron验收，证明长标题全文、长路径首尾可滚到、无内部横溢或裁切及展开返回。旧冻结/报告保留，新候选v2冻结1664文件，最新六场景和六题报告另存v2，源码冻结后再次验证。具体矩阵见docs/validation/collaboration-evidence-20261108/completion-audit.md。真实模型新增额度仍待答复，真实子项继续未勾选。

补充验收最终结果：v2完整Vitest710文件7051通过/11跳过（180.24秒），typecheck/build退出0；新增真实长内容桌面1项通过，与前轮41项记录分开。1664文件冻结及main/正式profile/旧证据边界再次通过。唯一未完成项仍是新增额度答复后的真实模型复验；保持待办与目标未完成。

## 本轮授权后的真实复验（2026-11-09）

用户明确新增最多300次，按原三题×两组×各2次×每组25执行；实际148次，12组全部结束，denied=0、inFlight=0，宿主退出0，无失败重跑。结果详见专项live-results.md；不是必须用满300。原始v2报告与SHA保留，独立核对5份合格交付及15个版本文件；成功配对2/6，没有据此宣称普遍收益。

独立复核发现一处评测路径漏判：成功read的绝对路径未被字面量input.csv识别。两个针对测试先失败后通过；修复复用宿主resolve路径身份，仍拒绝其他工作区和错误/写入工具。原始报告不覆盖，live-offline-read-recheck.json只纠正一组正确阻塞的漏计，模型新增请求0。v3六题localhost与独立文件复算通过，完整回归正在最后收口；源冻结1668文件。之前等待授权/目标blocked属于历史状态，授权条件已满足。

本轮未继续开发未列入计划的新提交助手；模型端正式提交、证据引用与冻结字段抄写摩擦作为有实证的后续线索保留，不降低验收门。历史超时/PTY保持OPEN。

最终收口：同一完整测试集合限制4worker后710文件7053通过/11跳过（272.62秒），typecheck/build退出0。默认并行1项24组用例60s超时保留原日志；未改任何测试阈值或减少用例。completion-state.json证明1668冻结文件、原始live报告、main与正式profile不变。真实148次排空，原始/离线修正结果分开，所有计划实施项已完成；没有本轮尚待授权或需追加执行的工作。旧的active/blocked/待额度段落为历史记录，当前已具备目标完成证据。专项分支不提交不合并，不推送不发布，历史风险保持OPEN。
