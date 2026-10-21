# Genek真实单文件下载核验

2026-10-21。用户指定Genek，核验代码为本地main `d683424bee26c62c7b2081b50afd9bd72de6c761`，包含单文件统一任务功能提交 `f6bceb02`。本报告补验新版单文件下载，与[此前旧单文件及文件夹核验](2026-10-21-genek-transfer-verification.md)分开留存；此前“旧单文件需重新发起”的限制不代表新版行为。

## 环境与执行范围

- 真实公网SSH：`ug2478@gs191.genek.cn:22`，与保存的主机指纹比对一致；实际Electron加载主工作区main构建。未启用fake SSH或模拟延迟，无模型推理调用。
- 使用隔离配置、数据库、凭据副本及本机下载目录。初始加密副本无法解密，用户在隔离窗口重新填写口令；随后真实登录和应用重启后的凭据读取均成功，没有改写生产配置。
- 远端操作仅限本次新建且带所有权标记的 `/home/ug2478/.dawn-single-download-qa-20261021-da5cbe0c`。
- 准备阶段取消了较慢的本机64 MiB上传，随后在专属远端目录用 `/dev/urandom` 生成源文件；未将未完成上传计作通过。64 MiB用于进度和取消，4 MiB用于权限失败、重启、重试及完整性。
- 64 MiB下载和取消通过实际UI点击；4 MiB失败任务通过与下载按钮相同的 `startFileDownloadBatch` 操作发起，原任务“重传未完成项”通过实际UI点击。

## 结果

| 检查 | 实际结果 |
| --- | --- |
| 64 MiB中间进度 | 983040 / 67108864字节时仍在传输，界面显示1% |
| 取消与清理 | 点击取消后为已取消，停在1048576字节；最终目标不存在、无part文件，后续计数稳定 |
| 真实失败 | 仅将自有4 MiB源文件设为0000，实际返回Permission denied；任务失败，本机无半文件 |
| 重启保留 | 恢复0600后重启应用，原批次及明细仍为失败，保留原因；凭据可正常读取 |
| 原任务重试 | 重连后点击原任务重传未完成项，同一批次完成4194304字节，界面100%及已完成 |
| 连续进度 | 42、46、51、56、60、65、68、73、78、82%的10次采样，UI百分比逐次与实际字节计算一致 |
| 进度条可见性 | 任务进度线计算高度及实际可见高度均为5px |
| 完整性 | 下载文件SHA-256与远端源一致，归档时再次验证本机留存副本 |
| 远端清理 | 所有权标记和两份源哈希再核对后，仅删除已知测试文件并rmdir；目录已移除、SSH已断开 |

4 MiB文件SHA-256：`fac4ee5487b3b738ea6c2352794e7a303a84429bd26cace59db4d25394797280`。

取消批次：`batch-3e99a4fd-e220-4df5-961f-eab9fd3abe0c`。失败、重启保留与完成使用同一批次：`batch-e3950392-57ba-4997-b30d-53f68597bdaf`。

## 可复核证据

证据目录：[artifacts/genek-single-download-qa](../../artifacts/genek-single-download-qa/)。

- 汇总与连续采样：[result.json](../../artifacts/genek-single-download-qa/result.json)、[progress.json](../../artifacts/genek-single-download-qa/progress.json)。
- 取消终态与清理：[cancelled.json](../../artifacts/genek-single-download-qa/cancelled.json)、[cleanup.json](../../artifacts/genek-single-download-qa/cleanup.json)。
- 权限失败与重试：[permission-failure.json](../../artifacts/genek-single-download-qa/permission-failure.json)、[retry-completed.json](../../artifacts/genek-single-download-qa/retry-completed.json)。
- 实际截图：[下载中](../../artifacts/genek-single-download-qa/download-progress.png)、[取消后](../../artifacts/genek-single-download-qa/download-cancelled.png)、[权限失败](../../artifacts/genek-single-download-qa/permission-failure.png)、[重试进度](../../artifacts/genek-single-download-qa/retry-progress.png)、[重试完成](../../artifacts/genek-single-download-qa/retry-completed.png)。

原始JSON内的 `committed=false`、`pushed=false` 表示实测结束时的快照，归档提交以开发历史和Git为准。原始外部留存目录为 `/Users/liuyue/.codex/qa-reports/2026-10-21-genek-single-download-LrZNuh`；其中4 MiB二进制副本不加入Git，仓库保留源哈希及复核数据。归档内容不包含口令、凭据文件、数据库或生产配置。

## 结论与边界

新版单文件下载的真实进度、取消清理、权限失败后原任务重试及重启保留均通过。64 MiB没有完整下载，不将它描述为完整性通过；完整性结论仅对应已完成的4 MiB文件。未模拟断网、服务器重启，不声明断点续传。

本次归档只改文档和证据，不重跑远端测试、不改运行代码；本地提交，不推送、不替换安装版。
