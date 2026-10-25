# UniProt 与三个科研插件验收（2026-10-25）

分支 codex/uniprot-proteins，基线 main 0ca81138（GEO、SRA 已分别验证合并）。上一项 SRA 在 main 再验 158 项相关测试、类型/构建和 4/4 Electron 通过。

## 本分支验证

- TDD：客户端缺失、工具未装配/未知插件、FASTA 被归为 application/octet-stream 的失败均先观察，再实现和复验。
- 相关 131 项、FASTA/文件/科研相关 92 项通过；最终 `npm test -- --maxWorkers=4`：516 文件、5461 passed、10 原有 skipped。FASTA 预览补齐后完整重跑。
- 类型检查通过；稳定启动器执行当前工作树完整 build 通过。未在 Electron 用例期间重建同一 dist。
- 最终 Electron 45/45：uniprot-proteins、sra-datasets、geo-datasets、literature、crossref-literature、office-plugin、browser-plugin、memory、settings-counts、markdown-math、visual。包括默认开直接查询、主编号、FUNCTION、JSON/Markdown/FASTA 三产物、FASTA 磁盘精确字节及字面预览、关闭后重启持久化、限流/零结果、方案只查。
- 14 张原有视觉图通过；只更新启用数断言 7→8，没有修改图片、阈值或遮罩。
- 官方匿名真实工具：P04637、TP53，393 残基；实际 tools 查询→缓存选择→保存，FASTA 去掉头及分行后与接口原序列逐字一致。输出在证据目录 protein-live-workspace/outputs/proteins/records-*。
- 固定隔离原生预览展示独立 GEO/SRA/UniProt 三卡和总计 8 个内置插件；新科研卡与文献卡缺省开，页面 1280px 无水平溢出。已有用户会话、模型、工作区保留，未重置凭证或插件设置。
- 人工按设计复核来源/编号、序列长度与字符、FUNCTION 审阅状态、缺失不补造、总量/截断、独立缓存和目录、符号链接拒绝、写门、只读与远端边界、共用 mock；没有待处理问题。未委派子 agent。

## 范围

API 模型新会话可用，ACP/外部 CLI 不新增工具。GEO/SRA 提供元数据，不下载原始测序文件；UniProt 提供规范序列，不做同工型/结构/变异预测。FASTA 仅包含实际完整序列；缺失/超 100000 残基不伪造或导出截断序列。三个新插件与 OpenAlex/Crossref 缺省开启，显式关闭保持关闭。

## 可复查证据

`/Users/liuyue/Documents/Codex/2026-10-25/dawn-science-research-plugins/`：

- geo-*、sra-*：各自分支与 main 验证记录、真实 API JSON、预览截图。
- uniprot-full-tests-final.log、uniprot-electron-final.log、uniprot-build-final.log、uniprot-typecheck-final.log、uniprot-fasta-tests.log。
- uniprot-live.json、uniprot-live.log、protein-live-workspace 下真实三文件。
- uniprot-preview.png、uniprot-flow.png、uniprot-fasta.png。

三项各自通过后合并本地 main。未推送、未发布或替换安装版。main 最终复验另行记录，不把分支结果冒充为 main 运行。
