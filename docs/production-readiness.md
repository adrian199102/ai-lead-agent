# Production readiness verification — 2026-11-22

## Verified
- CI: 10/10 Node tests passed, including parallel same-key requests against a mocked atomic RPC. This is **not** a real concurrent PostgreSQL load test.
- Supabase SQL: two temporary auth.users identities and two businesses were inserted in a single transaction. With `role authenticated` and separate JWT subject claims, each user saw only its own lead. Transaction was rolled back and the project still had zero auth users/businesses/leads. This verifies database RLS behavior, **not** actual Supabase-issued JWT login.
- Supabase SQL: invalid inbound message rejected without partial lead/event records; temporary test business removed.
- Production route `POST /v1/leads/qualify`: verifies bearer JWT via `db.auth.getUser`, checks business membership and role, then uses server-only RPC. Mock tests cover missing/invalid JWT, cross-tenant access, viewer denial, and authorized request.

## Outstanding blockers
1. Create two **development-only** Supabase Auth users through supported Auth flows. Set up two businesses and memberships, obtain actual access tokens, and verify direct Data API RLS and API route access across tenants. Never share JWTs or service-role keys in chat.
2. Configure a trusted server runtime with `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `OPENAI_API_KEY` in its secret manager; run the API against development Supabase with actual bearer tokens. Keep service-role keys off browser clients and GitHub source.
3. Real concurrent PostgreSQL/API idempotency load test with parallel connections and an isolated development tenant; check exactly one lead/message/state/event persisted.
4. npm audit identified **four high severity dependency packages**: `fast-uri`, `fastify`, `find-my-way`, `form-data`. The CI workflow currently reports vulnerabilities but does **not** fail on them. Update dependencies and lockfile via `npm audit fix` in a controlled environment, review resulting changes, run `npm ci && npm test && npm audit --omit=dev --audit-level=high`, then enforce audit in CI. Do not mark production ready while these remain.
5. Reconcile Supabase remote migration history with repository SQL files; remote migrations already applied. Review function `SECURITY DEFINER` and service-role-only grants before launch.

## Operational caution
The production endpoint is source code in draft PR #1; no public deployment or real-secret API integration has been performed. Keep PR draft.
