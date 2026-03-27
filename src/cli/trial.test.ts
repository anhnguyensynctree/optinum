import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { test } from "node:test";
import {
  checkTrialLimit,
  incrementTrialCounter,
  TRIAL_LIMIT,
} from "./trial.js";

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "optinum-trial-"));
}

function cleanup(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

test("first run: creates config file and allows", () => {
  const homeDir = makeTmpDir();
  try {
    const result = checkTrialLimit({ _homeDir: homeDir });
    assert.strictEqual(result.allowed, true);
    assert.strictEqual(result.runsUsed, 0);

    incrementTrialCounter({ _homeDir: homeDir });

    const configFile = path.join(homeDir, ".optinum", "config.json");
    assert.ok(fs.existsSync(configFile), "config.json should be created");
    const config = JSON.parse(fs.readFileSync(configFile, "utf8"));
    assert.strictEqual(config.synthRuns, 1);
  } finally {
    cleanup(homeDir);
  }
});

test("second run: increments counter and allows", () => {
  const homeDir = makeTmpDir();
  try {
    incrementTrialCounter({ _homeDir: homeDir });
    const result = checkTrialLimit({ _homeDir: homeDir });
    assert.strictEqual(result.allowed, true);
    assert.strictEqual(result.runsUsed, 1);

    incrementTrialCounter({ _homeDir: homeDir });

    const configFile = path.join(homeDir, ".optinum", "config.json");
    const config = JSON.parse(fs.readFileSync(configFile, "utf8"));
    assert.strictEqual(config.synthRuns, 2);
  } finally {
    cleanup(homeDir);
  }
});

test("third run: blocks with message after limit reached", () => {
  const homeDir = makeTmpDir();
  try {
    // Simulate TRIAL_LIMIT runs already used
    for (let i = 0; i < TRIAL_LIMIT; i++) {
      incrementTrialCounter({ _homeDir: homeDir });
    }

    const result = checkTrialLimit({ _homeDir: homeDir });
    assert.strictEqual(result.allowed, false);
    assert.strictEqual(result.runsUsed, TRIAL_LIMIT);
    assert.ok(
      typeof result.reason === "string" && result.reason.length > 0,
      "reason should be set",
    );
    assert.ok(
      result.reason!.includes("OPTINUM_API_KEY"),
      "reason should mention OPTINUM_API_KEY",
    );
  } finally {
    cleanup(homeDir);
  }
});

test("API key bypasses counter regardless of run count", () => {
  const homeDir = makeTmpDir();
  try {
    // Exhaust trial runs
    for (let i = 0; i < TRIAL_LIMIT + 5; i++) {
      incrementTrialCounter({ _homeDir: homeDir });
    }

    const result = checkTrialLimit({
      _homeDir: homeDir,
      _env: { OPTINUM_API_KEY: "sk-test-key" },
    });
    assert.strictEqual(result.allowed, true);
    assert.strictEqual(result.runsUsed, 0);
    assert.strictEqual(result.reason, undefined);
  } finally {
    cleanup(homeDir);
  }
});
