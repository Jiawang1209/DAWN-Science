# 过期视觉基线同步

基线6b4f80b0，独立codex/electron-visual-baselines。原14项6通过8失败；分别查看亮暗diff及实际/预期图，确认命令面板旧生成→先出方案文字（29ea5f97）、右坞surface-panel/圆角及设置栏圆角描边（86993b76、DESIGN 10-21）、旧v0.0.33→当前v0.0.35。侧对话差异是共用右坞头/外框及页签圆角，与当前已批准样式一致；无文字/按钮裁切。

只拷8份失败验证轮稳定actual帧，不改产品、测试等待、mask、threshold=0或maxDiffPixels=100；其他6基线不动，旧expected/actual/diff和前后sha256留存。按CLAUDE要求再验两遍14项，主目录也复验后本地合并，不推送。
