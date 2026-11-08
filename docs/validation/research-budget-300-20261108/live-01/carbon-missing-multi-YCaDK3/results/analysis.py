#!/usr/bin/env python3
"""Arithmetic mean of carbon_mg_g in input.csv (approved method).

Rule: drop rows whose carbon_mg_g is missing (literal NA or empty string).
No filtering on rain_mm, no imputation, no unit conversion, no inference.
Python standard library only; run as a single command:

    python3 -I results/analysis.py

Writes results/result.json and results/report.md. Never modifies input.csv.
"""

import csv
import json
import math
import os
import sys

TARGET = "carbon_mg_g"
UNIT = "mg/g"
MISSING_TOKENS = {"", "NA", "na", "N/A", "NaN", "nan"}
DATA_RANGE = (12.0, 15.6)  # observed domain from the read-only check
INPUT_PATH = "input.csv"
RESULT_PATH = os.path.join("results", "result.json")
REPORT_PATH = os.path.join("results", "report.md")
REPRO_COMMAND = "python3 -I results/analysis.py"


def fail(message):
    sys.stderr.write("ERROR: %s\n" % message)
    sys.exit(1)


def read_rows(path):
    """Read the CSV, returning the header and all rows (nothing pre-filtered)."""
    if not os.path.isfile(path):
        fail("input file not found: %s" % path)
    with open(path, "r", encoding="utf-8", newline="") as handle:
        reader = csv.reader(handle)
        try:
            header = next(reader)
        except StopIteration:
            fail("input file is empty: %s" % path)
        header = [name.strip() for name in header]
        if TARGET not in header:
            fail("target column %r missing from header %r" % (TARGET, header))
        rows = []
        for line_no, raw in enumerate(reader, start=2):
            if not raw or all(field.strip() == "" for field in raw):
                continue
            if len(raw) != len(header):
                fail(
                    "line %d has %d fields, expected %d"
                    % (line_no, len(raw), len(header))
                )
            rows.append((line_no, dict(zip(header, raw))))
    if not rows:
        fail("no data rows found in %s" % path)
    return header, rows


def main():
    header, rows = read_rows(INPUT_PATH)

    values = []
    missing = []
    for line_no, record in rows:
        raw = record[TARGET].strip()
        if raw in MISSING_TOKENS:
            missing.append(
                {
                    "line": line_no,
                    "site": record.get("site", ""),
                    "raw": raw if raw else "<empty>",
                }
            )
            continue
        try:
            value = float(raw)
        except ValueError:
            fail(
                "line %d: %s=%r is neither missing nor numeric"
                % (line_no, TARGET, raw)
            )
        if not math.isfinite(value):
            fail("line %d: %s=%r is not a finite number" % (line_no, TARGET, raw))
        values.append(value)

    n_total = len(rows)
    n = len(values)

    # Arithmetic mean; math.fsum keeps the summation exactly rounded.
    mean = math.fsum(values) / n

    # --- self-checks: any failure means a non-zero exit -------------------
    if not isinstance(n, int) or n <= 0:
        fail("effective sample size is not a positive integer: %r" % (n,))
    if n + len(missing) != n_total:
        fail(
            "row accounting mismatch: %d valid + %d missing != %d total"
            % (n, len(missing), n_total)
        )
    if not math.isfinite(mean):
        fail("computed mean is not finite: %r" % (mean,))
    if not (DATA_RANGE[0] <= mean <= DATA_RANGE[1]):
        fail(
            "mean %.12g outside observed data range [%s, %s]"
            % (mean, DATA_RANGE[0], DATA_RANGE[1])
        )

    result = {"n": n, "unit": UNIT, "mean": mean}

    os.makedirs(os.path.dirname(RESULT_PATH), exist_ok=True)
    with open(RESULT_PATH, "w", encoding="utf-8") as handle:
        json.dump(result, handle, ensure_ascii=False, indent=2, allow_nan=False)
        handle.write("\n")

    # Re-read the written JSON and confirm it matches what was computed.
    with open(RESULT_PATH, "r", encoding="utf-8") as handle:
        written = json.load(handle)
    if written.get("n") != n or written.get("unit") != UNIT:
        fail("written result.json does not match computed n/unit")
    if abs(float(written.get("mean")) - mean) > 1e-12:
        fail("written result.json does not match computed mean")

    missing_lines = ", ".join(str(item["line"]) for item in missing)
    missing_data_rows = ", ".join(str(item["line"] - 1) for item in missing)
    missing_sites = ", ".join(item["site"] for item in missing)
    min_value = min(values)
    max_value = max(values)

    report = """# carbon_mg_g 算术均值 — 结果报告

## 1. 输入

- 数据文件：`input.csv`（唯一数据源；只读，未做任何修改）。
- 结构：1 行表头 + {n_total} 行数据，列恰为 `{header}`。
- 目标列：`{target}`；单位 `{unit}`（单位仅来自列名 `{target}` 与用户声明，文件内没有独立的单位元数据或方法说明，未做任何单位换算）。
- 协变量：`rain_mm`（mm，单位同样仅由列名推断）在全部 {n_total} 行都有值；本次计算**不使用**它做筛选、分层或协变量调整。

## 2. 处理

- 缺失规则：**仅**丢弃目标列 `{target}` 为缺失（字面量 `NA` 或空字符串）的行；其他列（含 `rain_mm`）不参与任何筛选。
- 实测缺失：{n_missing} 行——文件行号 {missing_lines}，即数据第 {missing_data_rows} 行（对应 `{missing_sites}`；`input.csv` 第 1 行为表头）。文件内缺失编码一致，只有字面量 `NA`，无空字符串、无 `NaN`、无 0/-999 等哨兵值，因此未做任何填补、插值或截尾。
- 有效样本：{n} / {n_total} 行（脚本内实测计数，非预设）。
- 非缺失且非数值的取值会让脚本报错并以非零码退出，不做静默跳过或按 0 兜底。
- 方法：算术均值（等权），`mean = Σx / n`，累加用 `math.fsum`（精确舍入），未使用中位数、几何均值或插补后均值。
- 未按 `rain_mm` 做任何筛选、分组或加权；未做训练/测试切分或模型选择。

## 3. 结果

| 指标 | 值 |
|---|---|
| 有效样本数 n | {n} |
| 算术均值 | {mean_fmt} {unit} |
| 有效值域 | [{min_value}, {max_value}] {unit} |
| 缺失（已丢弃） | {n_missing} 行（目标列 `NA`） |

- `mean = {mean_repr}`（未截断的浮点值），单位 `{unit}`。
- 这是**可观测子集**的点估计，没有区间估计。

## 4. 局限

1. **缺失机制未知。** `{target}` 的 {n_missing} 个 `NA` 恰好每 7 行出现一次（plot-1/8/15/22/29/36/43），呈确定性等间隔排布；在缺少数据生成说明的情况下无法假定 MCAR/MAR，也无法排除与取值相关的缺失。因此本结果是完整案例（可观测子集）均值。
2. **不可外推。** `rain_mm` 随 `site` 序号严格单调递增（300→817，每行 +11），site/rain 存在完全共线的梯度；未纳入设计信息，故该均值不应被当作任意 site/rain 水平下的总体均值或梯度均值。
3. **单位仅源于列名。** 文件内无独立单位元数据，`{unit}` 来自列名 `{target}` 与用户声明；若上游实际单位不同，本结果不能直接解释，需要换算。
4. **未做不确定性估计。** 无抽样设计、无重复测量信息、无权重，因此未计算标准误、置信区间或任何 p 值；报告不作"显著""效应量"等推断性表述。
5. 未做缺失填补、敏感性分析或协变量调整（按批准方法有意排除）。

## 5. 复现

单一命令（在包含 `input.csv` 的目录下运行，仅用 Python 标准库，无 subprocess/网络/第三方包）：

```bash
{repro}
```

脚本只读 `input.csv`，只写 `results/result.json` 与本报告 `results/report.md`；自证性检查（n 为正整数、行数守恒、均值有限且落在观测值域 [{lo}, {hi}]、落盘 JSON 与内存计算一致）任一失败即以非零码退出。

`results/result.json` 内容（平铺对象）：

```json
{{"n": {n}, "unit": "{unit}", "mean": {mean_repr}}}
```
""".format(
        n_total=n_total,
        header=", ".join(header),
        target=TARGET,
        unit=UNIT,
        n_missing=len(missing),
        missing_lines=missing_lines,
        missing_data_rows=missing_data_rows,
        missing_sites=missing_sites,
        n=n,
        mean_fmt=repr(mean),
        mean_repr=repr(mean),
        min_value=min_value,
        max_value=max_value,
        repro=REPRO_COMMAND,
        lo=DATA_RANGE[0],
        hi=DATA_RANGE[1],
    )

    with open(REPORT_PATH, "w", encoding="utf-8") as handle:
        handle.write(report)

    sys.stdout.write(
        "OK n=%d mean=%r unit=%s missing=%d total=%d\n"
        % (n, mean, UNIT, len(missing), n_total)
    )


if __name__ == "__main__":
    main()
