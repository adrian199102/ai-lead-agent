# Secure qualification milestone (development only)

This branch adds validated AI extraction and a development-only `POST /leads/qualify` endpoint.

## Configuration

Copy `.env.example` to `.env` and provide real values locally. Never commit `.env`.
Use a dedicated **server-only** Supabase service-role key. Never put it in browser code.
Rotate any OpenAI key that may have been exposed by the previous `console.log` statement.

Install dependencies with `npm ci` and start with `npm start`.

## Test

Set `DEV_API_KEY` to a long random value. Both development routes require an
`x-api-key` header matching this value. They are disabled when `NODE_ENV=production`.

```bash
curl -X POST http://127.0.0.1:3000/leads/qualify \
  -H 'Content-Type: application/json' \
  -H 'x-api-key: YOUR_DEV_API_KEY' \
  -d '{"name":"Test Lead","phone":"+639000000000","message":"My budget is 100k, next month"}'
```

The database must already contain the `leads`, `messages`, and `lead_state`
tables defined in the original README. This endpoint creates a **new lead for every
request**; it does not yet deduplicate or upsert leads. Inserts across three tables
are **not atomic**, so a partial write is possible if a later insert fails.

## Not production-ready

Before enabling public inbound traffic, implement verified webhook signatures,
tenant-scoped authorization and RLS, idempotency/deduplication, transactional writes,
rate limiting, structured audit logging, and integration tests. The development
API-key guard is not a substitute for production authentication.
