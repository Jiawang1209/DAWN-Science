# 对话协作台与流程工作台：实现与验收

## 交付结果

默认主对话加入紧凑协作摘要；右侧协作面板改为紧凑任务列表与过程/交接/产物/记录页签。展开流程工作台后使用完整工作区：左侧 Agent 网络，右侧多列成员卡片、名称搜索、状态筛选，点击节点与卡片联动任务详情。真实任务依赖另用原 team-dag 呈现。已按用户中途提供的 Harness 截图调整规模与布局，实际 Electron 截图保存在验证目录。

本轮复用 getRunOverview、RunHistory、RunBudget、冻结交接 v1/v2、TeamSnapshot、原子转录与原团队管理入口；调度/契约/版本锁/取消排空/恢复语义继续由原后端决定。主对话摘要与面板对同一 client/session 只共用一份轮询。会话内阅读选择与页签保存在窗口中，切会话隔离。

## 真实效果

- [日常对话界面](../validation/collaboration-workbench-20261107/desktop/phase-b-conversation-dark.png)
- [展开后的 Agent 网络与成员卡片](../validation/collaboration-workbench-20261107/desktop/phase-b-network-dark-completed.png)
- [实际等待产物锁](../validation/collaboration-workbench-20261107/desktop/phase-a-lock-wait.png)
- [900px 窄窗口](../validation/collaboration-workbench-20261107/desktop/phase-b-network-narrow.png)
- [真实依赖与验收产物](../validation/collaboration-workbench-20261107/desktop/phase-c-pipeline-accepted.png)
- [重启后的保留记录](../validation/collaboration-workbench-20261107/desktop/phase-c-recovery.png)

演示使用既有 localhost mock inference 驱动真实 Electron、Pi、锁和落盘记录。8 个子任务是实际启动的测试执行；这不是新增真实模型科研质量测量。本轮真实 API 请求 0 次，沿用前一轮已耗尽的 30 次调用边界。

## 独立审查与修复

requesting-code-review 技能要求的独立只读审查发现三项 P2，全部修复并复核：

1. 累计 token 漏 cacheRead：改为 input+output+cacheRead，任一缺失或 partial 则标部分，口径与原预算一致。先失败再通过的测试见 red-usage.log 和最终 UI 测试。
2. live/idle 被主摘要写成“执行已结算”：增加预算阻塞、尚未执行、未知区分，仅全部排空才显示结算。red-summary.log 保留原失败。
3. 展开后触发按钮卸载，Esc 返回丢失焦点：由父组件引用重新挂载的按钮恢复焦点；真实 Electron 复现日志 desktop-network.log 保留，修复后 Escape/focus 断言通过。

补查会话迟到回复、最后订阅卸载、刷新不重叠、键盘页签、磁盘只读、普通子任务无虚构依赖、外会话 Team 不混入、task/run 分域选中、原子对话续聊、原科学任务验收。独立复核未发现新增阻塞问题。任务图标题使用“任务依赖”，不把所有普通任务称为冻结契约任务。

## 验证结果与原始日志

| 验证 | 实际结果 | 证据 |
|---|---|---|
| 类型检查 | 通过 | typecheck-final.log |
| 构建 | Electron/CLI/UI 全构建通过；最终文案后的 UI 重建通过 | build-final.log、build-ui-labels.log |
| 完整 Node/UI（最多4 worker） | 646文件、6378通过、10既有跳过 | full-unit-bounded.log |
| 最终 UI/设计/双语定向 | 6文件、125通过 | final-ui.log |
| 真实内核 | 12文件、50通过、1条件跳过；PATH优先/usr/local/bin | kernel.log |
| 相关真实桌面 | 22个不同场景通过 | desktop-final.log |
| 窄窗口/联动补验 | 1场景通过 | desktop-narrow-pipeline.log |
| 新依赖/验收断言补验 | 3场景通过，最终文案再补验1场景通过 | desktop-pipeline-expanded.log、desktop-pipeline-labels.log |
| 退出证据 | 35次正常native/管道退出，0清理错误，1次5秒观察记录 | exit-summary.json、timelines.md |

以上日志位于 docs/validation/collaboration-workbench-20261107。额外执行是重复场景的补验，不计作更多不同桌面场景。未声称完整桌面全套、跨平台、真实服务、签名打包或正式安装升级已验收。

## 必须保留的失败与跟踪

**首轮完整测试并非全绿。** 默认文件并发运行时 6376通过、1失败、10跳过；失败是原 tests/runtime/remote-terminal.test.ts:37 清理期，真实 shell 没在既有 vi.waitFor 默认1000ms 内报告退出。运行/测试文件本轮均未修改。单独复跑25/25通过；保持原断言和超时，以 maxWorkers=4 重新完整运行6378通过（期间另新增1项键盘会话隔离测试）。不将首次失败抹去，不断言根因已解决，也不与历史 Electron 超时自动认定为同一问题。full-unit.log 和 remote-terminal-rerun.log 均保留。

**本轮捕获一次约11.8秒的关闭延迟。** desktop-final-results/collaboration-network-rend-05ccc-inked-selection-and-filters/electron-exit 中，PID1953 的清理分支同步约1.01ms完成，应用退出事件已记录；父侧仍等到约11.8秒后才收到正常child-exit、管道关闭及Playwright close返回。5秒观察时进程仍存在，sample本身到期，未得到可用栈。最终exitCode0，无shutdown-drain-timeout/fallback。并发资源压力或Electron原生退出阶段只是待查方向，不作为已证明根因。后续普通重跑未触发观察记录；历史偶发 Close context 超时与页面提前关闭继续开放跟踪。

## 工作区与保存边界

- 工作区：/Users/liuyue/.codex/worktrees/dawn-evidence-evaluation-20261107/dawn-science，分支 codex/evidence-evaluation-20261107，叠加上一轮未提交证据交接功能。
- 本轮起点 baseline.patch/baseline-files.json 已保存。先前未提交文件仅 e2e/evidence-handoff.spec.ts、src/ui/i18n/en.ts、src/ui/run-overview.tsx、tests/ui/run-overview.test.tsx 随新入口调整，其余全部保留；未删除旧工作区。
- main仍为f685a56122ee6238affa55d8bd9ba6f9b604a6c7，干净未改。未提交、未合并、未推送、未发布、未替换正式App。
- 正式providers.yaml/credentials.json/dawn.db指纹与本轮首次检查及上一轮审计相同；只保存指纹，不保存凭证内容。
- 最终组合候选54个源/测试文件指纹见candidate-manifest.json（包含上一轮30个，不能误读为本轮新增54个）。审计结果见final-audit.json。


## 后续授权集成更新

2026-11-07用户另行明确授权复审、修复补测后本地提交合并main。组合代码已提交2885470a并快进main；main类型/构建、191定向及实际Electron通过。此处先前“未提交/合并”是首次实现时状态，最终结果见[复审与集成记录](2026-11-07-collaboration-merge-review.md)。未推送发布、不替换正式App；历史超时及真实模型收益边界继续保留。
