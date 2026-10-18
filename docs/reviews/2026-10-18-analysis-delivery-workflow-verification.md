# 分析交付验收

## 验收清单（开始实跑前）

- 文件清单/交付记录；显式多选、取消/返回保留草稿；不自动选择 final/v2。
- 默认仅整理；空名称/空选择不能继续，非法路径拒绝；输入引用与原件保存；同名另存。
- 整理状态与运行状态分别展示；新生成结果解读、README、脚本、原图/表/报告、manifest 可预览与关闭。
- 整理并验证→等待核对；脚本/参数/比较范围可查看与编辑；运行前明确确认；独立进程/解释器、输出/tmp/cache、超时/停止、日志、退出码和真实比较。
- 选定结果重跑通过；退出零但缺输出为部分验证；数值不一致失败；旧验证目录保留。
- 路线/Bot 文件进入同一选择流；会话/工作区切换与迟到响应不串；重载后记录恢复。
- 实际 Electron 普通/窄坞/暗色：标题、主动作、状态、选择、详情、文件预览不裁切/横向溢出，关闭可回退。
- 探索：缺脚本只有部分交付；运行方案删除输出参数不启动；处理取消；已编辑参照不能冒充原结果。

## 边界

模型工程验收使用共享确定性 mock；文件创建、Python 计算、复制、实际输出比较及 Electron 全链路为真实执行。不能由此证明真实 LLM 的科研判断质量。数据为合成草地样例，不能冒充实测科学结论。

## 结果

已完成实际合成科研案例；本节以下保存执行事实和边界。

### 实际案例

- 隔离 Electron：`tmp/analysis-delivery-live-1792331052764/`，独立 providers/models/DB/user-data/工作区，未使用安装版配置。
- Python 实际读取合成草地 30 条观测，排除 2 条生物量缺失编码 `-999`；有效 n=28，OLS slope=2.98177615、intercept=12.13644091、训练 R²=0.98399937。没有计算 p 值或区间，不支持因果推断。
- 原结果：`workspace/results/model.csv`、`summary.json`、`analysis_report.md`、`regression.png`；PNG 实际可解码，640×380。
- 交付：`workspace/outputs/delivery/草地分析交付验收-c2d67803-f56/`。新增 `结果解读.md`、README、整理脚本、原文件副本和 manifest；原始 CSV 仅引用和留存哈希。
- 先仅整理，显示“未运行验证”；另一次“整理并验证”先等待核对。确认后由 `/usr/bin/python3`（实际版本 3.9.6）启动独立进程，退出码0；完整比较 model.csv 的1行6列及 summary.json，连续值预定容差 1e-9，样本量/类别精确匹配。
- `TMPDIR/TMP/TEMP`、HOME 和缓存分别指向全新 validation UUID 目录下的 output 子目录。没有重启/清空当前内核，没有删除固定目录，没有覆盖原结果。独立进程不是强制文件系统沙箱。
- 比较仅覆盖上述统计表/JSON，图片与报告仍交回预览；新增验证图片/报告不因未列入比较方案而漏收。旧验证输出保留。

### 异常与边界

- 空选择/空名称不能继续；越界、隐藏凭证路径和符号链接拒绝；大文件只引用，超过文本上下文上限不冒充完整阅读。
- 非 UTF-8 文本保留原文件并标注未读取，不能将替换字符 `�` 交给模型或据此把不同类别值比较为相同。
- 缺脚本为部分交付；模型未返回合格结果解读为失败；退出0但缺预期输出为部分验证，数值不一致为失败；参照被修改不能冒充原始结果。
- 缺少配置解释器或输出参数时不会运行；协议返回可操作原因。取消/超时停止本次进程组，日志与部分输出留存；删除会话不会被迟到写入复活。
- 草稿/页面按会话及工作区隔离，迟到回读不覆盖新作用域；查看脚本前编辑的运行参数返回后保留，运行授权不持久化；不存在的旧 pending 请求会回到记录列表。
- 本机 native 当前模型用于生成，不暗用其他模型；停用的 analysis-delivery 不绕过；远端和非 native 不宣称已支持。

### 界面证据

截图均为真实 Electron，不是 HTML 模型图：上述 live 目录的 `evidence/`。

- `delivery-options.png`：显式5文件选择、默认仅整理、输入引用。
- `delivery-final-summary.png`：整理状态/验证状态分别展示，结果解读/README入口、带框文件列表。
- `validation-plan-fixed-footer.png`：核对方案可滚动，确认/启动留在底部。
- `delivery-dark-narrow-final.png`：约322px坞宽，内容无横向溢出；`interpretation-dark-narrow.png`、`figure-dark-narrow.png` 展示解读和图片关闭返回。
- 预览页面 JS errors 为0。窗口普通、窄坞和暗色通过实际控件检查；最终预览保持打开。

### 检查记录

- Vitest：`/tmp/dawn-delivery-final-full-tests.log`；定向生成/编码/独立 Python/R/协议/界面/共享 mock：`/tmp/dawn-delivery-final-focused.log`。
- 类型检查和构建：`/tmp/dawn-delivery-typecheck.log`、`/tmp/dawn-delivery-build.log`。
- Electron 文件、路线、Bot 和交付：`/tmp/dawn-delivery-final-e2e.log`。路线/Bot 实际交付入口携带当前文件到统一选择流，未发送额外分析请求。

最终检查：439个测试文件、4,824项通过，10项原跳过；11项实际Electron用例通过（含两个科研交付完整/缺项案例、路线/Bot交付入口、原产物预览）；typecheck与主进程/UI构建通过。最后一轮全量耗时94.29秒，Electron用例52.3秒。构建沿用既有chunk体积提示，Vitest沿用JSDOM canvas未实现提示；未将这些提示计作功能错误。

上述独立分支验收完成时，本地 `main` 为 `5fea3a0260071ef9c45644dfe109a5b487f99cc4`；当时未合并、未推送、未替换安装版。

### 用户授权后的本地合并验收

2026-10-18，用户授权检查无误后合并到 main。本地主目录由 `5fea3a02` 无冲突快进至功能提交 `2714afb9`，并另行提交本次验收记录。

- 合并前：类型检查、38项定向测试通过。
- 合并后主目录：类型检查与主进程/UI构建通过；439个Vitest文件、4,824项通过，10项原跳过（97.33秒）；11项实际Electron交付/路线/产物/Bot用例通过（1.4分钟）。
- 日志：`/tmp/dawn-delivery-merge-preflight-typecheck.log`、`/tmp/dawn-delivery-merge-preflight-tests.log`、`/tmp/dawn-delivery-main-typecheck.log`、`/tmp/dawn-delivery-main-build.log`、`/tmp/dawn-delivery-main-tests.log`、`/tmp/dawn-delivery-main-e2e.log`。
- 保留功能分支、独立工作树、隔离预览及忽略目录内的案例和截图；未推送、未替换安装版。工程验收与科研判断质量的边界不变。
