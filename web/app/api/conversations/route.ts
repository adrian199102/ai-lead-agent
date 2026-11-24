import { NextRequest, NextResponse } from 'next/server'
import { serverClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 60
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const API_URL = process.env.AI_LEAD_AGENT_API_URL || 'https://ai-lead-agent-msmodl2xz-adriangraven02-9841.vercel.app'

async function authorize(businessId: string, leadId: string) {
  const supabase = await serverClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  if (!UUID.test(businessId) || !UUID.test(leadId)) return { error: NextResponse.json({ error: 'Invalid identifiers' }, { status: 400 }) }
  const { data: membership, error: memberError } = await supabase.from('business_memberships').select('role').eq('business_id',businessId).eq('user_id',user.id).maybeSingle()
  if (memberError) return { error: NextResponse.json({ error: 'Membership check unavailable' }, { status: 503 }) }
  if (!membership) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  const { data: lead, error: leadError } = await supabase.from('leads').select('id').eq('id',leadId).eq('business_id',businessId).maybeSingle()
  if (leadError) return { error: NextResponse.json({ error: 'Lead lookup unavailable' }, { status: 503 }) }
  if (!lead) return { error: NextResponse.json({ error: 'Lead not found' }, { status: 404 }) }
  return { supabase, role: membership.role }
}

export async function GET(request: NextRequest) {
  const businessId = request.nextUrl.searchParams.get('business_id') || ''
  const leadId = request.nextUrl.searchParams.get('lead_id') || ''
  const auth = await authorize(businessId,leadId)
  if (auth.error) return auth.error
  const { data: messages, error } = await auth.supabase!.from('messages')
    .select('id,direction,message,created_at').eq('business_id',businessId).eq('lead_id',leadId)
    .order('created_at',{ascending:true}).order('id',{ascending:true}).limit(200)
  if (error) return NextResponse.json({ error: 'Conversation history unavailable' }, { status: 503 })
  const { data: assessment } = await auth.supabase!.from('qualification_assessments')
    .select('completeness_score,missing_fields,next_action,qualification_decision')
    .eq('business_id',businessId).eq('lead_id',leadId).maybeSingle()
  const { data: state } = await auth.supabase!.from('lead_state')
    .select('budget,timeline').eq('business_id',businessId).eq('lead_id',leadId).maybeSingle()
  return NextResponse.json({ messages, assessment, qualification: state })
}

export async function POST(request: NextRequest) {
  let body: { business_id?: string; lead_id?: string; message?: string; event_key?: string; approved?: boolean }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  const businessId = body.business_id || '', leadId = body.lead_id || ''
  const auth = await authorize(businessId,leadId)
  if (auth.error) return auth.error
  if (!['owner','admin','agent'].includes(auth.role!)) return NextResponse.json({ error: 'Read-only workspace role' }, { status: 403 })
  if (body.approved !== true || !body.message?.trim() || body.message.length > 4000 ||
      !body.event_key || !/^conversation-[0-9a-f-]{36}$/i.test(body.event_key))
    return NextResponse.json({ error: 'Invalid message parameters' }, { status: 400 })
  const { data: { session } } = await auth.supabase!.auth.getSession()
  if (!session?.access_token) return NextResponse.json({ error: 'Session expired' }, { status: 401 })
  const bypass = process.env.AI_LEAD_AGENT_API_BYPASS_SECRET
  if (!bypass) return NextResponse.json({ error: 'Backend access unavailable' }, { status: 503 })
  try {
    const response = await fetch(API_URL+'/v1/leads/'+leadId+'/messages/inbound',{
      method:'POST',
      headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.access_token,
        'idempotency-key':body.event_key,'x-vercel-protection-bypass':bypass},
      body:JSON.stringify({business_id:businessId,message:body.message.trim()}),
      cache:'no-store',signal:AbortSignal.timeout(50000)
    })
    const raw = await response.text()
    let result: unknown
    try { result=JSON.parse(raw) } catch { result={error:'Unexpected backend response'} }
    return NextResponse.json(result,{status:response.status})
  } catch {
    return NextResponse.json({error:'Request timed out. Refresh conversation before retrying; the message may have been saved.'},{status:502})
  }
}
