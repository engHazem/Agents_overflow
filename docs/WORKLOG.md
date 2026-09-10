# Worklog

Append-only record of what was built, added, or changed, and why. Newest entry
at the bottom. Decisions and their rationale live in [DESIGN.md](DESIGN.md);
this file tracks **what actually happened**.

Format: each entry gets a date, a scope tag, and a short note. `ADDED`,
`CHANGED`, `REMOVED`, `FIXED`, `DECIDED`, `BLOCKED`.

---

## 2026-09-09

**DECIDED — stack.** TypeScript on Node 24, Fastify + Zod for HTTP, Postgres
with pgvector for relational + FTS + vector in a single engine, Drizzle as the
ORM, Redis + BullMQ for async work, OpenAI `text-embedding-3-large` at 1536
dimensions. npm workspaces for the monorepo. Rationale in DESIGN.md §6.

**DECIDED — search architecture.** Two-tier: exact-signature short circuit
(Tier 0) in front of a hybrid FTS + vector pipeline fused with RRF (Tier 1).
Four choices worth flagging because they are non-obvious:

- Embeddings truncated to 1536 dims — pgvector cannot ANN-index above 2000, so
  the native 3072 would silently degrade every query to a sequential scan.
- Only `status` is a hard filter. Environment and framework are scoring boosts,
  because hard-filtering them would starve the cross-environment confirmations
  the `verified` badge depends on.
- Version conflicts are checked by deterministic semver evaluation, not left to
  a reranker, which does topical matching and cannot reason about numeric
  constraints.
- No cross-encoder in v1 — built behind an interface, enabled once the corpus
  and eval data justify it.

Full reasoning in DESIGN.md §3.

**BLOCKED — D1, local database.** This machine has Node 24 and npm and nothing
else: no Docker, no Docker Desktop, no local Postgres, no WSL, no podman. Pure
domain logic and schema definitions can proceed, but migrations and integration
tests cannot run until a Postgres with pgvector is reachable. Options and
recommendation raised with the user; unresolved.

**ADDED — documentation.** `docs/DESIGN.md` (living decision record) and
`docs/WORKLOG.md` (this file).

**ADDED — monorepo scaffold.** npm workspaces root with shared TypeScript
configuration; `packages/` and `apps/` laid out per DESIGN.md §6. Vitest at the
root, collecting from every workspace. Strict TypeScript including
`noUncheckedIndexedAccess` and `verbatimModuleSyntax`.

**ADDED — `@agents-overflow/core`: the normalizer.** First real component, built
first because Tier 0's signature, the FTS document, and the embedding input all
derive from it (DESIGN.md §3.1).

- `redact.ts` — ordered redaction rules. Order is load-bearing: URLs before
  POSIX paths (or a URL's pathname is mistaken for a path), `node_modules`
  before generic paths (or the failing package name is lost along with the
  user-specific directory). Path rules keep the basename and replace only the
  directory — the failing file's name is signal, its location is not. Every rule
  counts its substitutions, so a shift in redaction counts flags upstream format
  changes early.
- `versions.ts` — pulls version references from the **raw** text, before
  redaction, which destroys some of the contexts they appear in (a pnpm store
  path collapses to a placeholder and takes the version with it). These feed the
  §3.6 precondition check.
- `frames.ts` — stack-frame detection across JS, Python, Rust, Ruby, Java, PHP
  and React component stacks; collapses runaway recursion; extracts the "core".
- `index.ts` — orchestration, sha256 signature, `NORMALIZER_VERSION` stamped on
  every result so a behaviour change can be rolled out as a reindex rather than
  silently serving hashes from two different algorithms.

**CHANGED — signature hashes a narrow core, not the whole trace.** Hashing a
full normalized trace is fragile: identical bugs produce different traces
depending on call depth, async boundaries, bundler wrapping and runtime
truncation, so two agents hitting the same bug would hash differently and Tier 0
would never fire. The signature now covers the error line, genuine continuation
lines, and the top 3 frames. Tests assert a Windows and a Linux trace of the
same missing module produce an identical signature, and that stack depth beyond
the top frames does not affect it.

**FIXED — three bugs caught before they could reach the corpus.** Worth
recording because each would have silently degraded retrieval rather than
failing loudly:

- The ANSI rule was missing its `\x1b` prefix and matched any `[`-plus-letter
  sequence, so it ate `[warn]`, `[info]` and similar log markers. Now built with
  an explicit `RegExp` constructor rather than a literal, to keep control
  characters out of the source.
- `posix_path` re-matched text the `node_modules` rule had just produced,
  stripping the package name that rule exists to preserve.
- The port rule's leading `\b` could never match, because the pattern's
  alternatives begin with `<`, which is not a word character.
- `extractCore` pulled in any two lines following the error line, letting
  unrelated build-log output into the signature — worst exactly where the error
  is buried in a noisy log. Continuation lines are now detected (indentation, or
  Rust/GCC diagnostic markers) instead of assumed.

25 tests passing, typecheck clean.

**DECIDED — D1 resolved: Neon.** Managed Postgres with pgvector available, no
local install, and database branching gives throwaway per-run test databases.
Migrations run over the direct (unpooled) connection — DDL and advisory locks
misbehave through PgBouncer in transaction mode — while the API uses the pooled
one with `prepare: false`, which transaction-mode pooling requires.

**ADDED — `@agents-overflow/db`: schema and initial migration.** 11 tables.
Choices worth recording:

- **`account` is the unit of independence.** N confirmations count only when
  they come from N distinct accounts. Anything finer — per agent instance, per
  API key — can be minted at will by one party, which would make the verified
  badge meaningless. `accountId` is denormalized onto `agent_identity` and
  `attempt_report` so the independence check never costs a three-table join on
  the hottest write path.
- **Anti-gaming lives in the database, not the application.** A unique index on
  `(solution, account, environment)` means one account in one environment gets
  one report row per solution. Re-reporting updates the verdict and bumps
  `report_count`; it never adds weight. No application bug can make a loop count
  twice.
- **`problem.signature` is unique per normalizer version, not globally.** When
  normalization changes, both generations coexist during the reindex instead of
  colliding, so the rollout does not have to be atomic.
- **Solution counters are a cache; `attempt_report` is the source of truth.**
  Ranking reads the counters on every query, so recomputing from the report
  table per request is not viable — but they are recomputable, which matters
  when scoring rules change.
- **`points_ledger` is append-only.** Reputation is derived, never a stored
  counter: scoring rules will change, and a running total can be neither
  re-derived nor audited when someone disputes it. A ledger replays under new
  rules and explains itself line by line. Reversals are compensating rows. A
  unique index makes awards idempotent under worker retries.
- **`retrieval_trace` exists now, before anything queries it**, per DESIGN.md
  §3.11 — every query served before the table exists is a relevance label lost
  permanently.
- **Votes stay separate from attempt reports.** A vote is an opinion; a report
  is an observation from a machine that ran the fix. Merged into one score,
  opinion drowns evidence.

**FIXED — migration gaps drizzle-kit does not emit.** Generated DDL was missing
`CREATE EXTENSION IF NOT EXISTS vector`, so the migration would have failed on a
fresh database at the first `vector(1536)` column. Added, along with CHECK
constraints for `vote.value IN (-1, 1)` and `attempt_report.report_count >= 1`.
The weighted `tsvector` generated column and the HNSW `vector_cosine_ops` index
did generate correctly.

**BLOCKED — migration not yet applied.** Schema and SQL are ready; needs a Neon
connection string in `.env` before `drizzle-kit migrate` can run.

**CHANGED — scope cut to a hackathon proof of concept.** Target is a working
demo, not a production service. Remaining work is now eight items focused on
making the core loop visible: migration, inline embeddings, the search pipeline,
three agent endpoints, two browse endpoints, seed data, the MCP server, and a
demo walkthrough. Details and the full cut list in DESIGN.md §7.

Cut: auth, Redis/BullMQ/workers, secret scanning, publish-time dedupe, the
precondition gate, rate limiting, observability, and the forum endpoints.

Kept despite the cut: the hybrid search pipeline (it is the substance of the
pitch), `retrieval_trace` (cheap now, impossible to backfill), and the
independence rule (it is what makes `verified` mean anything, and it costs
nothing because a unique index already enforces it).

The 11-table schema stays as written rather than being trimmed — it is finished
and typechecks, so cutting it down would cost time and gain nothing. The demo
just leaves most of it unused.

**Nothing built this entry** — scope change only. Prior work stands: normalizer
(25 tests) and schema unchanged.

**CHANGED — priority reordered: deadline is tomorrow, a frontend developer is
waiting.** The API contract became the first deliverable rather than a
by-product, because a person is blocked on its shape while the backend is not
blocked on anything but a connection string.

**ADDED — `@agents-overflow/shared`: the wire contract.** Zod schemas for every
endpoint, exported as types the frontend imports directly. Inputs are forgiving
and outputs strict: agents assemble payloads from whatever context they have, so
a required field an agent cannot fill becomes a request never made — and a query
we never see is worse than one missing its framework name.

**ADDED — `@agents-overflow/core`: ranking and verification.** All pure, all
tested (22 new tests, 47 total).

- `verification.ts` — Wilson lower bound rather than a raw success rate, because
  a raw rate cannot separate evidence from luck: 1-for-1 is 100% and 47-for-50
  is 94%, and ranking the first higher would float every untested guess to the
  top. Confidence scales the bound by a saturating breadth multiplier, so three
  successes across three environments beat ten from one machine. `disputed`
  deliberately overrides `verified` — a fix that stopped working is the most
  important thing to surface, not something to hide behind an old badge.
  Verified requires N=3 distinct owners **and** N=3 distinct environments; one
  party spinning up three machines is one party's word repeated.
- `fusion.ts` — RRF at k=60, with a test pinning the property that makes it
  worth using: a candidate placing 2nd and 3rd across both lists outranks one
  that placed 1st in a single list.
- `environment.ts` — fingerprint hashing. Versions are coarsened to major.minor
  before hashing, otherwise the environment space fragments so finely that the
  badge could be farmed by bumping a patch version three times.
- `embedding.ts` — OpenAI via `fetch`, no SDK. **Every failure path returns
  `null` instead of throwing**, including the timeout, so a provider outage
  degrades search to full-text rather than taking the demo down mid-presentation.
- `fts.ts` — builds an OR-joined `to_tsquery`. Both `websearch_to_tsquery` and
  `plainto_tsquery` AND their terms, so feeding either a whole stack trace
  demands all forty terms appear in one document and silently matches nothing —
  a failure indistinguishable from an empty corpus. Tokenization also strips
  every tsquery metacharacter structurally, so terms cannot carry an injection.

**ADDED — `@agents-overflow/api`: the HTTP service.** Fastify 5, CORS open,
4MB body limit because agents paste whole stack traces and the 1MB default
would reject them.

- `POST /v1/search` — Tier 0 signature short circuit, then FTS + vector + RRF +
  blend. Falls back to full-text alone when embeddings are unavailable and says
  so in a `degraded` field rather than failing.
- `POST /v1/publish` — attaches to an existing problem when the signature
  already exists. Publishing the same error twice is the normal case, not an
  error.
- `POST /v1/report` — recomputes counters from `attempt_report`, which stays the
  source of truth, then updates the cached aggregates and the badge. Returns
  `previousVerification` alongside `verification` so the frontend can animate
  the transition, which is the moment the demo is built around.
- `GET /v1/problems` and `/v1/problems/:id` — the forum view.

Identity is by header (`x-agent-owner`), accounts provisioned on first sight.
No auth at all — noted in the code as the first thing to replace, since any
caller can currently claim any identity.

**CHANGED — fusion runs in TypeScript, not SQL.** DESIGN.md §3.3 specifies a
single SQL round trip. Reusing the already-tested pure function is worth more
than one saved round trip at demo scale. Noted in the code as an optimisation,
not a correctness fix.

**REMOVED — the `env_match` blend term.** I had written it comparing the
caller's environment against `problem.language`, which is meaningless — a
problem has no environment of its own, only the reports confirming it do. Doing
it properly means aggregating each solution's confirmed environments, which is a
real feature rather than a one-liner. Shipping the placeholder would have been
worse than omitting the signal because it would have looked like it worked. Its
0.10 weight folded into relevance.

**ADDED — seed corpus.** 18 problems, 22 solutions, written as an agent would
actually paste them: real stack shapes, absolute paths, line numbers, so the
normalizer is exercised on representative input. Reports are dealt across
distinct owner+environment pairs to produce a genuine spread of badge states —
a corpus where everything is `verified` demonstrates nothing, and one where
nothing is would be worse.

**ADDED — `@agents-overflow/mcp`.** Three tools: `search_solutions`,
`publish_solution`, `report_outcome`. Deliberately logic-free — anything clever
here would duplicate server-side rules and drift from them. Tool descriptions
are written at the agent rather than the reader: "call this FIRST, before trial
and error", "report failures as well as successes".

**ADDED — `docs/API.md`.** Endpoint reference for the frontend developer.

47 tests passing, every workspace builds, every workspace typechecks.

**BLOCKED — nothing has touched a database yet.** Migration, seed, and the
end-to-end loop all wait on a Neon connection string in `.env`. Everything above
is verified only by the type checker and unit tests.

**UNBLOCKED — Neon connected, schema live, full loop running.**

**FIXED — generated column rejected: `array_to_string` is STABLE, not
IMMUTABLE.** Postgres refuses a generated column whose expression is not
immutable, so the `problem` table could not be created at all. Replaced with
`array_to_tsvector(coalesce(tags, ARRAY[]::text[]))`, which is immutable.
Consequence worth remembering: `array_to_tsvector` does not stem or case-fold,
so **tags must be stored lowercase**.

**ADDED — `packages/db/scripts/migrate.mjs`.** `drizzle-kit migrate` wraps a
migration in one transaction and reported the failure without naming the
statement that caused it, which turned a one-line mistake into a guessing game
and a spinner that never terminated. The replacement applies statements
individually and names the failure. It also derives Neon's direct endpoint by
stripping `-pooler` from the host, so only one connection string is needed in
`.env`.

**ADDED — `packages/db/scripts/check.mjs`.** Asserts the things that fail
*silently*: missing pgvector, an absent HNSW index (queries stay correct but
degrade to sequential scans), a `search_doc` that exists but is not generated.

**FIXED — the bug that mattered: signatures did not match across platforms.**
The end-to-end run exposed it — the demo's step 3 should have hit the exact-match
fast path and instead fell through to hybrid search and returned the wrong
problem entirely.

Cause: the `node_modules` rule stripped the directory prefix but left the
remainder in its original form, so Linux produced `ioredis/built/Redis.js` and
Windows `ioredis\built\Redis.js`. Different text, different hash. The fast path
silently missed in precisely the cross-platform case it exists to serve, and
nothing failed loudly — search simply returned worse results.

Fixed by normalizing Windows separators to POSIX before any path rule runs, with
`:` in the lookbehind so the drive-letter separator in `C:\Users` is converted
too — without it that one backslash survives and the Windows path rule never
matches. `posix_path`'s lookbehind was also widened so it stops consuming the
relative remainder of an earlier substitution.

Two regression tests pin it: identical signatures for the same dependency frame
on Windows and Linux, and the full relative path under `node_modules` surviving
intact. 49 tests passing.

**CHANGED — `NORMALIZER_VERSION` 1 → 2** and reseeded. This is the protocol the
schema was built for: signatures are unique per normalizer version, so a
behaviour change is a reindex rather than a silent split-brain.

**CHANGED — seed verification distribution.** The first seed produced 17 of 21
solutions `verified`, which makes the badge look automatic and removes the
contrast the demo depends on. Retuned to 10 verified, 4 corroborated, 6
unverified, 1 disputed. Added `--reset`.

**ADDED — `scripts/demo.mjs`.** Drives and narrates the whole loop: search finds
nothing, publish, a second agent on a different OS hits the exact-match path,
three independent agents report success and the badge climbs
`unverified → corroborated → verified`, then a duplicate report demonstrates
that re-reporting adds no weight.

**ADDED — root scripts**: `migrate`, `db:check`, `seed`, `seed:reset`, `api`,
`demo`.

**Verified end to end.** 18 seeded problems, exact-match path confirmed working
across Windows and Linux traces, badge transitions confirmed, independence rule
confirmed.

**RESOLVED — embeddings enabled.** Endpoint is a self-hosted OpenAI-compatible
service, not OpenAI itself, so `createOpenAIEmbedder` gained a `baseUrl` option
(`OPENAI_BASE_URL`). Verified: honours `dimensions` (1536), returns unit-length
vectors, and the space is meaningful — cosine 0.77 between an error and a
reworded version of it, 0.085 against unrelated text.

Added a truncate-and-renormalize fallback for endpoints that ignore
`dimensions`: `text-embedding-3` is Matryoshka-trained, so a longer vector can
be shortened and rescaled to unit length rather than rejected. Renormalizing is
not optional — a truncated slice is no longer unit-length, and pgvector's cosine
distance assumes it is.

Semantic retrieval confirmed working: a query with no distinctive shared
keywords ranks the right problem first, matched by **both** FTS and vector,
which is exactly the agreement RRF exists to reward.

**FIXED — search latency, 4–7s down to ~2.3s warm; browse 3.8s to ~1.3s.**
Measured per stage rather than guessed, which mattered — the obvious suspect was
wrong.

- **The real cost was `select()`.** `SELECT * FROM problem` took **1.9s for 19
  rows** because it fetches `embedding` (1536 floats per row, serialized as
  text), the `tsvector`, and `embed_input` — none of which any response uses.
  Replaced with explicit column lists on every problem read. This scales with
  corpus size, so it would have grown into the entire latency budget.
- **Identity resolution cost 3 round trips per request.** `resolveActor` upserts
  account, key and identity every time, and against a database in another region
  that dominated the request. Now cached per process, along with environment
  resolution.
- **Browse ran a separate `COUNT`.** Folded into the main query as
  `count(*) over()`.
- Embedding timeout raised 10s → 25s. Measured provider latency is 0.9–10.5s, so
  a 10s timeout sat exactly on the boundary and would drop vector search
  intermittently while reporting itself as degraded for no real reason.
- Added an in-memory query embedding cache. Confirmed hitting via
  `retrieval_trace.embedding_cache_hit`.

Remaining ~2.3s is roughly six round trips to `us-east-2` plus a variable
embedding call. Reducing it further means restructuring the pipeline into fewer
queries, which is the SQL-CTE fusion already noted as a later optimisation.

**FIXED — the demo polluted itself on re-runs.** The run id was in the file
path, which the normalizer strips by design, so every run produced an identical
signature, rediscovered the previous run's problem, and started step 4 already
verified — never showing the badge transition, which is the entire point. Moved
the run id into the hostname, which survives normalization. The demo is now
repeatable and shows the full arc every time.

**State: working end to end.** 19 problems, embeddings on, exact-match path
confirmed across Windows and Linux traces, badge transitions confirmed,
independence rule confirmed, 49 tests passing.

**ADDED — `scripts/mcp-smoke.mjs`.** The MCP server had been built and
typechecked but never actually run, which proves nothing about whether it
starts, advertises its tools, or reaches the API. The smoke test speaks JSON-RPC
over stdio the way a real client does — initialize, `tools/list`, then a real
`tools/call`. Passing: all three tools advertised, and a live search returning
ranked hits matched by both retrieval methods.

**All eight demo-scope items are now complete and verified by execution rather
than by type checking.** Still outstanding for a real product, unchanged from
DESIGN.md §7: auth, secret scanning, publish-time dedupe, the precondition gate,
workers, rate limiting, the cross-encoder, and the human forum endpoints.

## 2026-09-10

**ADDED — frontend integrated with the real backend.** React 19 + TypeScript +
Redux Toolkit + Axios + TanStack React Query, existing UI preserved. Full
breakdown in [FRONTEND_INTEGRATION.md](FRONTEND_INTEGRATION.md).

Wired and verified in a browser against the live API: search (with the
exact-signature path visible), solution detail, publish, and — the important one
— **report outcome**, which moved a solution from 6 to 7 confirmations and
refreshed the badge in place via cache invalidation.

**REMOVED — mock data.** Every hardcoded array in the pages that had a backend
equivalent. The rest is now an honest empty state naming the missing endpoint
rather than a plausible-looking number.

**DECIDED — savings figures removed rather than estimated.** Tokens saved, cost
avoided and time saved appeared in six places across the landing page, home
dashboard, search results and solution detail. The backend tracks no usage data
at all, so every one of those numbers would have been invented. Computing them
client-side would mean inventing a baseline too, and "18.4K tokens saved" reads
as a measurement however it is captioned — it is also precisely the figure a
judge or customer repeats back. They now read "not tracked yet".

**DECIDED — no optimistic update on the report mutation.** The badge transition
is computed server-side from independence rules the client does not model
(distinct owners AND distinct environments). Guessing locally risks showing
"verified" for a report that did not count. Waiting for the real answer costs
one round trip and is always right.

**DECIDED — the web client reports a single `web` environment.** A browser
cannot discover the OS, runtime or package versions of the project actually
being fixed, and the backend counts distinct environments to decide
verification. Sending a guessed fingerprint would corrupt the count the badge
depends on. Agents reporting through MCP send their real environment.

**NOTED — auth is the owner handle.** The backend has no authentication; it
identifies callers by `x-agent-owner` and provisions accounts on sight. Signing
in therefore chooses that handle, which is a real mechanism rather than a
placeholder — it is the independence key. `authSlice` is shaped like a normal
auth slice so that only its reducers and the Axios interceptor change when real
auth lands.

**BLOCKED — features with no backend endpoint.** AI chat, savings metrics, agent
dashboard/profile, leaderboard, notifications, moderation, comments, votes,
bookmarks, per-report replication history, and a real tags endpoint. None were
faked. Ranked by unblocking value in FRONTEND_INTEGRATION.md.

**NOTED — pnpm unavailable on this machine.** `corepack enable` needs
administrator rights on Windows, and `corepack pnpm` hangs on its download
prompt with no stdin. npm was used locally; `frontend/package-lock.json` is
gitignored so `pnpm-lock.yaml` stays canonical.

Frontend build passes, TypeScript clean, backend tests still 49 passing.

**ADDED — LLM chat, grounded in the knowledge base.** `POST /v1/chat`, with the
model key held server-side. Two modes:

- **Problem-scoped** — the "Ask AI about this problem" thread now sitting in the
  discussion area of every problem page. The user asks, the site's assistant
  answers from that problem's own solutions and verification evidence.
- **Corpus-wide** — omit `problemId` and the server runs the existing search
  pipeline first, then answers from the top entries. This is retrieval before
  generation, which is what keeps a general question grounded in published
  solutions rather than the model's own recollection.

**The grounding rules matter more than the model.** The system prompt renders
evidence as explicit numbers rather than prose, and forbids inventing
verification counts, replication numbers, environments, dates or savings. The
product rests on those counts being trustworthy — a confident "confirmed 31
times" that nobody measured would do more damage than an unanswered question.
It is also told to say when the knowledge base does not cover something instead
of answering from general knowledge, and to flag version conflicts between the
caller's environment and a solution's `requires` constraints.

Verified against the live endpoint in both modes, and end to end through the UI:
asking "Solve this for me" on the Docker port problem returned the real fix,
correctly citing "verified by 4 independent agents across 4 distinct
environments" — figures that match the database.

Responses carry `sources` (which entries the answer drew on, with their
verification state) so the UI can cite rather than assert.

**FIXED — blank page after a reload while signed in.** The session persists but
the current page does not, so a reload left an authenticated user on `landing`
— a value the signed-in shell has no branch for, rendering an empty `<main>`.
Anyone refreshing saw a blank screen.

**FIXED — duplicate React keys in search results.** The fragment wrapping each
result row pair carried no key, so React warned on every render and row identity
was unstable across re-sorts.

**REMOVED — the last fabricated statistic.** The top bar's "4.82M tokens saved"
now shows the real problem count.

Frontend build and TypeScript pass; backend tests still 49 passing.

## 2026-09-10

**FIXED — search relevance. Three separate causes, found by measuring rather
than guessing.**

Symptom: searching a Postgres `ECONNREFUSED` returned "Cannot find module" as
the top hit, and the correct entry did not make the top three. Instrumenting
each retrieval stage separately showed vector search was fine — the correct
answer ranked **2nd of 20** — so the fault was downstream.

**1. The full-text query was built from stack frames.** For that query the
tsquery was `error | connect | econnrefused | tcpconnectwrap | afterconnect |
oncomplete | node | net | node_modules | lib | client`. Exactly one of eleven
terms identified the error; the rest is frame machinery that appears in every
document containing a Node stack trace, which in a corpus of JavaScript errors
is most of them. The correct answer ranked 15th of 16, behind entries that
merely shared the word `connect`.

`buildTsQuery` now takes terms from the error message and only falls back to
frames when the message yields fewer than three. Selecting by *line* rather than
by a stopword list is the point: `module` is noise inside `at Module._load` but
is the entire signal in "Cannot find module", and no blanket stopword list can
tell those apart.

**2. RRF scores were normalized by dividing by the maximum.** RRF at k=60 is
deliberately flat — rank 1 scores 1/61, rank 20 scores 1/80 — so dividing by the
max compressed the whole candidate set into roughly 0.76-1.0. After the 0.75
relevance weight that is a spread of about 0.18, *smaller* than the 0.20 the
confidence term can swing. Verification evidence was therefore outvoting
relevance outright rather than breaking ties within it: a well-confirmed CORS
solution ranked above the correct answer for a database query purely on
confirmation count. Now min-max normalized across the observed range.

**3. Both retrieval lists returned nearly the whole corpus.** ANN search returns
the *nearest* rows whether or not they are related, and an OR-joined tsquery
matches almost anything, so with 20 documents both lists held ~16 of them and
RRF was ranking noise. Added a cosine-distance ceiling of 0.62 to the vector
list. Measured separation on this corpus is clean — related problems sit at
0.40-0.48, unrelated ones start around 0.64 — but it is a recall/precision
trade, so it is a named constant to be tuned against the retrieval traces.

Result across three probe queries:

| Query | Before | After |
|---|---|---|
| Postgres / Prisma connection | 3rd | **1st** |
| CORS | 1st | **1st**, unrelated hits cut from 3 to 2 |
| Missing module | — | **1st**, related module errors following |

60 tests passing, including regression tests for the frame-noise and
normalization bugs.

**Worth noting for later:** none of this was reachable by type checking or by
the unit tests as they stood. It surfaced only from using the service as an
agent would, through the MCP tools, against real data.

**ADDED — Feature 2 foundations: secret scanning and the reviewer agent.**

`packages/core/src/review/secrets.ts` — pattern-based credential detection.
Runs **before** anything is persisted and **before** the AI reviewer, and uses
no model at all. That ordering is the whole point: an AI reviewer can be talked
out of its instructions by text inside the submission it is reviewing, and a
leaked credential is public the moment it is stored. The one check whose failure
is unrecoverable is the one check that never depends on judgement.

Covers AWS, GitHub, OpenAI/Anthropic, Google, Slack, Stripe, private key blocks,
JWTs, credentials inside connection strings, assigned secrets, and personal home
directories. Deliberately biased toward false positives — wrongly flagging a
post costs one round trip, wrongly publishing a live key costs someone their
account. Placeholder-aware, so `sk-YOUR_KEY_HERE`, `password@localhost` and
`process.env.DB_PASSWORD` do not trip it. Findings never contain the secret.

`packages/core/src/review/reviewer.ts` — deterministic checks then AI judgement.
Prompt injection is the design constraint, not an afterthought:

- Submitted text is never concatenated into instructions; it arrives inside
  blocks fenced with a **random per-request delimiter**, so a submission cannot
  forge the terminator and escape into instruction context.
- The reply must parse into a fixed shape. Anything unparseable is a failure,
  not an approval — otherwise "break the parser" becomes a way to publish
  anything.
- Every error path returns `needs_human`, never `approved`. A reviewer that
  cannot be reached must not become one that waves everything through.
- An approval that also reports an injection attempt is downgraded to
  `needs_human`, because it contradicts itself.

Dangerous commands (`rm -rf /`, `curl | sh`, fork bombs, `DROP DATABASE`) are
matched in code, not left to the model — "is this destructive" has a definite
answer. The patterns key on the *target*, so `rm -rf node_modules`, which is the
correct fix for a great many problems, passes.

When static checks block, the model is never called: there is nothing for it to
add, and asking invites it to disagree.

**ADDED — Feature 1 foundations: `kind` and per-stack implementations.**

`problem.kind` is `error` or `task`, defaulted to `error` so existing rows keep
their meaning. `problem.signature` is now nullable, since a task has no error
text — with a **partial** unique index so any number of tasks can coexist, and a
CHECK constraint that an `error` must have a signature while a `task` must not.

New `implementation` table: one row per technology stack under a solution, with
its own body, commands, version constraints **and its own verification
counters**. A plan and its implementations succeed independently, and "seven
agents followed the plan, but the Go version keeps failing" is a precise
statement a single shared counter could not express.

**ADDED — auth schema.** `auth_identity` and `session`. Identities are a
separate table rather than columns on `account` because someone signing in with
GitHub today and Google tomorrow must land on the *same* account — otherwise
they would look like two independent parties and could corroborate their own
solutions, which is exactly what the verification rules exist to prevent. Only
session token *hashes* are stored.

**FIXED — two migration hazards drizzle-kit does not handle.**

- Existing rows would have taken the new `pending_review` default, hiding the
  entire published corpus the moment the review gate is enforced. The migration
  now backfills them to `approved`.
- Dropping and re-adding the generated `search_doc` column takes its GIN index
  with it, and the rebuild is not emitted. Full-text search would have silently
  degraded to sequential scans. Verified missing on the live database,
  recreated, and the rebuild added to the migration so a fresh install is not
  affected.

99 tests passing. 15 tables. Migration applied to Neon.

**ADDED — sign-in with GitHub and Google.**

`packages/core/src/auth/oauth.ts` holds the parts that are pure logic, so the
security-critical pieces are testable without an HTTP server or a provider
round trip. `apps/api/src/auth.ts` holds the flow.

Three things designed in rather than bolted on:

- **CSRF on the callback.** Anyone can point a victim's browser at our callback
  URL with a code of their choosing, which would log the victim into the
  *attacker's* account. The `state` parameter is an HMAC over a nonce and issue
  time rather than an opaque random string, so it needs no storage and no
  cleanup, and it expires. Verified with a constant-time compare, length checked
  first because `timingSafeEqual` throws on a mismatch — which would itself leak
  length.
- **Open redirects.** `returnTo` is validated against our own origin before use.
  An open redirect on a login route is a phishing primitive: sign in on the real
  site, get bounced to a copy, and the address bar looked right throughout.
- **Account linking by *verified* email only.** Signing in with GitHub and later
  with Google must land on one account. Linking on an unverified address would
  let anyone claim someone else's account by signing up elsewhere with their
  address. GitHub needs a second API call for this, since `/user` omits a
  private address.

Session tokens are 256 bits of entropy, stored only as a SHA-256 hash — a
leaked database must not hand over live sessions. Plain SHA-256 rather than a
password hash, because there is nothing to brute-force and nothing to slow down.
Sign-out revokes rather than deletes, so it stays auditable.

The cookie is `sameSite: lax`, not `strict`: the browser arrives from the
provider's domain, and `strict` would drop the cookie on exactly that
navigation.

CORS now reflects the origin and sets `credentials: true` — the session cookie
is not sent otherwise, and the spec forbids combining credentials with a
wildcard origin.

Handle collisions are resolved on account creation, because the handle is the
independence key and two people called "Ada Lovelace" must not share one.

Verified against the live server: both providers redirect correctly; a forged
state, a missing code, and a provider-side refusal each land on a specific
`auth_error` rather than a stack trace; an off-origin `returnTo` is silently
dropped.

**ADDED — `scripts/check-env.mjs`.** Reports which variables are configured
without printing values.

**INCIDENT — OAuth credentials were pasted into `.env.example`.** That file is
committed; `.env` is the gitignored one. Caught before the change was committed,
so nothing reached GitHub and no rotation was needed. Values moved to `.env`,
placeholders restored, and the committed file verified clean. The env checker
above exists so "did that save to the right file?" has an answer that does not
involve opening a file full of credentials.

117 tests passing.

**COMPLETED — the four requested features are wired end to end.**

*Feature 2 — review on the publish path.* Secret scanning runs first and
refuses outright rather than redacting and storing: quietly stripping a
credential teaches the author nothing and leaves the key live. Dangerous
commands are refused next. Only then does the AI reviewer run, and its verdict
sets `review_status` on the problem, the solution and every implementation. The
decision is written to `review` as an append-only row, so a later human override
is a new row and the evidence that justifies it survives.

*Feature 1 — tasks and implementations.* `publish` accepts `kind: 'task'` with
a technology-free plan plus per-stack implementations. Validation is expressed
as two refinements rather than field-level rules, so the error message can say
which of the two constraints was broken: an error needs its error text, a task
needs at least one implementation. `report` accepts an `implementationId` and
recomputes that implementation's counters separately from its plan's.

Stack keys are normalized on write — "Node + Fastify", "node+fastify" and
"Fastify / Node" collapse to one row rather than three spellings of the same
thing.

*Onboarding.* `GET /v1/setup?client=…` generates the actual files and steps for
Claude Code, Claude Desktop, Cursor, Windsurf, VS Code Copilot, and a flagged
generic fallback. Generated server-side because the config contains the absolute
path to the MCP server on *this* machine; hardcoding it in the frontend would
produce a config that looks right and silently does nothing. VS Code nests the
same object under `servers` rather than `mcpServers`, which is the sort of
detail that costs an afternoon.

Every guide ends with a verification step and a description of what failure
looks like, because a failed connection is silent: an agent with no tools
behaves exactly like one that chose not to use them.

*Frontend.* Real GitHub and Google buttons, rendered only for providers the
server actually has configured. A "Connect your agent" page with a client
picker, copy buttons, and the notes. Sidebar entry added.

**FIXED — asking "am I signed in?" signed the user out.** The global 401
interceptor dispatches `signedOut`, which is right for an expired session and
wrong for `/v1/auth/me`, where 401 is the normal answer for a visitor who never
signed in. The symptom was sidebar clicks bouncing back to the landing page.
That endpoint is now exempt from the handler.

**FIXED — the two sign-in paths were indistinguishable.** Someone who chose
"continue without signing in" has no server session by definition, so the
`/v1/auth/me` probe was undoing their choice. `authSlice` now records whether
the session came from a provider or a local handle, and only a provider session
can be cleared by that probe.

**ADDED — `scripts/verify-features.mjs`.** 20 end-to-end checks covering the
paths that are easy to believe work when they do not: a credential must be
refused, a dangerous command must be refused, a task must reject a missing
implementation, an implementation must gather its own evidence, every client's
generated config must contain an absolute path, and an unauthenticated caller
must be rejected. All 20 pass.

117 unit tests, 20 integration checks, frontend and backend build clean.

**FIXED — a successful sign-in looked like nothing happened.**

Symptom: choosing a Google account completed, the browser came back, and the
site never showed a name. It looked like the login had failed.

It had not. The database held two live sessions and a linked Google identity —
the OAuth flow worked end to end. The fault was one missing line in the frontend:
**Axios does not attach cookies to cross-origin requests unless
`withCredentials` is set.** The API is on `:3000` and the app on `:5173`, so the
session cookie was written correctly by the callback and then never sent again.
`/v1/auth/me` answered 401 forever.

This is a two-sided handshake and both halves are easy to get half-right: the
server needs `credentials: true` on CORS (already done, which is why nothing
errored) and the client needs `withCredentials`. With only the server half, a
login silently no-ops.

**CHANGED — sign-in is now required.**

The handle-only path ("continue without signing in") is gone, along with the
"Get started" button that bypassed authentication. Both entry points now lead to
a real sign-in page.

The reason is not gatekeeping. Everything an agent publishes is attributed to an
account, and the account is what the verification rules count as an independent
party. A self-chosen handle meant two people could pick the same one and
unknowingly corroborate each other — which is exactly what the `verified` badge
exists to rule out. It also meant contributions could not be credited to anyone.

**ADDED — a real sign-in page**, and a third app state. The session is resolved
by asking the server, so on first paint we do not yet know whether someone is
signed in; rendering the signed-out view during that moment would flash the
sign-in page at someone who is already authenticated. Loading, signed out, and
signed in are now distinct.

**FIXED — the sidebar showed a hardcoded user and a dead sign-out button.** It
now shows the real name and avatar, says whether the session came from a
provider, and signs out for real.

**REMOVED — the moderation page, and human review with it.** The AI reviewer is
now the only reviewer.

This required deciding what happens to submissions the reviewer cannot judge.
`needs_human` was a queue nobody would ever work, so a submission landing there
would have been hidden forever. Two changes make that safe:

- **One retry, with a fresh delimiter.** The undecidable cases are
  overwhelmingly transient — the endpoint was briefly unreachable, or the model
  wrapped its JSON in prose. Not more than one retry: a genuinely confused model
  does not become less confused by being asked five times.
- **An undecidable submission is published and marked, not hidden.** By the time
  the AI stage runs, the checks that actually protect people — secret scanning
  and dangerous commands — have already passed deterministically. What is
  missing is quality judgement, and losing good contributions every time the
  endpoint hiccups is the worse failure.

`rejected` and `changes_requested` still block, and both return their reasons so
an agent can revise and resubmit.

**FIXED — the reviewer was rejecting correct submissions for being specific.**

It refused a Node port-conflict fix as "not generalizable" and objected that
`lsof` is Unix-specific — in a fix for a particular error, where naming the exact
command is the entire point. It also flagged a general plan for using the words
"endpoint" and "credentials", which are concepts rather than technologies.

The prompt had mentioned that errors may be technology-specific, but still
listed generality among the criteria, so the model reached for it anyway.
Mentioning a rule and then excusing it is not enough: the criterion is now
absent entirely for `error` submissions, and the prompt states outright that
specificity must never be raised as an issue for them.

Also added an explicit bar — request changes only for problems that would
mislead a reader or make the solution fail — with the reason stated: there is no
human moderator behind the reviewer, so a refusal is final.

**Worth recording: the reviewer then caught a real defect in my own test
fixture.** A publish check kept failing, and the reviewer's explanation was that
the error named one port while the command named another. It was right, three
times out of three, with the same reasoning. The test data was wrong, not the
code.

121 unit tests, 20 integration checks, all passing.

**CHANGED — publishing and verifying are agent-only.**

The human "Did this work for you?" buttons and the whole Submit Solution page
are gone, and the API refuses both from the website.

The reason is what the badge is supposed to mean. `verified` claims that
independent agents ran the fix in their own environments; a person clicking a
button has run nothing, and counting it would turn the badge into a measure of
enthusiasm rather than evidence.

The guard keys on the **session cookie** — the website has one, an MCP server
does not. That is deliberately a positive signal rather than a negative one:
checking for a missing `x-agent-name` header would let anyone bypass the rule by
adding it, whereas a browser cannot easily stop sending its own cookie.

**REMOVED — the Agents section, API docs, and Submit Solution.** All four pages
were mock data with no backend. `docs/API.md` remains for anyone integrating.

**ADDED — My Agents.** `GET /v1/me/agents` counts activity **per agent, not per
account**: someone running three agents needs to see which is contributing and
which only ever consumes, and an account-level total hides exactly that. The
counts use correlated subqueries rather than joins, because joining three
one-to-many relationships multiplies rows and inflates every figure.

**ADDED — a real leaderboard.** People ranked by what their agents contributed,
each shown with the fleet they run. Verified work is weighted ten times a
publish and thirty times a report: publishing is cheap and reporting is cheaper,
while getting something confirmed by *other people's* agents is the only part
that cannot be self-dealt. A flat count would rank a prolific agent above a
careful one.

**ADDED — Gemini support in onboarding.** Gemini CLI (`~/.gemini/settings.json`)
and Gemini Code Assist (`.gemini/settings.json`), both merges rather than new
files since those hold other settings too.

Also fixed a quieter onboarding bug while there: every client was being told to
write `CLAUDE.md`. Each reads its own instructions file — `GEMINI.md`,
`.cursor/rules/`, `.github/copilot-instructions.md`, `.windsurfrules` — and
writing the wrong one fails silently in the worst way: the tools connect, the
agent never reaches for them, and the service looks useless.

**FIXED — a guard that was defined but never called.** The agent-only check was
inserted into the source by a CRLF-sensitive replacement that silently matched
nothing, so the function existed and no route used it. Caught by testing the
endpoint rather than by reading the diff: a browser publish sailed through to
the reviewer.

125 unit tests, 20 integration checks, all passing.

**CHANGED — connecting an agent is one command.**

The setup page had drifted into instructions: assemble two files, work out where
each lives on your platform, get an absolute path right. That is more steps than
the manual walkthrough it replaced, and every mistake in it fails silently.

`scripts/connect-agent.mjs` now does it. Run it from the project you want to
connect and it fetches the guide from the running API — so the server path is
correct for that machine rather than copied from a page — and writes both files.
The page leads with that command; the file contents are behind a toggle for
anyone who prefers to do it by hand.

**FIXED — the connect script destroyed existing MCP configuration.**

Cursor's config is declared `action: 'create'`, and the script took that
literally: running it in a project that already had another MCP server wiped
that server out.

`action` describes the usual case for a person reading instructions — "you
probably do not have this file yet". It is not permission for a script to
overwrite one that does exist. The script now merges whenever the file is there,
whatever the guide called it, and re-running is idempotent.

Caught by running it against a config that already had another server in it,
which is the only way this shows up: with an empty directory it looks perfect.

**CHANGED — the Connect page is now a complete, ordered walkthrough.**

Five numbered stages, all visible: pick your agent, set it up, restart, check it
worked, and what to do when it did not. Nothing important is behind a toggle —
the earlier version hid the file contents, which made the page feel like a
teaser rather than instructions.

The two genuinely different routes sit as tabs rather than one being hidden:
**one command** or **write the files myself**. They produce identical results, so
neither is a fallback for the other.

**ADDED — symptom-first troubleshooting**, generated per client so it names that
client's real config path. Five entries, each a failure this setup actually
produces:

- the agent never searches (tools did not load — the expected failure, since
  nothing errors)
- the agent has the tools but ignores them (the instructions file is what makes
  it reach for them; configuration alone does not)
- tool calls fail to connect (the API URL is baked into the config, not
  discovered)
- the server does not start (path wrong, or never built)
- confirmations never advance verification (two people sharing an owner handle
  count as one party)

**FIXED — the one-command box rendered empty.** `connectScriptPath` was defined
in config and never passed to `buildSetupGuide`, so the command string was blank
and the page's primary call to action showed nothing.

This is the **second** time a multi-line string replacement silently matched
nothing against this repository's CRLF line endings — the same failure produced
a guard that was defined but never called. Both passed type checking, because in
each case the code was valid and simply absent. Not using that technique here
again.

**ADDED — download buttons for the config files.**

The one-command route only works for someone who has cloned this repository,
because the command runs a script out of it. For everyone else the command fails
with "file not found", which is a confusing way to discover a prerequisite. That
requirement is now stated on the tab rather than left to be found.

Downloads are the route that works for anybody: built in the browser from text
the page already has, so they need no endpoint and no local checkout.

Each file now also states where to save it. Browsers ignore a path in the
download attribute and save under the bare filename, so `.cursor/mcp.json`
arrives as `mcp.json` in the downloads folder. Leaving that implicit would put
the file in the wrong place with no error — the same silent failure this whole
page exists to prevent.

Tabs reordered so downloading comes first, since it is the route with no
prerequisites.

**CHANGED — generated configs can use `npx` instead of an absolute path.**

The absolute path was defensible locally and wrong for distribution. Relative
paths are not the alternative: MCP clients resolve them against *their own*
working directory, which varies by client and by how it was launched, so a
relative path resolves to nothing and the tools fail to load without an error.
Absolute is the lesser evil on one machine.

But it is only ever correct on the machine that generated it. A config
downloaded from a deployed site would point at a directory the reader does not
have — and, being a path that simply is not there, would fail silently in the
same way.

`MCP_PACKAGE_NAME` fixes that. Set it and every generated config switches to
`npx -y <package>`, which works anywhere and needs no checkout. Until it is set,
the page says outright that the config only works on the machine running the
API, rather than leaving that to be discovered.

Verified both forms: unset gives the path plus the warning; set gives
`npx -y agents-overflow-mcp` and drops the warning.

Publishing the server to npm is job 6 in the roadmap. This makes the site
correct the moment that happens, with no code change — only an environment
variable.

**CHANGED — agents now connect with a URL. The absolute path is gone.**

The path was the real problem with this page, and no amount of rewording fixed
it: it only ever worked on the machine that generated it, and getting it wrong
failed silently.

The service is already an HTTP API, and MCP has an HTTP transport, so the server
is now mounted at `POST /mcp` on the API itself. For every client that can take
a URL, the whole configuration is:

```json
{ "mcpServers": { "agents-overflow": { "type": "http", "url": "…/mcp?owner=you" } } }
```

Nothing to install, nothing to keep up to date, no path, and no local checkout.
Six of the eight supported clients get this. Claude Desktop and unknown clients
still launch a local server over stdio, so they keep the path — and now they are
the only ones carrying that warning.

The endpoint is stateless: a fresh server and transport per request, no session
store. The tools are pass-throughs to endpoints that already exist, so there is
no per-connection state worth keeping, and statelessness means the API can sit
behind a load balancer without sticky sessions.

The tools moved to `apps/mcp/src/tools.ts` and are shared by both transports.
They must be identical either way, so they no longer live in whichever
entrypoint happened to be written first.

The owner travels in the query string. It is the independence key and a URL is
the only thing every client can carry, which makes it exactly as spoofable as
the header it becomes — the same trust level the rest of the service operates
at today. Personal keys are the fix and are on the roadmap.

**CHANGED — the Connect page lost its alternative routes.** With a three-line
config there is nothing for a setup script to save anyone, so the tabs are gone
and the page is one path in order: pick your agent, add two files, restart,
check, troubleshoot.

**ADDED — `npm run mcp:smoke:http`**, proving the URL path end to end:
initialize, list tools, and a real search returning ranked results.

**FIXED — the Connect page could serve a stale config.**

The setup guide was cached for five minutes. That is wrong for this particular
data: the config embeds the API URL and the owner handle, so a stale copy is not
merely out of date — it is a file that looks correct and connects to nothing.
Someone reading the page while the server changed underneath them would copy
yesterday's answer and spend the evening debugging it.

Now fetched fresh on every mount. The request is cheap; a wrong config is not.

This is the likely explanation for a report of an absolute path still appearing
after the switch to URL configs: the server was already returning the URL form
while the page was still showing what it had cached.

**ADDED — `npm run check:connection`.**

Everything up to now verified that we *produced* a config file. Nothing verified
that the file *works*. This reads it the way a client does — from disk, using
only what is in it — finds the `agents-overflow` entry across every supported
client's config location, and completes a real MCP handshake against whatever
URL it finds.

It also catches the specific failure worth catching: a stdio entry whose server
path does not exist. That is the case where an agent silently has no tools, and
the check says so outright rather than leaving it to be inferred.

It is now the first verification step on the page, ahead of "give your agent a
real error", because it fails loudly where the agent fails silently.

---

## 2026-09-10

Revision pass over the whole connect path, after the switch to URL transport
left the frontend, the scripts and the docs describing the previous design.

**FIXED — the Connect page never showed the fastest route.** The generator has
produced client-native commands (`claude mcp add`, `gemini mcp add`,
`code --add-mcp`) since the URL transport landed, with a comment explaining they
are offered first because assembling a file by hand is where people give up. The
page rendered none of it: `quickStart` was in the response and absent from the
UI, and the frontend's `SetupGuide` type still described the old single-command
shape, so nothing flagged the drift.

The page now leads with the endpoint itself — one URL, owner already in it —
then offers the two routes as tabs: the command that writes the file, or the
file with its destination spelled out per OS. Also newly rendered: `locations`
(the absolute config path for each operating system, rather than a `~/…` the
reader has to expand), `transport`, `apiUrl`, and the placeholder-owner warning
for anyone who is not signed in.

These tabs are not the ones removed earlier. That pair was "run our setup
script" versus "write the files yourself", and the script route deserved to go —
it needed a checkout of this repository. This pair is the client's own command
versus the file it writes, and both work from a bare machine.

**FIXED — a sub-path in the API URL was silently dropped.** `new URL('/mcp',
'https://host/api/')` resolves to `https://host/mcp`: the leading slash discards
the base path. Any deployment behind a proxy that mounts the API under a prefix
— the normal shape — handed every reader a URL that 404s. Now resolved relative
to the base, and the API URL is normalized once so appending `/health` cannot
produce a double slash.

**FIXED — the VS Code Windows command was a copy of the POSIX one.** Two
commands, labelled by OS, byte-for-byte identical: the `\"` escaping meant to
survive into the output collapsed inside the template literal. PowerShell strips
the inner quotes when passing a single-quoted blob to a native executable, so
Windows readers were handed something `code` receives as non-JSON. The escaping
is doubled now, and a test asserts the two differ — the kind of defect that only
reveals itself on the platform nobody tested.

**CHANGED — `steps` covers only the config file.** It also carried "add the
protocol" and "restart", both of which apply on either route, so the page showed
them twice. `restart` is its own field now, and the protocol file is its own
section. One fact, one place.

**ADDED — 97 tests for the setup generator**, which had none despite being the
module most exposed to readers on other machines. The invariant worth pinning is
portability: no output may reference this host's filesystem. The rest cover the
dialect table per client (`url` / `serverUrl` / `httpUrl`, `mcpServers` /
`servers`), the bridge, the placeholder owner, and the localhost warning being
hostname-checked rather than substring-matched. 220 tests passing.

**FIXED — the OAuth callback used the internal address.** `publicBaseUrl` was
introduced for exactly the values that end up in other people's hands, and its
own doc comment names the OAuth callback as one of them, but `auth.ts` still
built the callback from `apiBaseUrl`. Behind a proxy that is wrong twice over:
the browser cannot resolve it, and it will not match the URI registered with the
provider.

**FIXED — `check:connection` misread two configs.** It looked for `url` and
`httpUrl` but not `serverUrl`, so a correct Windsurf config was reported as
broken — sending someone to fix what was never wrong. And for an `npx -y
mcp-remote <url>` entry it printed a green "the server file exists" having
checked nothing, which is the one thing this script must never do. It now tests
the bridged URL for real, says plainly when it cannot verify an entry, and looks
in Claude Desktop's three locations.

**CHANGED — `agent-config.mjs` delegates to the shared generator.** It hand-
rolled a path-based stdio config, which is the shape the service moved away
from. It now supports every client through `buildSetupGuide`, so there is one
dialect table rather than two that drift. Registered as `npm run agent:config`.
Config on stdout, everything else on stderr, so a redirect gives a usable file —
with `--silent`, since npm's own banner goes to stdout and would otherwise land
in the JSON.

**CHANGED — this repo connects by URL too.** The committed `.mcp.json` still
launched `./apps/mcp/dist/index.js` over stdio: the exact shape the Connect page
now tells everyone to avoid, in the one file every contributor sees first. It
points at `/mcp` like everybody else. A stopped API now shows up as a failed
connection instead of a server that starts and has nothing to talk to.

**FIXED — `mcp:smoke` blamed itself for a service that was not running.** With
the API down, `initialize` and `tools/list` are answered locally, so the run
printed two green lines and then `Unexpected token e in JSON at position 1` —
the API's plain-text error meeting `JSON.parse`. It preflights `/health` and says
what is actually wrong, and a non-JSON tool response is now quoted rather than
replaced by a parse error.

**CHANGED — docs match the code again.** `INTEGRATION.md` documented only the
stdio path and told Claude Desktop users to write an absolute path. It now leads
with the URL, carries the per-client dialect and instructions-file tables, and
explains `PUBLIC_BASE_URL`. `SIMPLE_GUIDE.md` Part 5 still said no account was
needed and showed the path-based config; it now describes the real flow and
narrows the remaining gap to personal API keys. Stale test counts (49) corrected
throughout.

**FIXED — CLAUDE.md listed built features as gaps.** It named secret scanning
and authentication as deliberately not built; both have been in for several
commits, which makes every other claim in that list less trustworthy. Replaced
with what is genuinely missing, plus the gap that matters and was easy to
over-read now that sign-in exists: **agent identity is still not
authenticated.** The `owner` arrives in a query string and is self-asserted, so
verification counts a value anyone can set. Added a convention entry for the
portability invariant the new tests enforce.

**NOT VERIFIED — the frontend was not run.** `.mise.toml` pins Node 22 and this
machine has 18, which Vite 8 refuses. TypeScript typechecks clean against the
updated contract, and the guide output was checked directly against the
generator for all eight clients, but nothing rendered the page.

---

## 2026-09-10 (later)

**ADDED — Feature 3: comments, votes, and proposed edits.** The human side of
the corpus. Everything until now was written by agents and confirmed by machines
that ran the fix; this is the part where a person who knows the thing that went
stale can say so.

Answering the question that prompted it: no, none of this existed. The `comment`
and `vote` tables had been in the schema since the first migration with no
endpoints and no UI, and nothing named proposal or suggestion existed anywhere
in the repository.

**The shape is a pull request, deliberately.** A human does not edit a solution;
they request a change, the reviewer decides, and the request is kept either way.
Three properties fall out of that:

- **Nothing mutates until approval.** An agent that knows better publishes its
  own solution. A human asks. The corpus is machine-verified, and letting an
  unverified human edit overwrite it directly would put opinion on top of
  evidence.
- **A refusal survives.** A declined proposal stays in the thread with the
  reviewer's reasons. "Someone asked for this and it was declined, and here is
  why" is what stops the same proposal arriving again next week.
- **Every version is kept.** `solution_revision` is append-only, so a proposal
  can show the diff against the text its author actually saw, and a bad edit is
  undoable. A revert would be a new version, never a deletion.

**The concurrency problem was the interesting one.** Two people editing step 3 is
normal. If the second edit is applied after the first, it reverts the first and
neither author is told — a silent data loss with no error anywhere. So every
proposal records the `baseVersion` it was written against, and applying one is a
compare-and-swap: `UPDATE solution SET version = base + 1 WHERE version = base`.
The loser is marked `outdated` and told to redo the change. A unique index on
(solution, version) is the backstop if the swap is ever removed. Checked twice —
once cheaply before the reviewer is called, once atomically on apply — because
the reviewer call takes seconds and a lot can land in that window.

**Votes are kept away from verification, and the UI says so.** A vote is an
opinion; an attempt report is an observation from a machine that ran the fix.
Collapsing them into one score would let a popular broken answer outrank a
confirmed one. The vote endpoint is a toggle rather than a setter: sending the
value you already hold retracts it, which is how people expect to undo a vote.

**FIXED — the reviewer rejected every proposal.** Its static checks refuse an
`error` submission with no error text, which is right for a new publication and
fatal for a proposal, because a proposal never carries the error. Every single
proposal came back `missing_error` — a complaint about a field the proposer was
never asked for. Now the problem's normalized error is passed along. Found by
submitting one, not by reading the code.

**ADDED — 32 tests** for the rules, as pure functions in
`packages/core/src/community/`: what a proposal changes (identical text is not a
change; an omitted field means leave it alone, never blank it), staleness, the
verdict mapping, vote arithmetic, and thread assembly — ordering, nesting,
orphan handling, and a deleted comment keeping its place so its replies are not
orphaned. 252 tests passing.

**Verified against the live database**, then reverted. Two accounts, a comment,
a nested reply, vote toggling in both directions, a proposal the reviewer
declined (correctly — it was irrelevant to the problem), one it approved and
applied to version 2, and a second proposal still claiming version 1 that came
back `409 outdated`. The corpus was restored to 50 solutions at version 1 and
the test accounts deleted, so nothing from the run remains.

**CHANGED — the roadmap, and two features removed.** Jobs 13 and 14 — agents
posting questions for other agents, and email notifications — are dropped rather
than deferred, at the user's direction, with the reasoning recorded under
[Dropped](ROADMAP.md#dropped) so nobody re-adds them from an older document. The
short version: an agent's session ends when its task does, so a question posted
on Monday is answered into a conversation nobody is in, and email existed mostly
to deliver those questions.

The roadmap also claimed as unbuilt several things that had shipped. It now
marks jobs 1, 2, 5, 9 and 15 done, and the remaining estimate drops from 43 days
to about 28½. Every remaining dependency runs through something already built,
so nothing left is blocked — the order is now a choice about value, not sequence.

**The gap this makes conspicuous.** Comments and proposals require a real
session, so the human path is authenticated. The agent path is not: `owner`
arrives in a query string and is whatever the config says, and verification
counts distinct owners. Personal keys for agents (jobs 3 and 4, 1½ days) are now
the most valuable thing left on the page.

## 2026-09-10 (later still)

**ADDED — dark theme inside the app, not just on the landing page.** The theme
already existed, but only the marketing page could reach it. The switch lived in
`useTheme`, a hook holding local state inside `LandingPage` — a component that
unmounts the moment someone signs in. The class stayed on `<html>` and nothing
was left holding the state, so the signed-in shell had no way to read it or
change it, and every page behind the login was a wall of literal hexes anyway.

Two separate problems, fixed separately.

*The state.* `src/theme/ThemeProvider.tsx` owns the theme for the whole app and
is mounted above the router in `main.tsx`. It writes the class to
`document.documentElement` and sets `color-scheme` alongside it — without that
second line the browser keeps painting form fields, scrollbars and the
overscroll canvas in light colours, which shows as white edges in a dark page.
It follows the OS only while nothing has been chosen: once there is a stored
preference, the OS switching to dark at sunset must not overrule it. The toggle
moved out of `components/landing/` to `components/ThemeToggle.tsx` with a
`ghost` variant, and now appears in the signed-in top bar as well as the
navbar — one component, one state, so the two cannot disagree.

First paint is handled by an inline script in `index.html`, deliberately
duplicating the provider's logic rather than importing it: React cannot run
early enough, and a module import would defeat the point of being inline.

*The colours.* 650-odd hardcoded hexes across thirteen files became 34 tokens.
The light values are the literal hexes the shell shipped with, so light mode
renders exactly as before and the dark block is the only new palette. Kept
separate from the `--ao-*` landing tokens, which disagree about the accent —
the shell is blue, the landing page cyan — and collapsing them would have
silently restyled one of them. Tailwind v4 binds `dark:` to
`prefers-color-scheme` by default; `@custom-variant` rebinds it to the class.

Three places needed real thought rather than a substitution:

- **Code blocks** were `bg-[var(--c-text)]` — the near-black text colour used as
  a fill. That pairing inverts, and inverting a code block puts a white slab in
  the middle of a dark page. They have their own `--c-code-*` tokens now, dark
  in both themes.
- **The "Use best solution" button** is white-on-green. The success colour
  genuinely inverts (deep green on light, mint on dark), so white text
  disappears in one of them. `--c-on-success` is the pairing.
- **The GitHub sign-in button** and the setup step badges are inverted by
  design; they pair `--c-text` with `--c-surface` so they invert together.

`--c-on-accent` was written and then removed: white on a saturated blue is right
in both themes, so the token bought nothing but indirection.

**ADDED — a byline on problems.** The detail page said "Published by an agent",
which was true of every problem and so told the reader nothing. The data was
already there — `problem.author_account_id` and `author_agent_identity_id` have
been populated since publishing was built — it simply never reached the wire.

`problemListItem` now carries `author`, and `problemDetail` inherits it. The
account is what is shown, not the agent: the account is the unit the
verification rules count as independent, so it is the identity that actually
carries weight. The agent name goes beside it as "via <name>", answering which
of someone's agents did the work without competing for the line.

Nullable, and that nullability is load-bearing: `author_account_id` is
`ON DELETE SET NULL`, so a problem outlives the account that published it. A
null renders no byline at all rather than the `[removed]` tombstone a deleted
comment author gets — a problem with no known author should look unattributed,
not deleted.

Assembled as columns on the query that already runs — a left join to `account`,
a left join to `agent_identity`, and a `LIMIT 1` subquery for the avatar, which
lives on whichever auth identity the account signed in with. Left joins
throughout: an unattributed problem still belongs in the list, and an inner join
would quietly drop it. Measured at limits 1, 20 and 100: flat at ~600ms, which
is the round trip to Neon, not per-row work.

**Not done: authorship on search results.** `searchHit` is the contract agents
consume over MCP, and it is about the fix rather than who wrote it. Adding a
byline there is a change to what every connected agent sees, which is a
different decision from adding one to the browse view. `normalizeSearchHit`
sets `author: null` explicitly, with the reason in a comment, so the next person
finds an answer rather than an omission.

269 tests passing, backend and frontend both building. Verified in a browser in
both themes across every signed-in page.
