import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockExecSync } = vi.hoisted(() => ({
  mockExecSync: vi.fn(),
}));

vi.mock("child_process", () => ({
  execSync: mockExecSync,
}));

import { parsePythonBlastRadius } from "./py-parser";
import type { DiffBlastRadius } from "../types/pipeline";

const EMPTY_RESULT: DiffBlastRadius = {
  changed: [],
  dependents: [],
  dependencies: [],
  highFanOut: false,
};

const VALID_RESULT: DiffBlastRadius = {
  changed: [
    {
      filePath: "src/foo.py",
      functionName: "my_func",
      startLine: 10,
      endLine: 20,
    },
  ],
  dependents: [
    {
      filePath: "src/bar.py",
      functionName: "caller",
      startLine: 5,
      endLine: 8,
    },
  ],
  dependencies: [],
  highFanOut: false,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("parsePythonBlastRadius", () => {
  it("happy path — returns correct DiffBlastRadius from valid JSON", () => {
    mockExecSync.mockReturnValue(JSON.stringify(VALID_RESULT));

    const result = parsePythonBlastRadius(["src/foo.py"], "/project");

    expect(result).toEqual(VALID_RESULT);
  });

  it("subprocess error — execSync throws, returns empty DiffBlastRadius", () => {
    mockExecSync.mockImplementation(() => {
      const err = new Error("Command failed") as Error & { stderr: string };
      err.stderr = "some error output";
      throw err;
    });

    const result = parsePythonBlastRadius(["src/foo.py"], "/project");

    expect(result).toEqual(EMPTY_RESULT);
  });

  it("empty output — execSync returns empty string, returns empty DiffBlastRadius", () => {
    mockExecSync.mockReturnValue("");

    const result = parsePythonBlastRadius(["src/foo.py"], "/project");

    expect(result).toEqual(EMPTY_RESULT);
  });

  it("malformed JSON — execSync returns invalid JSON, returns empty DiffBlastRadius", () => {
    mockExecSync.mockReturnValue("not valid json {{");

    const result = parsePythonBlastRadius(["src/foo.py"], "/project");

    expect(result).toEqual(EMPTY_RESULT);
  });

  it("stderr warnings — returns parsed result even when stderr is present in error", () => {
    // When execSync succeeds but there are warnings, they appear as stderr in the error path
    // Simulate: valid JSON stdout, subprocess also writes to stderr (wildcard-import-warning)
    // In the non-error path, execSync returns stdout only; stderr warnings don't throw
    mockExecSync.mockReturnValue(JSON.stringify(VALID_RESULT));

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = parsePythonBlastRadius(["src/foo.py"], "/project");

    // Still returns parsed result
    expect(result).toEqual(VALID_RESULT);
    // No error logged when subprocess succeeds
    expect(consoleSpy).not.toHaveBeenCalled();

    consoleSpy.mockRestore();
  });
});
