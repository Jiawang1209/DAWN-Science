# 编排建议与成员入口审查记录（2026-11-08）

## 范围与授权

本地 main `d0b6ca78` 的独立 worktree `codex/mode-member-workspace-20261108`，按用户确认的优先级 1、2 开发。用户要求计划、/goal、阶段展示及测试审查；本轮没有提交/合并、付费 API、推送、发布或替换安装 App 的授权。遵守长期路线图单线实施，以下为本会话逐项复审，不标为新一轮独立子 agent 审查。

## 查到并修复的问题

| 问题 | 证据 | 修复 | 回归 |
|---|---|---|---|
| 输入缺失时内部仍计算默认模式 | review-incomplete-red.log | 输入不足时不返回推荐，保留审阅要求并禁用采纳 | 规则/界面/评测矩阵通过 |
| 打开成员后从旧主对话协作入口返回丢展开偏好 | playwright-final 的 collaboration-network 失败 trace；review-return-red.log | 路由卸载负责关闭 modal，窗口展开偏好保留 | 新单测复现旧错、修复后 9 项通过；桌面复跑结果见最终验证索引 |
| Bot 打开请求等待时选了另一成员，旧回复仍可能跳转 | review-late-bot-red.log 与延迟真实 IPC 桌面用例 | 请求绑定窗口选择代次、owner、child epoch 和当前成员匹配；宿主回复后再核对 | review-late-bot-green.log，最终 completion-desktop.log |
| 下拉框在 Chromium 的名称含选项文本 | playwright-a 失败 trace | 显式 aria-label，不放宽精确定位 | ab-desktop.log 两条真实路径通过 |
| 可能展示同名旧成员邮箱 | member generation/时间反例 | 同一 team+owner+member incarnation 才关联，排除加入时间之前消息 | collaboration-member.test.ts |
| 侧会话 Bot scope 与主会话能力不等价 | 现有 BotPane/openBotMember 路径审查 | 主会话才传递 Bot 打开能力，侧边显示不可用原因 | 侧会话草稿与旧团队入口桌面检查，Bot 只读桌面检查 |

原始失败 stdout、trace 和截图都留存，不更新旧逐像素基线、不放宽阈值。

## 已核对的不变式

- 建议纯函数没有模型、权限、文件锁、存储或执行句柄。既有运行不会被切换。
- 独立审阅要求不能用手选 single/parallel/chain 消除；依赖或共用写入时拒绝 parallel。草稿仍是建议，实际硬约束由已有冻结契约执行，不能把草稿称为安全边界。
- 草稿追加到当前仍可见的 owner，旧内容保留；没有自动发送。主/侧会话分别验收。
- 成员身份不使用 label 猜测；普通 index 需要安全非负整数，团队需要 owner/team/member incarnation，任务展示需要全部 attempt 字段相符。
- Team 邮箱不是完整过程、也没有任务代次标签；界面如实说明。没有将邮箱内容当作版本/验收证明。
- Bot 进入现有只读成员对话；使用现有 openBotMember 与 readOnlyBotCallbacks；没有获取成员写租约。侧会话未支持的能力不显示可用操作。
- 子任务复用原 SubagentDock，canAsk/inspect/expectedEpoch/回执控制不变。没有新起一套取消、排空、产物锁或恢复路径。
- 返回来源仅为窗口导航，按 owner+kind+target 一次消费，清除不再可见来源、其他打开入口和 resetAllState 残留；重启不会恢复导航指针。
- 原四个详情页、团队原始管理区、主对话协作摘要、子任务 chip 与 Bot 原会话入口保留。

## 历史风险保持 OPEN

历史 7350ms/20690ms OS 退出延迟、长时 Bot/MCP stopping 保持 OPEN。本轮沿用 Electron 退出日志与 1500/4000ms 预算；当前正常退出不能证明历史原因已解决。没有改动 watchdog、退出逻辑或预算阈值。

## 验证与限制

最终类型/构建/单测/内核/桌面计数、source hash 与截图以 [本轮验证索引](../validation/mode-member-workspace-20261108/README.md) 为准。localhost 模型验证软件执行链，不代表付费模型收益、科学有效性、Windows/Linux 真机、正式升级包或极慢机器验收。无本轮真实 API 额度，原 30 次剩余额度不滚存。
