# Arithmetic mean of `temperature_c` — report

Template: `tabular-ecology@1` · Language: Python (stdlib only) · Approved method: arithmetic mean
Frozen acceptance: `input.csv`, column `temperature_c`, metric `mean`, unit `°C`, missing = block,
absolute tolerance `1e-9`.

## 1. Input

| item | value |
|---|---|
| file | `input.csv` (workspace root) |
| MD5 | `703e940ca0fb318c8af01387b091d071` |
| size / lines | 39 bytes, header + 4 data rows |
| header | `site,temperature_c` (LF endings, no BOM, no trailing blank line) |
| rows read | 4 |
| rows used | 4 (none dropped) |
| missing / NA in `temperature_c` | 0 |
| values | A=14, B=18, C=22, D=26 (all integers, parsed as finite floats) |

The `site` column is an identifier only; it is not used in the calculation.

## 2. Processing

1. Read `input.csv` with `csv.DictReader` (UTF-8, BOM-tolerant).
2. Structural checks (hard failure, exit code 2, no result written):
   - header must be exactly `['site', 'temperature_c']`;
   - no record may have more fields than the header or be entirely blank;
   - every `temperature_c` value must be a finite number.
3. Missing-value handling: the task's data rule is "drop NA in target column only", while the
   frozen host acceptance declares `missing = block` and the task forbids discarding samples.
   Because 0 missing values were observed, both rules give the same sample set. The script
   implements the stricter variant: if any NA appears in `temperature_c` it aborts with
   `INPUT_ERROR` instead of silently dropping the row. No row was dropped here.
4. Mean: `sum = math.fsum(values)` (exact to rounding), `mean = sum / n`.
   No imputation, no winsorising, no unit conversion, no rounding of the emitted value.
5. Only genuine outlier screen applied: a *warning-only* count of values outside
   [−89.2, 56.7] °C (planet-scale record range). Zero warnings; the data are never modified.

## 3. Result

| quantity | value |
|---|---|
| n (sample count) | 4 |
| sum | 80 |
| **arithmetic mean of `temperature_c`** | **20** |
| unit | °C |
| dropped samples | 0 |

`results/result.json` (flat object, consistent with the submission `data.metrics`/`sampleCount`):

```json
{
  "n": 4,
  "unit": "°C",
  "mean": 20.0
}
```

Cross-check: independent `awk` summation of the same file gives `n=4 sum=80 mean=20`, identically
20 within the required 1e-9 tolerance (the value is exact: 80/4).

## 4. Reproduce

```bash
python3 -I results/analysis.py
```

`-I` runs the isolated interpreter (no user site-packages, no `PYTHONPATH`, current directory not on
`sys.path`). The script imports only `csv`, `json`, `math`, `sys`, `pathlib`, `typing` from the
standard library, creates no subprocesses and touches no network or external state. It resolves
`input.csv` next to the script's parent directory (falling back to the current directory) and writes
`results/result.json`. Optional positional arguments: `analysis.py [input.csv] [result.json]`.

Checks performed while validating the script:

| check | outcome |
|---|---|
| run on the real input | exit 0, `rows_read=4 rows_used=4 dropped=0`, `mean=20.0` |
| independent `awk` mean | 20 (matches) |
| determinism (rerun to a temp path) | byte-identical `result.json` |
| NA fixture (`B,NA`) | exit 2, `INPUT_ERROR` naming line 3, no result file written |
| non-numeric fixture (`D,abc`) | exit 2, `INPUT_ERROR` naming line 5 |
| import surface | stdlib only |

## 5. Limitations and evidence gaps

- **Sample size is 4.** The mean is a point description only. No interval, no standard error, no
  test of normality or homogeneity is meaningful at this n, and none is reported.
- **No sampling/design metadata.** The input carries only `site` and `temperature_c`; it does not
  document how sites were selected, whether the four values are replicates, independent sites or
  a time series, nor the measurement instrument, calibration or per-value uncertainty. Whether
  pooling these four numbers into one mean is ecologically meaningful cannot be established from
  the file alone.
- **Single measurement per site.** There is no replication inside a site, so within-site variability
  is unknown and unquantified.
- **Unit.** °C is taken from the frozen task/acceptance declaration, not verified against an
  instrument or metadata; the column name `temperature_c` is consistent with it but is not proof.
  No conversion was attempted.
- **Arithmetic mean sensitivity.** The mean is not robust to outliers; with n = 4 a single wrong
  entry would move it substantially. Values 14–26 °C look plausible, but plausibility is not a
  correctness check and no record-level provenance was supplied.
- **Missingness.** Zero missing values were observed, so the reported n equals the row count; this
  report cannot say whether unobserved missingness exists upstream of `input.csv`.
- **Scope.** The result is descriptive of the four supplied rows only; it should not be generalised
  to any wider population, season or region.
