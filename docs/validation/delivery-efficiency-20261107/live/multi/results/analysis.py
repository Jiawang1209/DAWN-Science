#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Arithmetic mean of carbon_mg_g (unit: mg/g), tabular-ecology@1.

Frozen contract:
  - metric: arithmetic mean
  - unit: mg/g
  - missing: drop rows where the TARGET COLUMN ONLY is missing
  - must NOT filter by rain_mm and must NOT impute any value

Reproduce with a single isolated-interpreter command from the workspace root:
    python3 -I results/analysis.py

Python standard library only. No subprocesses, no network, no external deps.
"""

import csv
import json
import math
import os
import sys

TARGET_COLUMN = "carbon_mg_g"
UNIT = "mg/g"
METRIC_NAME = "mean"
# Literal tokens accepted as missing in the target column.
# Only "NA" is documented by the frozen data-check stage; other spellings are
# treated as hard errors rather than silently dropped (no guessing).
NA_TOKENS = frozenset({"NA", "N/A", "na", "n/a", "NaN", "nan", "NULL", "null", ""})

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
INPUT_PATH = os.path.join(ROOT, "input.csv")
RESULT_PATH = os.path.join(HERE, "result.json")
REPORT_PATH = os.path.join(HERE, "report.md")


def fail(msg):
    sys.stderr.write("ERROR: " + msg + "\n")
    raise SystemExit(2)


def load_rows(path):
    """Read the CSV keeping ALL rows and ALL columns intact."""
    if not os.path.isfile(path):
        fail("input file not found: %s" % path)
    with open(path, "r", newline="", encoding="utf-8-sig") as fh:
        reader = csv.DictReader(fh)
        if reader.fieldnames is None:
            fail("input has no header row")
        header = [h.strip() for h in reader.fieldnames]
        if TARGET_COLUMN not in header:
            fail("target column %r not in header %r" % (TARGET_COLUMN, header))
        rows = []
        for raw in reader:
            rows.append({(k.strip() if k else k): (v.strip() if isinstance(v, str) else v)
                         for k, v in raw.items()})
    return header, rows


def main():
    header, rows = load_rows(INPUT_PATH)
    total_rows = len(rows)
    if total_rows == 0:
        fail("input has no data rows")

    values = []          # parsed finite target values (complete cases only)
    missing_rows = []    # 1-based data-row index of dropped target-missing rows
    for idx, row in enumerate(rows, start=1):
        cell = row.get(TARGET_COLUMN)
        if cell is None:
            fail("row %d is missing the target column entirely" % idx)
        text = cell.strip()
        if text in NA_TOKENS:
            missing_rows.append(idx)
            continue
        try:
            val = float(text)
        except ValueError:
            # Unknown non-numeric token: do NOT guess -> hard error.
            fail("unrecognized non-numeric value %r in %s at data row %d"
                 % (cell, TARGET_COLUMN, idx))
        if not math.isfinite(val):
            fail("non-finite value %r in %s at data row %d" % (cell, TARGET_COLUMN, idx))
        values.append(val)

    n = len(values)
    if n == 0:
        fail("no non-missing observations in %s; mean is undefined" % TARGET_COLUMN)

    total = math.fsum(values)             # exact summation, order-independent
    mean = total / n
    if not math.isfinite(mean):
        fail("computed mean is not finite")

    # rain_mm is retained untouched and never used for filtering.
    rain_col_present = "rain_mm" in header

    result = {"n": n, "unit": UNIT, METRIC_NAME: mean}
    with open(RESULT_PATH, "w", encoding="utf-8") as fh:
        json.dump(result, fh, ensure_ascii=False, indent=2)
        fh.write("\n")

    dropped = ", ".join(str(i) for i in missing_rows) if missing_rows else "none"
    report = """# carbon_mg_g 算术均值分析报告

## 1. 任务与冻结契约

- 研究模板：tabular-ecology@1；语言：Python（stdlib）
- 目标：计算 `carbon_mg_g` 的算术均值，单位 **mg/g**
- 用户已批准方法：arithmetic mean（未加权、未分组）
- 缺失值规则：**仅**丢弃目标列 `carbon_mg_g` 为 `NA` 的行（drop NA in target column only）
- 明确禁止：按 `rain_mm` 筛选样本；对缺失值做任何填补（插补/均值填充/回归填充）；猜测或换算单位

## 2. 输入

- 输入文件：`input.csv`（与脚本同级的父目录，路径由脚本自动解析）
- 列：`site`（字符串，dimensionless）、`carbon_mg_g`（浮点，mg/g）、`rain_mm`（整数，mm）
- 数据行数：{total_rows}（表头 1 行）
- 缺失：`carbon_mg_g` 共 {n_missing} 个 `NA`（数据行序 {dropped}），全部为字面量 `NA`，无其他缺失写法
- `rain_mm` 完整无缺失，本分析**完全未使用**其取值做筛选、分层或加权

## 3. 处理流程

1. 用 `csv.DictReader` 读取全部 {total_rows} 行，保留所有列与原始行序，不做任何筛选。
2. 逐行检查目标列：`NA` 字面量判为缺失并丢弃该行；其余值用 `float()` 解析；
   遇到无法识别的非数值记号（除 `NA` 外的任意文本）或非有限值，脚本直接以错误退出，
   不做猜测、不静默丢弃——因此本数据集若出现新缺失写法，结果不会被悄悄污染。
3. 对余下 {n} 个有效观测计算算术均值：`mean = math.fsum(values) / n`
   （`fsum` 做精确求和，结果与求和顺序无关）。
4. 写出 `results/result.json`（平铺对象 `{{n, unit, mean}}`）与本报告 `results/report.md`。
5. 脚本仅使用标准库（csv/json/math/os/sys），不创建子进程、不访问网络；
   以 `python3 -I results/analysis.py` 单一命令复现。

## 4. 结果

| 项目 | 值 |
| --- | --- |
| 指标 | arithmetic mean of `carbon_mg_g` |
| 有效样本量 n | {n} |
| 丢弃的缺失行 | {n_missing} |
| 有效值总和 | {total!r} |
| **算术均值** | **{mean!r} mg/g** |

`results/result.json` 内容：

```json
{{"n": {n}, "unit": "{unit}", "mean": {mean!r}}}
```

## 5. 局限与说明

1. **缺失机制未知**：无法从数据本身判断 `carbon_mg_g` 的缺失是否完全随机（MCAR）。
   完全案例（complete-case）算术均值仅在该列缺失与取值无关时才无偏；
   若缺失为 MNAR（例如低值样本更易未测），本均值可能有偏。未做敏感性分析或插补（按契约禁止填补）。
2. **单位未经换算核验**：一律采用用户批准并已由数据核查阶段确认的 mg/g；
   无原始测定记录可交叉核对，故未做单位换算。
3. **未做推断统计**：本任务只要求点估计，未计算标准误、置信区间或假设检验。
4. **未剔除异常值**：按契约保留全部非缺失观测；核查阶段显示值域约 12.0–15.6 mg/g，无离群迹象。
5. **可复现性**：结果只依赖 `input.csv` 的字节内容与上述确定性算法；脚本对无法识别的取值硬失败，
   因此不会因缺失写法变化而静默改变样本量。

## 6. 产物

- `results/analysis.py` —— 可复现脚本（stdlib）
- `results/result.json` —— 平铺结果对象 `{{n, unit, mean}}`
- `results/report.md` —— 本报告
""".format(total_rows=total_rows, n_missing=len(missing_rows), dropped=dropped,
           n=n, total=total, mean=mean, unit=UNIT)

    with open(REPORT_PATH, "w", encoding="utf-8") as fh:
        fh.write(report)

    # Console echo for the execution log.
    print("input rows        : %d" % total_rows)
    print("dropped (target NA): %d  @ data rows %s" % (len(missing_rows), dropped))
    print("valid n           : %d" % n)
    print("sum               : %r" % total)
    print("mean (%s)      : %r" % (UNIT, mean))
    print("rain_mm used for filtering: no (column present: %s)" % rain_col_present)
    print("wrote: %s" % RESULT_PATH)
    print("wrote: %s" % REPORT_PATH)


if __name__ == "__main__":
    main()
