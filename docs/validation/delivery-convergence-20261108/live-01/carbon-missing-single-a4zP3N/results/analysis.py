#!/usr/bin/env python3
"""Arithmetic mean of carbon_mg_g (unit mg/g) from input.csv.

Frozen approval:
  - metric: arithmetic mean
  - unit: mg/g (as declared by the column header; no conversion applied)
  - missing-value rule: drop NA in the target column only
  - no filtering on rain_mm, no imputation, no row removal for any other reason

Standard library only. Run under the controlled interpreter, e.g.
    python3 -I results/analysis.py
No subprocesses, no external dependencies, reads only input.csv.
"""

import json
import math
import os
import sys

TARGET = "carbon_mg_g"
UNIT = "mg/g"
MISSING_TOKENS = {"", "NA", "N/A", "na", "nan", "NaN", "NULL", "null"}

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
INPUT = os.path.join(ROOT, "input.csv")
RESULT = os.path.join(HERE, "result.json")


def parse_csv(path):
    """Minimal RFC4180-ish reader (stdlib csv keeps this honest)."""
    import csv

    with open(path, newline="", encoding="utf-8") as fh:
        rows = list(csv.reader(fh))
    if not rows:
        raise SystemExit("input.csv is empty")
    header = [h.strip() for h in rows[0]]
    records = []
    for line_no, raw in enumerate(rows[1:], start=2):
        if not raw or all(c.strip() == "" for c in raw):
            continue  # blank line, not a data record
        if len(raw) != len(header):
            raise SystemExit(
                "row %d has %d fields, header has %d" % (line_no, len(raw), len(header))
            )
        records.append(dict(zip(header, (c.strip() for c in raw))))
    return header, records


def main():
    header, records = parse_csv(INPUT)
    if TARGET not in header:
        raise SystemExit("target column %r not found in header %r" % (TARGET, header))

    total_rows = len(records)
    values = []
    n_missing = 0
    n_unparseable = 0
    other_missing = {h: 0 for h in header if h != TARGET}

    for rec in records:
        for h in header:
            if h == TARGET:
                continue
            if rec[h] in MISSING_TOKENS:
                other_missing[h] += 1
        raw = rec[TARGET]
        if raw in MISSING_TOKENS:
            n_missing += 1
            continue
        try:
            x = float(raw)
        except ValueError:
            n_unparseable += 1
            continue
        if not math.isfinite(x):
            n_unparseable += 1
            continue
        values.append(x)

    if n_unparseable:
        # Non-numeric, non-NA tokens are not the approved "drop NA" case: stop.
        raise SystemExit(
            "%d unparseable non-NA values in %s; refusing to guess"
            % (n_unparseable, TARGET)
        )
    if not values:
        raise SystemExit("no usable values in %s" % TARGET)

    n = len(values)
    mean = math.fsum(values) / n
    if not math.isfinite(mean):
        raise SystemExit("mean is not finite")

    result = {"n": n, "unit": UNIT, "mean": mean}
    with open(RESULT, "w", encoding="utf-8") as fh:
        json.dump(result, fh, ensure_ascii=False, indent=2)
        fh.write("\n")

    print("input file      : %s" % os.path.relpath(INPUT, ROOT))
    print("rows parsed     : %d" % total_rows)
    print("dropped NA      : %d (target column only)" % n_missing)
    print("other col NA    : %s" % (other_missing,))
    print("n used          : %d" % n)
    print("arithmetic mean : %.12f %s" % (mean, UNIT))
    print("min / max       : %g / %g" % (min(values), max(values)))
    print("result written  : %s" % os.path.relpath(RESULT, ROOT))
    return 0


if __name__ == "__main__":
    sys.exit(main())
