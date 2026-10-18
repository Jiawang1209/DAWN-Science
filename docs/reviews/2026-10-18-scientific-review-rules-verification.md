# 共用科研审查规则验收

2026-10-18。`codex/scientific-review-rules`，基于本地 main `67d8ed30`。用户授权独立分支实施，不合并、不推送、不替换已安装软件。

## 最终内容与边界

- 新增 `skills/scientific-review/SKILL.md` 与目录内 `references/checklist.md`、`references/reporting.md`。提供设计/实验单位、数据对账、方法参数、数字图表、独立重跑、两维状态及问题报告依据。
- 同步 stat-consultant、reproducibility-reviewer、reviewer-two、data-auditor、methods-writer；有限修正 data-cleaner 的比较、去重及目录表述。同步 reproducible-analysis、analysis-delivery、analyze-like-case 的衔接，不全面重写专业方法库。
- 保护活动内核；只审不运行时静态核对，已有执行授权不重复询问，缺工具不假称重算。报告与验证产物的写入边界明确区分；无写入工具不借 bash 保存审查报告/改脚本，具备执行能力且获准独立重跑时允许受审脚本在隔离验证目录生成产物和运行日志。
- 统计数值预先声明比较标准，样本量/键/分类精确核对，图形检查数据及渲染；哈希/导出元数据与科学内容分开。相同输入重复运行与幂等性区分。随机种子缺失按证据与影响报告，不给伪精确评分或预测修改后一定能跑。
- 入口按名称发现，复用项目 > 全局 > 自带覆盖与 manual/off。子任务按实际 ID/nextOffset 读取目录内参考，不越界、不绕过开关。角色原 tools 不变。

没有修改 `src/`、运行时权限、协议、数据库、依赖、版本或 UI；这些是模型可读规则，不是新增的执行拦截器。不自动派审/重跑，不写用户项目或全局技能/角色，不修改旧案例或安装版。

## 自动验收

| 检查 | 实际结果 |
| --- | --- |
| 基线 `npm run build` / `npm test` | 通过；410文件4571项通过、10项原设置跳过（83.94秒） |
| 新内容/资源合同先红 | 6项预期失败、1项覆盖行为通过；新技能缺失、旧矛盾及角色未衔接导致失败 |
| 新技能 Electron 先红 | 旧构建显式 `/skill:scientific-review` 未展开规范正文，新增断言预期失败 |
| 场景及复审回归 | 两轮新增冲突断言先失败后修正；保留 scenario-red/green、review-red/green 日志 |
| 内容/资源/构建相关 | 8文件64项通过，包含真实 pi loader、角色 tools、三级覆盖、manual/off、旧ID禁用、目录越界、97字符分页及 dist 193字符分页 |
| 实际 dist 对齐 | 新规范、两参考、六角色与三既有技能逐字比对源码；真实父侧服务仅从 dist 路径读取 |
| `npm run typecheck` / `npm run build` | 通过；保留已有 Vite 大包提示 |
| 最终 Electron 相关全组 | 12项通过（39.6秒）；覆盖技能显式展开/目录用途/设置展示/管理、子资源派单/长查询/续问刷新/退出重启/亮暗宽窄；使用既有共享确定性 mock，无新增假推理分支 |
| 最终全量 `npm test` | 412文件4580项通过、10项沿用原设置跳过（97.56秒）；包含复审修正及三级实际目录覆盖合同 |
| `git diff --check` / 主工作区 | 通过；main 仍为 67d8ed30 且干净，功能改动只在独立工作树 |

## 六场景与复审

旧版独立 Agent `scientific_review_baseline` 与新版 `scientific_review_scenarios` 均只读 Markdown，回答活动内核、PDF元数据、Reviewer Two 缺执行工具、静态审查不安装下载、清洗重复运行与幂等、重复观测五角色交接六场景，并检查关闭/覆盖和无 write 报告边界。

旧版演练实际也能守住执行边界；它定位了重启/逐字节/工具示例冲突，没有发生实际越权。因此本次不把两次演练描述成真实工具违规率改善或模型科研质量因果实验。自动红灯来自上表内容与加载合同。

新版演练准确区分题设与亲自核验，发现旧模板和示例的残留：审计员声称已存规则、时间函数不分元数据判严重、清洗目录与去重建议含混、报告工具可能落盘、手动干预一律消掉等。均已修正并复核，快照起步列部分运行。过程摘录见忽略证据目录 `scenarios-before.md`、`scenarios-after.md`。

独立只读 `review_scientific_rules` 发现两项 P2：禁写措辞过宽与获准隔离重跑矛盾、随机性无条件严重及示例影响无依据。先补断言见红，再修正文/共用规范/示例；复审已确认两项关闭、未见补丁引入新的重要矛盾，六角色工具声明相对基线未改。

## 证据与未覆盖项

日志位于本工作树忽略目录 `tmp/scientific-review/`：baseline-build/tests、red、electron-red、scenario-red/green、build-contract-red、green、review-red/green、typecheck、build、full-tests、electron 等 `.log`，以及两个场景摘录 `.md`。build-contract-red 特意在源码修正但未重建时失败，重建后同版内容及真实资源读取通过，避免只验仓库文本。

本轮没有对用户科研数据做 R/Python 分析、独立重跑、PDF渲染比较或真实 DAWN 模型工具端到端科研质量验收；示例中的数值不是本次实验数据。确定性 Electron 证明加载与既有链路，文字演练证明规范可应用并暴露冲突，不能据此保证模型每次都会正确判断科研问题。未跑完整 Electron 全套；前轮已记录的无关旧页签/侧会话断言未修改或标为 skip。

保留分支与工作树供查看；本地 main 及上一项的实际预览/案例不动。
