# Secured qualification API — Vercel test deployment

Vercel project: `ai-lead-agent-api` (separate from `ai-lead-agent-web`).
Git branch: `feature/secure-lead-qualification`.
The project is protected with **Vercel Authentication for all deployments**. Do not disable protection or promote the backend for public use until its live authorization tests pass.

## Server-side environment configuration

In the **ai-lead-agent-api** project, configure the following as **sensitive/encrypted** environment variables for the deployment environment:

- `SUPABASE_URL`: `https://rrpglnllrdvculbslxnn.supabase.co` (nonsecret; already configured for Preview).
- `SUPABASE_SERVICE_ROLE_KEY`: service-role/secret key for the development Supabase project; **server-side only**.
- `OPENAI_API_KEY`: restricted development API key used by the qualification extractor; **server-side only**.

Never put either secret in `NEXT_PUBLIC_*`, GitHub source, screenshots, messages, or frontend runtime config. Rotate immediately if exposed. Redeploy the backend after saving environment variables. Because the initial Git deployment was unexpectedly classified as `production`, configure the keys for the actual environment shown in Vercel and keep **all** deployments protected; do not assume Preview variables apply to Production.

## Route and authorization

`POST /v1/leads/qualify`, JSON body:
`{"business_id":"<UUID>","name":"QA synthetic lead","message":"Budget 100k, next month"}`.

Required headers: `Authorization: Bearer <user's Supabase access token>`, `idempotency-key: <unique per lead>`, `Content-Type: application/json`.

The backend verifies the token via `auth.getUser()`, checks `business_memberships` for the target business, requires owner/admin/agent role, then invokes the service-role-only `create_qualified_lead` RPC. Never submit real customer data in QA.

## Live test cases (not yet executed)

1. Missing/invalid token -> 401, no write.
2. Account 2 targeting Company ABC -> 403, no write.
3. Account 1 targeting Company ABC -> 201, one synthetic lead.
4. Account 2 targeting Company DEF -> 201, one synthetic lead.
5. Repeat the same idempotency key and payload -> 200, same lead ID, no duplicate.
6. Repeat same key with different payload -> 409, no new lead.
7. Check each dashboard and RLS tenant isolation after writes.

The browser sessions' access tokens must not be copied into ChatGPT. Run requests from a trusted local API client or an authenticated test harness that keeps tokens private. Vercel Authentication may require an authorized team session or approved automation bypass to reach the protected deployment.

## Current verification

GitHub Node qualification tests and frontend build pass for commit `d4277939243f58f94c3bb0afbbee2010ae124296`. Vercel build READY is **not** proof that the API function runs successfully. Live HTTP authentication/authorization and database write checks remain pending.
