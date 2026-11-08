#!/usr/bin/env python3
"""Arithmetic mean of `carbon_mg_g` in input.csv (unit: mg/g).

Approved method: arithmetic mean (tabular-ecology@1).
Missing-value rule: drop NA in the target column only; no filtering on rain_mm,
no imputation, no row removal for any other reason.

Python standard library only (csv, json, math, pathlib, sys). No subprocesses,
no network, no third-party dependencies. Deterministic and re-runnable.

Usage (from the workspace root, or any directory):
    python3 -I results/analysis.py [input.csv]

Outputs:
    results/result.json  flat object {n, unit, mean}
"""

from __future__ import annotations

import csv
import json
import math
import sys
from pathlib import Path

COLUMN = "carbon_mg_g"
UNIT = "mg/g"
METRIC = "mean"

# Tokens accepted as missing markers. The dataset uses "NA".
NA_TOKENS = {"", "NA", "N/A", "NAN", "NULL", "NONE", "."}

SCRIPT_DIR = Path(__file__).resolve().parent
WORKSPACE_ROOT = SCRIPT_DIR.parent
RESULT_PATH = SCRIPT_DIR / "result.json"


def resolve_input(argv: list[str]) -> Path:
    """Resolve the input CSV path without depending on the current directory."""
    if len(argv) > 1:
        candidate = Path(argv[1]).expanduser()
        if not candidate.is_absolute():
            candidate = (Path.cwd() / candidate).resolve()
        return candidate
    return WORKSPACE_ROOT / "input.csv"


def load_column(path: Path) -> tuple[int, list[float], list[str], int]:
    """Read the target column.

    Returns (total_rows, valid_values, dropped_labels, file_column_count).
    Raises SystemExit with a clear message on any structural problem: silent
    coercion would change the analysed sample.
    """
    if not path.is_file():
        raise SystemExit(f"ERROR: input file not found: {path}")

    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        header = reader.fieldnames
        if header is None:
            raise SystemExit(f"ERROR: input file has no header row: {path}")
        if COLUMN not in header:
            raise SystemExit(
                f"ERROR: column {COLUMN!r} not found in header {header!r}"
            )

        total = 0
        values: list[float] = []
        dropped: list[str] = []
        for line_no, row in enumerate(reader, start=2):
            total += 1
            # Any column whose count of parsed fields mismatches the header is a
            # structural defect; refuse rather than guess alignment.
            if None in row:
                raise SystemExit(
                    f"ERROR: row {line_no} has more fields than the header allows"
                )
            raw = row.get(COLUMN)
            if raw is None:
                raise SystemExit(f"ERROR: row {line_no} is missing {COLUMN!r}")
            token = raw.strip()
            if token.upper() in NA_TOKENS:
                label = (row.get("site") or f"row {line_no}").strip()
                dropped.append(label)
                continue
            try:
                value = float(token)
            except ValueError:
                raise SystemExit(
                    f"ERROR: non-numeric value {raw!r} in {COLUMN!r} at row {line_no}"
                ) from None
            if not math.isfinite(value):
                # inf/nan cannot enter an arithmetic mean without corrupting it.
                raise SystemExit(
                    f"ERROR: non-finite value {raw!r} in {COLUMN!r} at row {line_no}"
                )
            values.append(value)

    return total, values, dropped, len(header)


def main(argv: list[str]) -> int:
    input_path = resolve_input(argv)
    total_rows, values, dropped, n_columns = load_column(input_path)

    if not values:
        raise SystemExit(
            f"ERROR: no usable numeric values in {COLUMN!r}; the mean is undefined"
        )

    # fsum keeps the sum exact before the single division (still an arithmetic mean).
    mean = math.fsum(values) / len(values)

    result = {"n": len(values), "unit": UNIT, "mean": mean}
    RESULT_PATH.write_text(
        json.dumps(result, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )

    print(f"input        : {input_path}")
    print(f"columns      : {n_columns}")
    print(f"rows read    : {total_rows}")
    print(f"dropped (NA) : {len(dropped)} -> {', '.join(dropped) if dropped else 'none'}")
    print(f"n used       : {len(values)}")
    print(f"min / max    : {min(values):.10g} / {max(values):.10g}")
    print(f"{METRIC:<13}: {mean:.12f} {UNIT}")
    print(f"result json  : {RESULT_PATH}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
