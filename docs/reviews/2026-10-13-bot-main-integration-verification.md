# Bot 功能 main 集成验收

日期：2026-10-13。用户授权测试通过后本地提交并合并。来源 `codex/bot-team`，基线 main 为 `5c7a1f74489800fbd3636f8c260db8fd1a8beec4`；应用 0.0.27、协议 8.15、数据库版本 17。

## 合并门已通过

- 本次重新运行完整单测：391 文件、4428 项通过、10 项原设置跳过，84.57 秒，退出码 0。
- 类型检查与完整 Electron/UI 构建成功，diff 检查通过。
- 44 项 Electron 用例通过，2.3 分钟：Bot 协作/私聊/派单/自动组队、旧 Team、侧边对话、响应式坞、文件树/菜单、R/Python 预览、长脚本展开及图片/脚本收起。
- 数据分析走真实会话、IPC、工具和文件：六行输入保留，确认 -999 后排除一行，n=5/slope=2/intercept=1/excluded=1。用户补充实际进入生成图形；脚本/SVG/CSV/Markdown 在 Bot 原消息内展开，× 收起及草稿恢复、窄坞标题可见性通过。
- 收尾只读复核覆盖数据库迁移、同 scope 私聊和派单幂等、Native 工具边界、取消/嵌套交流续接、产物真实路径及输出锁、UI 范围隔离和迟到读取。沿用前阶段复审和红绿回归证据，本次未发现新增阻断项；没有声称本轮另做独立 agent 审查。

本次命令日志保存在来源工作树 `tmp/bot-main-integration-verification/`；此前 UI 截图保存在 `tmp/bot-inline-preview-verification/`。未屏蔽失败、修改视觉基线、mask 或容差；仍有原有构建 chunk 提示、jsdom canvas 和旧英文缺译提示。

## 集成方式与保护

采用本地 fast-forward 合并；不 pull/push、不发布、不变更安装版。主工作区原有的未跟踪 `docs/superpowers/plans/2026-10-12-bot-team.md` 是早期计划副本，与分支的完成版不同；原文已完整备份到主工作区 `tmp/bot-main-integration-preserved/original-plan-crbjwwyr/2026-10-12-bot-team.md`，SHA-256 为 `60d9d4081c8dedad8129218667b4e34943929fc589f3293839cc638491829e6a`。合并前再次校验原文未被并发修改，再让该路径由已跟踪的完成版接管。

合并后核对 main 与测试分支的 commit/tree 一致，在主工作区重新构建并运行 Bot/团队关键 Vitest 和 Bot 协作/私聊/派单 Electron 冒烟；实际集成回执和主工作区复验日志保存在主工作区 `tmp/bot-main-integration-verification/`。保留分支工作树中的验收证据和正在查看的隔离预览。

## 使用边界

新 Bot 执行支持 Native/API，ACP/CLI 尚不作为 Bot 成员。确定性 mock 证明本机协作与交付机制，未评测真实模型科学判断质量，也未端到端验收真实 SSH/断连。退出应用后的草稿恢复、长期要求摘要、团队历史选择器和停止底层不返回时的总截止时间改造不属于本轮交付。
