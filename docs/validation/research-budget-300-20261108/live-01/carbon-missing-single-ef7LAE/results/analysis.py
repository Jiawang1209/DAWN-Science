#!/usr/bin/env python3
"""Arithmetic mean of carbon_mg_g (unit: mg/g) with target-column-only NA dropping.

Approved method: arithmetic mean (tabular-ecology@1).
Missing-value rule: drop NA in the target column only (do NOT filter on rain_mm,
do NOT impute).

Stdlib only. No subprocesses, no network, no writes outside results/.
Run from the task directory:  python3 -I results/analysis.py
"""

import csv
import json
import math
import os
import sys

TARGET = "carbon_mg_g"
KEY_COL = "site"
UNIT = "mg/g"
NA_TOKENS = {"NA", "N/A", "na", "n/a", "NaN", "nan", "", "NULL", "null", "."}


def resolve_inputs(argv):
    """Default to <project_root>/input.csv; allow explicit overrides."""
    here = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(here)
    data_path = argv[1] if len(argv) > 1 else os.path.join(project_root, "input.csv")
    out_dir = argv[2] if len(argv) > 2 else here
    return data_path, out_dir


def parse_number(raw):
    """Return (value, ok). NA tokens -> (None, False); unparseable -> ('ERR', False)."""
    if raw is None:
        return None, False
    token = raw.strip()
    if token in NA_TOKENS:
        return None, False
    try:
        value = float(token)
    except ValueError:
        return "ERR", False
    if not math.isfinite(value):
        return "ERR", False
    return value, True


def main(argv):
    data_path, out_dir = resolve_inputs(argv)

    with open(data_path, "r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        if reader.fieldnames is None:
            raise SystemExit("input.csv has no header row")
        header = [h.strip() for h in reader.fieldnames]
        if TARGET not in header:
            raise SystemExit("target column missing: %s (found %s)" % (TARGET, header))

        n_rows = 0
        kept = []          # (site, value) after NA drop
        dropped = []       # sites whose target cell was NA
        malformed = []     # non-NA cells that failed numeric parsing
        rain_values = []   # retained for structure checks only, never used in the metric

        for row in reader:
            if not any((v or "").strip() for v in row.values() if isinstance(v, str)):
                continue  # skip fully blank lines
            n_rows += 1
            site = (row.get(KEY_COL) or "").strip()
            value, ok = parse_number(row.get(TARGET))
            if value == "ERR":
                malformed.append({"site": site, "raw": row.get(TARGET)})
                continue
            rain, _ = parse_number(row.get("rain_mm"))
            if rain is not None and rain != "ERR":
                rain_values.append(rain)
            if not ok:
                dropped.append(site)
                continue
            kept.append((site, value))

    if malformed:
        raise SystemExit(
            "non-numeric, non-NA values in %s: %s" % (TARGET, malformed)
        )

    n = len(kept)
    if n == 0:
        raise SystemExit("no usable values in %s after dropping NA" % TARGET)

    values = [v for _, v in kept]
    total = math.fsum(values)  # exact float summation, order-independent
    mean = total / n

    # Flat, minimal result object per frozen acceptance schema:
    # {n: int, unit: str, <metric name>: finite number}
    result = {
        "n": n,
        "unit": UNIT,
        "mean": mean,
    }

    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, "result.json")
    with open(out_path, "w", encoding="utf-8") as handle:
        json.dump(result, handle, ensure_ascii=False, indent=2, sort_keys=True)
        handle.write("\n")

    print("rows read:            %d" % n_rows)
    print("NA dropped (%s):%5d  %s" % (TARGET, len(dropped), ",".join(dropped)))
    print("n used:               %d" % n)
    print("sum:                  %.10f" % total)
    print("mean %s:         %.10f %s" % (TARGET, mean, UNIT))
    print("min / max:            %.4f / %.4f" % (min(values), max(values)))
    print("rain_mm values seen:  %d (not used for filtering/imputation)" % len(rain_values))
    print("wrote:                %s" % out_path)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
