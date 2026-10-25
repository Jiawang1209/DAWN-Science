# 长脚本阅读底色验收

基线maind0726d1e，独立codex/electron-script-reading；用户授权剩余Electron逐项修复/验证/本地合并，不推送。

首批30通过后script-reading的R长脚本失败：预览rgb246/246/243与外层dock白色不一致。现行DESIGN 2026-10-12明确脚本预览采用surface-sidebar，当前CSS也显式如此；外层right-dock随后使用surface-panel，拿两者元素比较已不能验证该语义。

只改本验收：按浏览器解析的surface-sidebar令牌校验脚本底色，覆盖R/Python亮色及Python暗色；保留边框/行高/原文/展开还原/文件和产物位置/选中颜色/滚动保存和长路径空间等全部断言。不为通过测试改产品或整体配色，不更新像素基线。
