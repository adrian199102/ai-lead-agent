# Customer messaging milestone — website first, WhatsApp second

## Delivered foundation
- Shared inbound envelope: channel, workspace, conversation, provider event ID, text, received timestamp.
- Channel adapter contract requires inbound verification and outbound delivery.
- Leads and messages have channel metadata; existing QA records default to internal.
- Unique workspace/channel/provider-event index prevents duplicate provider message IDs.

## Website chat — next implementation gate
1. Workspace owner explicitly enables a public website chat endpoint and obtains an opaque public widget ID (not the workspace UUID).
2. Anonymous visitors obtain short-lived, cryptographically random conversation credentials; store only a hash server-side. Bind credentials to workspace, conversation, and expiry.
3. Server verifies session, origin policy, payload size, per-session/IP rate limits and abuse protection; no service-role key in browser.
4. Adapter persists inbound event and qualification transactionally and delivers the stored outbound response.
5. Build embeddable widget with consent, loading/retry, accessibility, and clear automated-agent disclosure.
6. Verify cross-workspace isolation, idempotent retries, expired sessions, abuse limits, and review-queue refresh.

## WhatsApp — after website acceptance
- Verify Meta webhook signatures and challenge, map WhatsApp message IDs to shared external_message_id.
- Store phone identifiers securely, manage opt-in/opt-out, delivery status, template approvals, and 24-hour customer service window.
- Use the same qualification engine and human-review queue; never assume provider send success without acknowledgment.

## Security
No anonymous direct table access. Public chat must not call the existing workspace-authenticated QA API directly. Never expose privileged Supabase credentials in the widget. No live customer message delivery until public-session security acceptance tests pass.
