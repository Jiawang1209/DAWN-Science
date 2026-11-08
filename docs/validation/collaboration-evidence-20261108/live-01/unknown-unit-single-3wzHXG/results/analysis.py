#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""carbon mean with unit (tabular-ecology@1) -- stdlib only, no subprocess.

Computes the arithmetic mean of `carbon` under the approved rule "drop NA in
target column only", then decides whether the requested deliverable (a MEAN
WITH A UNIT) can be produced. The unit is not derivable from this workspace, so
the script keeps `unit`/`mean_carbon` empty and records an explicit blocked
state; the unitless mean is only a raw-scale diagnostic. A unit is never
guessed from magnitudes, from neighbouring columns, or from convention.

Usage: python3 -I results/analysis.py [--input input.csv] [--outdir results]
Exit code 0 means the computation ran; the gate outcome lives in the artifact.
"""

import argparse
import csv
import json
import statistics
import sys
from pathlib import Path

TEMPLATE = "tabular-ecology@1"
TARGET = "carbon"
METHOD = "arithmetic mean"
NA_RULE = "drop NA in target column only"
NA_TOKENS = {"", "na", "n/a", "nan", "null", "none", "."}
UNIT = None  # no source in this workspace states a unit for `carbon`


def fail(msg):
    print("ERROR: " + msg, file=sys.stderr)
    raise SystemExit(1)


def read_table(path):
    if not path.is_file():
        fail("input file not found: %s" % path)
    with path.open("r", encoding="utf-8-sig", newline="") as fh:
        reader = csv.DictReader(fh)
        header = reader.fieldnames or []
        rows = list(reader)
    if not header:
        fail("input file has no header row")
    return header, rows


def parse_numeric(raw, label):
    """float, or None for a missing token; hard error on anything else."""
    token = (raw or "").strip()
    if token.lower() in NA_TOKENS:
        return None
    try:
        value = float(token)
    except ValueError:
        fail("non-numeric non-missing value %r in %r at %s" % (raw, TARGET, label))
    if value != value or value in (float("inf"), float("-inf")):
        fail("non-finite value %r in %r at %s" % (raw, TARGET, label))
    return value


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", default="input.csv")
    ap.add_argument("--outdir", default="results")
    args = ap.parse_args(argv)
    src, outdir = Path(args.input), Path(args.outdir)
    outdir.mkdir(parents=True, exist_ok=True)

    header, rows = read_table(src)
    if TARGET not in header:
        fail("target column %r absent; header=%s" % (TARGET, header))
    id_col = header[0]
    if any(not (c or "").strip() for c in header):
        fail("header contains blank column names: %s" % header)

    kept, dropped = [], []
    for idx, row in enumerate(rows, start=2):
        label = "line %d (%s)" % (idx, row.get(id_col, "?"))
        value = parse_numeric(row.get(TARGET, ""), label)
        if value is None:
            dropped.append(label)
        else:
            kept.append(value)
    if not kept:
        fail("no usable numeric values in %r" % TARGET)

    n = len(kept)
    mean = statistics.fmean(kept)  # approved method: arithmetic mean

    other_missing = {}
    for name in header:
        if name == TARGET:
            continue
        c = sum(1 for r in rows
                if (r.get(name) or "").strip().lower() in NA_TOKENS)
        if c:
            other_missing[name] = c

    blocked = UNIT is None
    result = {
        "status": "blocked" if blocked else "ok",
        "blocker": "unit_not_provided" if blocked else None,
        "reason": ("Requested deliverable is a mean WITH a unit. Neither the "
                   "input file nor the request supplies a unit for column "
                   "'carbon', and a unit cannot be derived from the numbers or "
                   "from neighbouring columns. The unit is never guessed, so "
                   "the deliverable is withheld instead of inferred."
                   if blocked else None),
        "n": n,
        "unit": UNIT,                 # None: unresolved, deliberately not filled
        "mean_carbon": None,          # withheld while the unit is unresolved
        "method": METHOD,
        "template": TEMPLATE,
        "input": str(src),
        "target_column": TARGET,
        "na_rule": NA_RULE,
        "na_dropped_in_target": len(dropped),
        "na_dropped_rows": dropped,
        "other_columns_missing_counts": other_missing,
        "diagnostics": {
            "mean_carbon_unitless": round(mean, 6),
            "sum_carbon_unitless": round(sum(kept), 6),
            "min_carbon_unitless": min(kept),
            "max_carbon_unitless": max(kept),
            "note": ("Unitless raw-scale figures on the input's own scale. NOT "
                     "the requested metric; must not be reported as a carbon "
                     "mean because the unit is unknown."),
        },
    }
    (outdir / "result.json").write_text(
        json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print("template=%s method=%s target=%s" % (TEMPLATE, METHOD, TARGET))
    print("rows_total=%d na_dropped=%d n=%d" % (len(rows), len(dropped), n))
    print("unit=%s  ->  status=%s" % (UNIT, result["status"]))
    print("diagnostic (unitless, not a deliverable): mean=%.6f" % mean)
    if blocked:
        print("BLOCKED: unit missing; mean withheld (see result.json / report.md)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
