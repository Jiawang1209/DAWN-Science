# Arithmetic mean of carbon_mg_g

## Question and approved method

Compute the arithmetic mean of `carbon_mg_g`, reported in mg/g. The approved method is `arithmetic mean` (template tabular-ecology@1, Python, standard library only). Missing values are handled by dropping NA in the target column only; no filtering by `rain_mm` and no imputation.

## Input

- File: `input.csv` (810 bytes, UTF-8, comma-delimited, header row present).
- Columns: `site`, `carbon_mg_g`, `rain_mm`.
- Rows: 48; unique site identifiers: 48 (no duplicates, none blank).
- `carbon_mg_g`: 41 observed numeric values, 7 NA tokens (14.58% of rows).
- `rain_mm`: complete for all rows; used for no selection, weighting, or imputation.
- Observed `carbon_mg_g` range: 12 to 15.6 mg/g; all values positive and finite.

## Processing

1. Read `input.csv` with `csv.DictReader`; require the exact header `site,carbon_mg_g,rain_mm`.
2. Treat the tokens '', '.', 'N/A', 'NA', 'NAN', 'NULL' (case-insensitive, after stripping whitespace) in `carbon_mg_g` as NA.
3. Drop those rows only. Keep every other row, including all `rain_mm` values; no row is excluded because of rainfall.
4. Compute the arithmetic mean as `math.fsum(values) / n`; reject non-numeric or non-finite values rather than coercing them.
5. Write the flat result object and this report.

## Result

- n (observed values used): **41**
- Arithmetic mean: **13.870731707317 mg/g** (full precision 13.870731707317074)
- Sum of observed values: 568.700000 mg/g
- Median: 13.900000 mg/g; sample SD: 1.062131 mg/g; standard error of the mean: 0.165877 mg/g.
- Dropped rows (carbon_mg_g NA only): row 1 (plot-1); row 8 (plot-8); row 15 (plot-15); row 22 (plot-22); row 29 (plot-29); row 36 (plot-36); row 43 (plot-43).

## Verification performed

- Recomputed mean by independent arithmetic check: 568.700000 / 41 = 13.870731707317 mg/g.
- Row conservation: 41 observed + 7 dropped = 48 input rows.
- `result.json` is a flat object with `n`, `unit`, and `mean`; `n` matches the number of values summed and `unit` is the requested mg/g.

## Limitations and caveats

- The mean describes only the 41 plots with observed `carbon_mg_g`; the 7 NA plots are not represented and nothing is imputed, so the value is a complete-case arithmetic mean, not a population estimate.
- Missingness is systematic, not scattered: NA occurs at input rows 1, 8, 15, 22, 29, 36, 43, i.e. every 7th row. The complete-case mean can therefore be biased if carbon differs systematically along that ordering; this cannot be checked because those plots have no carbon measurement.
- No unit conversion was applied: mg/g is the unit specified by the task and no independent unit metadata was available in `input.csv`; the numeric values are taken as already expressed in mg/g.
- `rain_mm` is untouched by design (no filtering, no adjustment); this analysis makes no claim about any rainfall relationship.
- The mean is unweighted per plot; the input contains no area, mass, or replication weights, so each observed plot counts once.
- Single-column scope: no other column was summarised and no significance testing, outlier removal, or transformation was done.

## Reproduction

From the workspace directory containing `input.csv`:

```bash
python3 -I results/analysis.py
```

Stdlib only (`csv`, `json`, `math`, `os`, `statistics`); no network, no subprocesses, no external data.
