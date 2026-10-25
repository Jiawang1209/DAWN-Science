# 剩余 Electron · 脚本阅读底色验证

基线d0726d1e，独立codex/electron-script-reading，仅修改script-reading及文档。后续30通过后，旧断言拿脚本底色与外层dock白色比较，实际暖灰不等。DESIGN 2026-10-12与显式CSS要求脚本surface-sidebar，而外层dock已是surface-panel。

使用浏览器在当前预览上下文解析surface-sidebar令牌，明确不得解析为透明，再比较实际底色；亮色R/Python与暗色Python均使用该检查。原文、行距/边框、产物/文件、选中颜色、窄宽展开/还原/滚动和DOM保留、长路径受限高度等全部目标保持。不改产品配色或超时、不更新视觉基线。

整份script-reading3/3（12.3秒），相关预览/收起/设计契约3文件138/138、类型通过；git diff --check与自审通过。R/Python在这里是合成长脚本文本验收，未将它称为真实R/Python分析执行。应用源码与已验证构建一致。主目录集成复验另记。

证据：/Users/liuyue/Documents/Codex/2026-10-25/dawn-science-remaining-electron/script-reading/，原始run-21与最终run-22.json/results；截图覆盖亮暗、宽窄和长路径。未推送。
