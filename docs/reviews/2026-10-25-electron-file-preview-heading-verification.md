# 剩余 Electron · 文件预览标题验证

基线c9781236，独立codex/electron-file-preview-heading，干净隔离目录复用；只改一份E2E及文档。

首批47通过后，窄坞标题元素盒29.195px高于行高18.2+1，报“文件名竖排”。实际查看失败截图是单行+水平滚动条。分支再次先红并记录：white-space=nowrap，clientWidth58/scrollWidth77，Range仅一条文字矩形，高15px、宽77.375px。现行共享预览头文件名单行横向滚动契约与该现象一致，原判据把滚动条计成了字行。

改为测Range实际文字行数/字形高，仍用原line-height+1门限；明确nowrap、非零可读宽度、聚焦及发生溢出时ArrowRight能滚动。顶行可达、时间戳先收缩、按钮高度不竖排均保持；不改产品CSS、不隐藏滚动条、不放宽阈值或超时。临时测量日志移除，证据保留。

最终整份files14/14通过（40.1秒），预览/收起/设计契约3文件138/138，类型通过。应用源码/脚本/依赖/单测与main相同，复用同版本已验证构建；git diff --check与自审通过。主目录集成复验另记。

证据：/Users/liuyue/Documents/Codex/2026-10-25/dawn-science-remaining-electron/file-preview-heading/，原始失败截图/trace在run-08-results，最终run-09.json。未推送、未替换安装版。
