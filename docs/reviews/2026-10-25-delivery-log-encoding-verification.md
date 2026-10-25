# 独立交付验证日志编码

基线 `6ace7655`，分支 `codex/delivery-log-encoding`。真实Node进程将“中”和“🌱”分开写入stdout/stderr，原实现逐块Buffer.toString导致两路均出现替换字符；真实Electron中Python分块输出“模型完成🌱”，原日志预览显示“���型完成🌱”。旧失败和探针保留。

两条日志流各持有Node内置StringDecoder及独立原始字节预算，每路至多1MiB。流结束时正常收尾；若达到预算，忽略尚未组成完整字符的尾部并保留logTruncated，不把半个UTF-8字符落盘。退出码、独立进程组、中止/超时和验证状态判据保持。

验证：新增3项真实子进程回归在原代码上全部失败，修复后交付模块6文件55项通过；覆盖逐字节中文/表情、stdout/stderr独立、超限边界及恰好满预算。类型与完整构建通过。真实Electron6项通过（22.4秒），包含原交付主链、编号/类别误判回归、缺失输出与新增日志场景；新增场景实际使用/usr/bin/python3，验证输出比较通过并打开stdout.log/stderr.log核对中文和表情。模型使用共用确定性mock，未连接真实供应商，不安装依赖。

证据：`/Users/liuyue/Documents/Codex/2026-10-25/dawn-science-next-audit/log-encoding/`。本地合并，不推送，不替换安装版。主目录复验另存main-*日志。
