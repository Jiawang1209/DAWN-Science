# 科研契约目录与真实复验审查

状态：实现已进入最终离线验收；联网与最终结论尚未完成。单线自审，没有委派子 agent。基线 main 5e64595b，专项 codex/contract-catalog-recheck-20261109；不提交、合并、推送、发布或替换正式 App。

## 已核对的实现链

用户确认 selection → SessionManager 当前 user 写权 → Native 活动/排空检查 → 方案簿原子保存 owner/修订 → 方案期只读 get_plan_contracts → propose_plan 当前指纹与原合同校验 → 方案簿私有绑定 → 采纳前再次核对 → 原 freezeApprovedPlan 快照/版本 → 原 Team 调度、工具证据、产物锁及验收。新能力不启动第二个调度器。

- 来源选择不接受 owner/revision/confirmedAt，宿主写入；线上的确认请求有 expectedRevision。
- 工具查询不读科研文件，不获写权、批准或执行权限；失败与不存在目录分开。
- 目录仅为 check/analyze/review 候选，简单任务可只选一个分析任务；用户未要求独立审阅时不固定增加三块。
- 完整 contract 和引用两种输入都核对当前冻结约束；删验收、扩权、去独立审阅、缺依赖均拒绝。
- 已批准任务不随新来源变化；方法/单位/缺失规则直接进入批准快照的执行说明，不依赖模型在正文抄写。
- 确认与规划共用前端 admission/取消；等待写权时取消不发送确认，切换 owner 不接受迟到响应。宿主已经接受的确认不伪装回滚，重新读取以宿主为准。
- 保留 Native 无子进程入口、远端、Bot 及旧完整合同的兼容路径；不使用 reload 重设会话。

## 审查发现及修复证据

证据根 `docs/validation/contract-catalog-recheck-20261109/b-product/`，所有 red 失败证据保留。

| 发现 | 修复 | 红/绿证据 |
| --- | --- | --- |
| 清除后旧未绑定提案可能复活 | 保留来源代次；空指纹也必须匹配修订 | clear-generation-red.log / book-query-green-2.log |
| 只验证某个审阅，额外提前审阅可混入 | 每个审阅均必须在分析之后 | review-dependency-red.log / core-verified.log |
| 仅凭契约引用无法识别方法文字变化 | 查询当前完整来源指纹并在提交/采纳重验 | product-plan-red.log / product-plan-green.log |
| 批准正文可漏写已确认方法 | 宿主说明直接冻结进原执行快照 | method-freeze-red.log / method-product-green.log |
| 路线不可读时前端可能悄悄脱绑 | 保留路线身份并要求重新读取，不自动解除 | route-ui-red.log / method-product-green.log |
| 损坏的其他 owner 来源可能出现在读取投影 | 返回明确 issue，不投影外会话来源 | foreign-projection-red.log / foreign-projection-green.log |
| 有绑定提案但来源元数据丢失可能回退弱合同 | 明确要求重新确认，可按现有代次恢复 | missing-source-red.log / 最终全量待核对 |
| 新能力支持检查误伤不带 childEntry 的旧方案入口 | 仅在确实支持新能力的本地会话装配 | 首轮 vitest-full.log / legacy-compat-green.log、full-findings-green.log |
| 旧科学模拟仍从静态提示找目录 | 同一研究模拟消费真实只读查询与指纹；旧注入用例保留 | evaluation-product-red.log / product-evaluation-green.log、full-findings-green.log |

首轮完整回归期间仍在修复源码，评测的候选变更 guard 正确使部分运行失去配对资格；它不是最终成绩。最终运行以 c-frozen/ 中固定候选与新日志为准。没有放宽旧设计、双语、冻结、预算或科学判据来消红。

## 尚待最终证据

完整 Vitest、23项相关 Electron、正式 profile 哈希与 main 核对，及用户授权300请求内的一轮真实复验。结果填写后才给出无阻塞结论。正常退出样本不关闭历史偶发退出超时/长 Bot MCP 清理/PTY 问题；1500/4000ms不变。

## 展示收口补查

- 发现展开工作台导致未确认约束草稿重挂载后丢失：复用collaboration-view保存owner+来源修订的草稿和展开状态；修订不匹配时不采用旧草稿，刷新从宿主读取。source-draft-red.log、source-draft-green-2.log（117项通过）保留。
- 导航请求计数用例曾在前一轮规划未结束时取基数：等待停止按钮消失后再比较，仍保留“展开返回不新增请求”的断言；navigation-source-recheck.log 2项通过，navigation-request-audit.json 2→2。
- 默认全并发与桌面同跑，原24组科学批测60秒超时一次；无源码变化。收口沿用先前4工作进程，不改科学、退出或PTY阈值。
