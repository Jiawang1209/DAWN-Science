#!/usr/bin/env python3
"""Arithmetic mean of temperature_c in input.csv (unit: degC).

Contract (tabular-ecology@1, user-approved method: arithmetic mean):
  * dataPath   : input.csv          (read-only)
  * column     : temperature_c
  * metric     : mean               (equal-weight arithmetic mean, sum(x)/n)
  * unit       : "°C"               (given by user, not inferred from data)
  * missing    : "block" / rule "drop NA in target column only"
                 -> only the target column is consulted for missingness;
                    non-numeric/empty target cells are dropped, never imputed.
                    Non-target columns (site) are never used to drop rows.
  * no imputation, no unit conversion, no row deletion beyond target NA.

Outputs (written by this single process):
  results/result.json  {"n": <int>, "unit": "°C", "mean": <finite float>}
  results/report.md    input / processing / result / limitations / reproduce

Execution model: plain single process. This script MUST NOT create
subprocesses, threads or external dependencies; it only reads input.csv via
csv and writes the two files above. Run with:
  python3 -I results/analysis.py
"""

import csv
import json
import math
import os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)  # results/.. == project root holding input.csv

DATA_PATH = os.path.join(ROOT, "input.csv")
RESULT_PATH = os.path.join(HERE, "result.json")
REPORT_PATH = os.path.join(HERE, "report.md")

COLUMN = "temperature_c"
UNIT = "\u00b0C"  # degree sign + C
MISSING_TOKENS = {"", "na", "n/a", "nan", "null", "none", "-", "?", "."}


def load_target_values(path, column):
    """Read `column` from `path`; drop NA only in that column.

    Returns (values, total_rows, dropped). No imputation, no unit change,
    no row removal for any other reason.
    """
    with open(path, "r", encoding="utf-8", newline="") as fh:
        reader = csv.DictReader(fh)
        if reader.fieldnames is None:
            raise SystemExit(f"input has no header: {path}")
        if column not in reader.fieldnames:
            raise SystemExit(
                f"target column {column!r} missing; header={reader.fieldnames!r}"
            )
        values = []
        total_rows = 0
        dropped = 0
        for raw_row in reader:
            # csv yields None for short rows; treat a fully empty line as no data
            if all(v is None or str(v).strip() == "" for v in raw_row.values()):
                continue
            total_rows += 1
            cell = raw_row.get(column)
            token = "" if cell is None else str(cell).strip()
            if token.lower() in MISSING_TOKENS:
                dropped += 1
                continue
            try:
                values.append(float(token))
            except ValueError:
                # Non-numeric target cell: treated as NA by the block rule.
                dropped += 1
        return values, total_rows, dropped


def main():
    values, total_rows, dropped = load_target_values(DATA_PATH, COLUMN)
    n = len(values)

    # Contract assertions: non-empty sample, finite mean, mean inside the
    # observed [min, max] range (a mean of a finite sample must lie there).
    assert n > 0, f"n must be > 0, got {n} (all target values missing?)"
    assert all(math.isfinite(v) for v in values), "non-finite observation"

    total = 0.0
    for v in values:
        total += v
    mean = total / n

    assert math.isfinite(mean), f"mean not finite: {mean}"
    lo, hi = min(values), max(values)
    assert lo - 1e-12 <= mean <= hi + 1e-12, f"mean {mean} outside [{lo}, {hi}]"

    payload = {"n": n, "unit": UNIT, "mean": mean}
    with open(RESULT_PATH, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False, indent=2)
        fh.write("\n")

    report = build_report(values, n, total_rows, dropped, mean, lo, hi)
    with open(REPORT_PATH, "w", encoding="utf-8") as fh:
        fh.write(report)

    print(f"n={n} unit={UNIT} mean={mean!r}")


def build_report(values, n, total_rows, dropped, mean, lo, hi):
    obs = ", ".join(f"{v:g}" for v in values)
    lines = []
    lines.append("# temperature_c 算术均值 — 结果报告")
    lines.append("")
    lines.append("## 1. 输入")
    lines.append("")
    lines.append("- 数据文件：`input.csv`（相对项目根目录，只读；本脚本不修改它）")
    lines.append(f"- 目标列：`{COLUMN}`；单位：`{UNIT}`（由用户指定，非由数据推断）")
    lines.append(f"- 数据行数：{total_rows}；目标列非缺失样本数：n = {n}")
    lines.append(f"- 目标列取值：{obs}")
    lines.append(
        f"- 缺失值规则：`drop NA in target column only`（宿主 missing=block）；"
        f"仅对目标列判定缺失，本轮目标列缺失 {dropped} 个"
    )
    if dropped == 0:
        lines.append("- 结论：目标列 4/4 有效，规则未触发，未删除任何行、未插补任何值")
    else:
        lines.append(
            f"- 注意：目标列有 {dropped} 个缺失/非数值单元按规则排除（未插补）"
        )
    lines.append("")
    lines.append("## 2. 处理")
    lines.append("")
    lines.append("- 方法：等权算术平均 `mean = sum(x_i) / n`，全部观测等权，无加权、无分组、无抽样")
    lines.append("- 单位保持 `" + UNIT + "`，不做任何单位换算")
    lines.append("- 无插补、无删行（除目标列缺失）、无截断、无离群值剔除")
    lines.append("- 未引入外部数据、网络请求或第三方包；Python 标准库 `csv`/`json`/`math` 与内置算术")
    lines.append("- 脚本内断言：n > 0、所有观测有限、均值有限、均值落在观测区间 [min, max] 内")
    lines.append("- 执行模型：单进程，脚本内不创建子进程/线程；只读 `input.csv`，只写本目录两个产物")
    lines.append("")
    lines.append("## 3. 结果")
    lines.append("")
    lines.append("| 项目 | 值 |")
    lines.append("|---|---|")
    lines.append(f"| n（参与计算样本数） | {n} |")
    lines.append(f"| unit | {UNIT} |")
    lines.append(f"| mean | {mean!r} |")
    lines.append(f"| 观测区间 | [{lo:g}, {hi:g}]（均值落在区间内） |")
    lines.append("")
    lines.append(f"即 Σx = {sum(values)!r}，n = {n}，算术均值 = {mean!r} {UNIT}。")
    lines.append("")
    lines.append("机器可读结果见 `results/result.json`（平铺对象，三项键：`n`、`unit`、`mean`）。")
    lines.append("")
    lines.append("## 4. 局限")
    lines.append("")
    lines.append("- 仅报告点估计；n = 4 且为自制小样本，不报告置信区间、不做假设检验，也不外推总体")
    lines.append("- 单位 `" + UNIT + "` 来自用户指令；数据本身无独立单位标记，无法由数据佐证量纲")
    lines.append("- 均值对离群值敏感；本样本量下有单个异常值即可显著移动结果，但按契约不剔除任何行")
    lines.append("- 未做分组/分层比较（如按 site），本任务只求总体算术均值")
    lines.append("- 未评估测量误差、采样代表性或缺失机制（本轮目标列无缺失，故缺失机制未受检验）")
    lines.append("")
    lines.append("## 5. 复现")
    lines.append("")
    lines.append("在项目根目录（含 `input.csv` 与 `results/`）执行单一命令：")
    lines.append("")
    lines.append("```bash")
    lines.append("python3 -I results/analysis.py")
    lines.append("```")
    lines.append("")
    lines.append("预期输出：`n=4 unit=\u00b0C mean=20.0`，并重写 `results/result.json` 与本报告。")
    lines.append("")
    return "\n".join(lines)


if __name__ == "__main__":
    main()
