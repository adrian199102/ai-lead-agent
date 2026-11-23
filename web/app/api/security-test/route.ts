import { NextRequest, NextResponse } from 'next/server'
import { serverClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const API_URL = process.env.AI_LEAD_AGENT_API_URL || 'https://ai-lead-agent-5hpny23qh-adriangraven02-9841.vercel.app'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(request: NextRequest) {
  const supabase = await serverClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'Sign in first' }, { status: 401 })
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) return NextResponse.json({ error: 'Session unavailable' }, { status: 401 })
  let body: { business_id?: string; mode?: string; key?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  if (!body.business_id || !UUID.test(body.business_id) || !['missing-token', 'invalid-token', 'cross-tenant', 'create', 'repeat', 'conflict'].includes(body.mode || '')) {
    return NextResponse.json({ error: 'Invalid test parameters' }, { status: 400 })
  }
  const mode = body.mode!
  // Only synthetic test data is permitted. The operator explicitly initiates every write.
  const eventKey = body.key && /^[a-zA-Z0-9_-]{8,120}$/.test(body.key) ? body.key : ''
  if (['repeat', 'conflict'].includes(mode) && !eventKey) return NextResponse.json({ error: 'Run create first to obtain a test key' }, { status: 400 })
  const key = eventKey || 'qa-' + crypto.randomUUID()
  const message = mode === 'conflict' ? 'Synthetic QA: budget changed to 200000, timeline next quarter' : 'Synthetic QA: budget 100000, timeline next month'
  const headers: Record<string,string> = { 'Content-Type': 'application/json', 'idempotency-key': key }
  if (mode !== 'missing-token') headers.Authorization = mode === 'invalid-token' ? 'Bearer invalid-qa-token' : 'Bearer ' + session.access_token
  try {
    const response = await fetch(API_URL + '/v1/leads/qualify', {
      method: 'POST', headers,
      body: JSON.stringify({ business_id: body.business_id, name: 'QA Synthetic Lead', message }),
      cache: 'no-store', signal: AbortSignal.timeout(25000)
    })
    const raw = await response.text()
    let result: unknown
    try { result = JSON.parse(raw) } catch { result = { message: raw.slice(0, 300) } }
    return NextResponse.json({ http_status: response.status, mode, event_key: key, result })
  } catch {
    return NextResponse.json({ error: 'Backend unavailable or timed out. No test result confirmed.' }, { status: 502 })
  }
}
