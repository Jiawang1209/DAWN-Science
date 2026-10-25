# 版本位置 Electron 验收

基线main b57f294c，独立codex/electron-version-placement。用户授权逐项修复、验证和本地合并，不推送。

header-version仍在.topbar .brand-version查找版本，当前App/CSS及DESIGN 2026-10-11第五轮已将版本移到全局statusbar最右且窄窗不隐藏，首页标题也改为“今天想分析什么？”。旧断言在5秒内找不到元素。

只对齐本用例：包中实际版本在statusbar唯一可见，宽/窄窗均位于栏内最右，品牌保持单行；从设置页点品牌实际返回首页，而非在首页空点。保留几何/版本及可点击目标，不修改产品、不延长超时、不更新视觉基线。
