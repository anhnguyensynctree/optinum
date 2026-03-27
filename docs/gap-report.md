# Gap Report

The gap report is the primary output of `optinum test`. It prints to stdout after every run and shows how many tests were generated per endpoint, broken down by case type.

## Column Definitions

| Column | Meaning |
|---|---|
| `endpoint` | The API route or function boundary where tests were synthesized |
| `happy` | Tests with valid payloads expecting a 2xx success response |
| `edge` | Tests targeting boundary conditions: empty input, type mismatches, missing optional fields |
| `ai-blind-spot` | Tests derived from the blind spot catalog matching the detected change type |
| `total` | Sum across all case types for that endpoint |

## Reading the Table

```
endpoint              happy   edge  ai-blind-spot  total
-----------------------------------------------------
/api/users/update         1      2              3      6
/api/orders               1      1              2      4
-----------------------------------------------------
TOTAL                     2      3              5     10
```

The `TOTAL` row at the bottom aggregates across all endpoints in the diff. Use it to get a quick read on test volume and composition before running.

## Blind Spots Section

If any `ai-blind-spot` tests were generated, a second section follows the table:

```
Blind spots detected:

  • [/api/users/update] Auth Check Without Ownership Verification
  • [/api/users/update] Idempotency Key Not Sent by Callers
```

Each bullet names the catalog pattern that triggered the test. Use the pattern ID to look up the full description and test strategy in [blind-spot-catalog.md](blind-spot-catalog.md).

## Triage Guidance

**High ai-blind-spot count relative to total** — the changed surface is high-risk. Patterns like `auth-ownership-gap`, `transaction-missing`, and `required-field-added` are severity `critical`. Run the generated tests before merging.

**Zero ai-blind-spot, low edge** — either the diff is low-risk (read-only, no contract change) or schema detection had insufficient information. Check that `optinum init` correctly identified your schema format.

**Zero tests generated** — no TypeScript files were detected in the diff, or all changed files are test files. Verify the `--diff` path points to source, not compiled output.

## JSON Output

Pass `--json` (formatter flag) to get the full `PipelineResult` as JSON instead of the table. Useful for piping into dashboards or CI artifact storage.
