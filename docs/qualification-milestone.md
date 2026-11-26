# Development qualification: database and verification

This branch implements a **development-only** lead qualification endpoint. It is not ready for public deployment.

## Database setup

1. Create or select an isolated Supabase development project.
2. Apply the original README schema for `leads`, `lead_state` and `messages` if missing.
3. Run `supabase/migrations/20261122_qualified_lead.sql` in the SQL editor. It creates businesses, memberships, tenant identifiers, inbound event keys and an atomic PostgreSQL RPC.
4. Create one development business with `insert into public.businesses(name) values ('Dev Business') returning id;`.
5. Copy `.env.example` to `.env`. Set `DEV_BUSINESS_ID` to the returned UUID, plus development Supabase credentials, `DEV_API_KEY` and `OPENAI_API_KEY`. Do not share or commit secrets.
6. Run `npm ci`, `npm test` and `npm start`. The tests mock Supabase; they do **not** establish live database correctness.

## API verification

```bash
curl -i -X POST http://127.0.0.1:3000/leads/qualify \
  -H 'Content-Type: application/json' \
  -H 'x-api-key: YOUR_DEV_API_KEY' \
  -H 'idempotency-key: dev-event-001' \
  -d '{"name":"Test Lead","phone":"+639000000000","message":"My budget is 100k, next month"}'
```

Expected: HTTP 201 with `lead_id`. Query `leads`, `messages`, and `lead_state` by that ID; each should contain one matching row with the same `business_id`. Repeat the identical request and key: expect HTTP 200 with `duplicate: true` and no new rows. Change the message while retaining the same key: expect HTTP 409.

To test atomicity in a disposable development database, intentionally trigger an error in the RPC's final insert and verify that no lead, message, or inbound event remains. Never run destructive test modifications in production.

## Security scope and remaining work

The development API binds requests to the **server-configured** `DEV_BUSINESS_ID`, not a caller-supplied tenant ID. It requires a development API key and is disabled in production. This is **not end-user authentication**.

RLS is enabled without permissive client policies. Dashboard access must later use verified Supabase Auth identity and tenant membership with tested RLS policies. The service-role key bypasses RLS and must stay server-only. A service-role RPC call is privileged; do not expose it to anonymous clients.

The idempotency key must be a stable provider event/message ID, **not a new random value on each retry**. The database unique key protects concurrent deliveries. Hashing checks for conflicting payloads, but it is not an identity or authentication mechanism.

Further work before production: verified provider signatures, tenant authorization for every entrypoint, rate limits, provider retries, stronger error mapping, authenticated dashboard policies, data retention, security review, and live integration tests. The migration assumes the original README's schema and has not been applied to a connected database by ChatGPT.
