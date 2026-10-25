# 远端内核完整链路验收

基线51a94384，独立codex/electron-remote-kernel-navigation。原run-61先红于旧远端服务器入口。只校准本文件旧UI定位：添加保存并连接后等ready、新建远端任务、管理菜单连接/断开/编辑；检测先展开高级设置；主输入不依赖会被续问建议替换的placeholder。run-62进入链路后5通过/3旧定位失败，证据保留；最终全部原内核/输出/状态/时限断言不改，产品不变。

完整remote-kernel8/8（48.8秒）：未配置选择→42，主动断开重建，意外掉线保持原x且接回得到43，后台杀核30秒内报警并重启（整例19.7秒），断线期间死核识别，解释器重开回显，Python png与R/IRkernel 42+图。相关UI2文件10项、最终类型通过，自审/diff检查通过，复用同源构建。

证据：/Users/liuyue/Documents/Codex/2026-10-25/dawn-science-remaining-electron/remote-kernel-navigation/，run-61/62失败，run-63最终。SSH身份/链路为夹具，Python/IRkernel及端口转发真实运行于本机；使用已有dawn-spike及/usr/local/bin/Rscript解析的系统R，不安装或冒充真实远端服务器验证。按授权本地合并，不推送。
