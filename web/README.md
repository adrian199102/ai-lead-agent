# AI Lead Agent — customer portal (Next.js)

A responsive MVP frontend with landing page, email/password registration and login, Supabase SSR cookie sessions, protected dashboard, business workspace selection, and RLS-scoped lead readout.

## Local development

1. `cd web && npm install`
2. Copy `.env.example` to `.env.local` and set `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` from the Supabase project dashboard.
3. `npm run dev` and visit http://localhost:3000.
4. In Supabase Auth settings, configure your Site URL and redirect URLs (e.g. `http://localhost:3000/auth/callback`). Enable email confirmation as desired.

## Security

The frontend uses only the **publishable** Supabase key. Never put a service-role/secret key in `NEXT_PUBLIC_` variables. The dashboard uses a verified server-side `auth.getUser()` and Supabase RLS for lead data. No privileged RPC calls are made by the browser. Middleware refreshes auth cookies, but route handlers must still verify the user.

## Current limitations

- Registration creates a Supabase Auth user, **not** a business membership. Workspace creation/invitations require a dedicated authorization-safe onboarding API, to be built next.
- The dashboard shows the 50 most recent leads, not all-time totals.
- Conversations, AI configuration, billing and prospect chat widget are future features.
- No production deployment has been configured or validated.
- Backend Fastify API remains a separate service; configure it independently with server-only credentials.
