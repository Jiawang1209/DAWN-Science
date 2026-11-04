# 版本化科研交接与批量专项证据

基线 07275d77；codex/versioned-science-batches；未提交、未合并、未推送、未发布。结论见 ../../reviews/2026-11-05-versioned-science-verification.md。

最终有效证据：

- typecheck-final.txt：类型检查通过。
- build-final.txt：Electron/CLI/UI 完整构建通过；保留既有构建提示。
- full-final.txt：618 文件、6162 测试通过，11 跳过，退出 0。
- electron-final.txt：11 场景通过，退出 0。
- evaluation-final.txt + evaluation/baseline.json / baseline.md：同条件 5 对真实 Pi 本地软件路径，正确交付/阻塞各5，错误放行0；不外推真实模型质量/费用。
- source-sha256.json + source-check.json：66 个变更源码/测试/夹具/配置文件冻结后无漂移，评测源码与 child 构建匹配；main 干净且未移动。
- input-reservation-final.txt：最后锁修复后的三文件12项针对验证；Bot 包含真实 Native/Pi/SQLite 版本观察。

其他 *-progress、*-red、*-green、*-typecheck 是开发与审查过程记录，可能包含预期红测、已经修复的失败或旧源码的通过；不替代上述最终证据。templates-first-green.txt 为首次通过记录，不是红测。独立只读复审记录整理在专项报告。
