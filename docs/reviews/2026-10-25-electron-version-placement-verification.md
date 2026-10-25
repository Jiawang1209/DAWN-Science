# 剩余 Electron · 版本位置验证

基线b57f294c，独立codex/electron-version-placement，仅改header-version及文档。首批原用例等待topbar版本失败；App/CSS与DESIGN第五轮明确版本位于全局状态栏最右、窄窗不隐藏。

当前用例检查实际包版本、全局唯一版本、1280/880窗口可见且处于状态栏内/最后元素/右内距边界；品牌文字仍一行，从设置页点击品牌实际返回“今天想分析什么？”并关闭设置。没有只在首页空点或删除导航断言。用例标题据当前行为改名，aliases.json记录同一基线用例映射，覆盖统计不算新增两项。

最终Electron1/1（2.0秒），设计契约103/103、类型通过；git diff --check、自审通过，应用源码与已验证构建一致。中间新增品牌检查曾错误以32px图标尺寸约束34px按钮，已改测实际文字行数后重新通过；该失败日志/run-12仍保留，不据此改产品或放宽阈值。未更新截图基线/超时。

证据：/Users/liuyue/Documents/Codex/2026-10-25/dawn-science-remaining-electron/version-placement/，原始run-11和最终run-13.json及两种宽度状态栏截图。主目录集成复验另记。未推送。
