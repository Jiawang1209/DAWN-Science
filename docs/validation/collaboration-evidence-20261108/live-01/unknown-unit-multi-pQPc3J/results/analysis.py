#!/usr/bin/env python3
"""Arithmetic mean of the `carbon` column in input.csv.

Contract (frozen):
  * read input.csv once, read-only;
  * target column only: drop rows whose `carbon` value is a missing marker
    (literal `NA`, empty field). No imputation, no transformation, no
    dropping/filtering on any other column;
  * report n (non-missing carbon count), dropped count, arithmetic mean;
  * record the unit status of `carbon` verbatim as `not_provided`.

The unit of `carbon` is not present in any declared input. This script
therefore never guesses, converts or borrows a unit (in particular it does
not use `rain_mm`, whose unit belongs to rainfall). `unit` in result.json is
the objective status string `not_provided`, not a measurement unit.

Run:  python3 results/analysis.py
Writes: results/result.json  (does not touch input.csv)
"""

import csv
import json
import math
import os
from statistics import mean, median, stdev

INPUT_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "input.csv")
RESULT_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "result.json")

TARGET = "carbon"
MISSING_MARKERS = {"NA", ""}          # explicit missing-value declaration
EXPECTED_COLUMNS = ["site", "carbon", "rain_mm"]
UNIT_STATUS = "not_provided"          # status string only, never a unit


def load_rows(path):
    with open(path, "r", newline="", encoding="utf-8") as fh:
        reader = csv.DictReader(fh)
        header = reader.fieldnames
        rows = list(reader)
    return header, rows


def main():
    header, rows = load_rows(INPUT_PATH)

    if header != EXPECTED_COLUMNS:
        raise SystemExit("unexpected header: %r" % (header,))
    if TARGET not in header:
        raise SystemExit("target column missing: %s" % TARGET)

    total_rows = len(rows)

    # Target-column-only missing handling: no other column is used to decide.
    values = []
    dropped = 0
    for row in rows:
        raw = row[TARGET]
        token = raw.strip() if raw is not None else ""
        if token in MISSING_MARKERS:
            dropped += 1
            continue
        values.append(float(token))

    n = len(values)
    if n <= 0:
        raise SystemExit("no non-missing %s values; mean undefined" % TARGET)

    for v in values:
        if not math.isfinite(v):
            raise SystemExit("non-finite %s value encountered: %r" % (TARGET, v))

    carbon_mean = mean(values)

    result = {
        "n": n,
        "unit": UNIT_STATUS,
        "mean_carbon": round(carbon_mean, 10),
    }

    with open(RESULT_PATH, "w", encoding="utf-8") as fh:
        json.dump(result, fh, ensure_ascii=False, indent=2, sort_keys=False)
        fh.write("\n")

    print("input: %s" % os.path.normpath(INPUT_PATH))
    print("columns: %s" % ",".join(header))
    print("data rows: %d" % total_rows)
    print("non-missing %s: %d" % (TARGET, n))
    print("dropped (missing marker in %s): %d" % (TARGET, dropped))
    print("arithmetic mean of %s: %.10f" % (TARGET, carbon_mean))
    print("min: %.10f  max: %.10f  median: %.10f" % (min(values), max(values), median(values)))
    if n >= 2:
        print("sample sd (n-1): %.10f" % stdev(values))
    print("unit: %s (no unit supplied by any declared input)" % UNIT_STATUS)
    print("wrote: %s" % os.path.normpath(RESULT_PATH))


if __name__ == "__main__":
    main()
