#!/usr/bin/env python3
"""Arithmetic mean of carbon_mg_g (unit: mg/g) with missing values dropped in
the target column only.

Approved method: arithmetic mean (tabular-ecology@1, python).
Missing-value rule: drop NA rows in the target column only; no filtering by
rain_mm and no imputation.

Run (single command, isolated interpreter):
    python3 -I results/analysis.py

The script uses only the Python standard library, reads only ./input.csv and
writes only ./results/result.json. It starts no subprocesses and no threads.
"""

from __future__ import annotations

import csv
import json
import math
import sys
from decimal import Decimal, InvalidOperation
from pathlib import Path

TARGET_COLUMN = "carbon_mg_g"
UNIT = "mg/g"
INPUT_PATH = Path("input.csv")
RESULT_PATH = Path("results/result.json")
MISSING_TOKENS = {"na", "n/a", "nan", "null", "none", ""}


def fail(message: str):
    print(f"ERROR: {message}", file=sys.stderr)
    raise SystemExit(1)


def load_rows(path: Path) -> tuple[list[str], list[dict[str, str]]]:
    if not path.is_file():
        fail(f"input file not found: {path}")
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        if reader.fieldnames is None:
            fail("input.csv has no header row")
        header = [name.strip() for name in reader.fieldnames]
        if len(set(header)) != len(header):
            fail(f"duplicate column names in header: {header}")
        rows = []
        for raw in reader:
            rows.append({(k or "").strip(): (v if v is not None else "") for k, v in raw.items()})
    if TARGET_COLUMN not in header:
        fail(f"target column {TARGET_COLUMN!r} missing; header={header}")
    if len(rows) == 0:
        fail("input.csv contains no data rows")
    return header, rows


def main() -> None:
    header, rows = load_rows(INPUT_PATH)

    values: list[Decimal] = []
    dropped_sites: list[str] = []
    for index, row in enumerate(rows, start=2):  # 2 = first data line
        token = (row.get(TARGET_COLUMN) or "").strip()
        site = (row.get("site") or "").strip() or f"line-{index}"
        if token.lower() in MISSING_TOKENS:
            dropped_sites.append(site)
            continue
        try:
            value = Decimal(token)
        except InvalidOperation:
            fail(f"non-numeric value {token!r} in {TARGET_COLUMN} at line {index}")
        if not value.is_finite():
            fail(f"non-finite value {token!r} in {TARGET_COLUMN} at line {index}")
        values.append(value)

    n = len(values)
    if n == 0:
        fail("no usable (non-missing) values in target column")

    total = sum(values, Decimal(0))
    mean_exact = total / Decimal(n)
    mean = float(mean_exact)
    if not math.isfinite(mean):
        fail("computed mean is not finite")

    result = {"n": n, "unit": UNIT, "mean": mean}

    RESULT_PATH.parent.mkdir(parents=True, exist_ok=True)
    RESULT_PATH.write_text(
        json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    print(f"rows_total={len(rows)}")
    print(f"dropped_missing={len(dropped_sites)}")
    print(f"dropped_sites={','.join(dropped_sites)}")
    print(f"n={n}")
    print(f"sum={total}")
    print(f"mean={mean_exact} (decimal) -> {mean!r} (float)")
    print(f"unit={UNIT}")
    print(f"wrote={RESULT_PATH}")


if __name__ == "__main__":
    main()
