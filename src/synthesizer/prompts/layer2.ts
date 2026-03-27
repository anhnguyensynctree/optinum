import type {
  DiffBlastRadius,
  EndpointContract,
  ChangeType,
} from "../../types/pipeline";
import type { CatalogPattern } from "../../catalog/catalog";

export interface Layer2PromptInput {
  blastRadius: DiffBlastRadius;
  contracts: EndpointContract[];
  changeTypes: ChangeType[];
  catalogEntries: CatalogPattern[];
}

const BLIND_SPOT_TEST_SCHEMA = `
{
  "testId": string,              // unique id e.g. "bs-001"
  "endpoint": string,            // e.g. "/api/users"
  "caseType": "ai-blind-spot",   // always "ai-blind-spot" for Layer 2
  "payload": object,             // request body or params sent by the upstream caller
  "expectedStatus": number,      // HTTP status code integer
  "expectedShape": object?,      // optional: shape of response body fields
  "blindSpotPattern": string,    // required: catalog pattern id (e.g. "params-renamed")
  "expectedResult": "FAIL"       // always "FAIL" — these tests catch regressions in callers
}
`.trim();

export function buildLayer2Prompt(input: Layer2PromptInput): string {
  const { blastRadius, contracts, changeTypes, catalogEntries } = input;

  const blastRadiusSection = JSON.stringify(blastRadius, null, 2);
  const contractsSection = JSON.stringify(contracts, null, 2);
  const changeTypesSection = JSON.stringify(changeTypes);
  const catalogSection = JSON.stringify(catalogEntries, null, 2);

  return `You are an adversarial test synthesis engine. Your sole purpose is to generate tests that expose AI blind spots — places where an AI assistant changed an API contract or added an endpoint but left upstream callers broken.

## Task
For each upstream dependent in the blast radius, generate one "ai-blind-spot" test per catalog pattern that applies. Each test simulates the broken caller making a request using the OLD contract shape (the one the AI forgot to update). These tests are designed to FAIL — they prove the caller is broken.

## Output Format
Return ONLY a valid JSON array. No markdown, no explanation, no code fences. Each element must conform to this schema:

${BLIND_SPOT_TEST_SCHEMA}

## Blast Radius
${blastRadiusSection}

## Endpoint Contracts (current — post-change)
${contractsSection}

## Detected Change Types
${changeTypesSection}

## Blind Spot Catalog Entries
${catalogSection}

## Rules
1. Only generate "ai-blind-spot" tests. No happy, edge, boundary, or auth tests.
2. Every test MUST have expectedResult: "FAIL" — these are regression detectors, not success checks.
3. Every test MUST have blindSpotPattern set to the catalog entry id that motivated the test.
4. For each dependent in blastRadius.dependents: generate one test per catalog entry, targeting the endpoint in contracts.
5. The payload must represent what the broken caller would send — old field names, missing new required fields, or old structure depending on the catalog pattern.
6. Every testId must be unique. Use format "bs-001", "bs-002", etc.
7. expectedStatus must be a number, not a string. Use 400 for validation failures, 403 for ownership/auth failures, 500 for crash scenarios.
8. payload must be a non-null object (use {} if the caller sends no body).
9. Output ONLY the JSON array — nothing else.`;
}
