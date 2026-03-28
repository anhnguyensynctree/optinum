# SWE-bench Benchmark

Optinum's empirical validation against real-world OSS bugs from SWE-bench Verified.

## Dataset

**SWE-bench Verified** — 500 human-validated Python bug instances across 12 repos:
Django, Flask, Requests, SymPy, Matplotlib, scikit-learn, Sphinx, Astropy, Pylint, Xarray, Seaborn, SciPy.

**Access:**
```python
from datasets import load_dataset
ds = load_dataset('princeton-nlp/SWE-bench_Verified', split='test')
```

## Results

- **Pilot:** 10 instances — see `docs/swe-bench-pilot.md`
- **Pattern match rate:** 10/10 (100%) on pilot
- **AI unit test miss rate:** 4/10 (40%) — human fix PRs also missed the edge case
- **Addressable instances:** 206/500 match Optinum's catalog change types

## Files

- `results.json` — structured pilot results
- `docs/swe-bench-pilot.md` — full narrative with per-instance analysis

## Full Run

Estimated tokens for 206 matching instances: ~620K (dry-run synthesis).
Execution pass (verify test fails on bug, passes on fix) requires Docker setup — see TASK-034.

## Reproduce

```bash
# Load dataset and filter
python3 -c "
from datasets import load_dataset
ds = load_dataset('princeton-nlp/SWE-bench_Verified', split='test')
# Filter by change type keywords
# Run: optinum test --diff <patch> --dry-run
"
```
