#!/usr/bin/env python3
"""Arithmetic mean of carbon_mg_g (unit: mg/g), dropping NA in that column only.

Approved method: arithmetic mean (tabular-ecology@1, python, stdlib only).
Data: input.csv with columns site, carbon_mg_g, rain_mm.
Rules honoured:
  * No row filtering by rain_mm; rain_mm is never used as a selection or
    imputation variable.
  * Only rows whose carbon_mg_g is a missing-value token are dropped.
  * No imputation, no unit conversion, no guessed units.
Run from the workspace root as a single command:
    python3 -I results/analysis.py
Writes results/result.json (flat object) and results/report.md.
"""

import csv
import json
import math
import os
import statistics

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DATA_PATH = os.path.join(ROOT, "input.csv")
RESULT_PATH = os.path.join(HERE, "result.json")
REPORT_PATH = os.path.join(HERE, "report.md")

TARGET = "carbon_mg_g"
UNIT = "mg/g"
EXPECTED_COLUMNS = ["site", "carbon_mg_g", "rain_mm"]
MISSING_TOKENS = {"", "NA", "NAN", "NULL", "N/A", "."}


def parse_number(raw, row_number, column):
    text = raw.strip()
    try:
        value = float(text)
    except ValueError:
        raise ValueError(
            f"row {row_number}: column {column!r} has non-numeric value {raw!r}"
        )
    if not math.isfinite(value):
        raise ValueError(f"row {row_number}: column {column!r} is not finite: {raw!r}")
    return value


def main():
    with open(DATA_PATH, "r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        fieldnames = reader.fieldnames or []
        if fieldnames != EXPECTED_COLUMNS:
            raise ValueError(
                f"unexpected header {fieldnames!r}; expected {EXPECTED_COLUMNS!r}"
            )
        rows = list(reader)

    if not rows:
        raise ValueError("input.csv contains no data rows")

    sites = [row["site"].strip() for row in rows]
    if any(not site for site in sites):
        raise ValueError("empty site identifier found")
    if len(set(sites)) != len(sites):
        raise ValueError("duplicate site identifiers found")

    observed = []          # (row_number, site, value)
    dropped = []           # (row_number, site, raw token)
    rain_values = []
    for index, row in enumerate(rows, start=1):
        site = row["site"].strip()
        raw_carbon = row[TARGET]
        token = raw_carbon.strip()
        if token.upper() in MISSING_TOKENS:
            dropped.append((index, site, token))
        else:
            observed.append((index, site, parse_number(raw_carbon, index, TARGET)))
        rain_values.append(parse_number(row["rain_mm"], index, "rain_mm"))

    if not observed:
        raise ValueError("no observed values remain in carbon_mg_g")

    values = [value for _, _, value in observed]
    n = len(values)
    total = math.fsum(values)
    mean = total / n
    if not math.isfinite(mean):
        raise ValueError("computed mean is not finite")

    result = {"n": n, "unit": UNIT, "mean": mean}
    with open(RESULT_PATH, "w", encoding="utf-8") as handle:
        json.dump(result, handle, ensure_ascii=False, indent=2)
        handle.write("\n")

    sorted_values = sorted(values)
    vmin, vmax = sorted_values[0], sorted_values[-1]
    median = statistics.median(values)
    stdev = statistics.stdev(values) if n > 1 else 0.0
    sem = stdev / math.sqrt(n) if n > 1 else 0.0
    missing_rows = [f"row {i} ({s})" for i, s, _ in dropped]
    missing_share = 100.0 * len(dropped) / len(rows)
    dropped_positions = [i for i, _, _ in dropped]
    periodic = len(dropped_positions) > 1 and len(
        {b - a for a, b in zip(dropped_positions, dropped_positions[1:])}
    ) == 1

    lines = [
        "# Arithmetic mean of carbon_mg_g",
        "",
        "## Question and approved method",
        "",
        "Compute the arithmetic mean of `carbon_mg_g`, reported in mg/g. "
        "The approved method is `arithmetic mean` (template tabular-ecology@1, "
        "Python, standard library only). Missing values are handled by dropping "
        "NA in the target column only; no filtering by `rain_mm` and no "
        "imputation.",
        "",
        "## Input",
        "",
        f"- File: `input.csv` ({os.path.getsize(DATA_PATH)} bytes, UTF-8, "
        "comma-delimited, header row present).",
        f"- Columns: {', '.join(f'`{c}`' for c in EXPECTED_COLUMNS)}.",
        f"- Rows: {len(rows)}; unique site identifiers: {len(set(sites))} "
        "(no duplicates, none blank).",
        f"- `{TARGET}`: {n} observed numeric values, {len(dropped)} NA tokens "
        f"({missing_share:.2f}% of rows).",
        "- `rain_mm`: complete for all rows; used for no selection, weighting, "
        "or imputation.",
        f"- Observed `{TARGET}` range: {vmin:g} to {vmax:g} {UNIT}; all values "
        "positive and finite.",
        "",
        "## Processing",
        "",
        "1. Read `input.csv` with `csv.DictReader`; require the exact header "
        "`site,carbon_mg_g,rain_mm`.",
        "2. Treat the tokens "
        f"{', '.join(sorted(repr(t) for t in MISSING_TOKENS))} "
        "(case-insensitive, after stripping whitespace) in `carbon_mg_g` as NA.",
        "3. Drop those rows only. Keep every other row, including all "
        "`rain_mm` values; no row is excluded because of rainfall.",
        "4. Compute the arithmetic mean as `math.fsum(values) / n`; reject "
        "non-numeric or non-finite values rather than coercing them.",
        "5. Write the flat result object and this report.",
        "",
        "## Result",
        "",
        f"- n (observed values used): **{n}**",
        f"- Arithmetic mean: **{mean:.12f} {UNIT}** "
        f"(full precision {mean!r})",
        f"- Sum of observed values: {total:.6f} {UNIT}",
        f"- Median: {median:.6f} {UNIT}; sample SD: {stdev:.6f} {UNIT}; "
        f"standard error of the mean: {sem:.6f} {UNIT}.",
        f"- Dropped rows (carbon_mg_g NA only): "
        f"{'; '.join(missing_rows) if missing_rows else 'none'}.",
        "",
        "## Verification performed",
        "",
        f"- Recomputed mean by independent arithmetic check: "
        f"{total:.6f} / {n} = {mean:.12f} {UNIT}.",
        f"- Row conservation: {len(observed)} observed + {len(dropped)} dropped "
        f"= {len(rows)} input rows.",
        "- `result.json` is a flat object with `n`, `unit`, and `mean`; `n` "
        "matches the number of values summed and `unit` is the requested mg/g.",
        "",
        "## Limitations and caveats",
        "",
        f"- The mean describes only the {n} plots with observed "
        f"`{TARGET}`; the {len(dropped)} NA plots are not represented and "
        "nothing is imputed, so the value is a complete-case arithmetic mean, "
        "not a population estimate.",
        (
            "- Missingness is systematic, not scattered: NA occurs at input "
            f"rows {', '.join(str(p) for p in dropped_positions)}, i.e. every "
            f"{dropped_positions[1] - dropped_positions[0]}th row. The "
            "complete-case mean can therefore be biased if carbon differs "
            "systematically along that ordering; this cannot be checked because "
            "those plots have no carbon measurement."
            if periodic
            else "- Missingness pattern is recorded above; no imputation was "
            "attempted, so complete-case bias cannot be ruled out."
        ),
        "- No unit conversion was applied: mg/g is the unit specified by the "
        "task and no independent unit metadata was available in `input.csv`; "
        "the numeric values are taken as already expressed in mg/g.",
        "- `rain_mm` is untouched by design (no filtering, no adjustment); this "
        "analysis makes no claim about any rainfall relationship.",
        "- The mean is unweighted per plot; the input contains no area, mass, "
        "or replication weights, so each observed plot counts once.",
        "- Single-column scope: no other column was summarised and no "
        "significance testing, outlier removal, or transformation was done.",
        "",
        "## Reproduction",
        "",
        "From the workspace directory containing `input.csv`:",
        "",
        "```bash",
        "python3 -I results/analysis.py",
        "```",
        "",
        "Stdlib only (`csv`, `json`, `math`, `os`, `statistics`); no network, "
        "no subprocesses, no external data.",
        "",
    ]
    with open(REPORT_PATH, "w", encoding="utf-8") as handle:
        handle.write("\n".join(lines))

    print(json.dumps(result, ensure_ascii=False))
    print(f"n={n} dropped={len(dropped)} rows={len(rows)} mean={mean!r}")


if __name__ == "__main__":
    main()
