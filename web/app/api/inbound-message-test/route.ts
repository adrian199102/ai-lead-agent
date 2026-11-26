import { NextRequest, NextResponse } from 'next/server'
import { serverClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const API_URL = process.env.AI_LEAD_AGENT_API_URL || 'https://ai-lead-agent-2g89vhjhs-adriangraven02-9841.vercel.app'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const KEY = /^qa-inbound-[0-9a-f-]{36}$/
const BASE_MESSAGES = {
  timeline: 'Synthetic QA inbound: I plan to proceed next month.',
  budget: 'Synthetic QA inbound: My estimated budget range is PHP 5,000–14,999.',
  both: 'Synthetic QA inbound: My estimated budget range is PHP 5,000–14,999 and I plan to proceed next month.'
} as const
const CHANGED_MESSAGE = 'Synthetic QA inbound: My timeline has changed to next quarter.'

export async function POST(request: NextRequest) {
  const supabase = await serverClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) return NextResponse.json({ error: 'Sign in first' }, { status: 401 })
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) return NextResponse.json({ error: 'Session unavailable' }, { status: 401 })

  let body: { business_id?: string; lead_id?: string; mode?: string; key?: string; approved?: boolean; scenario?: 'timeline' | 'budget' | 'both' }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  if (!body.business_id || !UUID.test(body.business_id) || !body.lead_id || !UUID.test(body.lead_id) ||
      !['create', 'repeat', 'conflict'].includes(body.mode || '') || body.approved !== true) {
    return NextResponse.json({ error: 'Invalid or unauthorized test parameters' }, { status: 400 })
  }
  const mode = body.mode!
  const key = mode === 'create' ? 'qa-inbound-' + crypto.randomUUID() : body.key
  if (!key || !KEY.test(key)) return NextResponse.json({ error: 'Run create first to obtain a test event key' }, { status: 400 })

  const { data: membership, error: membershipError } = await supabase.from('business_memberships')
    .select('role').eq('business_id', body.business_id).eq('user_id', user.id).maybeSingle()
  if (membershipError) return NextResponse.json({ error: 'Unable to verify workspace membership' }, { status: 503 })
  if (!membership || !['owner', 'admin', 'agent'].includes(membership.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const { data: lead, error: leadError } = await supabase.from('leads')
    .select('id').eq('id', body.lead_id).eq('business_id', body.business_id).maybeSingle()
  if (leadError) return NextResponse.json({ error: 'Unable to verify selected lead' }, { status: 503 })
  if (!lead) return NextResponse.json({ error: 'Lead not found in workspace' }, { status: 404 })

  const bypass = process.env.AI_LEAD_AGENT_API_BYPASS_SECRET
  if (!bypass) return NextResponse.json({ error: 'Backend access is not configured' }, { status: 503 })
  const scenario = body.scenario && Object.hasOwn(BASE_MESSAGES, body.scenario) ? body.scenario : 'timeline'
  const message = mode === 'conflict' ? CHANGED_MESSAGE : BASE_MESSAGES[scenario]
  try {
    const response = await fetch(API_URL + '/v1/leads/' + body.lead_id + '/messages/inbound', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + session.access_token,
        'idempotency-key': key,
        'x-vercel-protection-bypass': bypass
      },
      body: JSON.stringify({ business_id: body.business_id, message }),
      cache: 'no-store', signal: AbortSignal.timeout(50000)
    })
    const raw = await response.text()
    let result: unknown
    try { result = JSON.parse(raw) } catch { result = { message: raw.slice(0, 250) } }
    return NextResponse.json({ http_status: response.status, mode, event_key: key, lead_id: body.lead_id, result })
  } catch {
    return NextResponse.json({
      error: 'Backend request timed out; a write may have succeeded. Verify the lead before retrying.',
      mode, event_key: key
    }, { status: 502 })
  }
}
