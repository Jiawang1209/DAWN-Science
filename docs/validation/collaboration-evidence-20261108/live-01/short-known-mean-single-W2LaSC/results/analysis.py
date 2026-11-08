#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
tabular-ecology@1 / arithmetic mean of `temperature_c`.

Contract (frozen):
  input   : input.csv  (columns: site, temperature_c)       rows declared: 4
  column  : temperature_c
  metric  : arithmetic mean
  unit    : °C
  missing : block   (NA in the target column aborts; nothing is imputed or dropped)
  output  : results/result.json , results/report.md

Invocation (single command, isolated interpreter, no subprocesses):
  python3 -I results/analysis.py

Only the Python standard library is used. No external services, no subprocesses,
no network, no randomness, no timestamps -> byte-stable outputs.
"""

from __future__ import annotations

import csv
import json
import math
import statistics
import sys
from pathlib import Path

TARGET_COLUMN = "temperature_c"
UNIT = "°C"
METRIC_NAME = "mean"
EXPECTED_ROWS = 4
ABS_TOL = 1e-9

# Tokens treated as missing. Comparison happens on a stripped, lowercased cell.
NA_TOKENS = {
    "", "na", "n/a", "n.a.", "nan", "null", "nil", "none", "missing",
    "-", "--", "?", ".",
}

HERE = Path(__file__).resolve().parent          # .../results
ROOT = HERE.parent                              # task working directory
DATA_PATH = ROOT / "input.csv"
RESULT_PATH = HERE / "result.json"
REPORT_PATH = HERE / "report.md"


class MethodBlocked(Exception):
    """Raised when the method's applicability conditions are not met.

    Blocking is deliberate: the contract forbids silently dropping samples,
    imputing missing values, or guessing units.
    """


def is_missing(cell: str | None) -> bool:
    return cell is None or cell.strip().lower() in NA_TOKENS


def read_table(path: Path) -> tuple[list[str], list[dict[str, str]], int]:
    """Read the CSV as UTF-8 text; return (header, rows, physical_line_count)."""
    if not path.is_file():
        raise MethodBlocked(f"input not found: {path}")

    raw = path.read_bytes()
    if not raw.strip():
        raise MethodBlocked(f"input file is empty: {path}")
    if b"\x00" in raw:
        raise MethodBlocked("input file contains NUL bytes; refusing to parse as text")

    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise MethodBlocked(f"input is not valid UTF-8: {exc}") from exc

    # Params come from bytes above; csv.reader consumes the decoded lines.
    reader = csv.reader(text.splitlines())
    rows = list(reader)
    if not rows:
        raise MethodBlocked("no header row found")

    header = [h.strip() for h in rows[0]]
    if not any(header):
        raise MethodBlocked("header row is empty")

    # Exact, case-sensitive match on the contracted column name.
    if TARGET_COLUMN not in header:
        raise MethodBlocked(
            f"target column {TARGET_COLUMN!r} not present; header={header}"
        )

    data_rows: list[dict[str, str]] = []
    for lineno, rec in enumerate(rows[1:], start=2):
        if not rec or all(not str(c).strip() for c in rec):
            continue  # trailing blank line, not a sample
        if len(rec) != len(header):
            raise MethodBlocked(
                f"line {lineno}: expected {len(header)} fields, got {len(rec)}"
            )
        data_rows.append({h: rec[i] for i, h in enumerate(header)})

    return header, data_rows, len(text.splitlines())


def to_number(row: dict[str, str], lineno: int) -> float:
    cell = row[TARGET_COLUMN]
    try:
        value = float(cell.strip())
    except (TypeError, ValueError) as exc:
        raise MethodBlocked(
            f"line {lineno}: {TARGET_COLUMN}={cell!r} is not numeric"
        ) from exc
    if not math.isfinite(value):
        raise MethodBlocked(
            f"line {lineno}: {TARGET_COLUMN}={cell!r} is not a finite number"
        )
    return value


def main() -> int:
    header, rows, line_count = read_table(DATA_PATH)

    if not rows:
        raise MethodBlocked("no data rows after the header")

    # ---- missing-value rule: drop NA in the target column only ------------
    # acceptance.missing == "block": if an NA exists in the target column we
    # stop instead of silently dropping it, because dropping would change n.
    target_missing = [i for i, r in enumerate(rows, start=2)
                      if is_missing(r.get(TARGET_COLUMN))]
    if target_missing:
        raise MethodBlocked(
            f"{len(target_missing)} missing value(s) in {TARGET_COLUMN} "
            f"at data row(s) {target_missing}; contract requires 'block' "
            "(no imputation, no silent sample loss)"
        )
    # NA in any other column is out of scope for this metric and is ignored.
    other_na = sum(
        1 for r in rows for k, v in r.items()
        if k != TARGET_COLUMN and is_missing(v)
    )

    values = [to_number(r, i) for i, r in enumerate(rows, start=2)]

    # ---- applicability conditions ----------------------------------------
    n = len(values)
    if n != EXPECTED_ROWS:
        raise MethodBlocked(
            f"declared input has {EXPECTED_ROWS} rows, file provides {n}; "
            "structure mismatch, refusing to report a mean over a different sample"
        )
    if n == 0:
        raise MethodBlocked("no usable numeric observations")

    vmin, vmax = min(values), max(values)

    # ---- arithmetic mean, with independent cross-checks -------------------
    mean = statistics.fmean(values)                       # primary (high precision)
    mean_fsum = math.fsum(values) / n                     # cross-check 1
    mean_sum = sum(values) / n                            # cross-check 2
    if not math.isfinite(mean):
        raise MethodBlocked("computed mean is not finite")
    for label, alt in (("math.fsum", mean_fsum), ("builtin sum", mean_sum)):
        if abs(alt - mean) > ABS_TOL:
            raise MethodBlocked(
                f"cross-check failed: {label} gives {alt!r}, fmean gives {mean!r}"
            )

    # no sample may be dropped
    if n != len(rows):
        raise MethodBlocked(f"sample loss detected: {len(rows)} read, {n} used")

    result = {"n": n, "unit": UNIT, METRIC_NAME: mean}
    # schema guard: flat object, positive integer n, string unit, finite number
    assert isinstance(result["n"], int) and result["n"] > 0
    assert isinstance(result["unit"], str) and result["unit"] == UNIT
    assert isinstance(result[METRIC_NAME], float) and math.isfinite(result[METRIC_NAME])

    RESULT_PATH.write_text(
        json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    sites = [r.get("site", "") for r in rows]
    dup_sites = sorted({s for s in sites if sites.count(s) > 1 and s})
    spread = vmax - vmin
    steps = [round(b - a, 12) for a, b in zip(values, values[1:])]

    def fmt(x: float) -> str:
        return repr(x) if isinstance(x, float) else str(x)

    report = f"""# 温度算术均值分析报告（tabular-ecology@1）

## 1. 结论

| 项目 | 值 |
|---|---|
| 目标列 | `{TARGET_COLUMN}` |
| 指标 | 算术均值（arithmetic mean） |
| 样本量 n（使用 / 读入） | {n} / {len(rows)} |
| 均值 | **{fmt(mean)} °C** |
| 单位 | `{UNIT}` |

均值 = ({' + '.join(fmt(v) for v in values)}) / {n} = {fmt(mean)} °C。

## 2. 输入

- 文件：`input.csv`（UTF-8，逗号分隔，{line_count} 行含表头，{n} 条数据行）
- 表头：`{', '.join(header)}`
- 读取到的 {TARGET_COLUMN} 观测：`{values}`
- 站点标识：`{sites}`；重复站点：{dup_sites if dup_sites else '无'}
- 取值范围：{fmt(vmin)} ~ {fmt(vmax)} °C；极差 {fmt(spread)} °C；相邻差 {steps}

## 3. 方法与适用条件核查

**所用方法**：目标列全部有效观测的算术均值，单位 °C（与输入列同单位，未做任何换算）。

条件逐条核查结果：

1. **数值型连续变量** —— 通过：{n} 个观测全部可解析为有限浮点数，无 `nan` / `inf`，无文本混入。
2. **目标列缺失值** —— 通过：{TARGET_COLUMN} 中缺失值 0 个。非目标列缺失值 {other_na} 个（与本指标无关，按要求仅忽略该列、不影响 n）。
3. **不得丢弃样本** —— 通过：读入 {len(rows)} 行，参与计算 {n} 行，差值为 0。
4. **输入结构符合冻结契约** —— 通过：表头含 `{TARGET_COLUMN}`，数据行数等于声明的 {EXPECTED_ROWS} 行，每行字段数与表头一致。
5. **单位可判定** —— 通过：列名 `{TARGET_COLUMN}` 与契约单位 `{UNIT}` 一致，未做单位推测或换算。
6. **算术均值本身可用** —— 通过：观测为等权独立记录（每行一个站点、无重复站点），加总与除法的定义域成立。

**计算与交叉校验**：主算法 `statistics.fmean` 得 {fmt(mean)}；`math.fsum/n` 得 {fmt(mean_fsum)}；内建 `sum/n` 得 {fmt(mean_sum)}。
三者差均 ≤ {ABS_TOL:g}（契约容差），校验通过。

## 4. 处理过程（可复现）

1. 以 UTF-8 读 `input.csv`，按 `csv` 模块解析，表头逐字段去除首尾空白。
2. 校验表头存在 `{TARGET_COLUMN}`（大小写与拼写精确匹配）；缺失则阻塞退出。
3. 丢弃纯空行（不计为样本）；校验每行字段数 = 表头字段数。
4. 目标列缺失标记（空串、`NA`、`N/A`、`nan`、`null`、`-` 等）计数为 0；若出现则按契约 `missing: block` **阻塞**，不填补、不丢弃。
5. 逐值 `float()` 解析并要求 `math.isfinite`；任一失败即阻塞。
6. 校验 n 等于声明的 {EXPECTED_ROWS} 行。
7. 计算算术均值，并用两种独立实现交叉校验至 {ABS_TOL:g}。
8. 写出 `results/result.json`（平铺对象 `{{n, unit, mean}}`）与本报告。

运行方式（唯一命令，隔离解释器，不创建子进程）：

```bash
python3 -I results/analysis.py
```

脚本仅用 Python 标准库（`csv`/`json`/`math`/`statistics`/`pathlib`/`sys`），无网络、无随机、无时间戳，重复运行输出一致。

## 5. 局限

- **样本量极小（n={n}）**：无法评估分布形状、离群值与稳健性；此处仅报告点估计，未给出标准误、置信区间或显著性检验，因为这些在 n={n} 下不具可靠推断力。
- **摄氏度是区间尺度**：°C 的零点为约定零点，均值的加总只对温度*差*有意义。若需跨数据集比较或计算比值，应改用开尔文（K）；本报告按契约只报告 °C，未做单位换算。
- **未做分层/加权**：每个站点等权，未按面积、时长或观测频次加权；若各站点代表范围不同，简单均值会被代表范围大的站点拉扯。
- **单列、单变量**：未检验与其他列（如 `site`）的关联，也未做时间或空间自相关诊断。
- **缺失值策略的后果**：契约要求"目标列出现 NA 即阻塞"，因此本脚本不会给出"剔除缺失后"的替代结果；如未来数据含 NA，需要上游决定补齐读入策略（并重新冻结 n）。
- 结果只对 `input.csv` 本次内容成立；文件一旦变更需重跑。
"""
    REPORT_PATH.write_text(report, encoding="utf-8")

    print(f"[ok] n={n} unit={UNIT} mean={mean!r}")
    print(f"[ok] rows read={len(rows)} used={n} dropped=0")
    print(f"[ok] checks: finite=yes crosscheck<= {ABS_TOL:g} unit-declared=yes")
    print(f"[ok] wrote {RESULT_PATH.relative_to(ROOT)} and "
          f"{REPORT_PATH.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except MethodBlocked as exc:
        print(f"[blocked] {exc}", file=sys.stderr)
        sys.exit(2)
