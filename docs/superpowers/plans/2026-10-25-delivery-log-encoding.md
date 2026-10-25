# 独立交付验证日志编码修复

目标：真实进程的stdout/stderr按流解码UTF-8，跨块中文和表情不损坏。每路保留前1MiB原始字节，截断不产生半个字符，仍如实标记日志不完整。保持退出码、取消、超时、进程组和独立验证状态规则。

- [x] 新增真实Node子进程回归，先确认跨块输出和字节上限失败。
- [x] 用Node内置StringDecoder为两条流独立解码；在字节预算处保留完整前缀。
- [x] 验证交付服务落盘、真实Python及Electron日志预览；复验类型、构建与相关用例。
- [x] 记录证据，独立提交后快进本地main，主目录复验；不推送。

文件：src/delivery/verify.ts、tests/delivery/process-logs.test.ts、e2e/delivery-log-encoding.spec.ts及验证文档。用户已授权逐项修复；本项不改变界面设计或协议。
