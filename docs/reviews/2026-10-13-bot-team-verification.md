# Bot Team 分支验收 — 2026-10-13

> 此文件记录第一阶段身份/任务底座及流水线验收。随后用户明确要求实际 Bot 交流/交接；最新实现与 8.14 验收见 `2026-10-13-bot-collaboration-verification.md`，不能只凭本文件证明实际互调。

## 状态与范围

- 分支：`codex/bot-team`，基线 main `5c7a1f74`（0.0.27）。
- 工作树：`/Users/liuyue/.codex/worktrees/bot-team/dawn-science`。
- 已完成 Native/API 首版 A/B/C：坞中 Bot 管理与直接交流、稳定 ID 斜杠委派、主对话自动组队与依赖调度、结果送达及产物预览。
- 未提交、合并、推送或替换安装版。预览使用独立配置、数据库、CLI home、技能、记忆、scratch、下载及工作区。
- 协议 8.13；数据库迁移 17。旧身份、团队与会话保留，不把 direct 私聊复制为团队上下文。

## 最终验证

所有命令在上述工作树执行。日志与截图保留于 `tmp/bot-team-verification/`（忽略目录，不提交生成文件）。

| 检查 | 实际结果 | 证据 |
| --- | --- | --- |
| 改动前全量 Vitest | 366 文件，4282 通过、10 跳过 | `/tmp/dawn-bot-team-baseline.log` |
| 最后源码冻结后 `npm test` | **384 文件，4345 通过、10 跳过**；82.97 秒，无失败/未处理异常 | `vitest-full.log` |
| `npm run typecheck` | exit 0，无类型诊断 | `typecheck.log` |
| `npm run build` | Electron 与 UI 均构建成功 | `build.log` |
| Electron 相关回归 | **43/43** 通过；覆盖 Bot、旧团队、侧边对话、自适应坞、文件列表、R/Python 高亮、预览展开/收起、文件菜单 | `electron-43.log` |
| 最终派单重试修正后 Bot Electron | **6/6** 通过，22.8 秒；包含真实工具依赖及产物点击 | `electron-bot-final-6.log` |
| 最后重试回归 | service + 真实 backend **4/4** 通过 | `retry-regression.log`，旧实现失败 `retry-before-fix.log` |
| `git diff --check` | 通过 | 收尾再次执行 |

Vitest 中现有 jsdom canvas 未实现提示与构建的 chunk-size 提示仍存在；没有因此忽略测试失败或改动视觉基线、容差、mask。

## 真实执行证据与边界

1. **三 Bot 依赖链**：假模型从真实注册表读取稳定 ID，数据 → 统计 → 绘图依次启动；三个不同 Native 成员会话各执行一次，任务均 completed，依赖及 attempt 与持久团队记录一致。模型推理是确定性的；会话、SQLite、pi 工具、文件写入及运算为实际链路。
2. **实际交付**：五行输入，质量结果 n=5、missing=0，OLS slope=2、intercept=1；结果 CSV 严格两行。生成 `scripts/model.py`、`scripts/plot.py`、`results/model.csv`、`notes/data.md`、`notes/method.md`、`figures/regression.svg`，SVG 系数从运算结果读取。脚本不是仅登记路径；Electron 点击 model.py 后在现有脚本预览中读取到真实内容。
3. **真实内核与权限**：`tests/kernel/bot-native.integration.test.ts` 同时启动主会话与 Bot 的独立 Python 内核，验证实际执行结果及各自文件。修复 spawnteract 在并发启动/握手前不保留端口导致的 ZMQ 抢占：仅串行启动握手，已启动内核仍独立并行。`tests/integration/bot-native-session.test.ts` 通过真实 pi 工具验证权限/结构化问答不能由错误会话代答，成员不能递归创建团队。
4. **重试与恢复**：请求先持久预留，重复请求共享执行/回执；仅明确分配前拒绝可清理重试身份。响应丢失、分配后落库失败、同请求结果不明后 Bot 停用均不被误判为未分配。结果通过持久 outbox 和历史 resultId 去重；中断写任务重启不自动重放。
5. **停止与文件冲突**：纯 Bot 团队停止取消未分配等待任务，避免收尾又启动下一项。相同 scope 的重叠输出路径排队，规范化绝对/相对/符号链接路径；未知输出独占。产物存在性与真实路径通过所属执行器核验，不能核验的引用明确标记；这是调度与交付约束，不能声称是新的操作系统文件沙箱。
6. **UI**：Bot direct 与旧侧边对话各自订阅/草稿/历史。模型显示来自真实会话，模型移除不自动换收费模型。空主对话 `/bot:` 仍走确定性派单；`/plan` 拒绝派单并保留草稿。图片补充暂不支持时明确拒绝并保留附件，避免静默丢失。亮暗主题及 280/480/720px 截图已保存。

## 尚未验证与首版限制

- **真实 SSH Bot 协作尚未端到端验收**。scope 包含连接与远端 cwd，执行/产物校验复用远端接口，失败不回退本机；代码检查和本机测试不能证明真实服务器、网络断连及远端 R/Python 内核已经通过。
- **真实模型质量尚未评测**。目前证明调度、权限、执行和交付链路成立，不代表不同模型的任务分解或科学结论质量。演示数据为特定五行算术样例，不是统计方法有效性评测。
- 新 Bot 团队执行限 Native/API；ACP/CLI、自由 Bot 群聊、递归组队、自动长期记忆、定时自主工作不在首版。
- 结果不明的任务保持原请求身份并要求检查现有任务，不能通过自动换 ID 无条件重复执行。

## 预览与审查

隔离窗口展示 `Bot-Team-Demo`，三个专业 Bot 及真实生成的示例产物；`preview.log` 记录演示临时目录，`branch-preview.png` 保存效果。推理服务器与 e2e 共用 `scripts/mock-inference-server.mjs`。演示回复包含固定测试文本，不代表真实模型最终措辞。

基础协议、运行时、UI 经独立只读复核；发现的 startup failure、恢复竞争、符号链接路径、团队停止、模型继承和重复派单边界已修复并复验。最后派单审查确认未知 allocation reservation 在 profile/scope 前处理，不会因后来停用 Bot 而产生新的可重复派单身份。
