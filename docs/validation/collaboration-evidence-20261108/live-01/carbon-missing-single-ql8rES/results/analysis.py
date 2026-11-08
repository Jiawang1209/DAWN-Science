#!/usr/bin/env python3
"""Arithmetic mean of `carbon_mg_g` (unit: mg/g), dropping NA in that column only.

Template: tabular-ecology@1 (language: python, stdlib only).
Approved method: arithmetic mean (user-approved). No filtering on `rain_mm`,
no imputation, no clipping, no rounding before aggregation.

Run as a single isolated command (no subprocesses, stdlib only):

    python3 -I results/analysis.py

Reads  : <task_dir>/input.csv           (declared input, unmodified)
Writes : <task_dir>/results/result.json (flat object: n, unit, carbon_mg_g_mean)

Design notes
------------
* Paths are resolved from this file's location so the command works from any cwd
  and always touches exactly the declared input/output files.
* Missingness is detected only in the target column, using the CSV's literal
  missing token(s). All other columns are passed through untouched; in
  particular `rain_mm` is never used to select or weight rows.
* Every input row is accounted for in an audit trail written into the JSON
  report metadata block of stdout, so the row count arithmetic is checkable.
"""

from __future__ import annotations

import csv
import json
import math
import sys
from pathlib import Path

TARGET_COLUMN = "carbon_mg_g"
RAIN_COLUMN = "rain_mm"
UNIT = "mg/g"
# Tokens treated as missing in the target column. The file uses the literal "NA".
MISSING_TOKENS = {"", "na", "n/a", "nan", "null", "none", "."}

BASE_DIR = Path(__file__).resolve().parent.parent
INPUT_PATH = BASE_DIR / "input.csv"
OUTPUT_PATH = BASE_DIR / "results" / "result.json"


def fail(message: str) -> None:
    """Hard failure: never fall back silently (project rule 7.5)."""
    print(f"ERROR: {message}", file=sys.stderr)
    sys.exit(1)


def load_rows(path: Path) -> tuple[list[str], list[dict[str, str]]]:
    if not path.is_file():
        fail(f"input file not found: {path}")
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        if reader.fieldnames is None:
            fail("input CSV has no header row")
        fieldnames = [name.strip() for name in reader.fieldnames]
        rows = []
        for raw in reader:
            if None in raw:  # ragged row: more cells than the header
                fail("input CSV has a row with more fields than the header")
            if all((value or "").strip() == "" for value in raw.values()):
                continue  # blank line, not a data record
            rows.append({(k or "").strip(): (v if v is not None else "") for k, v in raw.items()})
    return fieldnames, rows


def parse_number(text: str, column: str, row_index: int) -> float:
    stripped = text.strip()
    try:
        value = float(stripped)
    except ValueError:
        fail(f"non-numeric value {stripped!r} in column {column!r} at data row {row_index}")
    if not math.isfinite(value):
        fail(f"non-finite value {stripped!r} in column {column!r} at data row {row_index}")
    return value


def main() -> None:
    fieldnames, rows = load_rows(INPUT_PATH)

    if TARGET_COLUMN not in fieldnames:
        fail(f"target column {TARGET_COLUMN!r} missing from header {fieldnames}")

    values: list[float] = []
    dropped: list[dict[str, object]] = []

    for index, row in enumerate(rows, start=1):
        cell = row.get(TARGET_COLUMN, "")
        label = row.get("site", "") or f"row-{index}"
        if cell.strip().lower() in MISSING_TOKENS:
            dropped.append(
                {
                    "row": index,
                    "site": label,
                    "rain_mm": row.get(RAIN_COLUMN, ""),
                    "reason": "missing in target column",
                }
            )
            continue
        # A non-numeric, non-missing cell is a hard error (no silent coercion).
        values.append(parse_number(cell, TARGET_COLUMN, index))

    if not values:
        fail("no usable observations in the target column after dropping missing values")

    n = len(values)
    total = math.fsum(values)
    mean = total / n

    # Audit of the "drop NA in target only" rule: rain_mm must still cover every row.
    rain_present = sum(
        1
        for row in rows
        if row.get(RAIN_COLUMN, "").strip().lower() not in MISSING_TOKENS
    )

    result = {"n": n, "unit": UNIT, "carbon_mg_g_mean": mean}

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT_PATH.open("w", encoding="utf-8") as handle:
        json.dump(result, handle, ensure_ascii=False, indent=2)
        handle.write("\n")

    audit = {
        "input": str(INPUT_PATH.name),
        "columns": fieldnames,
        "rows_read": len(rows),
        "rows_with_value": n,
        "rows_dropped_missing": len(dropped),
        "dropped_rows": dropped,
        "rain_mm_rows_present": rain_present,
        "min": min(values),
        "max": max(values),
        "sum": total,
        "mean": mean,
        "unit": UNIT,
        "output": str(OUTPUT_PATH.relative_to(BASE_DIR)),
    }
    print(json.dumps(audit, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
