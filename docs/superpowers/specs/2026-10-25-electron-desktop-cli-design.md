# 桌面 CLI 模型验收契约

基线 main 8e192c5b，独立 codex/electron-desktop-cli，复用干净隔离工作目录。用户授权逐项修复、验证、本地合并、不推送。

首批后续回归99通过后 desktop-cli 失败：标题已呈现 deepseek-flash，旧断言仍查 deepseek/。核实 src/cli/tui.ts 以 context.model/options.model 展示模型名，已有 tui 单测明确相同标题（2435cced引入）。没有证据显示模型绑定损坏。

仅修验收：读取并按现有 TerminalAgentStateSchema 校验 getTerminalAgentMode，检查预期 provider/model、标题展示所绑定 model、假服务收到该 model 的实际请求。其余 pending input 拒绝、PID/cwd/变量不变、/exit、原会话草稿/终端会话连续性检查保持。产品、Shell配置、mock与超时不变。保存原失败和最终证据。
