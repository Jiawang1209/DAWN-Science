# 剩余视觉基线同步

基线6b4f80b0，独立codex/electron-visual-baselines。全14项先跑为6通过8失败；逐类查看亮暗diff及实际/预期图，核对已合入提交/设计后，只同步8份过期图。

| 亮暗两张 | 确认的差异及来源 |
|---|---|
| 命令面板 | 生成→先出方案文字（29ea5f97）和v0.0.33→0.0.35 |
| 概览 | 右坞surface-panel、radius-lg及当前标签外形（86993b76/现行样式）和版本 |
| 设置栏 | 设置壳圆角/hairline与固定头部（DESIGN 10-21、86993b76）和版本 |
| 坞里的对话 | 共用右坞头/外框、页签圆角和版本；消息/输入未裁切 |

直接使用run-51失败验证轮稳定actual；不使用未经稳定帧批量update。旧expected/actual/diff和每张前后sha256保留。产品/E2E脚本/等待/mask/threshold=0/maxDiffPixels=100均不改，其余6基线不动。

更新后全14项连续两遍通过：run-52 28.8秒、run-53 29.2秒。自审及diff检查通过。证据：/Users/liuyue/Documents/Codex/2026-10-25/dawn-science-remaining-electron/visual-baselines/updates.json及上述原始结果目录。仅macOS固定1280×808视觉基线，不外推Windows/Linux。按授权本地合并，不推送。
