#!/usr/bin/env python3
"""Arithmetic mean of carbon_mg_g (unit: mg/g) — tabular-ecology@1.

Approved method: arithmetic mean of the target column.
Missing-value rule: drop NA in the target column only (rows are not removed
from the input file; rain_mm is never used for filtering, weighting or imputation).

Run from the workspace root:
    python3 -I results/analysis.py

Inputs : input.csv  (columns: site, carbon_mg_g, rain_mm; 48 data rows)
Outputs: results/result.json  (flat {n, unit, mean})
"""

import csv
import json
import math
import os
import sys

DATA_PATH = "input.csv"
TARGET_COLUMN = "carbon_mg_g"
UNIT = "mg/g"
RESULT_PATH = os.path.join("results", "result.json")

# Tokens treated as missing in the target column. Only these are dropped.
NA_TOKENS = {"", "NA", "N/A", "na", "NaN", "nan", "NULL", "null"}


def load_column(path, column):
    """Return (all_values_including_missing, kept_numeric_values, raw_rows)."""
    with open(path, "r", newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        if reader.fieldnames is None:
            raise SystemExit("input.csv has no header row")
        if column not in reader.fieldnames:
            raise SystemExit(
                "target column %r not found in header %r" % (column, reader.fieldnames)
            )
        kept, dropped, total = [], 0, 0
        for line_no, row in enumerate(reader, start=2):
            total += 1
            raw = row[column]
            token = (raw or "").strip()
            if token in NA_TOKENS:
                dropped += 1
                continue
            try:
                value = float(token)
            except ValueError:
                raise SystemExit(
                    "non-numeric and non-NA value %r in %s at line %d"
                    % (raw, column, line_no)
                )
            if not math.isfinite(value):
                raise SystemExit(
                    "non-finite value %r in %s at line %d" % (raw, column, line_no)
                )
            kept.append(value)
    return total, kept, dropped


def main():
    total_rows, values, dropped = load_column(DATA_PATH, TARGET_COLUMN)
    n = len(values)
    if n == 0:
        raise SystemExit("no numeric observations available in %s" % TARGET_COLUMN)

    total = math.fsum(values)          # exact-then-rounded summation
    mean = total / n
    if not math.isfinite(mean):
        raise SystemExit("computed mean is not finite")

    payload = {"n": n, "unit": UNIT, "mean": mean}
    os.makedirs(os.path.dirname(RESULT_PATH) or ".", exist_ok=True)
    with open(RESULT_PATH, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)
        handle.write("\n")

    sys.stdout.write(
        "input_rows=%d dropped_na=%d n=%d sum=%.17g mean=%.17g unit=%s\n"
        % (total_rows, dropped, n, total, mean, UNIT)
    )
    sys.stdout.write("wrote %s\n" % RESULT_PATH)


if __name__ == "__main__":
    main()
