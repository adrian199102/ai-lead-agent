import { NextRequest, NextResponse } from 'next/server'
import { serverClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const API_URL = process.env.AI_LEAD_AGENT_API_URL || 'https://ai-lead-agent-msmodl2xz-adriangraven02-9841.vercel.app'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(request: NextRequest) {
  const supabase = await serverClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'Sign in first' }, { status: 401 })
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) return NextResponse.json({ error: 'Session unavailable' }, { status: 401 })
  let body: { business_id?: string; approved?: boolean }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  if (!body.business_id || !UUID.test(body.business_id) || body.approved !== true)
    return NextResponse.json({ error: 'Invalid test parameters' }, { status: 400 })
  const { data: membership, error: membershipError } = await supabase.from('business_memberships')
    .select('role').eq('business_id', body.business_id).eq('user_id', user.id).maybeSingle()
  if (membershipError) return NextResponse.json({ error: 'Membership check unavailable' }, { status: 503 })
  if (!membership || !['owner', 'admin', 'agent'].includes(membership.role))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const bypass = process.env.AI_LEAD_AGENT_API_BYPASS_SECRET
  if (!bypass) return NextResponse.json({ error: 'Backend access is not configured' }, { status: 503 })
  try {
    const response = await fetch(API_URL + '/v1/leads/qa-fresh', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + session.access_token,
        'idempotency-key': 'qa-fresh-' + crypto.randomUUID(),
        'x-vercel-protection-bypass': bypass
      },
      body: JSON.stringify({ business_id: body.business_id }),
      cache: 'no-store', signal: AbortSignal.timeout(50000)
    })
    const raw = await response.text()
    let result: unknown
    try { result = JSON.parse(raw) } catch { result = { error: raw.slice(0, 250) } }
    return NextResponse.json({ http_status: response.status, result })
  } catch {
    return NextResponse.json({ error: 'Request timed out. The lead may have been created; refresh the dashboard before retrying.' }, { status: 502 })
  }
}
