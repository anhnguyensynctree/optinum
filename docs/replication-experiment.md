# AI-Native Replication Experiment

**Date:** 2026-03-27
**Repos tested:** 5 (yt-knowledge, daily-cosmos, rentandlend-platform, mind-drops, sonai)
**AI tool:** Claude Code / OMS (all 10 diffs)
**Target:** ≥2 catches where Optinum generates a failing test the AI didn't write

---

## What We Tested

10 real diffs from the user's own AI-native projects — all committed using Claude Code or OMS-driven Claude Code sessions. These are not benchmarks or synthetic fixtures. They are production commits from actively developed personal projects.

For each diff we asked:
1. What tests did the AI write alongside the code change?
2. What tests would Optinum generate from the blast radius + change type + catalog?
3. Do any of Optinum's unique tests fail on the AI's code?

---

## Results

**CATCH rate: 4/10** — Optinum generated a test the AI didn't write that fails on the AI's code
**Unique test rate: 8/10** — Optinum generated at least one test the AI omitted
**New catalog patterns:** 0 — all catches mapped to existing patterns

---

## Catch Analysis

### CATCH 1 — exp-001 · yt-knowledge · config-drift-across-files

**Commit:** `2ab927d` — "split claude_model into analyzer_model + brain_model"

**What the AI changed:** Refactored `cli.py` to read two new config keys (`analyzer_model`, `brain_model`) instead of one (`claude_model`). Updated `config.yaml` with the new keys.

**What the AI missed:** `config.yaml.example` — the template users copy to set up the project — still references `claude_model`. Any user copying the example gets the old key, which the code silently ignores, falling back to the default `claude-sonnet-4-6` for both model slots. No configuration validation, no migration hint, no test.

**Optinum test generated:**
```python
def test_legacy_config_key_raises():
    """Loading config with claude_model should raise ConfigurationError with migration hint."""
    config = {"claude_model": "claude-opus-4-6"}
    with pytest.raises(ConfigurationError, match="claude_model is deprecated"):
        load_settings(config)
```

**Why it fails on the AI's code:** `load_settings` calls `settings.get("analyzer_model", "claude-sonnet-4-6")` — old key is silently ignored, default model used for both. No error raised.

**Catalog pattern:** `config-drift-across-files` — AI edits the primary config file but misses the template (example) that users copy. Config drift between live config and example is a systematic AI miss: the AI's context window covers the active file, not the documentation artifact.

---

### CATCH 2 — exp-002 · daily-cosmos · params-renamed

**Commit:** `824dd7c0` — "rename primary_label → primary_identity, fix all 8 extractors"

**What the AI changed:** Renamed `primary_label` → `primary_identity` on `SystemOutput` across all 8 Stage 1 extractors, updated unit tests to verify the new field name.

**What the AI missed:** Backward compatibility with previously computed and stored/cached `SystemOutput` objects. Any `SystemOutput` persisted to the database, a JSON cache, or a log with the old `primary_label` field returns `undefined` when `anchor-identities.ts` reads `output.primary_identity`. The chip row silently produces no labels for migrated data. AI tests only verified newly computed outputs — not stored data.

**Optinum test generated:**
```typescript
it("anchor-identities handles legacy primary_label field gracefully", () => {
  const legacy: SystemOutput = {
    system: "western_astrology",
    primary_label: "Pisces",  // old field — not primary_identity
    primary_identity: undefined,
    raw: {}
  };
  const chip = buildChipRow([legacy]);
  // Should either map primary_label → primary_identity or raise a clear migration error
  // AI code: returns undefined chip silently
  expect(chip[0]).not.toBeUndefined();
});
```

**Why it fails on the AI's code:** `anchor-identities.ts` reads `output.primary_identity` directly. Legacy data with only `primary_label` returns `undefined`. The chip row renders empty — silent data loss, no error.

**Catalog pattern:** `params-renamed` — AI renamed the field and updated all writers but missed all readers of previously serialized data. Backward compat is a known AI miss: AI context covers the current codebase, not the data already written to storage.

---

### CATCH 3 — exp-005 · rentandlend-platform · input-trust-violation

**Commit:** `823cde8` — "add /favorites page (was 404)"

**What the AI changed:** Created `/favorites/page.tsx` with a `useAuth` hook + `useEffect` redirect to `/auth/login` for unauthenticated users.

**What the AI missed:** The auth guard is client-side only. Next.js App Router SSR renders the full page HTML before the client's `useEffect` runs. An unauthenticated HTTP fetch (crawler, API consumer, SSR scraper) receives the full rendered HTML — including any user-specific content fetched server-side — before the redirect fires. No server-side middleware or server component auth check exists for this route.

**Optinum test generated:**
```typescript
it("GET /favorites without session returns no user-specific content in HTML", async () => {
  const res = await fetch("/favorites", { redirect: "manual" });
  // Client-side redirect fires after SSR — server returns 200 with full HTML
  expect(res.status).toBe(307);  // or auth should be enforced server-side
  // AI code: returns 200 with full page HTML, redirect fires client-side only
});
```

**Why it fails on the AI's code:** The server returns HTTP 200 with full page HTML. Auth redirect only fires in the browser. Server-side callers see the full content.

**Catalog pattern:** `input-trust-violation` — AI implemented auth at the wrong boundary. Client-side guards are LLM-idiomatic (every `useAuth` example in training data shows this pattern) but leave a server-side exposure gap.

---

### CATCH 4 — exp-009 · sonai · input-trust-violation

**Commit:** `2f47231` — "Add time-travel Supabase Edge Function — weekly cron for temporal pattern notifications"

**What the AI changed:** Implemented a full Supabase Edge Function that runs on a weekly cron: finds users with temporal patterns, generates Claude Haiku reflections, validates content, sends Expo push notifications.

**What the AI missed:** The function has no caller authorization check inside the handler. While the Supabase anon key gates public requests, any caller possessing the anon key (which is bundled in the Expo client and thus semi-public) can POST to `/functions/v1/time-travel` directly, bypassing the cron schedule and triggering push notifications to all matching users on demand.

**Optinum test generated:**
```typescript
it("POST /functions/v1/time-travel with anon key returns 403 (cron-only endpoint)", async () => {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/time-travel`, {
    method: "POST",
    headers: { Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
  });
  expect(res.status).toBe(403);
  // AI code: returns 200 with { ok: true, processed: N } — sends notifications
});
```

**Why it fails on the AI's code:** The handler processes any authenticated Supabase request without checking whether the caller is the Supabase cron scheduler (service role) or an external client (anon key). The function sends real push notifications to users on any valid call.

**Catalog pattern:** `input-trust-violation` — write endpoint processes without verifying caller authorization level. AI correctly implements the happy-path cron flow but misses the "who is allowed to call this" boundary check — a systematic LLM miss: training data for edge functions shows business logic, not authorization guards.

---

## Misses — What Optinum Couldn't Catch

| ID | Repo | Commit | Why Missed |
|---|---|---|---|
| exp-003 | rentandlend | `82fe72c` | Null fix correct and safe; downstream renders null gracefully |
| exp-004 | rentandlend | `0e26bb8` | Each routing layer tested independently; no cascade failure exposed |
| exp-007 | mind-drops | `dec51213` | Inner try/except in `_analyse_one` handles failures before gather propagation |
| exp-008 | yt-knowledge | `50ce6ff` | Atomic rename — both caller and definition updated in same commit |
| exp-010 | mind-drops | `21a8ccf7` | `asyncio.gather([])` returns `[]` — Python semantics handle empty case |

---

## What This Proves

**4 of 10 real AI-generated diffs have a real integration gap that the AI didn't test.** Each catch maps to an existing catalog pattern:

- 2× `input-trust-violation` — auth at wrong boundary, anon key insufficient for write endpoints
- 1× `config-drift-across-files` — example template not updated with live config
- 1× `params-renamed` — rename updated writers, not stored/serialized readers

**The AI wrote no tests for 3 of the 4 catches.** For exp-005, the AI wrote auth check code but no test verifying it worked. For exp-001 and exp-009, no tests were written at all.

**The failure is structural, not incidental.** In every catch, the AI correctly implemented the happy path and missed the boundary. This is the training distribution pattern: LLMs generate code that handles the cases they were shown. They generate tests that verify the code handles those same cases. Optinum runs from outside that context and tests the boundary the AI didn't see.

---

## Next Steps

1. **TASK-034** — SWE-bench full synthesis run (206 instances) to validate classifier at scale
2. Run `optinum demo --repo <url>` end-to-end on an unfamiliar public repo in under 2 minutes (Milestone 2 demo gate)
3. Publish catch rate: "4/10 real AI-generated diffs had integration gaps Optinum caught; AI wrote no tests for 3 of 4"
