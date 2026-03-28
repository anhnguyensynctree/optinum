/**
 * Source: https://github.com/suryaumapathy2812/aether/issues/10
 * AI tool: Claude Code + Kilo (.kilo/plans directory present in repo)
 *
 * Optinum generates this from: changeType=new-write-endpoint, pattern=input-trust-violation
 *
 * Client-side auth guards are a systematic AI miss. Training data is full of
 * the idiomatic React pattern — `useAuth()` + redirect — because it is the
 * correct UX pattern. AI learns and reproduces it faithfully. But training data
 * conflates "protecting the UI" with "protecting the API". The two require
 * separate mechanisms. Optinum knows that any new write endpoint must be tested
 * for server-side auth independently of whatever client-side guard exists.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import fs from "fs";
import path from "path";

// --- Test 1: API rejects requests without Authorization header ---
// This test runs against the live Next.js API handler, bypassing the React UI.
describe("API route auth — no Authorization header", () => {
  it("returns 401 when Authorization header is absent", async () => {
    const { GET } = await import("@/app/api/notes/route");
    const req = new Request("http://localhost/api/notes");

    const res = await GET(req);

    // Fails on buggy codebase: returns 200 — server never checks auth
    expect(res.status).toBe(401);
  });
});

// --- Test 2: Forged localStorage token does not grant API access ---
// Simulates an attacker setting a fake token, then hitting the API directly.
describe("localStorage token bypass", () => {
  beforeEach(() => {
    // Attacker plants a fake token
    Object.defineProperty(window, "localStorage", {
      value: { getItem: vi.fn().mockReturnValue("fake-token-anything") },
      writable: true,
    });
  });

  it("API returns 401 even when localStorage contains a token", async () => {
    const { GET } = await import("@/app/api/notes/route");
    // No Authorization header — localStorage is irrelevant to server-side code
    const req = new Request("http://localhost/api/notes");

    const res = await GET(req);

    // localStorage.getItem('aether_token') returning truthy has zero effect
    // on the server. If the server returns 200 here, auth is client-only.
    expect(res.status).toBe(401);
  });
});

// --- Test 3: middleware.ts exists and covers auth-required routes ---
// Structural test: if the file is absent, client-side guards are the only line
// of defence — and they are not a security boundary.
describe("middleware.ts — server-side route protection", () => {
  it("middleware.ts exists at project root", () => {
    const middlewarePath = path.resolve(process.cwd(), "middleware.ts");
    const exists = fs.existsSync(middlewarePath);

    // Fails on aether: no middleware.ts — Next.js never intercepts requests
    expect(exists).toBe(true);
  });

  it("middleware.ts matcher covers /api routes", async () => {
    const middlewarePath = path.resolve(process.cwd(), "middleware.ts");
    const content = fs.readFileSync(middlewarePath, "utf-8");

    // The exported config.matcher must include API and dashboard paths
    expect(content).toMatch(/matcher/);
    expect(content).toMatch(/\/api\//);
  });
});
