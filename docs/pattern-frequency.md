# Pattern Frequency — AI-Native Bug Evidence

Ranked by number of confirmed external instances. Each instance is a real GitHub issue, PR, or commit
in an AI-assisted or AI-generated repo with a specific, verifiable link.

---

## Rank 1 — config-drift-across-files (7 instances)

The most common AI-native bug. AI edits the live config/code file and forgets the template
(`.env.example`, `config.example.yaml`, `README`, deployment script) that documents it.
Developers following the docs get a broken setup. Often silent — wrong key means undefined,
which falls back to a default or crashes at first use.

| Repo | AI Tool | Gap | Link |
|---|---|---|---|
| `MalikAhmad911/infinite-rankers` | Claude Code (PR author) | `NEON_DATABASE_URL` in example; code reads `DATABASE_URL`. Wrong PORT. | [PR#1](https://github.com/MalikAhmad911/infinite-rankers/pull/1) |
| `theideaiq/monorepo` | Jules (×4 PRs) | Zod schema added `SUPABASE_SERVICE_ROLE_KEY` + `ZAIN_SECRET_KEY`; `.env.example` missing both. Jules fixed this 4 separate times. | [PR#660](https://github.com/theideaiq/monorepo/pull/660) |
| `rogeriosantos/dnchub-app` | Claude (co-author) | DB migration renamed `drivers→employees`; README still says `/api/v1/drivers`, "Driver PIN auth" | [Issue#20](https://github.com/rogeriosantos/dnchub-app/issues/20) |
| `Ih0rd/remnawave-tg-shop` | ChatGPT Codex | `Settings` model references 5 keys absent from `.env.example` | [PR#19](https://github.com/Ih0rd/remnawave-tg-shop/pull/19) |
| `erinversfeldcodes/thestacks` | Claude Code | Code switched `S3_*` → `R2_*`; `.env.example` still documented `S3_*` | [Issue#129](https://github.com/erinversfeldcodes/thestacks/issues/129) |
| `dbbaskette/Worldmind` | Claude (co-author) | `CENTURION_*/STARBLASTER_*` renamed in code; stale in `.env.example`, README, `manifest.yml`, `run.sh` | [Issue#22](https://github.com/dbbaskette/Worldmind/issues/22) |
| `yt-knowledge` *(personal)* | Claude Code | `claude_model` split into `analyzer_model + brain_model`; `config.yaml.example` still has old key | exp-001 |

**Why AI always makes this mistake:** The AI's context window covers the active file being edited.
The example/template file is a documentation artifact — it's not imported, not tested, not in the
diff context. AI edits what's in scope and misses what documents it.

---

## Rank 2 — input-trust-violation (6 instances)

AI generates correct business logic but implements auth at the wrong boundary — client-side only,
session check without ownership check, or no auth at all because the existing codebase has none.
Two subcategories: (A) auth missing entirely, (B) authn present but authz missing.

| Repo | AI Tool | Gap | Severity | Link |
|---|---|---|---|---|
| `assafelovic/gpt-researcher` | AI-first ("built using AI") | Zero auth on all 14 REST endpoints + WebSocket. CVSS 9.8. Every AI-added endpoint inherited the no-auth baseline. | Critical | [Issue#1695](https://github.com/assafelovic/gpt-researcher/issues/1695) |
| `vercel/ai-chatbot` | Vercel (canonical AI template) | `/api/document` POST: session check (authn) present, ownership check (authz) absent. Any user overwrites any document. Thousands of projects forked this template. | High | [PR#929](https://github.com/vercel/ai-chatbot/pull/929) |
| `am225723/quoagent` | Jules | `/api/run`, `/api/approve`, `/api/contacts/*` unprotected. `CRON_SECRET` set in env but never checked. Jules Sentinel wrote the post-mortem. | High | [PR#33](https://github.com/am225723/quoagent/pull/33) |
| `suryaumapathy2812/aether` | Claude + Kilo | `isLoggedIn()` reads localStorage only. No `middleware.ts`. API never sends Authorization header. `localStorage.setItem('aether_token', 'anything')` bypasses guard. | High | [Issue#10](https://github.com/suryaumapathy2812/aether/issues/10) |
| `rentandlend-platform` *(personal)* | Claude Code | `/favorites` SSR renders full page HTML before client-side `useEffect` redirect fires. | Medium | exp-005 |
| `sonai` *(personal)* | Claude Code (OMS) | `time-travel` Edge Function: no caller auth check; anon key (bundled in client) can trigger cron on demand. | Medium | exp-009 |

**Why AI always makes this mistake:** Training data overwhelmingly shows authentication code
(the login/session check) as the auth pattern. Authorization (ownership, role, scope) is
a second layer rarely shown together with the endpoint code. AI implements what it was shown:
"is the user logged in?" — not "is this user allowed to do this to this resource?"

---

## Rank 3 — params-renamed (6 instances)

AI renames a field across type definitions and writers but misses readers of stored/serialized data
or reads in a different code path. Silent: old field name returns undefined, not an error.

| Repo | AI Tool | Gap | Link |
|---|---|---|---|
| `Writewyze/qodo-test-shared-models` | Cursor | `email → emailAddress` rename missed length-check reader on line 29. Cursor Bugbot caught it in its own PR review. | [PR#1](https://github.com/Writewyze/qodo-test-shared-models/pull/1) |
| `langchain-ai/langchain` | Claude tool code | Dispatch builds `{"path": path}`; both `_handle_rename` implementations read `args["old_path"]`. KeyError on every rename. Two classes, same flaw. | [Issue#35852](https://github.com/langchain-ai/langchain/issues/35852) |
| `thomasdavis/omega` | Claude Code (issues filed `@claude`) | Prisma `userId` field missing `@map("user_id")`. Code writes camelCase; DB has snake_case. All reads fail. | [Issue#1005](https://github.com/thomasdavis/omega/issues/1005) |
| `Salk/bloom-desktop` | GitHub Copilot (agent mode) | `accession_id → accession_name` rename broke existing stored DB records and upload mapper. | [Issue#88](https://github.com/Salk-Harnessing-Plants-Initiative/bloom-desktop/issues/88) |
| `rogeriosantos/dnchub-app` | Claude (co-author) | `driver_id → employee_id` migration; API consumers sending `driver_id` get 404. | [Issue#20](https://github.com/rogeriosantos/dnchub-app/issues/20) |
| `daily-cosmos` *(personal)* | Claude Code (OMS) | `primary_label → primary_identity` rename; stored/cached `SystemOutput` objects silently return undefined chip. | exp-002 |

**Why AI always makes this mistake:** AI renames within its context window (the current file, the
current class). Serialized data, API consumers, and cached records live outside that window.
AI verifies the rename compiles and current tests pass — it doesn't simulate what happens to
data already written under the old schema.

---

## Rank 4 — cascade-blindness (4 instances)

AI fixes or changes a function in one file but misses callers in other files that depend on the
old contract. Particularly common in dead-code removal (deletes something that looks unused but
has a cross-file importer) and security fixes (patches one call site, misses another).

| Repo | AI Tool | Gap | Link |
|---|---|---|---|
| `jurjans/ksj-wp-func` | Claude Code | Dead-code removal deleted `get_model()` — looked unused in `function_app.py` but `fb_gen.py` imported it. Two separate restore commits for two separate deletions. | [commit e735faf](https://github.com/jurjans/ksj-wp-func/commit/e735faf677f2f8060b7f100db4265a06444a94ce) |
| `vercel/ai-chatbot` | Vercel | Chat ownership fix applied to chat endpoint; document endpoint (same underlying writer) missed. Second PR weeks later. | [commit c937db3](https://github.com/vercel/ai-chatbot/commit/c937db3) |
| `All-Hands-AI/OpenHands` | OpenHands (AI coding agent) | `validate_api_key` fixed for user identity; `org_id` scoping on the same key missed in `require_permission`. | [Issue#13464](https://github.com/All-Hands-AI/OpenHands/issues/13464) |
| `langchain-ai/langchain` | Claude tool code | Both middleware classes generated from same flawed template — both read `args["old_path"]` while dispatch wrote `args["path"]`. | [Issue#35852](https://github.com/langchain-ai/langchain/issues/35852) |

**Why AI always makes this mistake:** AI operates on the changed file and its direct imports.
Cross-file callers — especially when they import a symbol rather than call through an interface —
are outside the diff context. AI confirms the changed function works correctly in isolation.
It doesn't traverse the upward call graph to find who else depends on the old contract.

---

## Summary

| Rank | Pattern | Instances | Severity floor | Propagation |
|---|---|---|---|---|
| 1 | config-drift-across-files | 7 | Low (silent fallback) | High — every env rename drifts |
| 2 | input-trust-violation | 6 | Critical (CVSS 9.8 confirmed) | Very high — template repos seed downstream |
| 3 | params-renamed | 6 | Medium (silent undefined) | Medium — per-rename |
| 4 | cascade-blindness | 4 | High (auth fixes incomplete) | Medium — per-refactor |

**Total confirmed instances across all 4 patterns: 23**
**AI tools represented: Claude Code, Jules, Cursor, Kilo, ChatGPT Codex, GitHub Copilot**
**Languages: TypeScript, Python, SQL migrations**
