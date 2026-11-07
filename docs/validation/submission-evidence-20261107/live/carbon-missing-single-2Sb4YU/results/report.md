# Mean `carbon_mg_g` (mg/g) — tabular-ecology@1 / arithmetic mean

**Result: mean = 13.870731707317074 mg/g (n = 41, unit mg/g).**

Machine-readable mirror: `results/result.json` → `{"n": 41, "mean": 13.870731707317074, "unit": "mg/g"}`.

## 1. Inputs

| item | value |
|---|---|
| file | `input.csv` (workspace root, 810 bytes, unchanged) |
| columns | `site`, `carbon_mg_g`, `rain_mm` (exactly these three, every row has 3 fields) |
| data rows | 48 (`plot-1` … `plot-48`) |
| site identifiers | unique, no duplicates, no blank rows |
| target column | `carbon_mg_g`, numeric with 0–1 decimals |
| NA count | `carbon_mg_g` = 7; `site` = 0; `rain_mm` = 0 |
| `rain_mm` | 48 distinct integers 300 → 817, constant step 11 |

Nothing in the input was modified; the script only reads it.

## 2. Method (as approved, unchanged)

- Metric: **arithmetic mean** of the single prespecified column `carbon_mg_g`.
- Missing data: **drop NA in the target column only** — 7 rows removed
  (`plot-1, plot-8, plot-15, plot-22, plot-29, plot-36, plot-43`; CSV lines 2, 9, 16, 23, 30, 37, 44).
- **No filtering or stratification by `rain_mm`** — `rain_mm` is not read into the computation at all,
  only audited for NA counts. No imputation, no smoothing, no unit conversion.
- Unit handling: `mg/g` exactly as required, taken from the column name `carbon_mg_g`
  (the `_mg_g` suffix is the only unit evidence present in the workspace; no conversion factor applied).
- Summation with `math.fsum` (compensated), then divided by `n`.

Applicability: the arithmetic mean needs only a finite-valued, numeric, single sample —
no distributional or independence assumption is required for the point estimate itself.
Every retained value parsed as finite float; there were **no** non-numeric values,
so nothing beyond genuine `NA` was discarded.

## 3. Processing audit (script output, verbatim figures)

```
data rows read        : 48
NA per column         : site=0, carbon_mg_g=7, rain_mm=0
rows dropped          : 7
rows used (n)         : 41
min / max             : 12.0 / 15.6
sum (fsum)            : 568.7
arithmetic mean       : 13.870731707317074
```

Descriptive context (not part of the frozen metric): median 13.9, sample SD (ddof=1) 1.0621,
range 12.0–15.6. Retained rows still cover `rain_mm` 311–817, i.e. the gradient is not truncated
by the NA drop.

## 4. Result and independent checks

- Exact rational value: 5687/410 = 13.8707317073170732… ; float 13.870731707317074.
- Cross-checked three ways, all identical to <1e-12: the delivered script (`math.fsum`),
  an independent `awk` accumulation (n=41, sum=568.7000000000), and an independent
  `fractions.Fraction` exact computation (5687/410).
- Passes the acceptance rule `mean / mg/g / drop` with absolute tolerance 1e-9.
- `result.json` is a flat object with integer `n`, string `unit`, finite numeric `mean`;
  it is written by the script itself, so the reported numbers cannot drift from the run.

## 5. Limitations and evidence gaps

1. **Complete-case mean assumes NA is uninformative (MCAR).** It is not verifiable here.
   The 7 NA rows are at a regular interval (`plot-1`, then every 7th plot), which looks like a
   design/export artefact rather than random loss; if missingness is related to the true carbon
   value, the dropped-row mean is biased in an unknown direction. It is reported as the approved
   complete-case estimate, not as an unbiased population value.
2. **No variable definitions / units metadata file exists** in the workspace. `mg/g` rests solely on
   the header naming convention `carbon_mg_g`; whether this is soil organic carbon, dry-mass basis,
   or an ashed/oxidised determination is unknown and was *not* guessed. If the header is mislabelled,
   the unit — not the arithmetic — would be wrong.
3. **The dataset is a designed grid, not a random sample.** `rain_mm` is a perfect arithmetic
   progression (+11 per plot) and `carbon_mg_g` is recorded to 0–1 decimals over a narrow 12–15.6
   range. With no replicates per `rain_mm` level, no uncertainty statement about a rain–carbon
   relationship is possible, and the mean describes only these 48 plots.
4. **Precision of the mean exceeds the data.** Values carry 1 decimal; the mean is reported at full
   float precision to satisfy the 1e-9 tolerance, but is only meaningful to ≈0.01 mg/g (13.87 mg/g).
5. No outlier/influence analysis was performed — it is outside the approved method; the range
   (12.0–15.6) shows no extreme value to flag.
6. `n = 41` refers to analysed rows, not to independent field replicates; no clustering or
   pseudo-replication structure is documented in the input.

No blocker was raised: the approved method is fully determined by the data on hand, all required
columns are present, the target column is numeric, and NA occurs only in the target column
(the script aborts by design if that condition breaks).

## 6. Files and reproduction

| path | role |
|---|---|
| `input.csv` | input, untouched |
| `results/analysis.py` | Python-stdlib script (no third-party imports, no subprocess, no threads) |
| `results/result.json` | `{n, mean, unit}` |
| `results/report.md` | this report |

Single command (isolated interpreter, script path declared, no child processes):

```
python3 -I results/analysis.py
```

The script resolves `input.csv` relative to its own location (`../input.csv`) and writes
`results/result.json` next to itself; an explicit input path may be passed as the only argument.
