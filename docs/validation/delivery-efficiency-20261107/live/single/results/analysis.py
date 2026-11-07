#!/usr/bin/env python3
"""Arithmetic mean of carbon_mg_g (unit: mg/g) -- frozen acceptance contract.

Method (user-approved): arithmetic mean of the target column.
Missing-value rule: drop rows whose *target column* is NA only; no imputation,
no filtering on rain_mm, all other input rows/columns preserved.

Stdlib only. Runs under `python3 -I results/analysis.py`:
 - no subprocesses, no network, no third-party imports
 - writes results/result.json (flat object: n, unit, mean)
"""

import csv
import json
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
INPUT = os.path.join(ROOT, "input.csv")
OUT = os.path.join(HERE, "result.json")

COLUMN = "carbon_mg_g"
UNIT = "mg/g"
METRIC = "mean"
NA_TOKENS = {"", "NA", "N/A", "na", "n/a", "NaN", "nan", "NULL", "null", "."}


def main() -> int:
    with open(INPUT, "r", newline="", encoding="utf-8") as fh:
        reader = csv.DictReader(fh)
        header = reader.fieldnames or []
        rows = list(reader)

    # --- structural checks on the real input ------------------------------
    if COLUMN not in header:
        raise SystemExit(f"target column {COLUMN!r} not found in header {header}")
    if "rain_mm" not in header:
        print("WARNING: rain_mm column absent (not required by this method)", file=sys.stderr)

    n_total = len(rows)
    values = []
    n_na = 0
    n_bad = 0
    for idx, row in enumerate(rows, start=2):  # line number in file
        raw = row.get(COLUMN)
        token = "" if raw is None else str(raw).strip()
        if token in NA_TOKENS:
            n_na += 1
            continue
        try:
            val = float(token)
        except ValueError:
            n_bad += 1
            print(f"WARNING: non-numeric, non-NA value {token!r} at line {idx}; excluded", file=sys.stderr)
            continue
        if not math.isfinite(val):
            n_bad += 1
            print(f"WARNING: non-finite value {token!r} at line {idx}; excluded", file=sys.stderr)
            continue
        values.append(val)

    n = len(values)
    if n == 0:
        raise SystemExit("no usable numeric observations in target column")

    total = math.fsum(values)          # exact summation, order-robust
    mean = total / n

    print(f"rows_total={n_total} na_dropped={n_na} nonnumeric_dropped={n_bad} n_used={n}")
    print(f"sum={total!r} mean={mean!r} unit={UNIT}")

    # flat object, keys exactly: n (int), mean (finite number), unit (str)
    result = {"n": n, METRIC: mean, "unit": UNIT}
    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(result, fh, ensure_ascii=False, indent=2)
        fh.write("\n")
    print("wrote", OUT)
    return 0


if __name__ == "__main__":
    sys.exit(main())
