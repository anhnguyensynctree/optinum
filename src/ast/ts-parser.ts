import { Project, SourceFile, SyntaxKind } from "ts-morph";
import * as path from "path";
import * as fs from "fs";
import { DiffBlastRadius, FunctionNode } from "../types/pipeline";

interface ParseDiffOptions {
  projectRoot: string;
  changedFiles: string[];
}

function extractEndpointFromPath(filePath: string): string | null {
  const match = filePath.match(/src\/(api\/.*?)\/route\.[jt]sx?$/);
  if (!match) return null;
  // Strip dynamic segments like [id]
  const segment = match[1].replace(/\[.*?\]/g, "");
  return "/" + segment.replace(/\/$/, "");
}

function addSourceFilesFromDir(project: Project, dir: string): void {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (
      entry.name === "node_modules" ||
      entry.name === "dist" ||
      entry.name.startsWith(".")
    ) {
      continue;
    }
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      addSourceFilesFromDir(project, full);
    } else if (
      (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) &&
      !entry.name.endsWith(".test.ts") &&
      !entry.name.endsWith(".test.tsx")
    ) {
      project.addSourceFileAtPath(full);
    }
  }
}

function findHttpCallers(
  project: Project,
  endpoint: string,
  changedAbsPaths: Set<string>,
): FunctionNode[] {
  const dependents: FunctionNode[] = [];
  const seen = new Set<string>();

  const patterns = [
    new RegExp(`fetch\\(["'\`]${escapeRegex(endpoint)}["'\`]`),
    new RegExp(`fetch\\(["'\`]${escapeRegex(endpoint)}[/?"'\`]`),
  ];

  for (const sf of project.getSourceFiles()) {
    const sfPath = sf.getFilePath();
    if (changedAbsPaths.has(sfPath)) continue;

    const text = sf.getFullText();
    if (!patterns.some((p) => p.test(text))) continue;

    // Top-level named functions
    for (const func of sf.getFunctions()) {
      const funcText = func.getFullText();
      if (!patterns.some((p) => p.test(funcText))) continue;
      const key = `${sfPath}:${func.getName() ?? "(anonymous)"}`;
      if (seen.has(key)) continue;
      seen.add(key);
      dependents.push({
        filePath: sfPath,
        functionName: func.getName() ?? "(anonymous)",
        startLine: func.getStartLineNumber(),
        endLine: func.getEndLineNumber(),
      });
    }

    // Arrow functions / function expressions in variable declarations
    for (const varDecl of sf.getVariableDeclarations()) {
      const init = varDecl.getInitializer();
      if (!init) continue;
      if (!patterns.some((p) => p.test(init.getFullText()))) continue;
      const key = `${sfPath}:${varDecl.getName()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      dependents.push({
        filePath: sfPath,
        functionName: varDecl.getName(),
        startLine: varDecl.getStartLineNumber(),
        endLine: varDecl.getEndLineNumber(),
      });
    }
  }

  return dependents;
}

function findImportCallers(
  project: Project,
  changedFile: SourceFile,
  changedAbsPaths: Set<string>,
): FunctionNode[] {
  const dependents: FunctionNode[] = [];
  const seen = new Set<string>();
  const changedBaseName = path.basename(
    changedFile.getFilePath(),
    path.extname(changedFile.getFilePath()),
  );

  for (const sf of project.getSourceFiles()) {
    const sfPath = sf.getFilePath();
    if (changedAbsPaths.has(sfPath)) continue;

    const imports = sf.getImportDeclarations();
    const importsFromChanged = imports.some((imp) => {
      const spec = imp.getModuleSpecifierValue();
      return (
        spec.endsWith("/" + changedBaseName) ||
        spec.endsWith("/" + changedBaseName + ".ts") ||
        spec.endsWith("/" + changedBaseName + ".tsx")
      );
    });
    if (!importsFromChanged) continue;

    for (const func of sf.getFunctions()) {
      const key = `${sfPath}:${func.getName() ?? "(anonymous)"}`;
      if (seen.has(key)) continue;
      seen.add(key);
      dependents.push({
        filePath: sfPath,
        functionName: func.getName() ?? "(anonymous)",
        startLine: func.getStartLineNumber(),
        endLine: func.getEndLineNumber(),
      });
    }
  }

  return dependents;
}

function collectDownstreamDeps(
  sf: SourceFile,
  absPath: string,
  changedAbsPaths: Set<string>,
  seen: Set<string>,
): FunctionNode[] {
  const deps: FunctionNode[] = [];

  for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    try {
      const sym = call.getExpression().getSymbol();
      if (!sym) continue;
      for (const decl of sym.getDeclarations()) {
        const declFile = decl.getSourceFile().getFilePath();
        if (declFile === absPath) continue;
        if (declFile.includes("node_modules")) continue;
        const key = `${declFile}:${sym.getName()}`;
        if (seen.has(key)) continue;
        seen.add(key);
        deps.push({
          filePath: declFile,
          functionName: sym.getName(),
          startLine: decl.getStartLineNumber(),
          endLine: decl.getEndLineNumber(),
        });
      }
    } catch {
      // skip unresolvable symbols
    }
  }

  return deps;
}

export function parseBlastRadius(options: ParseDiffOptions): DiffBlastRadius {
  const { projectRoot, changedFiles } = options;

  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    compilerOptions: {
      allowJs: false,
      strict: false,
      skipLibCheck: true,
    },
  });

  addSourceFilesFromDir(project, projectRoot);

  const changed: FunctionNode[] = [];
  const allDependents: FunctionNode[] = [];
  const dependencies: FunctionNode[] = [];
  const seenDeps = new Set<string>();
  const seenDependents = new Set<string>();

  // Resolve absolute paths up front
  const changedAbsPaths = new Set<string>(
    changedFiles.map((f) =>
      path.isAbsolute(f) ? f : path.join(projectRoot, f),
    ),
  );

  for (const changedFilePath of changedFiles) {
    const absPath = path.isAbsolute(changedFilePath)
      ? changedFilePath
      : path.join(projectRoot, changedFilePath);

    let sf = project.getSourceFile(absPath);
    if (!sf) {
      if (!fs.existsSync(absPath)) continue;
      sf = project.addSourceFileAtPath(absPath);
    }

    // Collect changed functions
    for (const func of sf.getFunctions()) {
      changed.push({
        filePath: absPath,
        functionName: func.getName() ?? "(anonymous)",
        startLine: func.getStartLineNumber(),
        endLine: func.getEndLineNumber(),
      });
    }

    // Strategy A: import-based callers
    const importCallers = findImportCallers(project, sf, changedAbsPaths);
    for (const caller of importCallers) {
      const key = `${caller.filePath}:${caller.functionName}`;
      if (!seenDependents.has(key)) {
        seenDependents.add(key);
        allDependents.push(caller);
      }
    }

    // Strategy B: HTTP callers for route files
    const endpoint = extractEndpointFromPath(changedFilePath);
    if (endpoint) {
      const httpCallers = findHttpCallers(project, endpoint, changedAbsPaths);
      for (const caller of httpCallers) {
        const key = `${caller.filePath}:${caller.functionName}`;
        if (!seenDependents.has(key)) {
          seenDependents.add(key);
          allDependents.push(caller);
        }
      }
    }

    // Downward: what does this changed file call?
    const downDeps = collectDownstreamDeps(
      sf,
      absPath,
      changedAbsPaths,
      seenDeps,
    );
    dependencies.push(...downDeps);
  }

  const highFanOut = allDependents.length > 20;
  if (highFanOut) {
    process.stderr.write(
      `[ts-parser] High fan-out detected: ${allDependents.length} dependents\n`,
    );
  }

  return { changed, dependents: allDependents, dependencies, highFanOut };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
