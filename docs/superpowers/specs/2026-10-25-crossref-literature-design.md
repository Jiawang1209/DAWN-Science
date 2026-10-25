# Crossref 论文索引接入

用户要求再接一个无需密钥、审批或机构订阅的论文索引，并授权任意选择。选用 Crossref 公共 REST API；沿用上一项文献插件的交互和本地逐分支验收/合并流程，不推送，不引入参考项目标识。

## 范围和选择

新增第五张默认关闭的插件卡“科研文献 · Crossref”，以免把现有 OpenAlex 会话的开关、工具名或来源含义改掉。复用读取/保存两族及现有权限、新会话生效和产物机制。与把两源合成一个总开关相比，独立卡可以单独启停和识别来源；与单独构建文献库页面相比，直接复用现有对话入口，范围更小。用户已明确委托选型，本项不再次索要选型确认。

工具为 `crossref_search`、`crossref_lookup_doi`、`crossref_save`。检索使用关键词、可选起止年份和条数，限定 journal-article；DOI 单条核对不限制文献类型。返回题名、作者、出版年、期刊、DOI、来源、UTC 查询时间和缺失/截断状态。日期保留来源精度，不补造月日；摘要将来源 JATS 标记转为有界纯文本，无摘要则为空。元数据核对不代表全文阅读或科学结论验证。

## 接线和边界

固定 `https://api.crossref.org/works`，无 Key、注册、邮箱或账户配置。公众池仍有限流；进程内所有 Crossref 会话共享串行队列，至少间隔 1 秒发起请求，排队也可取消。每次最多 25 条、超时 20 秒、响应 2 MiB；不自动分页、不自动重试、不下载 PDF、不跟随跳转。429、权限、服务故障、非 JSON、格式异常和 404 均明确处理；未查到不能解释为论文不存在。

抽取既有有界 JSON 读取为小型共享模块，OpenAlex 保持原端点、字段和错误语义，由原测试守住。文献报告的 source 扩展为 OpenAlex/Crossref；工具工厂共用会话 UUID 缓存和保存逻辑，每个来源各自缓存，不互借记录。记录仍只可保存本会话实际取得的最近 100 条，应用重启后重新查询。

保存复用 `outputs/literature/references-*/references.json` 和 `文献清单.md`，来源文字改为按每条实际报告生成，不能写死 OpenAlex。路径保护、拒绝符号链接、唯一目录、原写权限/方案门和远端只读保持。现有 OpenAlex 卡与工具名不改。新增 Crossref 查询加入方案、讨论和路线只读名单，保存须经过 write 目录权限门。

## 验收

先写失败测试，覆盖匿名请求、查询/年份/文献类型参数、DOI 精确匹配、部分日期、JATS 摘要、缺失值、服务错误、超时/取消/预算和串行节流。验证来源保存、双源缓存隔离、插件默认状态、实际 NativeRuntime 写门与只读门。

共享固定 API 与推理场景同时供 dev:mock 和 Electron 使用；测试默认关闭、启用持久化、新会话装配、真实查询工具执行、DOI、所选记录保存和产物预览，失败不落盘，方案只读，关闭后无工具。跑完整单元/UI、类型/构建、相关 Electron 与未改视觉基线。原生预览使用固定 launcher，先停旧预览，保留隔离 profile；构建完成后再运行对应目录的 Electron 测试。另用生产客户端少量匿名实测 API 并保存来源证据。

官方依据：[接口](https://www.crossref.org/documentation/retrieve-metadata/rest-api/)、[公开访问与限流](https://www.crossref.org/documentation/retrieve-metadata/rest-api/access-and-authentication/)、[过滤器](https://www.crossref.org/documentation/retrieve-metadata/rest-api/rest-api-filters/)。
