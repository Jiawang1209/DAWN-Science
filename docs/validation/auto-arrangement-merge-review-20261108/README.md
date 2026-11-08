# 自动安排合并前复审：验证索引

对应 [复审记录](../../reviews/2026-11-08-auto-arrangement-merge-review.md)。本轮新增证据单独存放，旧两批原始证据不改写。

- `before-sha256.json`：复审前 526 份已修改/新增文件的指纹（按当时 Git 可见范围，忽略的旧日志不在此清单）。
- `source-freeze.json`：最终 663 份 src/scripts 冻结指纹。
- `focused-red.log` / `markdown-red.log`：停止确认门闩、历史等待、工具取消和 Markdown 示例反例。
- `recovery-red*.log`、`playwright-red*/`：真实 Electron 的首次定位问题及正确重开后的恢复缺陷，原图与 trace 保留。
- `focused-green.log`、`review-final-green.log`：定向验证；后者 11 文件 106 项通过。
- `review-green.log`：门闩测试挂错钩子导致超时，保留现场，未放宽超时。
- `branch-checks.json` / `final-*.log`：冻结后串行类型、构建、Node/UI、独立内核、离线评测与相关桌面结果；已全部通过：6868 Node/UI（10 跳过）、50 独立内核（1 跳过）、30 相关桌面，类型/构建及离线安排 4/4 通过。
- `desktop-final/`：自动安排 1/2/3 块、调整为 2 块、重启恢复、取消后重启及手工修改批准的真实界面。
- `member-final/`、`collaboration-final/`、`outcome-final/`、`playwright-final/`：原成员入口、展开返回、原团队/Bot、侧边会话与停止排空回归。
- `exit-*/app-*.jsonl`、`exit-*/exit-*.jsonl`：应用侧与宿主/OS 关闭诊断。统计必须从 close-requested 相减，保持历史超时 OPEN。

分支验收通过，无剩余阻塞，准备按授权本地提交并合并 main。最终桌面批次 33 次原生退出正常，最大 OS close 267.631ms；所有中间批次累计 39 次退出亦有完整正常诊断。663 源码、464 旧证据零漂移。集成后会追加真实提交与 main 复验；无推送、发布、正式 App 替换或付费请求。
