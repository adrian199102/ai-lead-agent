# Deploying the customer portal to Vercel (private preview)

The frontend is in `web/` within the `adrian199102/ai-lead-agent` repository. The existing Fastify API is separate and must **not** be assumed deployed by Vercel.

1. Connect Vercel to the GitHub repository and import the project.
2. Set **Root Directory** to `web` and Framework Preset to **Next.js**.
3. For a preview deployment, select the `feature/secure-lead-qualification` branch. Do not merge the draft PR just to deploy.
4. Configure environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL=https://rrpglnllrdvculbslxnn.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` = the project's **publishable** key from Supabase Dashboard.
5. **Never** set `SUPABASE_SERVICE_ROLE_KEY` or a Supabase secret key as a `NEXT_PUBLIC_*` variable.
6. In Supabase Auth URL configuration, add the actual Vercel preview hostname and `https://<preview-host>/auth/callback` to allowed redirects. Configure the correct Site URL when a stable hostname is available.
7. Restrict preview access to the development team using Vercel deployment protection; avoid a publicly accessible signup until workspace onboarding, email abuse protection, and tenant authorization are fully tested.
8. Smoke test: landing page, registration, confirmation callback, login, protected dashboard redirect, sign-out, and an account without memberships. A newly registered account should see the no-workspace empty state.
9. Provision test business memberships through a trusted admin workflow; validate that only the correct business leads appear. Do not use service-role credentials in the browser.
10. Before production, address the backend dependency audit and implement self-service business onboarding and live end-to-end tests.

Build checks are in `.github/workflows/frontend-build.yml`. A successful build does not prove the deployed app works with real Supabase Auth configuration.
