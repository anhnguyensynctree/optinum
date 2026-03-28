// Optinum generates this from: changeType=new-write-endpoint, pattern=input-trust-violation
// Source repo: https://github.com/am225723/quoagent/pull/33
// AI tool: Jules (Google Labs)
// Gap: Jules built /api/run with full business logic but no auth check.
//      CRON_SECRET was present in env but the code never read it.
//      Jules Sentinel — Jules's own post-execution reviewer — caught the gap
//      and filed the fix PR with a post-mortem.

import { describe, it, expect, vi } from "vitest";
import { POST } from "./buggy-route";
import { NextRequest } from "next/server";

// Mock the agent so tests don't make real LLM calls
vi.mock("@/lib/agent", () => ({
  runAgent: vi.fn().mockResolvedValue({ output: "agent result" }),
}));

describe("input-trust-violation: /api/run requires Authorization header", () => {
  const makeRequest = (authHeader?: string) =>
    new NextRequest("http://localhost/api/run", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(authHeader ? { Authorization: authHeader } : {}),
      },
      body: JSON.stringify({ input: "test", context: {} }),
    });

  it("returns 401 when Authorization header is missing", async () => {
    // AI code: returns 200 — no auth check exists
    // Correct code: returns 401
    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
  });

  it("returns 401 when Authorization header has wrong secret", async () => {
    process.env.CRON_SECRET = "real-secret";
    const res = await POST(makeRequest("Bearer wrong-secret"));
    expect(res.status).toBe(401);
  });

  it("returns 200 when Authorization header matches CRON_SECRET", async () => {
    process.env.CRON_SECRET = "real-secret";
    const res = await POST(makeRequest("Bearer real-secret"));
    expect(res.status).toBe(200);
  });
});
