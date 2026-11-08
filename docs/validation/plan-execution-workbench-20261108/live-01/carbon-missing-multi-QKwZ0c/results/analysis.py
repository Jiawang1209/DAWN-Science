#!/usr/bin/env python3
"""Arithmetic mean of carbon_mg_g (unit: mg/g) from input.csv.

Frozen contract (tabular-ecology@1):
  - data: input.csv
  - target column: carbon_mg_g (unit mg/g, declared by the column name)
  - metric: arithmetic mean (user-approved method)
  - missing-value rule: drop NA in the target column ONLY
    (no row filtering by rain_mm, no imputation of any kind)
  - outputs: results/result.json (flat object: n, unit, mean)

Standard library only, no subprocesses, deterministic. Run from the working
directory that contains input.csv:

    python3 -I results/analysis.py
"""

import csv
import json
import math
import os
import sys

DATA_PATH = "input.csv"
TARGET = "carbon_mg_g"
UNIT = "mg/g"
RESULT_PATH = os.path.join("results", "result.json")

# Only these tokens count as an explicit missing marker. Anything else that
# fails float() is a data error and aborts the run (no silent coercion).
NA_TOKENS = {"na", "n/a", "nan", "null", "none", ""}


def parse_target(raw: str, lineno: int):
    """Return a finite float, or None for an explicit NA marker."""
    text = raw.strip()
    if text.lower() in NA_TOKENS:
        return None
    try:
        value = float(text)
    except ValueError:
        raise SystemExit(
            "data error: line %d column %s is neither a number nor NA: %r"
            % (lineno, TARGET, raw)
        )
    if not math.isfinite(value):
        raise SystemExit(
            "data error: line %d column %s is non-finite: %r" % (lineno, TARGET, raw)
        )
    return value


def main() -> int:
    if not os.path.isfile(DATA_PATH):
        raise SystemExit("input error: %s not found in %s" % (DATA_PATH, os.getcwd()))

    with open(DATA_PATH, "r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        header = reader.fieldnames or []
        if TARGET not in header:
            raise SystemExit("input error: column %s missing; header=%r" % (TARGET, header))

        rows = 0
        dropped = []
        values = []
        for record in reader:
            rows += 1
            lineno = reader.line_num  # 1-based physical line, header is 1
            # The rest of the row is read but NOT used for filtering.
            value = parse_target(record.get(TARGET) or "", lineno)
            if value is None:
                dropped.append((record.get("site") or "row-%d" % lineno, lineno))
            else:
                values.append(value)

    if not values:
        raise SystemExit("data error: no non-missing %s values, mean undefined" % TARGET)

    n = len(values)
    total = math.fsum(values)  # exactly-rounded summation of the valid values
    mean = total / n
    if not math.isfinite(mean):
        raise SystemExit("numeric error: mean is not finite")

    os.makedirs(os.path.dirname(RESULT_PATH) or ".", exist_ok=True)
    payload = {"n": n, "unit": UNIT, "mean": mean}
    with open(RESULT_PATH, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)
        handle.write("\n")

    print("rows_read=%d" % rows)
    print("non_missing=%d" % n)
    print("dropped_na=%d %s" % (len(dropped), [site for site, _ in dropped]))
    print("sum=%r" % total)
    print("mean=%r unit=%s" % (mean, UNIT))
    print("wrote %s" % RESULT_PATH)
    return 0


if __name__ == "__main__":
    sys.exit(main())
