#!/usr/bin/env python3
"""tabular-ecology@1 — arithmetic mean of `carbon`, gated on an explicit unit.

Approved method: arithmetic mean (unweighted) over non-missing `carbon` rows.
Missing-value rule: drop NA in the target column only; no other column is used
or imputed.

Precondition that cannot be satisfied from the workspace: the physical unit of
`carbon`. `input.csv` carries no unit metadata (header is `site,carbon,rain_mm`,
no accompanying data dictionary, README or unit column), and the request states
that no unit was supplied. `rain_mm` is a different variable and its unit says
nothing about `carbon`; numeric magnitude is not evidence of a unit either.
Therefore this script never guesses a unit and never writes `results/result.json`
when no unit is declared. The blocked exit is a successful run with a refusal
outcome (exit 0) so that the refusal itself is reproducible.

Unit may be declared explicitly by the requester/data owner via
`--unit` or the `CARBON_UNIT` environment variable; only then is the flat
result object written.

Usage:
    python3 -I results/analysis.py
    python3 -I results/analysis.py --unit '<declared unit>'
"""

import argparse
import csv
import json
import math
import os
import sys
from pathlib import Path

TEMPLATE = "tabular-ecology@1"
TARGET = "carbon"
REQUIRED_COLUMNS = ("site", "carbon", "rain_mm")
NA_TOKENS = {"NA", "N/A", "NaN", "nan", "NULL", "null", ""}


def load_rows(path: Path):
    if not path.is_file():
        raise SystemExit(f"BLOCKED: input file not found: {path}")
    with path.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        header = reader.fieldnames or []
        missing = [name for name in REQUIRED_COLUMNS if name not in header]
        if missing:
            raise SystemExit(f"BLOCKED: missing required column(s): {missing}")
        rows = list(reader)
    if not rows:
        raise SystemExit("BLOCKED: input has no data rows")
    return header, rows


def target_values(rows):
    values = []
    dropped = 0
    for line_no, row in enumerate(rows, start=2):
        raw = row.get(TARGET)
        text = "" if raw is None else str(raw).strip()
        if text in NA_TOKENS:
            dropped += 1
            continue
        try:
            value = float(text)
        except ValueError:
            raise SystemExit(
                f"BLOCKED: non-numeric, non-NA value in {TARGET} at line {line_no}: {text!r}"
            )
        if not math.isfinite(value):
            raise SystemExit(
                f"BLOCKED: non-finite value in {TARGET} at line {line_no}: {text!r}"
            )
        values.append(value)
    return values, dropped


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", default="input.csv")
    parser.add_argument(
        "--unit",
        default=os.environ.get("CARBON_UNIT"),
        help="explicitly declared unit of the carbon column (required to deliver)",
    )
    parser.add_argument("--out", default="results/result.json")
    args = parser.parse_args()

    input_path = Path(args.input)
    header, rows = load_rows(input_path)
    values, dropped = target_values(rows)
    n = len(values)
    if n == 0:
        raise SystemExit("BLOCKED: no non-missing carbon values remain after dropping NA")

    mean = math.fsum(values) / n
    unit = (args.unit or "").strip()

    status = {
        "template": TEMPLATE,
        "input": str(input_path),
        "columns": header,
        "target": TARGET,
        "method": "arithmetic mean (unweighted)",
        "n_rows_read": len(rows),
        "n_used": n,
        "n_dropped_na_target_only": dropped,
        "mean_untyped": mean,
    }

    if not unit:
        status.update(
            {
                "status": "blocked",
                "blocking_reason": "unit of column 'carbon' was not provided by the input file or the request",
                "unit": None,
                "result_written": False,
                "note": "numeric mean is reported for transparency only; it is not a deliverable without a unit and must not be interpreted with an assumed unit",
            }
        )
        print(json.dumps(status, ensure_ascii=False, indent=2))
        return 0

    result = {"n": n, "unit": unit, "mean": mean}
    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    status.update(
        {
            "status": "delivered",
            "unit": unit,
            "result_written": True,
            "result_path": str(out_path),
            "result": result,
        }
    )
    print(json.dumps(status, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
