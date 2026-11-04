# 验证证据索引

代码基线 5c88414e，专项 codex/science-pipeline，日期 2026-11-04 至 2026-11-05。

- `*-red.txt`：刻意保留的缺能力/边界失败复现，不是最终验收结论。
- `*-progress.txt`、`*-pre-review.txt`：实施中输出，可能包含已修复问题。
- `admission-green.txt`、`recovery-review-green.txt`、`review-final-targeted.txt`：并发/取消/指针/恢复/边界的对应回归。
- `adapters-recovery-green.txt`：实际 Pi 子进程、Workbench/SQLite Bot 和共享锁路径。
- `typecheck-final.txt`、`build-final.txt`、`unit-final.txt`、`electron-final.txt`：最终源码验证，结果与审查报告一起阅读。
- `source-sha256.txt`：最终变更代码/测试及夹具清单；文档与原始日志不计入源码哈希。

正式结论见 [实施及审查报告](../../reviews/2026-11-05-science-pipeline-verification.md)。没有真实服务商或科学结论验收。
