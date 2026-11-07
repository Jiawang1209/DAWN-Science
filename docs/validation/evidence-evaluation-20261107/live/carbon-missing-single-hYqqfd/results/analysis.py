#!/usr/bin/env python3
"""Arithmetic mean of `carbon_mg_g` (unit: mg/g) for tabular-ecology@1.

Frozen method (user-approved): arithmetic mean.
Frozen missing-value rule: drop NA rows in the target column only.
`rain_mm` is NOT used: no filtering, no weighting, no imputation.

Python stdlib only. No subprocesses. Deterministic.

Run (controlled environment):
    python3 -I results/analysis.py

Writes:
    results/result.json   flat object {n, unit, mean}
    results/summary.json  auxiliary: value set, exact mean, invariant checks
"""

import csv
import json
import sys
from fractions import Fraction
from pathlib import Path

COLUMN = "carbon_mg_g"
UNIT = "mg/g"
METRIC = "mean"
MISSING_TOKENS = {"", "na", "n/a", "nan", "null", "none", "."}

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
DATA_PATH = ROOT / "input.csv"
RESULT_PATH = HERE / "result.json"
SUMMARY_PATH = HERE / "summary.json"


def parse_target(raw):
    """Return (value as str-or-None). Empty/NA tokens -> None. Non-numeric -> error."""
    token = raw.strip()
    if token.lower() in MISSING_TOKENS:
        return None
    return token  # keep as string; numeric conversion happens once, below


def main():
    if not DATA_PATH.is_file():
        raise SystemExit(f"input not found: {DATA_PATH}")

    with DATA_PATH.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        fieldnames = reader.fieldnames or []
        rows = list(reader)

    if COLUMN not in fieldnames:
        raise SystemExit(f"column {COLUMN!r} missing from header {fieldnames!r}")
    if not rows:
        raise SystemExit("input has zero data rows")

    # ---- structure audit -------------------------------------------------
    ragged = [i for i, r in enumerate(rows, start=2) if any(k is None for k in r)]
    if ragged:
        raise SystemExit(f"ragged rows at line(s): {ragged}")

    kept = []          # exact Fractions, retained rows
    seen_na = []       # site labels of dropped rows
    for line_no, row in enumerate(rows, start=2):
        label = (row.get("site") or f"line-{line_no}").strip()
        token = parse_target(row[COLUMN])
        if token is None:
            seen_na.append(label)
            continue
        try:
            value = float(token)
        except ValueError:
            raise SystemExit(
                f"non-numeric, non-NA value in {COLUMN} at line {line_no}: {token!r}"
            )
        if value != value or value in (float("inf"), float("-inf")):
            raise SystemExit(f"non-finite value in {COLUMN} at line {line_no}: {token!r}")
        # exact decimal -> Fraction, so the mean does not inherit binary drift
        kept.append(Fraction(token))

    n = len(kept)
    if n == 0:
        raise SystemExit("no usable values after dropping NA in the target column")

    # ---- arithmetic mean -------------------------------------------------
    exact_mean = sum(kept, Fraction(0)) / n
    mean_value = float(exact_mean)
    if mean_value != mean_value or mean_value in (float("inf"), float("-inf")):
        raise SystemExit("mean is not finite; refusing to write result")

    values_float = [float(v) for v in kept]
    naive_float_mean = sum(values_float) / n

    result = {
        "n": n,
        "unit": UNIT,
        METRIC: mean_value,
    }
    RESULT_PATH.write_text(json.dumps(result, indent=2, sort_keys=False) + "\n", encoding="utf-8")

    summary = {
        "data_path": str(DATA_PATH),
        "column": COLUMN,
        "unit": UNIT,
        "metric": METRIC,
        "missing_rule": "drop NA in target column only",
        "rows_total": len(rows),
        "rows_retained": n,
        "rows_dropped_na": len(seen_na),
        "dropped_labels": seen_na,
        "rain_column_used": False,
        "mean_exact_fraction": f"{exact_mean.numerator}/{exact_mean.denominator}",
        "mean_float": mean_value,
        "mean_float_vs_exact_abs_diff": abs(naive_float_mean - mean_value),
        "min": min(values_float),
        "max": max(values_float),
        "retained_values": values_float,
        "columns_in_header": fieldnames,
    }
    SUMMARY_PATH.write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")

    print(f"rows_total={len(rows)} retained={n} dropped_na={len(seen_na)}")
    print(f"dropped={seen_na}")
    print(f"mean={mean_value:.17g} unit={UNIT} exact={exact_mean}")
    print(f"wrote {RESULT_PATH}")
    print(f"wrote {SUMMARY_PATH}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
