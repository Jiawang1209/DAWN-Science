# Arithmetic mean of `carbon_mg_g` — tabular-ecology@1

**Scope frozen by the task contract.** Method: arithmetic mean. Missing-value rule:
drop `NA` in the target column only. Unit: `mg/g`. `rain_mm` is not used in any way —
no filtering, no weighting, no imputation, no adjustment.

## 1. Inputs

| Item | Value |
|---|---|
| Data file | `input.csv` (workspace root; 810 bytes) |
| Format | CSV, comma-delimited, UTF-8, one header row |
| Header | `site,carbon_mg_g,rain_mm` (3 columns) |
| Data rows | 48 (`plot-1` … `plot-48`) |
| Duplicate `site` values | none |
| Ragged / short rows | none |
| Target column | `carbon_mg_g`, 48 cells |
| `NA` cells in target | 7 |

The only file consumed by the script is `input.csv`. `single/transcript/*.jsonl` is a
session log present in the workspace and was **not** read as data; it contributed
nothing to the computation.

## 2. Processing

1. Read `input.csv` with `csv.DictReader` (standard library only) and confirm that
   `carbon_mg_g` exists in the header and that no row is ragged.
2. Classify each target cell: every token in `{"", NA, N/A, NaN, null, none, .}`
   (case-insensitive) counts as missing; anything else must parse as a finite number,
   otherwise the script aborts rather than silently coercing.
3. Drop **only** the rows whose `carbon_mg_g` is missing. 7 rows removed:
   `plot-1, plot-8, plot-15, plot-22, plot-29, plot-36, plot-43`
   (all 7 have valid `rain_mm` values — kept here as evidence that the rows were
   dropped for the target column alone, not for any covariate reason).
4. Retain all remaining 41 rows; **no row of `input.csv` was deleted from the file
   itself** — the drop is an analysis-time mask, so the input is preserved unmodified.
5. Compute the arithmetic mean as an exact rational (`fractions.Fraction` of each
   decimal token), then convert the exact result to `float` for output. This removes
   binary floating-point accumulation drift from the reported value.
6. `rain_mm` was carried through the file but never referenced by any expression in
   the script; `results/summary.json` records `"rain_column_used": false`.

Statistical condition for the arithmetic mean: the target variable is a single
continuous quantity with no groups, no weighting and no repeated-measure structure,
so the unweighted mean of the 41 observed values is the quantity the approved method
names. The `NA` cells are treated as missing at random per the frozen rule; no
imputation, no deletion of partially observed rows for other columns.

## 3. Result

| Quantity | Value |
|---|---|
| n (retained) | **41** |
| Arithmetic mean | **13.870731707317074** |
| Unit | `mg/g` |
| Exact rational form | 5687/410 |
| Min of retained values | 12.0 |
| Max of retained values | 15.6 |
| Rows dropped as `NA` | 7 |

`results/result.json` (flat object, matches the `data.metrics` / `sampleCount` contract):

```json
{
  "n": 41,
  "unit": "mg/g",
  "mean": 13.870731707317074
}
```

Cross-checks run independently of the delivered script, same file:

- `awk` single pass over column 2 skipping `NA`: `n=41`, `sum=568.7`,
  `mean=13.870731707317074`.
- Fresh `python3 -I` one-liner recomputation: `n=41`,
  `mean=13.870731707317074`; difference from `result.json` = `0.0`.
- Exact arithmetic: 5687/410 = 13.87073170731707…, so the float carrying 17
  significant digits is the correctly rounded value, well inside the frozen
  `absoluteTolerance` of 1e-9.

## 4. Reproducibility

Single command, Python standard library, no subprocesses spawned, deterministic
output (no timestamps, no randomness, no environment-dependent paths in the values):

```bash
python3 -I results/analysis.py
```

Run from the workspace root. The script resolves `input.csv` relative to its own
location (`results/analysis.py` → parent directory), so it is insensitive to the
caller's working directory. Declared inputs: `input.csv` only. Outputs:
`results/result.json` (contract file) and `results/summary.json` (auxiliary audit
trail: dropped labels, retained value list, exact fraction, float-vs-exact delta).

## 5. Limitations and evidence gaps

1. **The unit `mg/g` is asserted, not measured.** It comes from the frozen task
   contract and is consistent with the column name `carbon_mg_g`, but `input.csv`
   carries no units row, no metadata block and no accompanying methods file, so
   nothing in the supplied data independently certifies the unit or the
   measurement basis (dry mass? total organic carbon? combustion method?). The value
   is reported as `mg/g` because that is the declared contract unit; it would be
   wrong to read it as any other unit.
2. **`NA` is treated as missing at random.** There is no information in the file
   about *why* those 7 plots lack a carbon value. If the missingness is systematic
   (e.g. failed assays in a particular soil class or along a rain gradient), the mean
   of the 41 observed plots is biased for the full 48-plot population. The frozen
   rule forbids imputation, so this bias cannot be quantified from the supplied data.
3. **No outlier or distribution diagnostics were used to alter the estimate.** The
   arithmetic mean is sensitive to extreme values; the retained range (12.0–15.6) is
   narrow, but this was only checked descriptively and did not change the approved
   method. A trimmed or robust mean would answer a different question and was not
   substituted.
4. **`rain_mm` is recorded as present but analytically unused.** Its values are
   complete (no blanks) and strictly increasing across `plot-1`…`plot-48`, which looks
   like an ordered design variable rather than a random draw; this is noted only as a
   structural observation, since the contract forbids any covariate-based selection.
5. **`n = 41` is the effective sample size for this estimate**, not 48. Any downstream
   test or model that assumes 48 independent observations would be overstating
   information.
6. **No ecological context is available** — no site identity beyond plot labels, no
   depth, no sampling date, no instrument. Results are therefore a descriptive
   summary of the supplied column and should not be interpreted as a regional or
   temporal carbon estimate.
