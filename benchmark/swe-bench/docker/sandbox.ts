import { execSync, spawnSync } from "child_process";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

export interface SandboxResult {
  instance_id: string;
  test_fails_on_bug: boolean;
  test_passes_on_fix: boolean;
  execution_verified: boolean;
  error: string | null;
  stdout: string;
}

export class DockerNotAvailableError extends Error {
  constructor(detail: string) {
    super(`Docker is not available: ${detail}`);
    this.name = "DockerNotAvailableError";
  }
}

/** Throws DockerNotAvailableError if Docker daemon is unreachable. */
export function checkDockerAvailable(): void {
  try {
    execSync("docker info", { stdio: "pipe" });
  } catch (err) {
    const detail =
      err instanceof Error ? err.message : "docker info returned non-zero";
    throw new DockerNotAvailableError(detail);
  }
}

export interface SandboxOpts {
  repoUrl: string;
  bugCommit: string;
  fixCommit: string;
  patchFile?: string;
  timeoutMs?: number;
}

/**
 * Runs synthesized test code inside an isolated Docker container.
 *
 * The container clones the repo at the bug commit, asserts the test FAILS,
 * then applies the fix and asserts the test PASSES.
 * execution_verified is true only when both assertions hold.
 */
export async function runInSandbox(
  instanceId: string,
  testCode: string,
  opts: SandboxOpts,
): Promise<SandboxResult> {
  const {
    repoUrl,
    bugCommit,
    fixCommit,
    patchFile,
    timeoutMs = 300_000,
  } = opts;

  const base: Pick<
    SandboxResult,
    | "instance_id"
    | "test_fails_on_bug"
    | "test_passes_on_fix"
    | "execution_verified"
  > = {
    instance_id: instanceId,
    test_fails_on_bug: false,
    test_passes_on_fix: false,
    execution_verified: false,
  };

  try {
    checkDockerAvailable();

    // Write test code to a temp file so we can mount it into the container
    const tmpDir = join(
      tmpdir(),
      `optinum-sandbox-${instanceId}-${Date.now()}`,
    );
    mkdirSync(tmpDir, { recursive: true });
    const testFilePath = join(tmpDir, "test_optinum.py");
    writeFileSync(testFilePath, testCode, "utf8");

    const dockerArgs = buildDockerArgs(
      repoUrl,
      bugCommit,
      fixCommit,
      testCode,
      patchFile,
      tmpDir,
    );

    const result = spawnSync("docker", dockerArgs, {
      timeout: timeoutMs,
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
    });

    const stdout = (result.stdout ?? "").trim();
    const stderr = (result.stderr ?? "").trim();

    if (result.error) {
      throw result.error;
    }

    const parsed = extractJsonResult(stdout);
    if (!parsed) {
      throw new Error(
        `Container produced no parseable JSON.\nstdout: ${stdout}\nstderr: ${stderr}`,
      );
    }

    const execution_verified =
      parsed.test_fails_on_bug === true && parsed.test_passes_on_fix === true;

    return {
      ...base,
      test_fails_on_bug: parsed.test_fails_on_bug,
      test_passes_on_fix: parsed.test_passes_on_fix,
      execution_verified,
      error: null,
      stdout,
    };
  } catch (err) {
    return {
      ...base,
      execution_verified: false,
      error: err instanceof Error ? err.message : String(err),
      stdout: "",
    };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildDockerArgs(
  repoUrl: string,
  bugCommit: string,
  fixCommit: string,
  testCode: string,
  patchFile: string | undefined,
  tmpDir: string,
): string[] {
  const args = [
    "run",
    "--rm",
    "--network",
    "host", // allow git clone inside container
    "-e",
    `REPO_URL=${repoUrl}`,
    "-e",
    `BUG_COMMIT=${bugCommit}`,
    "-e",
    `FIX_COMMIT=${fixCommit}`,
    "-e",
    `TEST_CODE=${testCode}`,
    "-e",
    `PATCH_FILE=${patchFile ?? ""}`,
  ];

  if (patchFile) {
    // Mount patch file read-only at the expected path
    args.push("-v", `${patchFile}:${patchFile}:ro`);
  }

  args.push("optinum-sandbox");
  return args;
}

/** Extract the last JSON object emitted on stdout (ignores pytest noise above it). */
function extractJsonResult(
  stdout: string,
): { test_fails_on_bug: boolean; test_passes_on_fix: boolean } | null {
  const lines = stdout.split("\n").reverse();
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("{")) {
      try {
        return JSON.parse(trimmed);
      } catch {
        continue;
      }
    }
  }
  return null;
}
