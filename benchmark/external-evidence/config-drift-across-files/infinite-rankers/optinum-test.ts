// Optinum generates this from: changeType=config-drift-across-files, pattern=config-drift-across-files
// Source repo: https://github.com/MalikAhmad911/infinite-rankers/pull/1
// AI tool: Claude Code (PR author)
// Gap: Claude renamed NEON_DATABASE_URL → DATABASE_URL in application code
//      but .env.example still documented the old key name.
//      A developer copying .env.example sets NEON_DATABASE_URL and gets a silent
//      connection failure — process.env.DATABASE_URL is undefined.

import { describe, it, expect } from "vitest";
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

describe("config-drift: .env.example matches code expectations", () => {
  const envExamplePath = path.resolve(".env.example");
  const envExampleContent = fs.readFileSync(envExamplePath, "utf8");

  it("documents DATABASE_URL, not NEON_DATABASE_URL", () => {
    // AI renamed the key in code — example must follow
    expect(envExampleContent).toMatch(/DATABASE_URL=/);
    expect(envExampleContent).not.toMatch(/NEON_DATABASE_URL=/);
  });

  it("PORT in example matches PORT used by server/index.ts", () => {
    // server/index.ts binds to process.env.PORT — example must document correct default
    const serverContent = fs.readFileSync("server/index.ts", "utf8");
    const portMatch = serverContent.match(/PORT[^=]*?(\d{4,5})/);
    const defaultPort = portMatch ? portMatch[1] : null;

    if (defaultPort) {
      expect(envExampleContent).toContain(`PORT=${defaultPort}`);
    }
  });

  it("all env vars used in application code are documented in .env.example", () => {
    // Scan source files for process.env.X — every key must appear in .env.example
    const output = execSync(
      `grep -r "process\\.env\\." src/ server/ --include="*.ts" -h | grep -oP 'process\\.env\\.\\K[A-Z_]+'`,
      { encoding: "utf8" },
    );
    const usedKeys = [...new Set(output.trim().split("\n").filter(Boolean))];
    const missingFromExample = usedKeys.filter(
      (key) => !envExampleContent.includes(`${key}=`),
    );
    expect(missingFromExample).toEqual([]);
  });
});
