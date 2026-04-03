# Docker Execution Sandbox

Isolated test verification for SWE-bench instances: proves a synthesized test FAILS at the bug commit and PASSES after the fix.

## Setup

```bash
docker build -t optinum-sandbox benchmark/swe-bench/docker
```

Requires Docker Desktop (or Docker Engine) running locally. First run is slow — it clones the target repo at container start time.

## Usage

```typescript
import { runInSandbox, checkDockerAvailable } from "./benchmark/swe-bench/docker/sandbox";

checkDockerAvailable(); // throws DockerNotAvailableError if Docker is absent

const result = await runInSandbox("django__django-1234", myTestCode, {
  repoUrl: "https://github.com/django/django",
  bugCommit: "abc123",
  fixCommit: "def456",
  timeoutMs: 300_000, // optional, default 5 min
});

console.log(result.execution_verified); // true = test confirms the bug and its fix
```

## What it proves

| Field | Meaning |
|---|---|
| `test_fails_on_bug` | pytest exits non-zero at the bug commit — the test catches the regression |
| `test_passes_on_fix` | pytest exits zero at the fix commit — the fix resolves what the test checks |
| `execution_verified` | both of the above are true — full red/green confirmation |

`execution_verified: true` is the acceptance signal for any synthesized test entering the benchmark corpus.

## Limitations

- Requires Docker Desktop; will not run in sandboxed CI without Docker-in-Docker
- Clones the full repository on each run — first execution per repo takes 30–120 s depending on repo size
- `pip install -e .` failures are silently swallowed; tests may still run if deps are already satisfied
- Multiline `TEST_CODE` passed via `-e` env var may hit shell quoting limits for very large test files; mount a volume for those cases
