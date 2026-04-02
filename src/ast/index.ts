import { DiffBlastRadius } from "../types/pipeline";
import { parsePythonBlastRadius } from "./py-parser";
import { parseBlastRadius as parseTsBlastRadius } from "./ts-parser";

const EMPTY: DiffBlastRadius = {
  changed: [],
  dependents: [],
  dependencies: [],
  highFanOut: false,
};

function mergeResults(a: DiffBlastRadius, b: DiffBlastRadius): DiffBlastRadius {
  return {
    changed: [...a.changed, ...b.changed],
    dependents: [...a.dependents, ...b.dependents],
    dependencies: [...a.dependencies, ...b.dependencies],
    highFanOut: (a.highFanOut ?? false) || (b.highFanOut ?? false),
  };
}

export function parseBlastRadius(
  changedFiles: string[],
  projectRoot: string,
): DiffBlastRadius {
  const pyFiles = changedFiles.filter((f) => f.endsWith(".py"));
  const tsFiles = changedFiles.filter(
    (f) => f.endsWith(".ts") || f.endsWith(".tsx"),
  );

  if (pyFiles.length === 0 && tsFiles.length === 0) {
    return { ...EMPTY };
  }

  let result: DiffBlastRadius = { ...EMPTY };

  if (pyFiles.length > 0) {
    const pyResult = parsePythonBlastRadius(pyFiles, projectRoot);
    result = mergeResults(result, pyResult);
  }

  if (tsFiles.length > 0) {
    const tsResult = parseTsBlastRadius({ projectRoot, changedFiles: tsFiles });
    result = mergeResults(result, tsResult);
  }

  return result;
}
