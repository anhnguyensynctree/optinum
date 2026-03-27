import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as path from "path";
import { runInit, type InitFs, type InitEnv } from "./init";
import { OptinumConfigSchema } from "../../config/config-schema";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface FakeFile {
  content: string;
  encoding: "utf8";
}

function makeFs(files: Record<string, string>): InitFs & {
  written: Record<string, string>;
} {
  const written: Record<string, string> = {};
  return {
    written,
    existsSync(p: string): boolean {
      return p in files || p in written;
    },
    readFileSync(p: string, _enc: "utf8"): string {
      if (p in files) return files[p];
      if (p in written) return written[p];
      throw new Error(`ENOENT: ${p}`);
    },
    writeFileSync(p: string, content: string, _enc: "utf8"): void {
      written[p] = content;
    },
  };
}

function silentEnv(answer: string | null = null): InitEnv {
  return { readLine: () => answer };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("runInit", () => {
  it("TS + vitest project writes correct config", async () => {
    const root = "/fake/ts-project";
    const pkg = JSON.stringify({
      devDependencies: { vitest: "^1.0.0" },
      dependencies: { zod: "^3.0.0" },
    });
    const fs = makeFs({
      [path.join(root, "tsconfig.json")]: "{}",
      [path.join(root, "package.json")]: pkg,
    });
    const env = silentEnv();

    await runInit(root, { _fs: fs, _env: env });

    const configPath = path.join(root, "optinum.config.ts");
    assert.ok(configPath in fs.written, "config file was written");

    const written = fs.written[configPath];
    assert.ok(written.includes('"typescript"'), "ecosystem is typescript");
    assert.ok(written.includes('"vitest"'), "testRunner is vitest");
    assert.ok(written.includes('"zod"'), "schemaFormat is zod");
    assert.ok(written.includes('"./optinum-tests"'), "outputDir present");
  });

  it("Python project writes python config", async () => {
    const root = "/fake/py-project";
    const fs = makeFs({
      [path.join(root, "pyproject.toml")]: "[tool.poetry]\nname = 'myapp'",
    });
    const env = silentEnv();

    await runInit(root, { _fs: fs, _env: env });

    const configPath = path.join(root, "optinum.config.ts");
    assert.ok(configPath in fs.written, "config file was written");

    const written = fs.written[configPath];
    assert.ok(written.includes('"python"'), "ecosystem is python");
    assert.ok(written.includes('"pytest"'), "testRunner is pytest");
    assert.ok(written.includes('"pydantic"'), "schemaFormat is pydantic");
  });

  it("existing config exits without overwriting when answer is n", async () => {
    const root = "/fake/existing-project";
    const configPath = path.join(root, "optinum.config.ts");
    const original = "// original content";
    const fs = makeFs({
      [path.join(root, "tsconfig.json")]: "{}",
      [configPath]: original,
    });
    const env = silentEnv(null); // non-interactive → treated as "n"

    await runInit(root, { _fs: fs, _env: env });

    // written map should not have the config path (not overwritten via writeFileSync)
    assert.ok(
      !(configPath in fs.written),
      "config was not re-written when answer is n",
    );
  });

  it("config loader parses the written file correctly", async () => {
    const root = "/fake/loader-project";
    const pkg = JSON.stringify({ dependencies: { zod: "^4.0.0" } });
    const fs = makeFs({
      [path.join(root, "tsconfig.json")]: "{}",
      [path.join(root, "package.json")]: pkg,
    });
    const env = silentEnv();

    await runInit(root, { _fs: fs, _env: env });

    const configPath = path.join(root, "optinum.config.ts");
    const written = fs.written[configPath];
    assert.ok(written !== undefined, "config was written");

    // Extract the object literal from the written TS source and validate with Zod
    // We parse out the fields manually to avoid needing a TS runtime here
    const ecosystem = written.match(/ecosystem: "([^"]+)"/)?.[1];
    const schemaFormat = written.match(/schemaFormat: "([^"]+)"/)?.[1];
    const testRunner = written.match(/testRunner: "([^"]+)"/)?.[1];
    const outputDir = written.match(/outputDir: "([^"]+)"/)?.[1];

    const result = OptinumConfigSchema.safeParse({
      ecosystem,
      schemaFormat,
      testRunner,
      outputDir,
    });

    assert.ok(result.success, `Zod parse failed: ${JSON.stringify(result)}`);
    assert.equal(result.data.ecosystem, "typescript");
    assert.equal(result.data.schemaFormat, "zod");
    assert.equal(result.data.testRunner, "jest");
    assert.equal(result.data.outputDir, "./optinum-tests");
  });
});
