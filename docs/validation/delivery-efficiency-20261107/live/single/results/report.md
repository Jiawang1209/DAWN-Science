# Report — arithmetic mean of `carbon_mg_g` (tabular-ecology@1)

## 1. Task and frozen acceptance contract
- Metric: arithmetic mean (user-approved method) of column `carbon_mg_g`.
- Unit: `mg/g` (declared by the frozen acceptance contract; no unit conversion performed).
- Missing-value rule: **drop NA in the target column only** — no imputation, no filtering on `rain_mm`, no row dropping for any other reason.
- Acceptance: `{"version":1,"kind":"tabular-ecology","scriptPath":"results/analysis.py","reportPath":"results/report.md","resultPath":"results/result.json","numeric":{"dataPath":"input.csv","column":"carbon_mg_g","metric":"mean","unit":"mg/g","missing":"drop","absoluteTolerance":1e-9}}`

## 2. Inputs
| Path | Role | Notes |
|---|---|---|
| `input.csv` | sole data input | 48 data rows + 1 header; SHA-256 `568eaee367b769dcdc3f93ae1434266124d6147bf597dfa586dc65e883aaf789` |
| `results/analysis.py` | analysis script (Python 3, stdlib only) | SHA-256 `0bb305d4ad5062f94c611f557016527babf0f41aea43355efe17b22818ab7d12` |

Input structure (verified by reading the file and by `csv.DictReader`):
- Header: `site,carbon_mg_g,rain_mm` — 3 columns, exact match with the contract's `column` and `dataPath`.
- 48 data rows, unique `site` identifiers `plot-1 … plot-48` (0 duplicates).
- `carbon_mg_g`: numeric decimal values plus the literal `NA` token; NA appears on file lines 2, 9, 16, 23, 30, 37, 44 (7 rows) — a regular every-7th-row pattern, i.e. a missing-data pattern structural in the file, not a computed zero.
- `rain_mm`: 48 fully populated integer values (300 … 817, monotone by plot). Retained but unused, per the missing-value rule.
- No unit column, no metadata/README, no sampling-design documentation in the workspace (`input.csv` and a harness transcript under `single/transcript/` are the only files).

## 3. Processing
Single command, exactly as authorized for the controlled interpreter:
```
python3 -I results/analysis.py
```
Script behaviour (`results/analysis.py`, stdlib `csv`/`json`/`math`/`os`/`sys` only; no subprocess, no network, no third-party imports):
1. Read `input.csv` from the workspace root with `csv.DictReader`; assert `carbon_mg_g` present in the header.
2. For each data row, take the raw target token. Treat the token set `{"", NA, N/A, na, n/a, NaN, nan, NULL, null, .}` as missing and drop **only those rows**; count them.
3. Convert remaining tokens to `float`; non-numeric or non-finite tokens would be excluded and reported on stderr (0 such cases occurred).
4. Sum with `math.fsum` (exact, order-robust) and divide by the used count.
5. Write `results/result.json` as a flat object `{"n": int, "mean": number, "unit": "mg/g"}`.
`rain_mm` is never read for filtering or imputation; all 48 rows remain in the parsed table.

Run log (stdout of the executed command):
```
rows_total=48 na_dropped=7 nonnumeric_dropped=0 n_used=41
sum=568.7 mean=13.870731707317074 unit=mg/g
```

## 4. Result
| Quantity | Value |
|---|---|
| n (rows used) | 41 |
| Sum of used values | 568.7 mg/g |
| **Arithmetic mean of `carbon_mg_g`** | **13.870731707317074 mg/g** |
| Unit | mg/g |
| NA dropped | 7 (target column only) |

Observed used-value distribution: min 12.0, median 13.9, max 15.6 mg/g; values lie on a 0.1 grid spanning 37 possible levels of which 33 are observed (only 12.3, 13.6, 14.4, 15.2 unobserved), i.e. an approximately flat spread across the 12.0-15.6 band rather than a single sharp peak (a few values repeat twice). All values are positive and of the same order of magnitude; no negative values, zero-inflation or order-of-magnitude outliers. No distributional assumption is needed for an arithmetic mean.

`results/result.json` (verbatim):
```json
{
  "n": 41,
  "mean": 13.870731707317074,
  "unit": "mg/g"
}
```
This matches the submitted `data.metrics {"mean": 13.870731707317074}` and `sampleCount 41`.

## 5. Independent verification performed
- Cross-check with an independent implementation (`awk` field split, not the Python script): `n=41 na=7 sum=568.7000000000 mean=13.870731707317074` — identical to the script output, difference 0 (≪ absoluteTolerance 1e-9).
- `result.json` re-parsed: keys exactly `{n, mean, unit}`; `n` is `int` 41; `mean` finite; `unit` is the string `mg/g`.
- Row/column retention audit: 48 `rain_mm` values still present in the input and 48 rows parsed; nothing filtered by rain.

## 6. Limitations and evidence gaps
- **Unit provenance**: `mg/g` is taken from the frozen acceptance contract. The file has no unit metadata or data dictionary, so the unit cannot be independently confirmed from the input itself; it is *asserted*, not measured. If provenance were required, external documentation would be needed (this is a documentation gap, not a computational blocker — the contract fixes `unit: "mg/g"`).
- **Missingness mechanism unknown**: 7 values are missing in a perfectly periodic pattern (every 7th plot). Available-data mean (= 13.8707 mg/g) is only unbiased under MCAR/MAR; under a systematic (MNAR) mechanism, e.g. specific plots being skipped for a reason correlated with carbon content, the estimate is biased. No imputation was performed, as mandated, so this bias cannot be corrected or bounded from the data at hand.
- **No uncertainty reported**: the contract asks only for a point mean; no standard error, CI, or variance is given here (a CI would additionally require an independence assumption on the 48 plots, which is undocumented).
- **Design/independence undocumented**: plot selection, spatial independence, and whether `site` ordering carries any blocking structure are not described; the arithmetic mean itself is still well-defined, but any inferential use of it would need that information.
- **Single-input scope**: results apply only to `input.csv` at the recorded SHA-256; a changed input invalidates this number.

## 7. Reproducibility
```
cd <workspace>
python3 -I results/analysis.py    # regenerates results/result.json deterministically
```
No external dependencies, no network, no child processes; deterministic output: the script was executed twice and `result.json` had the identical SHA-256 `251febe5fafc5245a32be04cc7cd8df857238c5de1d6fcfb8d240bbe998eb595` both times.
