import { execSync } from "child_process";
import * as path from "path";
import { DiffBlastRadius } from "../types/pipeline";

const EMPTY: DiffBlastRadius = {
  changed: [],
  dependents: [],
  dependencies: [],
  highFanOut: false,
};

export function parsePythonBlastRadius(
  changedFiles: string[],
  projectRoot: string,
): DiffBlastRadius {
  const scriptPath = path.join(__dirname, "py_parser.py");

  let stdout: string;
  try {
    const result = execSync(
      `python3 ${scriptPath} --root ${projectRoot} --files ${changedFiles.join(" ")}`,
      { encoding: "utf-8" },
    );
    stdout = typeof result === "string" ? result : result.toString();
  } catch (err: unknown) {
    const execErr = err as { stderr?: string; message?: string };
    if (execErr.stderr) {
      console.error(execErr.stderr);
    }
    return { ...EMPTY };
  }

  if (!stdout || stdout.trim() === "") {
    return { ...EMPTY };
  }

  try {
    const parsed = JSON.parse(stdout) as DiffBlastRadius;
    return {
      changed: parsed.changed ?? [],
      dependents: parsed.dependents ?? [],
      dependencies: parsed.dependencies ?? [],
      highFanOut: parsed.highFanOut ?? false,
    };
  } catch {
    return { ...EMPTY };
  }
}
