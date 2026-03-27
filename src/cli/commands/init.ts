import * as path from "path";
import {
  OptinumConfigSchema,
  type OptinumConfig,
} from "../../config/config-schema";

// Minimal FS interface for injection in tests
export interface InitFs {
  existsSync(p: string): boolean;
  readFileSync(p: string, encoding: "utf8"): string;
  writeFileSync(p: string, content: string, encoding: "utf8"): void;
}

// Minimal env interface for injection in tests
export interface InitEnv {
  /** Read a single line from stdin synchronously; return null if non-interactive */
  readLine(): string | null;
}

export interface InitOpts {
  _fs?: InitFs;
  _env?: InitEnv;
}

function buildRealFs(): InitFs {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const fs = require("fs") as typeof import("fs");
  return {
    existsSync: (p) => fs.existsSync(p),
    readFileSync: (p, enc) => fs.readFileSync(p, enc),
    writeFileSync: (p, content, enc) => fs.writeFileSync(p, content, enc),
  };
}

function buildRealEnv(): InitEnv {
  return {
    readLine() {
      // Synchronous stdin read — only works in interactive TTY
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { execSync } =
          require("child_process") as typeof import("child_process");
        const result = execSync("read -r line && echo $line", {
          stdio: ["inherit", "pipe", "inherit"],
          shell: "/bin/bash",
        });
        return result.toString().trim() || null;
      } catch {
        return null;
      }
    },
  };
}

function detectEcosystem(
  projectRoot: string,
  fs: InitFs,
): "typescript" | "python" {
  if (fs.existsSync(path.join(projectRoot, "tsconfig.json"))) {
    return "typescript";
  }
  if (
    fs.existsSync(path.join(projectRoot, "pyproject.toml")) ||
    fs.existsSync(path.join(projectRoot, "setup.py"))
  ) {
    return "python";
  }
  return "typescript";
}

function detectTestRunner(
  projectRoot: string,
  ecosystem: "typescript" | "python",
  fs: InitFs,
): "jest" | "vitest" | "pytest" {
  if (ecosystem === "python") {
    return "pytest";
  }
  const pkgPath = path.join(projectRoot, "package.json");
  if (fs.existsSync(pkgPath)) {
    try {
      const raw = fs.readFileSync(pkgPath, "utf8");
      const pkg = JSON.parse(raw) as Record<string, unknown>;
      const devDeps = (pkg["devDependencies"] ?? {}) as Record<string, string>;
      const deps = (pkg["dependencies"] ?? {}) as Record<string, string>;
      if ("vitest" in devDeps || "vitest" in deps) {
        return "vitest";
      }
    } catch {
      // fall through
    }
  }
  return "jest";
}

function detectSchemaFormat(
  projectRoot: string,
  ecosystem: "typescript" | "python",
  fs: InitFs,
): "zod" | "pydantic" | "openapi" {
  if (ecosystem === "python") {
    return "pydantic";
  }
  const pkgPath = path.join(projectRoot, "package.json");
  if (fs.existsSync(pkgPath)) {
    try {
      const raw = fs.readFileSync(pkgPath, "utf8");
      const pkg = JSON.parse(raw) as Record<string, unknown>;
      const deps = (pkg["dependencies"] ?? {}) as Record<string, string>;
      const devDeps = (pkg["devDependencies"] ?? {}) as Record<string, string>;
      if ("zod" in deps || "zod" in devDeps) {
        return "zod";
      }
    } catch {
      // fall through
    }
  }
  return "openapi";
}

function renderConfig(config: OptinumConfig): string {
  const lines: string[] = [
    `import type { OptinumConfig } from "./src/config/config-schema";`,
    ``,
    `const config: OptinumConfig = {`,
    `  ecosystem: "${config.ecosystem}",`,
    `  schemaFormat: "${config.schemaFormat}",`,
    `  testRunner: "${config.testRunner}",`,
    `  outputDir: "${config.outputDir}",`,
  ];
  if (config.llm !== undefined) {
    lines.push(`  llm: "${config.llm}",`);
  }
  lines.push(`};`, ``, `export default config;`, ``);
  return lines.join("\n");
}

export async function runInit(
  projectRoot?: string,
  opts?: InitOpts,
): Promise<void> {
  const root = projectRoot ?? process.cwd();
  const fsImpl = opts?._fs ?? buildRealFs();
  const envImpl = opts?._env ?? buildRealEnv();

  const configPath = path.join(root, "optinum.config.ts");

  if (fsImpl.existsSync(configPath)) {
    process.stdout.write("Config already exists — overwrite? (y/n) ");
    const answer = envImpl.readLine();
    if (answer !== "y") {
      console.log("Aborted.");
      return;
    }
  }

  const ecosystem = detectEcosystem(root, fsImpl);
  const testRunner = detectTestRunner(root, ecosystem, fsImpl);
  const schemaFormat = detectSchemaFormat(root, ecosystem, fsImpl);

  const config: OptinumConfig = OptinumConfigSchema.parse({
    ecosystem,
    schemaFormat,
    testRunner,
    outputDir: "./optinum-tests",
  });

  const content = renderConfig(config);
  fsImpl.writeFileSync(configPath, content, "utf8");
  console.log(`Written: ${configPath}`);
}
