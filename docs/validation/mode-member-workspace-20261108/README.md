# 编排建议与成员协作入口验证（2026-11-08）

状态：实现、代码复审与本地验证完成；专项工作区待用户验收，未提交、未合并、未推送、未发布。

- 基线 main：`d0b6ca78e40d0e051746df250978d3ecb06e9cb9`，main 保持干净、未切换。
- 分支：`codex/mode-member-workspace-20261108`。
- 工作区：`/Users/liuyue/.codex/worktrees/dawn-mode-member-workspace-20261108/dawn-science`。
- [详细计划](../../superpowers/plans/2026-11-08-mode-member-workspace.md) · [设计](../../superpowers/specs/2026-11-08-mode-member-workspace-design.md) · [审查](../../reviews/2026-11-08-mode-member-workspace.md) · [使用说明](../../任务安排与成员会话-怎么用.md)。

## 实际交付

1. 「如何安排任务」根据明确的任务块、依赖、共用写入、独立审阅给出建议和解释。输入不完整暂不推荐；明确审阅不能降级、冲突并行不能采纳。只追加到所属会话草稿，不自动启动、发送或改变现有运行。
2. 共用成员区域连接普通子任务原过程/续问/纠偏/停止、旧 Team 角色和邮箱、Bot 已启动成员只读对话。现有契约、产物版本、锁、预算、验收和恢复保持原执行路径。
3. 返回恢复 owner、成员选择、详情 tab 和展开；旧协作摘要入口的展开行为也保留。Bot 宿主回复晚到时，重新核对当前选择、执行代次和成员身份，拒绝抢回新界面。
4. 复用 evaluate:science 的 `--mode-advice` 子命令记录 12 个固定规划场景。全通过，新增付费模型请求 0；该矩阵不是实际模型收益对照。

## 当前效果（真实 Electron + localhost 假推理）

- [阶段 A：建议面板](desktop-completion/stage-a-advice-panel.png) · [完整界面](desktop-completion/stage-a-advice.png) · [追加草稿](desktop-completion/stage-a-draft.png)
- [阶段 B：成员入口](desktop-completion/stage-b-member.png) · [原过程与续问](desktop-completion/stage-b-conversation.png) · [返回原展开成员与记录页](desktop-completion/stage-b-return.png)
- [阶段 C：重启恢复](desktop-completion/stage-c-recovery.png)
- Bot 只读效果：playwright-completion 的 Bot Team 用例目录中 `unified-member-readonly.png`，同时断言未取得成员写租约、延迟 IPC 不抢新选择。
- 8 成员暗色网络、窄屏与原入口：collaboration-fixed/。全量桌面路径输出见下表，旧失败原件保留。

## 验证证据

| 检查 | 结果 | 原始证据 |
|---|---|---|
| 初始相关基线 | 4 文件 56 项通过 | baseline.log |
| 完整 Node/UI | 678 文件，6838 通过，10 跳过 | completion-node-ui.log |
| 最后变更后的定向复验 | 10 文件 144 项通过 | completion-after-review-targeted.log |
| 内核项目（串行，核心未改） | 12 文件，50 通过，1 跳过 | full-kernel.log |
| 最终类型/构建 | 均退出 0 | completion-after-review-typecheck.log / completion-after-review-build.log |
| 规划矩阵 | 12/12，0 模型请求 | evaluation-completion/mode-advice.json |
| 旧入口修复后相关 Electron | 14 项通过 | desktop-fixed.log / desktop-fixed-checks.json |
| 侧边会话与原团队入口 | 1 项通过；主草稿不变，侧边草稿追加 | desktop-side-fixed.log |
| 最终构建 Electron 复验 | 4 项通过，包括延迟真实 IPC、Bot 只读、草稿、续问、展开返回和重启 | completion-after-review-desktop.log / completion-after-review-checks.json |
| 源码冻结 | 656 文件无漂移，main 干净 | source-freeze.json / scope-audit.json |
| 退出观测 | 43 样本，最长 app.close 341.528ms、OS close 341.214ms | exit-observations.json / exit-*/ |

完整 Node/UI 后还修正了新增 RTL 测试中误用的 Playwright `exact` 类型选项，并将普通 Bot 会话的返回标签限制为真实成员查看态。最后 144 项定向、类型/构建和 4 项真实 Electron 覆盖这些变更；没有把定向计数加进全量计数，也没有把重复桌面运行算作更多独立场景。最终 4 项与先前 15 项存在重叠。

## 复审发现及原始红灯

- 输入缺失仍有内部默认推荐：review-incomplete-red.log → review-incomplete-green.log，现为无推荐。
- 新入口清掉 expanded 偏好，旧协作摘要返回失败：playwright-final 的失败截图/trace + review-return-red.log → review-return-green.log + desktop-fixed.log。
- Bot 迟到回复缺少当前成员选择核对：review-late-bot-red.log → review-late-bot-green.log，最后真实 IPC 延迟用例通过。
- 普通 Bot 会话不应显示成员返回标签：review-bot-return-label-red.log → completion-after-review-targeted.log。
- Chromium select 标签与 RTL 不同：playwright-a 失败现场 → 显式 aria-label 后通过；没有弱化定位或图像阈值。
- completion-typecheck.log 保留新增测试 `exact` 类型错误，修正后最终类型检查退出 0。

## 仍保留的限制

历史偶发 OS 退出 **7350/20690ms 继续 OPEN**，长时 Bot/MCP stopping 仍需独立复现。本轮短用例正常退出不代表历史原因已消除；1500/4000ms 预算和退出逻辑均未修改。

建议来自明确结构输入，是给模型的草稿，不是自动任务拆解/执行策略强制器。Team 邮箱无完整逐步过程与 task-attempt 标签；不能用它代替原始工具记录或验收证明。侧边会话的 Bot 打开能力未接入，已显示不可用原因。

没有新增付费模型、正式安装包/升级、全量桌面、Windows/Linux 真机或极慢机器验收；不宣称模型速度、成本或科学准确率收益。正式 App、凭证和数据库未操作。原始日志中的启动 ERR_ABORTED、ResizeObserver 提示、jsdom canvas 缺口和构建 chunk 提示保留，不等于所有日志无警告。日志当前保存在工作区，其中 `.log` 受既有 gitignore 影响，未来提交时需显式保留本轮证据。
