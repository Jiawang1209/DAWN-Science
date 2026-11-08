#!/usr/bin/env python3
"""Arithmetic mean of `carbon_mg_g` in `input.csv` (approved method: arithmetic mean).

Contract (frozen):
  dataPath   = input.csv
  column     = carbon_mg_g
  metric     = mean
  unit       = mg/g
  missing    = drop (rows whose *target column* is NA only)

Rules implemented here:
  * Only rows whose `carbon_mg_g` cell is a missing marker ("NA" or empty) are dropped.
  * `rain_mm` is NEVER used for filtering and nothing is imputed.
  * All other columns/rows are kept intact; the input file is only read, never written.
  * Summation uses `math.fsum` (exactly rounded partial sums) to avoid naive-accumulation error.
  * Any value in the target column that is neither a missing marker nor a finite
    decimal number aborts the run with a clear error (no silent coercion, no guessing).
  * Unit "mg/g" is taken from the column name only; no unit metadata exists in this
    workspace, so this is an assumption recorded in the report's limitations.

Run from the repository (workspace) root as a single command:

    python3 -I results/analysis.py

`-I` runs an isolated interpreter (no user site-packages, no cwd on sys.path); the
script imports only the Python standard library, starts no subprocess, and opens no
network connection.

Outputs (paths resolved relative to this file, so cwd does not matter):
    results/result.json   flat object {"n": int, "unit": "mg/g", "mean": float}
    results/report.md     inputs, processing, results, limitations
"""

from __future__ import annotations

import csv
import json
import math
import sys
from pathlib import Path

TARGET_COLUMN = "carbon_mg_g"
UNIT = "mg/g"
MISSING_MARKERS = frozenset({"NA", ""})

RESULTS_DIR = Path(__file__).resolve().parent
WORKSPACE_ROOT = RESULTS_DIR.parent
INPUT_PATH = WORKSPACE_ROOT / "input.csv"
RESULT_PATH = RESULTS_DIR / "result.json"
REPORT_PATH = RESULTS_DIR / "report.md"


def parse_target(raw: str) -> float | None:
    """Return the numeric value, or None when the cell is a missing marker."""
    text = raw.strip()
    if text in MISSING_MARKERS:
        return None
    try:
        value = float(text)
    except ValueError as exc:
        raise ValueError(
            f"unparseable value {raw!r} in column {TARGET_COLUMN!r}: "
            "only the literal NA (or an empty cell) may be treated as missing"
        ) from exc
    if not math.isfinite(value):
        raise ValueError(
            f"non-finite value {raw!r} in column {TARGET_COLUMN!r}; "
            "refusing to compute a mean over it"
        )
    return value


def read_input(path: Path) -> tuple[list[str], int, list[float], list[str]]:
    """Read input.csv; return (header, total_rows, valid_values, missing_sites)."""
    with path.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.reader(handle)
        try:
            header = next(reader)
        except StopIteration:
            raise ValueError(f"{path} is empty; expected a header row")
        stripped = [name.strip() for name in header]
        if len(set(stripped)) != len(stripped):
            raise ValueError(f"duplicate column names in header: {stripped!r}")
        if TARGET_COLUMN not in stripped:
            raise ValueError(
                f"column {TARGET_COLUMN!r} not found in header {stripped!r}"
            )
        target_index = stripped.index(TARGET_COLUMN)
        site_index = stripped.index("site") if "site" in stripped else None

        total_rows = 0
        values: list[float] = []
        missing_sites: list[str] = []
        for line_no, row in enumerate(reader, start=2):
            if not row or all(cell.strip() == "" for cell in row):
                continue  # blank line, not a data record
            if len(row) != len(stripped):
                raise ValueError(
                    f"line {line_no}: expected {len(stripped)} fields, got {len(row)}"
                )
            total_rows += 1
            value = parse_target(row[target_index])
            if value is None:
                site = row[site_index].strip() if site_index is not None else f"row{line_no}"
                missing_sites.append(site)
            else:
                values.append(value)
    return stripped, total_rows, values, missing_sites


def compute(values: list[float]) -> float:
    if not values:
        raise ValueError("no valid observations in the target column; cannot compute a mean")
    return math.fsum(values) / len(values)


def write_result(n: int, mean: float) -> None:
    RESULT_PATH.parent.mkdir(parents=True, exist_ok=True)
    payload = {"n": n, "unit": UNIT, "mean": mean}
    with RESULT_PATH.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2, allow_nan=False)
        handle.write("\n")


def build_report(
    header: list[str],
    total_rows: int,
    values: list[float],
    missing_sites: list[str],
    mean: float,
) -> str:
    n = len(values)
    total = math.fsum(values)
    missing_count = len(missing_sites)
    missing_list = ", ".join(missing_sites) if missing_sites else "(none)"
    rain_index = header.index("rain_mm") if "rain_mm" in header else None
    rain_note = (
        "`rain_mm` 完整保留，未用于任何筛选"
        if rain_index is not None
        else "输入不含 `rain_mm` 列"
    )
    value_lines = "\n".join(
        f"| {i} | {v!r} |" for i, v in enumerate(values, start=1)
    )
    return f"""# `{TARGET_COLUMN}` 算术均值 — 结果报告

批准方法：arithmetic mean（描述性点估计，预先指定，未做方法搜索）。
本报告由 `{RESULTS_DIR.name}/analysis.py` 自动生成，数值与 `{RESULTS_DIR.name}/result.json` 同源。

## 1. 输入

| 项目 | 内容 |
|---|---|
| 数据文件 | `input.csv`（唯一输入，只读） |
| 列 | `{", ".join(header)}`（无重名列） |
| 数据行数 | {total_rows} |
| 目标列 | `{TARGET_COLUMN}`（单位 `{UNIT}`） |
| 目标列缺失标记 | 字面量 `NA`（亦将空单元格视为缺失），共 {missing_count} 处：{missing_list} |
| 参与计算的有效观测 | {n} 个 |
| 其他列 | {rain_note}；`site` 仅作标识，不参与计算 |

未引入任何外部数据，未联网，未读取除 `input.csv` 之外的文件。

## 2. 处理

1. 用标准库 `csv` 读取；校验表头无重名列、每行字段数与表头一致。
2. **仅**丢弃 `{TARGET_COLUMN}` 为缺失标记（`NA` / 空）的行 → {missing_count} 行被剔除。
3. 不按 `rain_mm`（或 `site`、行序）筛选，不做任何填补/插值/平滑，不做单位换算。
4. 目标列出现缺失标记与有限十进制数之外的取值时脚本以异常终止（不静默强制转换），
   因此"结果存在"即意味着该列全部有效值均可解析。
5. 求和用 `math.fsum`（精确舍入求和，避免朴素累加误差），再除以有效观测数 n：

   `mean = math.fsum(x_i) / n`

6. 以双精度浮点运算，`json.dump` 写出全精度表示；不设置随机数、不建子进程、无外部依赖。

重跑命令（仓库根目录，单条命令）：

```bash
python3 -I {RESULTS_DIR.name}/analysis.py
```

## 3. 结果

| 指标 | 数值 |
|---|---|
| n（有效观测数） | {n} |
| Σ x_i（`math.fsum`） | {total!r} |
| 算术均值 `mean` | {mean:.10f} |
| 单位 | `{UNIT}` |

全精度值：`mean = {mean!r}`。写入 `{RESULTS_DIR.name}/result.json` 的平铺对象为
`{{"n": {n}, "unit": "{UNIT}", "mean": {mean!r}}}`。

有效观测明细（按输入行序，已剔除缺失行）：

| # | {TARGET_COLUMN} |
|---|---|
{value_lines}

## 4. 局限

- **单位仅由列名推断**：`{UNIT}` 来自列名后缀 `{TARGET_COLUMN}`；工作区内没有
  README 或单位元数据可供佐证，本报告不证明该单位真实成立，也未做任何量纲换算。
  若原始单位不同，数值本身不变，但"`{UNIT}`"这一读法需要重新确认。
- **观测独立性未知**：行是否相互独立、`site` 是否存在空间/时间结构，输入未说明；
  此处只给算术点估计，不假设独立同分布。
- **不做推断**：未报告置信区间、标准误、假设检验、`{ "rain_mm" if rain_index is not None else "其他变量" }` 关联或分组比较；
  该均值只描述这 {n} 个有效值，不外推到未观测区域或总体。
- **缺失机制未知**：本任务按批准规则仅做完整案例（available-case）剔除，
  未假设 `NA` 为 MCAR/MAR/MNAR，也未评估剔除带来的偏倚；`NA` 不视为 0 或检出限。
- **无图**：按批准范围不产出任何图表，也不做探索性可视化。
- **不做多重比较/敏感性分析**：单一预先指定指标，未尝试替代缺失处理或替代汇总方式。
- 本报告为描述性算术均值；报告数值以 `{RESULTS_DIR.name}/result.json` 为准，二者同源同精度。
"""


def main() -> int:
    if not INPUT_PATH.is_file():
        print(f"error: input file not found: {INPUT_PATH}", file=sys.stderr)
        return 1
    try:
        header, total_rows, values, missing_sites = read_input(INPUT_PATH)
        mean = compute(values)
    except ValueError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1

    write_result(len(values), mean)
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text(
        build_report(header, total_rows, values, missing_sites, mean),
        encoding="utf-8",
    )

    print(
        f"rows={total_rows} n={len(values)} dropped_NA={len(missing_sites)} "
        f"unit={UNIT} mean={mean!r}"
    )
    print(f"wrote {RESULT_PATH}")
    print(f"wrote {REPORT_PATH}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
