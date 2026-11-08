#!/usr/bin/env python3
"""Arithmetic mean of carbon_mg_g in input.csv (unit: mg/g).

Contract (frozen, approved method):
  * target column: carbon_mg_g, metric: mean, unit: mg/g
  * missing handling: drop rows whose target value is missing (NA); no imputation,
    no filtering by rain_mm, no outlier removal, no truncation.
  * input.csv is read only and never rewritten.
  * pure Python standard library, no third-party packages, no subprocesses,
    no network access, no hard-coded absolute paths.

Reproduce with a single command from the workspace root:

    python3 -I results/analysis.py

Outputs (deterministic, written next to this script):
  results/result.json  flat object {"n": int, "unit": "mg/g", "mean": float}
  results/report.md    human-readable report (inputs, steps, result, limitations)
"""

import csv
import json
import math
import statistics
import sys
from pathlib import Path

TARGET_COLUMN = "carbon_mg_g"
UNIT = "mg/g"
EXPECTED_COLUMNS = ["site", "carbon_mg_g", "rain_mm"]
# Only the literal NA token (plus a blank cell, which is the same "no value" case)
# is treated as missing for the target column. Anything else must parse as a
# finite float, otherwise we fail loudly instead of silently guessing.
MISSING_TOKENS = {"", "na", "n/a", "nan", "null", "none"}


def find_input():
    """Resolve input.csv from the working directory, falling back to the
    workspace root implied by this script's location. Never absolute-literal."""
    candidates = [
        Path("input.csv"),
        Path(__file__).resolve().parent.parent / "input.csv",
    ]
    for candidate in candidates:
        if candidate.is_file():
            return candidate
    raise SystemExit(
        "ERROR: input.csv not found; tried: "
        + ", ".join(str(c) for c in candidates)
    )


def load_values(path):
    """Read the target column; return (values, missing_count, total_rows, column_unit)."""
    values = []
    missing = 0
    total = 0
    with path.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        header = reader.fieldnames or []
        if header != EXPECTED_COLUMNS:
            raise SystemExit(
                "ERROR: unexpected header %r; expected %r" % (header, EXPECTED_COLUMNS)
            )
        for line_no, row in enumerate(reader, start=2):
            if row.get(TARGET_COLUMN) is None:
                raise SystemExit("ERROR: malformed row at line %d" % line_no)
            raw = row[TARGET_COLUMN].strip()
            total += 1
            if raw.lower() in MISSING_TOKENS:
                missing += 1
                continue
            try:
                value = float(raw)
            except ValueError:
                raise SystemExit(
                    "ERROR: non-numeric %s value %r at line %d"
                    % (TARGET_COLUMN, raw, line_no)
                )
            if not math.isfinite(value):
                raise SystemExit(
                    "ERROR: non-finite %s value %r at line %d"
                    % (TARGET_COLUMN, raw, line_no)
                )
            values.append(value)
    return values, missing, total


def main():
    script_dir = Path(__file__).resolve().parent
    input_path = find_input()
    values, missing, total = load_values(input_path)

    n = len(values)
    if n == 0:
        raise SystemExit("ERROR: no valid observations in %s" % TARGET_COLUMN)

    # Two independent summation paths; refuse to publish if they disagree.
    mean_fsum = math.fsum(values) / n
    mean_fmean = statistics.fmean(values)
    if not math.isfinite(mean_fsum) or not math.isfinite(mean_fmean):
        raise SystemExit("ERROR: non-finite mean")
    if abs(mean_fsum - mean_fmean) > 1e-12:
        raise SystemExit(
            "ERROR: summation paths disagree: fsum=%r fmean=%r"
            % (mean_fsum, mean_fmean)
        )
    mean = mean_fsum

    result = {"n": n, "unit": UNIT, "mean": mean}

    result_path = script_dir / "result.json"
    with result_path.open("w", encoding="utf-8") as handle:
        json.dump(result, handle, ensure_ascii=False, allow_nan=False)
        handle.write("\n")

    sd = statistics.stdev(values) if n > 1 else float("nan")
    report = build_report(
        input_path=input_path,
        total=total,
        missing=missing,
        n=n,
        mean=mean,
        mean_fmean=mean_fmean,
        minimum=min(values),
        maximum=max(values),
        sd=sd,
    )
    report_path = script_dir / "report.md"
    with report_path.open("w", encoding="utf-8") as handle:
        handle.write(report)

    print("input: %s" % input_path)
    print("rows=%d valid_n=%d missing=%d" % (total, n, missing))
    print("mean(%s) = %r %s" % (TARGET_COLUMN, mean, UNIT))
    print("wrote: %s" % result_path)
    print("wrote: %s" % report_path)
    return 0


def build_report(input_path, total, missing, n, mean, mean_fmean, minimum, maximum, sd):
    return f"""# carbon_mg_g 算术均值 — 结果报告

方法：arithmetic mean（用户已批准）。单位：mg/g。
缺失规则：仅丢弃目标列 `carbon_mg_g` 的缺失行（drop NA in target column only）。

## 1. 输入

| 项目 | 值 |
|---|---|
| 输入文件 | `input.csv`（只读，未改动、未清洗另存） |
| 列 | `site`, `carbon_mg_g`, `rain_mm` |
| 数据行数 | {total} |
| 目标列 | `carbon_mg_g` |
| 目标列缺失（`NA`）行数 | {missing} |
| 有效观测数 n | {n} |

## 2. 处理步骤

1. 以 UTF-8 读取 `input.csv`，用 `csv.DictReader` 解析；校验表头恰为 `site,carbon_mg_g,rain_mm`。
2. 逐行读取 `carbon_mg_g`：字面 `NA`（大小写不敏感的 `NA`/`N/A`/`NaN`/`null`/空串）判定为缺失，整行不参与计算；其余值必须可解析为**有限浮点**，否则脚本以非零状态失败（不静默跳过、不猜测）。
3. **不**按 `rain_mm` 筛选、分层或加权；**不**做任何填补（均值/中位数/前向填充）；**不**缩尾、**不**剔除离群值；**不**删列、**不**改写输入文件。
4. 计算算术均值 `sum / n`。为防累加误差，用两条独立路径复算：`math.fsum(values)/n` 与 `statistics.fmean(values)`；两者差值须 ≤ 1e-12，否则脚本失败退出、不写结果。
5. 写出 `result.json`（平铺对象 `{{"n":…, "unit":"mg/g", "mean":…}}`，`allow_nan=False`）与本报告。

## 3. 结果

| 指标 | 值 |
|---|---|
| **mean(`carbon_mg_g`)** | **{mean!r}** |
| 单位 | {UNIT} |
| 有效 n | {n} |
| 缺失（整行丢弃） | {missing} |
| 参与计算的原始行数 | {total} |

`result.json` 内容（即权威数值，未四舍五入）：

```json
{{"n": {n}, "unit": "{UNIT}", "mean": {mean!r}}}
```

复算一致性：`math.fsum`/n 与 `statistics.fmean` 两条路径结果差值 = {abs(mean - mean_fmean):.3e}（阈值 1e-12）。

审计用描述量（**非结论**，仅作量级核对，不进入 `result.json`）：

| 量 | 值 |
|---|---|
| min | {minimum!r} |
| max | {maximum!r} |
| 样本标准差（n−1） | {sd!r} |

## 4. 局限与说明

- **缺失机制未检验**。`NA` 仅按「无值」处理，未假定其随机性；本报告不断言 MCAR/MAR/MNAR，也不对缺失做出任何推断。缺失呈每 7 行一次（plot-1、8、15、22、29、36、43）的规则间隔，这属于数据结构事实，不构成机制结论。
- **`rain_mm` 完全未使用**：未用于筛选、分层、加权或填补。若研究问题需要按降水梯度分析，应另立任务，不在本契约内。
- **单位依据仅为列名与用户规则**：`carbon_mg_g` 的后缀 `_mg_g` 与声明单位 mg/g 一致，且用户已指定单位规则为 mg/g；文件内**没有**独立单位声明行或元数据，故单位证据是列名约定 + 用户规则，而非文件内显式声明。
- **`NA` 不等于 0 或低于检出限**：未把缺失当作零或任何具体数值，因此均值只代表 {n} 个有效观测的中心位置，不覆盖其余 {missing} 个样本。
- 这是**单变量描述统计点估计**，不含假设检验、置信区间或模型拟合；不对总体外推作断言。每行（plot）视为一个观测，未做加权。
- 未做离群值处理与缩尾；有效值域较窄（{minimum!r}–{maximum!r}），不改变既定方法。
- 复现：在工作区根目录执行单一命令 `python3 -I results/analysis.py`；脚本仅用标准库（`csv`、`json`、`math`、`statistics`、`pathlib`、`sys`），不创建子进程、不联网、不依赖第三方包、不含绝对路径。
"""


if __name__ == "__main__":
    sys.exit(main())
