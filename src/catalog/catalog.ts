import catalogData from "./blind-spot-catalog.json";

export interface CatalogTestPattern {
  assertType:
    | "field-sent"
    | "field-not-sent"
    | "status-code"
    | "artifact-exists"
    | "artifact-missing"
    | "call-made"
    | "call-not-made";
  description: string;
  field?: string;
  value?: unknown;
}

export interface CatalogPattern {
  id: string;
  name: string;
  changeType: string;
  description: string;
  testPattern: CatalogTestPattern;
  ossEvidence: string | null;
  provisional: boolean;
  fixtureRef: string | null;
  severity: "critical" | "high" | "medium" | "low";
}

export interface BlindSpotCatalog {
  version: string;
  patterns: CatalogPattern[];
}

const catalog: BlindSpotCatalog = catalogData as BlindSpotCatalog;

export function getCatalog(): CatalogPattern[] {
  return catalog.patterns;
}

export function queryByChangeType(changeType: string): CatalogPattern[] {
  return catalog.patterns.filter((p) => p.changeType === changeType);
}

export function getPattern(id: string): CatalogPattern | undefined {
  return catalog.patterns.find((p) => p.id === id);
}

export function getProvisionalPatterns(): CatalogPattern[] {
  return catalog.patterns.filter((p) => p.provisional === true);
}

export function getCatalogVersion(): string {
  return catalog.version;
}
