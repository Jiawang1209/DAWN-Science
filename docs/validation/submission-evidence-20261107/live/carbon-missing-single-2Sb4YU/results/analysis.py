#!/usr/bin/env python3
"""Arithmetic mean of `carbon_mg_g` (unit: mg/g) from input.csv.

Frozen, user-approved method (tabular-ecology@1):
  - metric: mean (arithmetic), unit: mg/g
  - missing values: drop NA in the target column ONLY (no rows are dropped
    or kept on the basis of `rain_mm`; `rain_mm` is not used at all)
  - no imputation, no filtering, no unit conversion (units are taken as
    declared by the header `carbon_mg_g`, i.e. mg/g)

Runs on the Python standard library only; creates no subprocesses and no
threads. Outputs:
  results/result.json  flat object {"n": int, "unit": "mg/g", "mean": float}
  stdout               human-readable audit trail (also used for the report)

Usage: python3 -I results/analysis.py [input.csv]
"""

import csv
import json
import math
import os
import sys

TARGET = "carbon_mg_g"
UNIT = "mg/g"
METRIC = "mean"
EXPECTED_HEADER = ["site", "carbon_mg_g", "rain_mm"]
NA_TOKENS = {"", "NA", "na", "N/A", "NaN", "nan", "NULL", "null", "None"}


def default_input_path():
    """input.csv lives at the workspace root, one level above results/."""
    here = os.path.dirname(os.path.abspath(__file__))
    return os.path.join(os.path.dirname(here), "input.csv")


def load_rows(path):
    with open(path, newline="", encoding="utf-8") as fh:
        reader = csv.reader(fh)
        try:
            header = next(reader)
        except StopIteration:
            raise SystemExit("FATAL: input file is empty: %s" % path)
        if header != EXPECTED_HEADER:
            raise SystemExit(
                "FATAL: unexpected header %r (expected %r)" % (header, EXPECTED_HEADER)
            )
        idx = {name: i for i, name in enumerate(header)}
        rows = []
        for lineno, raw in enumerate(reader, start=2):
            if not raw or all(cell.strip() == "" for cell in raw):
                continue  # blank line, not a data row
            if len(raw) != len(header):
                raise SystemExit(
                    "FATAL: line %d has %d fields, header has %d"
                    % (lineno, len(raw), len(header))
                )
            rows.append((lineno, {k: raw[i].strip() for k, i in idx.items()}))
    if not rows:
        raise SystemExit("FATAL: no data rows in %s" % path)
    return header, rows


def main(argv):
    path = argv[1] if len(argv) > 1 else default_input_path()
    if not os.path.isfile(path):
        raise SystemExit("FATAL: input file not found: %s" % path)

    header, rows = load_rows(path)

    # ---- structural audit -------------------------------------------------
    sites = [r["site"] for _, r in rows]
    dup_sites = sorted({s for s in sites if sites.count(s) > 1})
    if dup_sites:
        raise SystemExit("FATAL: duplicated site identifiers: %s" % dup_sites)

    na_per_col = {c: 0 for c in header}
    values = []          # (lineno, site, value)
    dropped = []         # (lineno, site)
    non_numeric = []
    for lineno, r in rows:
        for col in header:
            if r[col] in NA_TOKENS:
                na_per_col[col] += 1
        raw = r[TARGET]
        if raw in NA_TOKENS:
            dropped.append((lineno, r["site"]))
            continue
        try:
            val = float(raw)
        except ValueError:
            non_numeric.append((lineno, r["site"], raw))
            continue
        if not math.isfinite(val):
            non_numeric.append((lineno, r["site"], raw))
            continue
        values.append((lineno, r["site"], val))

    if non_numeric:
        raise SystemExit(
            "FATAL: non-numeric / non-finite %s values (cannot be silently "
            "dropped as NA): %s" % (TARGET, non_numeric)
        )
    # Only the target column may contain NA for this method to be applied as approved.
    other_na = {c: n for c, n in na_per_col.items() if c != TARGET and n > 0}
    if other_na:
        raise SystemExit(
            "FATAL: NA outside the target column %s: %s. The approved rule drops "
            "NA in the target column only; this needs a human decision."
            % (TARGET, other_na)
        )
    if not values:
        raise SystemExit("FATAL: no usable %s values after dropping NA" % TARGET)

    n = len(values)
    total = math.fsum(v for _, _, v in values)   # exact-ish summation
    mean = total / n

    # ---- outputs ----------------------------------------------------------
    here = os.path.dirname(os.path.abspath(__file__))
    result_path = os.path.join(here, "result.json")
    payload = {"n": n, METRIC: mean, "unit": UNIT}
    with open(result_path, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False, indent=2)
        fh.write("\n")

    col_vals = [v for _, _, v in values]
    print("input file            : %s" % path)
    print("header                : %s" % ",".join(header))
    print("data rows read        : %d" % len(rows))
    print("NA per column         : %s" % ", ".join("%s=%d" % (c, na_per_col[c]) for c in header))
    print("rows dropped (NA %s)  : %d -> %s" % (TARGET, len(dropped),
                                               ", ".join("line %d (%s)" % d for d in dropped)))
    print("rows used (n)         : %d" % n)
    print("column                : %s" % TARGET)
    print("unit                  : %s" % UNIT)
    print("rain_mm used?         : no (no filtering, no stratification)")
    print("imputation            : none")
    print("min / max             : %r / %r" % (min(col_vals), max(col_vals)))
    print("sum (fsum)            : %r" % total)
    print("arithmetic mean       : %r  (%s)" % (mean, METRIC))
    print("wrote                 : %s" % result_path)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
