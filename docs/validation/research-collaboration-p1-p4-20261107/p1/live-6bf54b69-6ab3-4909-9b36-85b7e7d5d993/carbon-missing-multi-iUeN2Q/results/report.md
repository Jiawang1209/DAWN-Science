# carbon_mg_g 算术均值 — 分析报告

模板：`tabular-ecology@1` · 语言：Python（stdlib）· 已批准方法：arithmetic mean（算术均值）
单位：`mg/g` · 缺失值规则：仅丢弃目标列 NA（drop NA in target column only）

## 1. 输入

| 项目 | 内容 |
|---|---|
| 文件 | `input.csv`（唯一输入，48 数据行 + 1 表头行；810 字节） |
| 列 | `site`（字符串，plot-1 … plot-48，无缺失）、`carbon_mg_g`（数值，mg/g）、`rain_mm`（整数） |
| 目标列 | `carbon_mg_g`，列名自带单位标记 `_mg_g`，与冻结契约单位 `mg/g` 一致，无需猜测单位 |
| 缺失情况 | `carbon_mg_g` 含 7 个字面量 `NA` token（第 1、8、15、22、29、36、43 条数据行，对应 plot-1/8/15/22/29/36/43）；`rain_mm`、`site` 无缺失 |

输入为核查阶段已冻结的同一文件（sha256 `568eaee367b769dcdc3f93ae1434266124d6147bf597dfa586dc65e883aaf789`），本轮未做任何修改、未新增/删除行列。

## 2. 处理

脚本：`results/analysis.py`（仅用 `csv`/`json`/`math`/`os`/`sys` 标准库，无第三方依赖、无子进程）。

调用方式（工作区根目录，隔离解释器、单一命令）：

```bash
python3 -I results/analysis.py
```

处理步骤：

1. 以 `csv.DictReader` 读取 `input.csv`，校验表头含 `carbon_mg_g`。
2. **仅**对目标列判断缺失：token（去空白后）属于 `{"", NA, N/A, na, NaN, nan, NULL, null}` 即记为缺失并跳过该单元格；该列其余 token 用 `float()` 解析。
3. 目标列出现任何既非 NA 又无法解析为有限浮点数的 token 时立即以非零退出码报错（`SystemExit`），不静默丢弃、不插值。
4. 用 `math.fsum` 求纳入值的和，除以纳入个数得 arithmetic mean（不加权、不分组、不按 `rain_mm` 筛选或填补）。
5. 写出 `results/result.json`：平铺对象 `{"n": 41, "unit": "mg/g", "mean": <数值>}`，与提交的 `data.metrics.mean` / `sampleCount` 一致。

被丢弃的 7 行仅因目标列为 `NA` 不参与均值；原始 `input.csv` 全量保留，`rain_mm` 未参与筛选/加权/填补，也未用于分层。

## 3. 结果

机器执行输出（`python3 -I results/analysis.py`）：

```
input_rows=48 dropped_na=7 n=41 sum=568.70000000000005 mean=13.870731707317074 unit=mg/g
wrote results/result.json
```

- 输入行数：48
- 丢弃 NA 个数：7（全部来自 `carbon_mg_g`）
- 纳入样本量 n：**41**
- 纳入值之和：568.70000000000005（浮点求和；精确有理和为 568.7，差异为二进制浮点表示误差，量级 1e-14）
- 算术均值：**13.870731707317074 mg/g**（≈ 13.8707 mg/g）
- 单位：mg/g

`results/result.json` 内容：

```json
{
  "n": 41,
  "unit": "mg/g",
  "mean": 13.870731707317074
}
```

核查阶段人工逐值核算给出 568.7 / 41 = 13.870731707317073；与机器结果的差约 1e-15，远小于宿主验收容差 `absoluteTolerance` 1e-9，二者一致。

## 4. 局限与说明

- 均值仅为该 41 个观测的**未加权算术均值**，不代表总体参数；未提供置信区间、标准差或分组比较（不在本任务范围）。
- 缺失按「仅目标列 drop」处理，前提是这些 `NA` 与数值缺失机制无关（MCAR/MAR 不可由本数据检验）；若缺失具系统性（例如与 `rain_mm` 相关），简单删除会使均值有偏。本任务按已批准规则执行，未做敏感性分析。
- `rain_mm` 按用户要求全程未用于筛选、加权或填补，因此结果与该列取值无关；也不能解读为「控制了降雨」的效应。
- 有效数字：报告展示保留 4 位小数（13.8707）便于阅读，`result.json` 保留完整双精度值；下游比较请以文件中的完整精度为准。
- 可复现性：脚本只依赖工作区内的 `input.csv` 与 Python 3 标准库；在本工作区根目录执行上述单条命令即可重跑，输出确定。

## 5. 产物

| 路径 | 说明 |
|---|---|
| `results/analysis.py` | 可复现分析脚本（stdlib，单命令运行） |
| `results/result.json` | 平铺结果 `{n: 41, unit: "mg/g", mean: 13.870731707317074}` |
| `results/report.md` | 本报告（输入、处理、结果、局限） |
