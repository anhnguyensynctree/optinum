import { execSync } from "child_process";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import {
  SynthesizedTestSchema,
  type SynthesizedTest,
  type DiscoveredPattern,
  type DiffBlastRadius,
  type EndpointContract,
  type ChangeType,
  type PipelineError,
} from "../types/pipeline";
import { queryByChangeType } from "../catalog/catalog";
import type { CatalogPattern } from "../catalog/catalog";
import { buildLayer1Prompt } from "./prompts/layer1";
import { buildLayer2Prompt } from "./prompts/layer2";
import { buildLayer3Prompt } from "./prompts/layer3";
import { withRetry, RetryExhaustedError } from "./retry";

export type SynthesisMode = "cli" | "api";

export interface SynthesizeInput {
  blastRadius: DiffBlastRadius;
  contracts: EndpointContract[];
  changeTypes: ChangeType[];
  mode?: SynthesisMode;
  /** Raw unified diff passed to Layer 3 for catalog-independent pattern discovery */
  rawDiff?: string;
  /** Injectable for testing — overrides subprocess call in cli mode */
  _cliRunner?: (prompt: string) => string;
  /** Injectable for testing — overrides API call in api mode (attempt=1 uses Opus, attempt>1 uses Haiku) */
  _apiRunner?: (prompt: string, model: string) => Promise<string>;
}

export interface SynthesizeResult {
  tests: SynthesizedTest[];
  error: PipelineError | null;
  /** Patterns discovered by Layer 3 from first-principles diff reasoning — catalog growth candidates */
  discoveredPatterns: DiscoveredPattern[];
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

export const SYNTHESIZER_PRIMARY_MODEL = "claude-opus-4-5";
export const SYNTHESIZER_RETRY_MODEL = "claude-haiku-4-5";

async function defaultApiRunner(
  prompt: string,
  model: string,
): Promise<string> {
  const client = new Anthropic();
  const message = await client.messages.create({
    model,
    max_tokens: 4096,
    messages: [{ role: "user", content: prompt }],
  });

  const content = message.content[0];
  if (content.type !== "text") {
    throw new Error(`Unexpected content type from API: ${content.type}`);
  }
  return content.text;
}

function buildInvoker(
  mode: SynthesisMode,
  prompt: string,
  cliRunner: (p: string) => string,
  apiRunner: (p: string, model: string) => Promise<string>,
): (attempt: number) => Promise<SynthesizedTest[]> {
  return async (attempt: number) => {
    const model =
      attempt === 1 ? SYNTHESIZER_PRIMARY_MODEL : SYNTHESIZER_RETRY_MODEL;
    const raw =
      mode === "api" ? await apiRunner(prompt, model) : cliRunner(prompt);
    return parseAndValidate(raw);
  };
}

export async function synthesizeTests(
  input: SynthesizeInput,
): Promise<SynthesizeResult> {
  const {
    blastRadius,
    contracts,
    changeTypes,
    mode = "cli",
    rawDiff,
    _cliRunner = defaultCliRunner,
    _apiRunner = defaultApiRunner,
  } = input;

  const catalogEntries = getCatalogEntries(changeTypes);

  // Layer 1 — standard tests
  const layer1Prompt = buildLayer1Prompt({
    blastRadius,
    contracts,
    changeTypes,
    catalogEntries,
  });

  let layer1Tests: SynthesizedTest[];
  try {
    layer1Tests = await withRetry(
      buildInvoker(mode, layer1Prompt, _cliRunner, _apiRunner),
      2,
    );
  } catch (err) {
    const retries = err instanceof RetryExhaustedError ? err.attempts - 1 : 0;
    const lastOutput = err instanceof RetryExhaustedError ? err.lastError : err;
    const pipelineError: PipelineError = {
      stage: "synthesizer",
      message: err instanceof Error ? err.message : String(err),
      retries,
      lastOutput,
    };
    return { tests: [], error: pipelineError, discoveredPatterns: [] };
  }

  // Layer 2 — blind spot tests (only when catalog entries exist)
  if (catalogEntries.length === 0) {
    console.log("no-catalog-entry: skipping Layer 2 synthesis");
    return { tests: layer1Tests, error: null, discoveredPatterns: [] };
  }

  const layer2Prompt = buildLayer2Prompt({
    blastRadius,
    contracts,
    changeTypes,
    catalogEntries,
  });

  let layer2Tests: SynthesizedTest[];
  try {
    layer2Tests = await withRetry(
      buildInvoker(mode, layer2Prompt, _cliRunner, _apiRunner),
      2,
    );
  } catch (err) {
    const retries = err instanceof RetryExhaustedError ? err.attempts - 1 : 0;
    const lastOutput = err instanceof RetryExhaustedError ? err.lastError : err;
    const pipelineError: PipelineError = {
      stage: "synthesizer",
      message: err instanceof Error ? err.message : String(err),
      retries,
      lastOutput,
    };
    return { tests: [], error: pipelineError, discoveredPatterns: [] };
  }

  // Layer 3 — catalog-independent pattern discovery (only when rawDiff provided)
  if (!rawDiff) {
    return {
      tests: [...layer1Tests, ...layer2Tests],
      error: null,
      discoveredPatterns: [],
    };
  }

  const layer3Prompt = buildLayer3Prompt({
    blastRadius,
    contracts,
    changeTypes,
    rawDiff,
  });

  let layer3Tests: SynthesizedTest[];
  try {
    layer3Tests = await withRetry(
      buildInvoker(mode, layer3Prompt, _cliRunner, _apiRunner),
      2,
    );
  } catch (err) {
    const retries = err instanceof RetryExhaustedError ? err.attempts - 1 : 0;
    const lastOutput = err instanceof RetryExhaustedError ? err.lastError : err;
    const pipelineError: PipelineError = {
      stage: "synthesizer",
      message: err instanceof Error ? err.message : String(err),
      retries,
      lastOutput,
    };
    return { tests: [], error: pipelineError, discoveredPatterns: [] };
  }

  // Extract distinct discovered patterns from Layer 3 output (dedup by name)
  const discoveredPatterns = extractDiscoveredPatterns(layer3Tests);

  return {
    tests: [...layer1Tests, ...layer2Tests, ...layer3Tests],
    error: null,
    discoveredPatterns,
  };
}

function extractDiscoveredPatterns(
  tests: SynthesizedTest[],
): DiscoveredPattern[] {
  const seen = new Set<string>();
  const result: DiscoveredPattern[] = [];
  for (const t of tests) {
    if (t.discoveredPattern && !seen.has(t.discoveredPattern.name)) {
      seen.add(t.discoveredPattern.name);
      result.push(t.discoveredPattern);
    }
  }
  return result;
}
