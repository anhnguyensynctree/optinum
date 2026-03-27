import * as fs from "fs";
import * as path from "path";

export const TRIAL_LIMIT = 2;

const CONFIG_FILENAME = "config.json";
const CONFIG_DIR = ".optinum";

const TrialConfigSchema = {
  parse(raw: unknown): { synthRuns: number } {
    if (
      typeof raw === "object" &&
      raw !== null &&
      "synthRuns" in raw &&
      typeof (raw as Record<string, unknown>).synthRuns === "number"
    ) {
      return { synthRuns: (raw as { synthRuns: number }).synthRuns };
    }
    return { synthRuns: 0 };
  },
};

function configPath(homeDir: string): string {
  return path.join(homeDir, CONFIG_DIR, CONFIG_FILENAME);
}

function readConfig(homeDir: string): { synthRuns: number } {
  const p = configPath(homeDir);
  if (!fs.existsSync(p)) {
    return { synthRuns: 0 };
  }
  try {
    const raw = JSON.parse(fs.readFileSync(p, "utf8"));
    return TrialConfigSchema.parse(raw);
  } catch {
    return { synthRuns: 0 };
  }
}

function writeConfig(homeDir: string, config: { synthRuns: number }): void {
  const dir = path.join(homeDir, CONFIG_DIR);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    configPath(homeDir),
    JSON.stringify(config, null, 2),
    "utf8",
  );
}

export interface TrialCheckResult {
  allowed: boolean;
  runsUsed: number;
  reason?: string;
}

export function checkTrialLimit(opts?: {
  _homeDir?: string;
  _env?: NodeJS.ProcessEnv;
}): TrialCheckResult {
  const env = opts?._env ?? process.env;
  const homeDir =
    opts?._homeDir ?? process.env.HOME ?? process.env.USERPROFILE ?? "~";

  if (env["OPTINUM_API_KEY"]) {
    return { allowed: true, runsUsed: 0 };
  }

  const config = readConfig(homeDir);
  const runsUsed = config.synthRuns;

  if (runsUsed >= TRIAL_LIMIT) {
    return {
      allowed: false,
      runsUsed,
      reason: `Trial limit reached (${runsUsed}/${TRIAL_LIMIT} runs used). Set OPTINUM_API_KEY to continue.`,
    };
  }

  return { allowed: true, runsUsed };
}

export function incrementTrialCounter(opts?: { _homeDir?: string }): void {
  const homeDir =
    opts?._homeDir ?? process.env.HOME ?? process.env.USERPROFILE ?? "~";
  const config = readConfig(homeDir);
  writeConfig(homeDir, { synthRuns: config.synthRuns + 1 });
}
