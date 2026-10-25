# 已验收工作区界面的视觉基线收口

基线为 main `d7b266be`，独立分支 `codex/workspace-visual-baselines`。用户已接受 `1f75a285` 的界面并授权本地合并；原记录明确保留了对应像素基线欠账。

仅更新14张macOS视觉PNG及文档。先运行原视觉规格确认14项图像差异；查看全部expected/actual/diff联系图，再检查命令面板亮色和设置栏暗色的完整diff。结构变化为侧栏292→260px、固定工作区标题及搜索迁移、相应主区自适应位置、共用描边复制图标。未修改产品源码、测试脚本、mask、threshold=0或maxDiffPixels=100。

从失败验证轮的稳定actual复制基线；第一次复验12通过/2失败，完整diff显示输入卡发丝线/阴影差异，按仓库现有视觉纪律采用该轮稳定actual替换这两张。随后完整14项连续两轮通过（28.9秒、28.7秒）。原expected/actual/diff、接触图和逐张前后SHA256映射均保留。

完整构建通过；本轮开始时全量Vitest500文件5294通过/10原有跳过。主目录合并后另行保留复验日志。仅声明macOS固定1280×808视觉检查，不外推Windows/Linux或安装包。

证据目录：`/Users/liuyue/Documents/Codex/2026-10-25/dawn-science-next-audit/visual-baselines/`。本地合并，未推送、未替换安装版；保留当前已打开的用户开发预览。
