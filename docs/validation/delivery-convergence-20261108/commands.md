# 实际执行命令与复核入口

以下命令均在隔离目录执行：

```sh
cd /Users/liuyue/.codex/worktrees/dawn-delivery-convergence-20261108/dawn-science
```

这是当时实际执行命令的记录。重新做离线桌面复验时，应改用新的证据目录，不能覆盖本轮或旧轮证据。真实模型命令不可为了复现截图重复执行，本轮授权对照已经结束（26/30），剩余4次是本轮未使用的审阅预留，不另启动任务。

## 最终类型、构建与全量

```sh
npm run typecheck
npm run build
npx vitest run
```

最终日志：final-typecheck.log、final-build.log、final-vitest.log。703文件7002通过11跳过，174.68秒。第一次全量的协议清单漏列、新工具记录回归修复前后的日志均单独保留；不把旧候选全绿代替最终候选证据。

## 相关桌面首轮41场景

```sh
DAWN_APPROVED_PLAN_EVIDENCE_DIR=docs/validation/delivery-convergence-20261108/desktop-final \
DAWN_AUTO_ARRANGEMENT_EVIDENCE_DIR=docs/validation/delivery-convergence-20261108/legacy/auto \
DAWN_MODE_MEMBER_EVIDENCE_DIR=docs/validation/delivery-convergence-20261108/legacy/members \
DAWN_COLLABORATION_EVIDENCE_DIR=docs/validation/delivery-convergence-20261108/legacy/collaboration \
DAWN_OUTCOME_EVIDENCE_DIR=docs/validation/delivery-convergence-20261108/legacy/outcome \
DAWN_SCIENCE_DEMO_DIR=docs/validation/delivery-convergence-20261108/legacy/science \
DAWN_HANDOFF_EVIDENCE_DIR=docs/validation/delivery-convergence-20261108/legacy/shutdown \
DAWN_ELECTRON_EXIT_DIAGNOSTICS_DIR=docs/validation/delivery-convergence-20261108/exit \
npx playwright test \
e2e/approved-plan-execution.spec.ts e2e/auto-arrangement.spec.ts \
e2e/mode-member-workspace.spec.ts e2e/plan-mode.spec.ts \
e2e/collaboration-workbench.spec.ts e2e/collaboration-network.spec.ts \
e2e/collaboration-outcome.spec.ts e2e/collaboration-stopping.spec.ts \
e2e/subagent-shutdown.spec.ts e2e/science-pipeline.spec.ts \
e2e/terminal-shutdown.spec.ts e2e/subagent-view.spec.ts \
e2e/subagent.spec.ts e2e/bot-collaboration.spec.ts
```

实际结果39通过、2失败；见desktop-first.log与failures目录。一个是新增标题栏断言定位错误，一个是工具记录被新提示污染的真实展示回归；两项已分别修正。

## 修复后的最终桌面专项

```sh
DAWN_APPROVED_PLAN_EVIDENCE_DIR=docs/validation/delivery-convergence-20261108/desktop-final \
DAWN_COLLABORATION_EVIDENCE_DIR=docs/validation/delivery-convergence-20261108/desktop-final-network \
DAWN_ELECTRON_EXIT_DIAGNOSTICS_DIR=docs/validation/delivery-convergence-20261108/exit-fixed \
npx playwright test e2e/approved-plan-execution.spec.ts \
e2e/collaboration-network.spec.ts e2e/science-pipeline.spec.ts
```

实际6/6通过，48.6秒，见desktop-fixed.log。覆盖真实8成员/长中文名/900px与粘性标题/搜索筛选/返回焦点、正式方案及产物版本、pass/revise/blocked流水线、干净原始工具输出。该证据不表述为同次最终全量41/41。

## 无模型的实际文件边界探针与退出汇总

```sh
node --import tsx docs/validation/delivery-convergence-20261108/completion-edge-probes.mjs
python3 docs/validation/delivery-convergence-20261108/summarize_exits.py
```

前者创建自己的临时文件并finally清理：validating→sealed，查询不增加提交次数；已验收文件删除后matches→unavailable，历史版本保留。后者只读现存诊断，汇总75份OS退出、73份有关闭起点，最大204.605ms；不拿协议关闭时间替代真实子进程退出。

## 已完成的真实对照入口（不要重复联网）

```sh
npm run evaluate:science -- --research-current-api \
docs/validation/delivery-convergence-20261108/live-01 \
'/Users/liuyue/Library/Application Support/dawn-science' \
deepseek deepseek-flash automatic-plan
```

最初宿主止于钥匙串预检且没有模型请求。用户恢复目标后恢复一次凭证预检；用户系统允许后，同一恢复宿主完成既定对照26次。原日志live-01.log与恢复日志live-resume-01.log分开，模型任务没有重跑。试验过程中不编辑src/scripts，不与全量/Electron并跑。

所有执行都使用本轮隔离配置和自制数据；正式profile只读凭证及当前模型元数据。正式配置/凭证/数据库哈希与main/旧证据保护结果见integrity-final.json。
