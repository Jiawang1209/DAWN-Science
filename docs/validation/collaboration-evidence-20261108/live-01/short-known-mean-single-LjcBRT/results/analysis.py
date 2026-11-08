#!/usr/bin/env python3
"""Arithmetic mean of temperature_c (unit: °C) — tabular-ecology@1 template.

Approved method: arithmetic mean (user-approved).
Unit rule: °C (given by the task, never inferred from the data).
Missing-value rule: drop NA in the target column only — but the frozen host
acceptance for this task sets numeric.missing = "block" and the task states
"不能丢弃样本" (no sample may be discarded). Because the observed input has zero
missing values both rules coincide; the script therefore blocks (exit code 2)
if any NA appears in temperature_c instead of silently dropping rows.

Standard library only. No subprocesses, no network, no external state.
Deterministic: identical input -> identical result.json.

Run:  python3 -I results/analysis.py [input.csv] [result.json]
"""

from __future__ import annotations

import csv
import json
import math
import sys
from pathlib import Path
from typing import Any

TARGET = "temperature_c"
UNIT = "°C"
METRIC = "mean"
EXPECTED_HEADER = ["site", TARGET]
# Values outside this range would suggest Fahrenheit/Kelvin mix-ups rather than
# genuine air/water temperatures; used only as a warning, never to alter data.
PLAUSIBLE_RANGE = (-89.2, 56.7)


class InputError(Exception):
    """Structural or value problem in the input table."""


def locate(*candidates: Path) -> Path:
    for candidate in candidates:
        if candidate.is_file():
            return candidate
    raise FileNotFoundError(f"none of these paths exists: {[str(c) for c in candidates]}")


def read_table(path: Path) -> tuple[list[str], list[dict[str, str]]]:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        header = reader.fieldnames
        if header is None:
            raise InputError("input file is empty (no header row)")
        if header != EXPECTED_HEADER:
            raise InputError(
                f"unexpected header {header!r}; expected exactly {EXPECTED_HEADER!r}"
            )
        rows = []
        for lineno, row in enumerate(reader, start=2):
            if None in row or any(key is None for key in row):
                raise InputError(f"line {lineno}: more fields than the header declares")
            if all((value or "").strip() == "" for value in row.values()):
                raise InputError(f"line {lineno}: blank record")
            row["__line__"] = str(lineno)
            rows.append(row)
    return header, rows


def parse_target(
    rows: list[dict[str, str]],
) -> tuple[list[float], list[dict[str, Any]], list[str]]:
    values: list[float] = []
    raw_tokens: list[str] = []
    dropped: list[dict[str, Any]] = []
    for row in rows:
        raw = (row.get(TARGET) or "").strip()
        if raw == "" or raw.upper() in {"NA", "N/A", "NAN", "NULL", "NONE", "."}:
            dropped.append({"line": row["__line__"], "raw": raw or "<blank>"})
            continue
        try:
            value = float(raw)
        except ValueError as exc:
            raise InputError(
                f"line {row['__line__']}: {TARGET}={raw!r} is not a finite number ({exc})"
            ) from exc
        if not math.isfinite(value):
            raise InputError(f"line {row['__line__']}: {TARGET}={raw!r} is not finite")
        values.append(value)
        raw_tokens.append(raw)
    if dropped:
        raise InputError(
            f"{len(dropped)} missing/NA value(s) in {TARGET} at line(s) "
            f"{[item['line'] for item in dropped]}; the frozen acceptance rule is "
            "missing=block and samples must not be discarded, so no mean is emitted"
        )
    if not values:
        raise InputError(f"no usable numeric values in column {TARGET}")
    return values, dropped, raw_tokens


def main(argv: list[str]) -> int:
    script_dir = Path(__file__).resolve().parent
    workspace = script_dir.parent
    input_path = Path(argv[1]) if len(argv) > 1 else locate(
        workspace / "input.csv", Path.cwd() / "input.csv"
    )
    result_path = Path(argv[2]) if len(argv) > 2 else script_dir / "result.json"

    try:
        _header, rows = read_table(input_path)
        values, _dropped, raw_tokens = parse_target(rows)
    except InputError as exc:
        print(f"INPUT_ERROR: {exc}", file=sys.stderr)
        return 2

    n = len(values)
    # fsum keeps the mean exact up to rounding; here 14+18+22+26 = 80 -> 20.0.
    total = math.fsum(values)
    mean = total / n
    if not math.isfinite(mean):
        print("INPUT_ERROR: mean is not finite", file=sys.stderr)
        return 2

    decimals = {len(t.split(".")[1]) for t in raw_tokens if "." in t}
    result = {"n": n, "unit": UNIT, METRIC: mean}
    result_path.parent.mkdir(parents=True, exist_ok=True)
    with result_path.open("w", encoding="utf-8") as handle:
        json.dump(result, handle, ensure_ascii=False, indent=2)
        handle.write("\n")

    out_of_range = [v for v in values if not (PLAUSIBLE_RANGE[0] <= v <= PLAUSIBLE_RANGE[1])]
    print(f"input={input_path}")
    print(f"rows_read={len(rows)} rows_used={n} dropped=0")
    print(f"values={values} sum={total!r} mean={mean!r} unit={UNIT}")
    print(f"observed_decimals={sorted(decimals)}")
    print(f"plausibility_warnings={len(out_of_range)}")
    print(f"wrote={result_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
