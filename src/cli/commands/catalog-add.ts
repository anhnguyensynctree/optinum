import * as fs from "fs";
import * as path from "path";

export interface CatalogAddArgs {
  repo: string;
  commit: string;
  description: string;
  outputDir?: string; // defaults to catalog/pending/
}

export interface PendingCatalogEntry {
  id: string;
  name: string;
  changeType: string;
  description: string;
  testPattern: {
    assertType: string;
    description: string;
  };
  ossEvidence: string | null;
  provisional: boolean;
  fixtureRef: string | null;
  severity: string;
  pending: {
    repo: string;
    commit: string;
    crossRefConfirmed: boolean;
    submittedAt: string;
  };
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 40);
}

export async function catalogAdd(
  args: CatalogAddArgs,
): Promise<{ filePath: string; entry: PendingCatalogEntry }> {
  const { repo, commit, description } = args;

  const shortCommit = commit.slice(0, 8);
  const descSlug = slugify(description);
  const id = `${descSlug}-${shortCommit}`;

  const entry: PendingCatalogEntry = {
    id,
    name: description,
    changeType: "unknown",
    description,
    testPattern: {
      assertType: "call-made",
      description: "TODO: describe what to assert",
    },
    ossEvidence: `${repo}@${commit}`,
    provisional: true,
    fixtureRef: null,
    severity: "medium",
    pending: {
      repo,
      commit,
      crossRefConfirmed: false,
      submittedAt: new Date().toISOString(),
    },
  };

  const outputDir =
    args.outputDir ?? path.join(process.cwd(), "catalog", "pending");
  fs.mkdirSync(outputDir, { recursive: true });

  const filename = `${id}.json`;
  const filePath = path.join(outputDir, filename);

  fs.writeFileSync(filePath, JSON.stringify(entry, null, 2) + "\n");

  console.log(`Created ${filePath}`);
  console.log(
    `  Set changeType manually in the file before submitting for review`,
  );
  console.log(`  Current changeType: "unknown"`);

  return { filePath, entry };
}

// CLI runner
export async function runCatalogAdd(argv: string[]): Promise<void> {
  const args: Partial<CatalogAddArgs> = {};

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--repo" && argv[i + 1]) args.repo = argv[++i];
    if (argv[i] === "--commit" && argv[i + 1]) args.commit = argv[++i];
    if (argv[i] === "--description" && argv[i + 1])
      args.description = argv[++i];
    if (argv[i] === "--output" && argv[i + 1]) args.outputDir = argv[++i];
  }

  if (!args.repo || !args.commit || !args.description) {
    console.error(
      "Usage: optinum catalog add --repo <url> --commit <sha> --description <text>",
    );
    process.exit(1);
  }

  await catalogAdd(args as CatalogAddArgs);
}
