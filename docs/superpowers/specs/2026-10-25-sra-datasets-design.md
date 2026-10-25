# NCBI SRA 插件设计

用户已批准 GEO → SRA → UniProt 顺序开发，独立分支验证后本地合并，不推送；科研插件缺省开启，旧的显式关闭设置保留。GEO 已合入 main 5de49adb，当前只做 SRA。

- 独立「科研数据 · NCBI SRA」插件，默认开，两族三工具：`sra_search`（关键词/Entrez 表达式、1–20 条实验记录）、`sra_get_accession`（Study/Sample/Experiment/Run 编号精确归属查询，最多 20 个实验）、`sra_save`（真实缓存记录保存）。支持 NCBI/ENA/DDBJ 的 SR/ER/DR 编号；BioProject 可用关键词/表达式查询，首版不增加跨数据库桥接。
- SRA 搜索单位是 Experiment（SRX/ERX/DRX），不是 Run 或独立生物学样本。清单保留实验/研究/样本编号、物种、测序平台与仪器、文库策略/来源/选择/单双端、实际 Run 元数据及来源。返回总量为实验条目总数，不能称作样本量。
- `sra_get_accession` 逐条检查请求编号属于返回的 Study/Sample/Experiment/Run；实验/运行编号应命中一个实验，研究和样本可以对应多个实验，超过 20 明确说明单页范围。每个实验最多列 40 个 Run，精确 Run 匹配先于截断，指定运行即使在第 41 项也保留；不得用相近编号冒充。
- 共用 GEO 的 NCBI 队列、20 秒/2 MiB 预算、取消、HTTP 错误和无自动翻页；不下载 FASTQ/SRA、不安装 SRA Toolkit、不做质控或访问受控数据。
- `@xmldom/xmldom` 0.8.15（现有锁文件已有传递依赖）声明为直接依赖，仅使用 `DOMParser.parseFromString` 解析 ESummary 内嵌 expxml/runs。拒绝 DTD/ENTITY、解析警告/错误和无效编号；保留 XML 转义文本。不手写 XML 正则解析器，不用远程服务解析，不将 XML 送入 UI。错误与预算限制留在 DAWN 的请求和映射层。
- 保存用已有 `outputs/datasets/records-*` 新目录、JSON/Markdown、会话/来源独立缓存、写权限门；远端只查询，方案/讨论只允许只读工具。
- dev:mock/Electron 继续共用同一假科研服务与模型步骤。验证默认开、真实 Run/文库详情、清单预览、零结果/限流、方案无写入、关停持久化、跨来源 ID 不能保存；实测官方匿名 API 与固定原生预览。

官方依据：https://www.ncbi.nlm.nih.gov/sra/docs/srasearch/ 与 NCBI E-utilities 文档。独立实现，不引入参考项目代码、命名或素材。
