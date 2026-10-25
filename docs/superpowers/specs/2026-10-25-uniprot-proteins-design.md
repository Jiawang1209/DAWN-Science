# UniProt 蛋白信息插件设计

用户已确认三项独立插件默认开启，逐项分支、验证、本地 main 合并，不推送。GEO 与 SRA 已合入 main 0ca81138；当前只做 UniProt。

- 独立「蛋白信息 · UniProt」卡，默认开启，保留显式关闭。两族三工具：`uniprot_search`（关键词/基因/物种 UniProt 表达式，1–20 项）、`uniprot_get_accession`（6/10 位主编号精确核验）、`uniprot_save`（当前会话实际 recordId 的记录与可用 FASTA）。首版查询规范序列，不扩展同工型/结构建模/变异预测。
- 使用官方 `https://rest.uniprot.org/uniprotkb/search`，JSON 格式，指定必要字段 accession/id/reviewed/protein/gene/organism/length/function/sequence。从官方 X-Total-Results 头读取总量，单页不翻页。编号查询用 accession 表达式且核对 primaryAccession；旧/次级编号映射不能冒充主编号相同。
- 记录蛋白名、基因、物种、分类号、数据库审阅状态、FUNCTION 注释及实际返回的参考标识。审阅状态不等于功能结论已由本应用验证。不补造缺失注释。
- 序列必须为来源实际返回的大写氨基酸字母，若提供长度则必须一致。最多 100000 残基；超限保留元数据并明确序列未保存，不伪造/截断后当作完整 FASTA。缺失序列不生成假 FASTA。注释文本 10000 字、基因/来源参考最多 40 项，截断提示。
- 复用科研有界请求与会话缓存，独立 UniProt 串行队列（间隔 500ms），20秒/2MiB/取消/429 等错误，不重试、重定向或下载结构。通过捕获响应头的 fetch 包装读取总量，不改已有 NCBI 协议。
- 保存限于新建 `outputs/proteins/records-*`，`records.json`、`蛋白清单.md`，有完整序列时另生成 `sequences.fasta`（80 字符一行）。JSON 保留查询条件/时间/来源/警告，FASTA 标识与实际记录一致，不能跨源/跨会话；数据集仍保存 outputs/datasets，边界不能放宽。写门/方案只读/远端仅查复用已有契约。
- dev:mock/Electron 共用本机合成 UniProt 响应、头与模型步骤。测试默认开启、搜索/编号、FUNCTION/FASTA 磁盘内容和预览、关闭重启、限流/零结果/方案无写入；GEO/SRA/文献/原插件/视觉回归。真实匿名客户端核对人 TP53 主编号 P04637、长度 393。固定原生预览保留用户已有配置与会话。

不新增依赖，独立实现，不复制参考项目代码/品牌/素材。官方依据：https://www.uniprot.org/help/api_queries 和 https://www.uniprot.org/help/accession_numbers ，并核对实际 REST JSON 与响应头。
