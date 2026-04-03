import type {
  DiffBlastRadius,
  EndpointContract,
  ChangeType,
} from "../../types/pipeline";
import type { CatalogPattern } from "../../catalog/catalog";

export interface Layer1PromptInput {
  blastRadius: DiffBlastRadius;
  contracts: EndpointContract[];
  changeTypes: ChangeType[];
  catalogEntries: CatalogPattern[];
  ecosystem?: "typescript" | "python";
}

const SYNTHESIZED_TEST_SCHEMA = `
{
  "testId": string,              // unique id e.g. "t-001"
  "endpoint": string,            // e.g. "/api/users"
  "caseType": "happy" | "edge" | "boundary" | "auth" | "ai-blind-spot",
  "payload": object,             // request body or params
  "expectedStatus": number,      // HTTP status code integer
  "expectedShape": object?,      // optional: shape of response body fields
  "blindSpotPattern": string?,   // required when caseType is "ai-blind-spot"
  "expectedResult": "PASS" | "FAIL"?
}
`.trim();

export function buildLayer1Prompt(input: Layer1PromptInput): string {
  const { blastRadius, contracts, changeTypes, catalogEntries, ecosystem } =
    input;

  const blastRadiusSection = JSON.stringify(blastRadius, null, 2);
  const contractsSection = JSON.stringify(contracts, null, 2);
  const changeTypesSection = JSON.stringify(changeTypes);
  const catalogSection = JSON.stringify(catalogEntries, null, 2);

  return `You are a test synthesis engine. Your job is to generate API tests based on a diff blast radius, endpoint contracts, detected change types, and known AI blind spot patterns.

## Task
Generate a JSON array of tests that cover: happy path, boundary conditions, edge cases, and auth checks. For each detected blind spot pattern, generate at least one "ai-blind-spot" caseType test.

## Output Format
Return ONLY a valid JSON array. No markdown, no explanation, no code fences. Each element must conform to this schema:

${SYNTHESIZED_TEST_SCHEMA}

## Diff Blast Radius
${blastRadiusSection}

## Endpoint Contracts
${contractsSection}

## Detected Change Types
${changeTypesSection}

## Relevant Blind Spot Catalog Entries
${catalogSection}

## Rules
1. Generate at least one "happy" test per endpoint in the contracts.
2. Generate at least one "edge" or "boundary" test per endpoint (missing required fields, wrong types, empty strings, max-length values).
3. For each entry in the blind spot catalog: generate one "ai-blind-spot" test that would catch the described failure. Set expectedResult to "FAIL" when the test is designed to catch a regression that the AI introduced.
4. If any changeType is "new-auth-check" or the catalog contains auth patterns: generate at least one "auth" test (unauthenticated request → 401, wrong ownership → 403).
5. Every testId must be unique. Use format "t-001", "t-002", etc.
6. expectedStatus must be a number, not a string.
7. payload must be a non-null object (use {} if no body).
8. Output ONLY the JSON array — nothing else.${
    ecosystem === "python"
      ? `

## Ecosystem: Python
Generate tests using Python idioms:
- Use httpx.post() / httpx.get() instead of fetch()
- Use assert resp.status_code == N instead of expect(res.status).toBe(N)
- For non-HTTP code: use direct function calls and assert return values or pytest.raises()
- endpoint field: use the function/method name if not an HTTP endpoint (e.g. "Pipeline.score")
- payload field: use Python dict notation in descriptions ({"key": "value"})`
      : ""
  }`;
}
