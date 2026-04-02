import type {
  DiffBlastRadius,
  EndpointContract,
  ChangeType,
} from "../../types/pipeline";

export interface Layer3PromptInput {
  blastRadius: DiffBlastRadius;
  contracts: EndpointContract[];
  changeTypes: ChangeType[];
  rawDiff: string;
}

const DISCOVERY_TEST_SCHEMA = `
{
  "testId": string,              // unique id e.g. "dp-001"
  "endpoint": string,            // e.g. "/api/users"
  "caseType": "ai-blind-spot",   // always "ai-blind-spot" for Layer 3
  "payload": object,             // request body or params
  "expectedStatus": number,      // HTTP status code integer
  "expectedShape": object?,      // optional: shape of response body fields
  "blindSpotPattern": string?,   // optional: set if this matches a known class
  "expectedResult": "PASS" | "FAIL",
  "discoveredPattern": {
    "id": string,                // e.g. "dp-001" — matches testId prefix
    "name": string,              // short kebab-case name for the pattern class
    "mechanism": string,         // 1-2 sentences: what technically fails and how
    "aiNativeReason": string     // 1-2 sentences: why AI is specifically blind to this
  }
}
`.trim();

export function buildLayer3Prompt(input: Layer3PromptInput): string {
  const { blastRadius, contracts, changeTypes, rawDiff } = input;

  const blastRadiusSection = JSON.stringify(blastRadius, null, 2);
  const contractsSection = JSON.stringify(contracts, null, 2);
  const changeTypesSection = JSON.stringify(changeTypes);

  return `You are a pattern discovery engine. Your purpose is to find failure modes that are NOT in any known catalog — reasoning from the raw diff and blast radius alone, from first principles.

## Task
Read the diff and reason structurally: what contracts, assumptions, or invariants did the changed code rely on? Which of those are now violated? For each failure mode you identify, generate one test AND name the pattern class you discovered.

Do NOT rely on any predefined list of patterns. Derive everything from the diff itself.

## Output Format
Return ONLY a valid JSON array. No markdown, no explanation, no code fences. Each element must conform to this schema:

${DISCOVERY_TEST_SCHEMA}

## Raw Diff (what actually changed)
\`\`\`diff
${rawDiff}
\`\`\`

## Blast Radius (what depends on the changed code)
${blastRadiusSection}

## Endpoint Contracts (post-change state)
${contractsSection}

## Detected Change Types
${changeTypesSection}

## Reasoning Instructions
For each changed function or file in the diff:
1. Identify: what contract did this code expose? (return shape, field names, status codes, auth requirements, ordering guarantees)
2. Identify: what did the diff change about that contract? (renamed field, added required param, removed status code, changed semantics)
3. Identify: which dependents in blastRadius.dependents would break because they still call the old contract?
4. Name the failure pattern: give it a short kebab-case id and 1-2 sentence description of the mechanism and why AI specifically misses it

## Rules
1. Only generate "ai-blind-spot" tests. Every test MUST have a discoveredPattern field.
2. Do NOT use pattern names from any catalog — derive the name from the diff itself.
3. If the failure mode you discover happens to match a known pattern class (e.g., a renamed field), name it differently — focus on the specific structural mechanism in this diff.
4. expectedResult must be "FAIL" when the test exposes a broken caller, "PASS" when it validates correct behavior after the change.
5. discoveredPattern.id must match the testId prefix (e.g., test "dp-001" → pattern id "dp-001").
6. Every testId must be unique. Use format "dp-001", "dp-002", etc.
7. expectedStatus must be a number, not a string.
8. payload must be a non-null object (use {} if no body).
9. If the diff contains no contract-breaking changes, return an empty array [].
10. Output ONLY the JSON array — nothing else.`;
}
