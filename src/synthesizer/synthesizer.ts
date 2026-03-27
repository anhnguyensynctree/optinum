import { execSync } from "child_process";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import {
  SynthesizedTestSchema,
  type SynthesizedTest,
  type DiffBlastRadius,
  type EndpointContract,
  type ChangeType,
  type PipelineError,
} from "../types/pipeline";
import { queryByChangeType } from "../catalog/catalog";
import type { CatalogPattern } from "../catalog/catalog";
import { buildLayer1Prompt } from "./prompts/layer1";
import { withRetry, RetryExhaustedError } from "./retry";

export type SynthesisMode = "cli" | "api";

export interface SynthesizeInput {
  blastRadius: DiffBlastRadius;
  contracts: EndpointContract[];
  changeTypes: ChangeType[];
  mode?: SynthesisMode;
  /** Injectable for testing — overrides subprocess call in cli mode */
  _cliRunner?: (prompt: string) => string;
  /** Injectable for testing — overrides API call in api mode */
  _apiRunner?: (prompt: string) => Promise<string>;
}

export interface SynthesizeResult {
  tests: SynthesizedTest[];
  error: PipelineError | null;
}

function getCatalogEntries(changeTypes: ChangeType[]): CatalogPattern[] {
  const seen = new Set<string>();
  const entries: CatalogPattern[] = [];
  for (const ct of changeTypes) {
    for (const pattern of queryByChangeType(ct)) {
      if (!seen.has(pattern.id)) {
        seen.add(pattern.id);
        entries.push(pattern);
      }
    }
  }
  return entries;
}

export function parseAndValidate(raw: string): SynthesizedTest[] {
  const trimmed = raw.trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (err) {
    throw new Error(
      `JSON parse failure: ${err instanceof Error ? err.message : String(err)}\nRaw output: ${trimmed.slice(0, 500)}`,
    );
  }

  const schema = z.array(SynthesizedTestSchema);
  const result = schema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`Zod validation failure: ${result.error.message}`);
  }
  return result.data;
}

function defaultCliRunner(prompt: string): string {
  const escaped = prompt.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return execSync(`claude --print "${escaped}"`, {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  }) as string;
}

async function defaultApiRunner(prompt: string): Promise<string> {
  const client = new Anthropic();
  const message = await client.messages.create({
    model: "claude-opus-4-5",
    max_tokens: 4096,
    messages: [{ role: "user", content: prompt }],
  });

  const content = message.content[0];
  if (content.type !== "text") {
    throw new Error(`Unexpected content type from API: ${content.type}`);
  }
  return content.text;
}

export async function synthesizeTests(
  input: SynthesizeInput,
): Promise<SynthesizeResult> {
  const {
    blastRadius,
    contracts,
    changeTypes,
    mode = "cli",
    _cliRunner = defaultCliRunner,
    _apiRunner = defaultApiRunner,
  } = input;

  const catalogEntries = getCatalogEntries(changeTypes);
  const prompt = buildLayer1Prompt({
    blastRadius,
    contracts,
    changeTypes,
    catalogEntries,
  });

  const invoke = async (): Promise<SynthesizedTest[]> => {
    const raw = mode === "api" ? await _apiRunner(prompt) : _cliRunner(prompt);
    return parseAndValidate(raw);
  };

  try {
    const tests = await withRetry(invoke, 2);
    return { tests, error: null };
  } catch (err) {
    const retries = err instanceof RetryExhaustedError ? err.attempts - 1 : 0;
    const lastOutput = err instanceof RetryExhaustedError ? err.lastError : err;

    const pipelineError: PipelineError = {
      stage: "synthesizer",
      message: err instanceof Error ? err.message : String(err),
      retries,
      lastOutput,
    };
    return { tests: [], error: pipelineError };
  }
}
