# 内容版本与批量专项的合并前复审证据

基线07275d77，codex/versioned-science-batches。旧 versioned-science-20261105 证据为首次实现记录；本目录记录本轮修复和最终源码。

- boundaries-red.txt：inode身份漂移、恢复路线竞态、长ID的原失败。
- case-alias-red.txt / scope-alias-red.txt：未来输出及工作区大小写别名的原失败。
- targeted-green.txt：关键7文件33项通过。
- scope-alias-green.txt：最后锁修复后3文件12项通过。
- typecheck-final.txt / build-final.txt：最终类型检查、完整构建通过。
- full-final.txt：冻结源码619文件/6171项通过，11跳过。
- electron-final.txt：11场景通过。
- evaluation-final.txt、evaluation/baseline.json / baseline.md：当前源码配对软件基线，各5/5成功、错误放行0，不支持真实模型/费用外推。
- source-sha256.json / source-check.json：67个文件无漂移，评测源码及child构建匹配。

提交和main集成验证另记 main-* 证据及 ../../reviews/2026-11-05-versioned-science-rereview.md。保留专项分支和工作区，不推送、不发布。
