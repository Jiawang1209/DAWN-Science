# 托盘新建首页验证

基线eb368d6d，独立codex/electron-tray-home。run-46连续105项后旧首页标题断言失败，截图已在现行首页。校准标题并补查首页草稿为空、原会话仍唯一、重新打开后托盘草稿保留；关闭窗口不销毁/隐藏和原草稿检查保持。不改产品。

整份tray 1/1（2.5秒），相关草稿/导航2组件文件11项、类型通过。最初组件过滤为空未计为通过，已用真实存在文件重跑。自审/diff检查通过，复用同源构建。证据：/Users/liuyue/Documents/Codex/2026-10-25/dawn-science-remaining-electron/tray-home/、run-46红/run-47绿。覆盖真实窗口close及webContents托盘事件，原生系统菜单点击本身不在边界。按授权本地合并，不推送。
