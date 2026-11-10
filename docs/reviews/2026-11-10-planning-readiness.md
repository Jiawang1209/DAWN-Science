# 科研规划与执行前就绪检查：专项自审

基线main：baaa2c5fa8a57fbdb019cdaa614348a45ea28218。专项分支codex/planning-readiness-20261110；用户授权开发、测试、审查和效果展示，没有本轮提交/合并授权，因此保留隔离工作区，不推送、不发布、不替换正式App。单线实现与自审，没有委派子agent。

## 改动与证据

| 问题 | 最终行为 | 证据 |
|---|---|---|
| 已知条件仍被反复问 | 自动安排与propose_plan共享澄清准则；目录明确返回confirmedFacts和missingFacts，假设性失败交既有预检处理，真实冲突问题保留 | b-red-corrected.log、b-green.log、tool-effects.json |
| 方案晚到批准才发现依赖错误 | 纯声明校验从原编译器提取，提交/批准共用；路径与契约不符、缺生产者依赖、嵌套写、审阅漏产物均提前拒绝。无保存、无自动补边，修正后可再交 | tests/tools/planning-readiness.test.ts、tests/protocol/executable-arrangement.test.ts；原approved-plan测试继续覆盖符号链接与内容版本 |
| 缺单位仍算数/写占位JSON | 显式unitStatus=missing贯通模板→acceptance→来源修订；只允许待补方案。TaskSettings、pipeline启动、子任务锁前、受控执行及验收/复用都用同一就绪判据；不启动子进程、不写三项科研产物 | c-red.log、c-green.log、lock-red.log、lock-ui-green.log、backstop-red.log、review-green.log |
| 旧证明可能跟着阻塞状态保留 | 科研就绪阻塞时返回无产物、无旧版本/通过证明的宿主回执，不能把历史证明当本轮通过 | stale-proof-red.log、stale-proof-green.log |
| 评测可能把缺项早停算成功 | automatic-plan的缺单位单组0模型请求，自动组按生产来源等待补信息；awaiting-info不算合格交付或正确科学blocked，manifest明确readiness-v2。离线入口仍要求已知单位配对合格、缺单位组完整且无产物 | research-unit-readiness.test.ts、research-fixture-cli.test.ts、empty-batch-red.log、empty-batch-green.log |

路径均相对于docs/validation/planning-readiness-20261110；测试源位于仓库tests/。

## 审查边界

- **确认与权限：** 已确认事实仍来自宿主source，目录查询不增加批准能力。模型问题不按关键词删除；模型不能自行补方法、单位、阈值或依赖。执行者名册、实际权限、符号链接/路径和输入内容版本继续在批准处冻结/复核。
- **会话与执行代次：** 缺单位作为原source与acceptance的一部分进入既有指纹，沿用owner、expectedRevision、来源CAS及原批准快照。补单位改变来源，旧方案不能复活；重启不重放。旧模板没有可选字段仍按原规则兼容，不猜测旧自由文本的单位含义。
- **取消与锁：** 预先已知缺单位不等待产物锁；abort优先于就绪阻塞。其他任务继续原锁池及排空顺序，没有扩大并行/嵌套，没有新调度器，也未调高退出阈值。
- **恢复与证据：** 原方案簿和表单草稿保存可选字段；跨owner、连接替换、迟到回调仍沿用原防线。阻塞不保留旧accepted证明、版本或deliverables，补齐后必须新确认、新方案、新采纳。
- **旧入口：** 非科研普通安排仍无需填写单位；旧描述性方案可显示。直接pipeline旧评测路径保持原语义，生产自动安排评测显式升级口径且不改旧报告。

## 实机效果与排查记录

9项相关Electron通过，包括原普通自动安排、取消、批准执行、编排入口和展开返回。新增路径实测：缺单位确认→待补信息、无法批准、无三项产物→重启仍缺单位→补m、确认第2版并生成新方案→真实Python计算x=1,2,3得到2m→分析和独立审阅均通过。

首次返回操作失败已查明是测试在表单重新挂载、约束尚未读回时调用uncheck；Playwright见默认未勾选便未点击，日志没有change事件。最终测试等待“已恢复勾选且可操作”后再改动，没有增加固定延时或重写原草稿机制。第二个测试设置问题是共享mock的正式回执固定3行m，而新测试最初给4行°C；宿主如实拒绝了该不匹配，随后正向用例沿用既有3行m夹具。原失败trace和诊断均保留，未修改科学验收断言。

截图在desktop/，actual-result.json为实际文件。前一候选15次桌面退出均为0，最大关闭147.28ms，无失败/到期/兜底事件；补齐格式及英文翻译后的最终构建又通过2项科研桌面路径，新增4次正常退出；exit-summary.json共记录19次样本。历史偶发退出超时、长Bot/MCP收尾和PTY清理继续OPEN，正常样本不能关闭它们。

## 验证状态

类型检查通过，最终构建通过。首轮完整Vitest为733文件，7164通过、11跳过、2项界面规范失败：新checkbox同一行包含父标签，静态扫描先截到父标签；另两条文案遗漏英文表。已只整理JSX分行并补翻译，未改扫描规则；119项定向UI检查通过。最终固定候选完整回归为733文件、7166通过、11跳过、0失败（vitest-final-green.log）。新增红测均保留，定向结果有交叉不相加。

本轮真实模型请求0。上述效果使用共享本地模拟模型，Python、文件、宿主契约与Electron交互实际执行。它证明规则与路径接通，不证明真实模型提问率、质量或费用改善；上一轮174次余额不使用。

新增缺单位判断依赖用户明确记录的结构化状态，不从任意普通聊天或旧单位字符串猜测。界面仍限既有本地Native/Python表格来源；其他普通任务不因此被要求填写科研表单。未开展新的跨平台、远端或真实服务验收，也未运行完整桌面套件；本轮是全量代码测试加9项受影响桌面路径。

## 最终结论

在本轮覆盖范围内未发现阻塞问题。候选1697个源码/配置文件及子进程构建保持一致，main仍为baaa2c5f且干净，正式profile三文件哈希不变。final-verdict.json保存结论。源码、计划、审查和效果证据留在隔离工作区，未提交/合并/推送/发布；原goal的实现、验证、自审和逐阶段效果已齐备，真实模型收益仍未新测。

离线入口额外保留12组实际文件：5个数值合格配对、缺单位两组awaiting-info（不算成功或正确科学blocked），72次localhost请求、在途0；独立CSV复算与文件核验12项通过，见fixture-summary.json。原失败trace与诊断移至当前用户目录下本任务独立档案，文件身份见archived-validation.json；旧路径生成的截图/JSON也均保留并恢复旧跟踪文件原字节，见legacy-desktop-index.json及legacy-generated-index.json。
