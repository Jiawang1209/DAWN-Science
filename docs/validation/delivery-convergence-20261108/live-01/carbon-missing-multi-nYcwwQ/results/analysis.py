#!/usr/bin/env python3
"""Arithmetic mean of carbon_mg_g in input.csv (unit: mg/g).

Method (approved): arithmetic mean.
Missing rule (approved): drop NA in target column only.
- Only rows whose carbon_mg_g is empty/NA/unparseable are excluded.
- rain_mm is never used for filtering, and no imputation is performed.

Run with a single command:  python3 -I results/analysis.py
Standard library only; no subprocesses, no threads, no network, no extra files.
"""

import csv
import json
import math
import os
import sys

INPUT_PATH = os.path.join("input.csv")
TARGET_COLUMN = "carbon_mg_g"
UNIT = "mg/g"
OUTPUT_DIR = "results"
RESULT_PATH = os.path.join(OUTPUT_DIR, "result.json")
REPORT_PATH = os.path.join(OUTPUT_DIR, "report.md")

# Literal tokens treated as missing in the target column.
MISSING_TOKENS = {"", "na", "n/a", "nan", "null", "none", "."}


def parse_value(raw):
    """Return float for a parseable numeric token, else None (missing/unparseable)."""
    text = raw.strip()
    if text.lower() in MISSING_TOKENS:
        return None
    try:
        value = float(text)
    except ValueError:
        return None
    if not math.isfinite(value):
        return None
    return value


def main():
    if not os.path.isfile(INPUT_PATH):
        sys.stderr.write("ERROR: input file not found: %s\n" % INPUT_PATH)
        return 1

    with open(INPUT_PATH, "r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        header = reader.fieldnames or []
        if TARGET_COLUMN not in header:
            sys.stderr.write(
                "ERROR: column %r missing; header is %r\n" % (TARGET_COLUMN, header)
            )
            return 1

        total_rows = 0
        values = []
        excluded_rows = []
        for row in reader:
            total_rows += 1
            raw = row.get(TARGET_COLUMN)
            value = parse_value(raw if raw is not None else "")
            if value is None:
                excluded_rows.append((row.get("site"), raw))
            else:
                values.append(value)

    n = len(values)
    # Guard rails: a valid positive count and a finite mean, else fail loudly.
    assert isinstance(n, int) and n > 0, "n must be a positive integer, got %r" % (n,)
    mean = math.fsum(values) / n
    assert math.isfinite(mean), "mean must be a finite number, got %r" % (mean,)

    result = {"n": n, "unit": UNIT, "mean": mean}
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    with open(RESULT_PATH, "w", encoding="utf-8") as handle:
        json.dump(result, handle, ensure_ascii=False, indent=2)
        handle.write("\n")

    minimum = min(values)
    maximum = max(values)
    excluded_desc = (
        ", ".join(
            "%s=%r" % (site if site is not None else "?", raw)
            for site, raw in excluded_rows
        )
        if excluded_rows
        else "none"
    )

    report = []
    report.append("# carbon_mg_g 算术均值报告\n")
    report.append("## 1. 输入\n")
    report.append("- 数据文件：`input.csv`（唯一数据源，未筛选、未裁剪、未改写）")
    report.append("- 列：`site`, `carbon_mg_g`, `rain_mm`")
    report.append("- 数据总行数（不含表头）：%d" % total_rows)
    report.append("- 分析变量：`carbon_mg_g`，分析单位 = 一行一条观测，等权\n")

    report.append("## 2. 处理\n")
    report.append("- 方法：算术均值 `mean = Σ x_i / n`（已批准方法，未替换）")
    report.append(
        "- 缺失规则：仅丢弃 `carbon_mg_g` 为空 / `NA` / 不可解析为数值的行（drop NA in target column only）"
    )
    report.append("- 未按 `rain_mm` 筛选任何行；未做填补（无插补、前向填充、零填充）；未剔除极值、未裁剪")
    report.append(
        "- 被排除行数：%d（其中 `rain_mm` 缺失与否不影响纳入决定）"
        % len(excluded_rows)
    )
    report.append("- 被排除行明细：%s" % excluded_desc)
    report.append("- 纳入行数 n：%d（= %d 总行 − %d 排除行）" % (n, total_rows, len(excluded_rows)))
    report.append(
        "- 数值校验：n 为正整数（n = %d）；mean 通过 `math.isfinite` 有限性断言" % n
    )
    report.append("- 实现：Python 标准库（`csv`/`json`/`math`），无第三方依赖、无子进程、无后台线程\n")

    report.append("## 3. 结果\n")
    report.append("| 指标 | 值 | 单位 |")
    report.append("| --- | --- | --- |")
    report.append("| carbon_mg_g 算术均值 | %.12f | %s |" % (mean, UNIT))
    report.append("")
    report.append("- `mean = %.12f` %s" % (mean, UNIT))
    report.append("- `n = %d`（与 `results/result.json` 的 `n` / sampleCount 一致）" % n)
    report.append("- `unit = %s`" % UNIT)
    report.append("- 纳入值域（仅描述，未用于处理）：min = %g, max = %g" % (minimum, maximum))
    report.append(
        "- 可复现命令：`python3 -I results/analysis.py`（读取 `input.csv`，写出 `results/result.json` 与本报告）\n"
    )

    report.append("## 4. 局限\n")
    report.append(
        "- 单位来源：`mg/g` 来自任务约定与宿主验收规则（并依次与列名 `carbon_mg_g` 字面相符），"
        "**不是数据内的独立单位证据**——文件无单位列、无单位元数据行、无测量方法说明。"
    )
    report.append(
        "- 偏态 / 极端值敏感性：算术均值对偏态分布与极端值敏感，当前值域为 %g–%g，"
        "本报告不宣称该值是稳健中心趋势估计。" % (minimum, maximum)
    )
    report.append(
        "- 缺失机制：按契约直接丢弃目标列 NA（complete-case），未检验缺失是否随机；"
        "若缺失与取值相关，均值可能存在偏倚。"
    )
    report.append("- 推断范围：仅为单变量描述统计点估计，无显著性检验、无置信区间、无外推结论。")
    report.append(
        "- 代表性：样本仅 48 行、单一 site 命名序列，无抽样设计信息，不能外推到其他地点或总体。"
    )
    report.append("")

    with open(REPORT_PATH, "w", encoding="utf-8") as handle:
        handle.write("\n".join(report))

    sys.stdout.write(
        "n=%d unit=%s mean=%.10f excluded=%d total=%d\n"
        % (n, UNIT, mean, len(excluded_rows), total_rows)
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
