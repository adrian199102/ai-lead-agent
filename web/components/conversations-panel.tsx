'use client'

import { useCallback, useEffect, useState } from 'react'
import { budgetRanges } from '@/lib/budget-ranges'
import { useRouter } from 'next/navigation'

type Lead = { id: string; name: string | null }
type Message = { id: string; direction: string; message: string; created_at: string }
type Snapshot = { messages: Message[]; assessment: { completeness_score: number; missing_fields: string[]; next_action: string; qualification_decision: string } | null; qualification: { budget: string | null; timeline: string | null } | null }

export function ConversationsPanel({businessId,role,leads,currencyCode}:{businessId:string;role:string;leads:Lead[];currencyCode:string}) {
  const router=useRouter()
  const [leadId,setLeadId] = useState(leads[0]?.id || '')
  const [snapshot,setSnapshot] = useState<Snapshot | null>(null)
  const [loading,setLoading] = useState(false)
  const [message,setMessage] = useState('')
  const [budgetRange,setBudgetRange]=useState('')
  const [approved,setApproved] = useState(false)
  const [busy,setBusy] = useState(false)
  const [error,setError] = useState('')
  const [pendingKey,setPendingKey] = useState('')
  const canWrite = ['owner','admin','agent'].includes(role)
  const load = useCallback(async () => {
    if (!leadId) { setSnapshot(null); return }
    setLoading(true)
    try {
      const response=await fetch('/api/conversations?business_id='+encodeURIComponent(businessId)+'&lead_id='+encodeURIComponent(leadId),{cache:'no-store'})
      const data=await response.json()
      if (!response.ok) throw new Error(data.error || 'Unable to load conversation')
      setSnapshot(data)
      setError('')
    } catch(e) { setError(e instanceof Error ? e.message : 'Unable to load conversation') }
    finally { setLoading(false) }
  },[businessId,leadId])
  useEffect(() => { void load() },[load])
  // A router.refresh() supplies a new leads array even when the selected workspace
  // and lead have not changed. Never reset the conversation for that case.
  useEffect(() => { setLeadId(leads[0]?.id || '');setMessage('');setBudgetRange('');setApproved(false);setPendingKey('');setSnapshot(null) },[businessId])
  // Preserve the selected lead across server revalidation; only fall back if it
  // is genuinely no longer in the refreshed list.
  useEffect(() => { setLeadId(current => leads.some(l=>l.id===current) ? current : (leads[0]?.id || '')) },[leads])
  useEffect(()=>{setBudgetRange('');setPendingKey('')},[currencyCode])
  async function send() {
    const outboundText=budgetRange?('My estimated budget range is '+budgetRange+'.'+(message.trim()?' '+message.trim():'')):message.trim()
    if (!leadId || !canWrite || !approved || !outboundText.trim() || busy) return
    const key=pendingKey || 'conversation-'+crypto.randomUUID()
    setPendingKey(key)
    setBusy(true)
    setError('')
    try {
      const response=await fetch('/api/conversations',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
        business_id:businessId,lead_id:leadId,message:outboundText,event_key:key,approved:true
      })})
      const data=await response.json()
      if (!response.ok) throw new Error(data.error || 'Message failed')
      setPendingKey('')
      setMessage('')
      setBudgetRange('')
      await load()
      // Revalidate server-loaded qualification review and follow-up queues.
      router.refresh()
    } catch(e) { setError((e instanceof Error ? e.message : 'Message failed')+' — retry uses the same event key.') }
    finally { setBusy(false) }
  }
  return <section id="conversations" className="mt-8 rounded-2xl border bg-white p-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-bold">Conversations</h2><p className="mt-1 text-sm text-slate-600">Multi-turn qualification sandbox · internal messages only, no external delivery</p></div>
      <button type="button" className="rounded-xl border px-3 py-2 text-sm" onClick={()=>void load()} disabled={loading||busy}>Refresh history</button></div>
    <label htmlFor="conversation-lead" className="mt-5 block text-sm font-semibold">Lead conversation</label>
    <select id="conversation-lead" className="mt-2 w-full rounded-xl border p-3 text-sm" value={leadId} disabled={busy} onChange={e=>{setLeadId(e.target.value);setSnapshot(null);setMessage('');setPendingKey('');setError('')}}>
      {!leads.length&&<option value="">No eligible leads</option>}
      {leads.map(l=><option key={l.id} value={l.id}>{l.name||'Unnamed lead'} — {l.id}</option>)}
    </select>
    {snapshot?.assessment&&<div className="mt-4 grid gap-3 rounded-xl bg-slate-50 p-4 text-sm sm:grid-cols-3">
      <p><strong>Completeness:</strong> {snapshot.assessment.completeness_score}%</p>
      <p><strong>Next action:</strong> {snapshot.assessment.next_action}</p>
      <p><strong>Missing:</strong> {snapshot.assessment.missing_fields.join(', ')||'None'}</p>
      <p><strong>Budget:</strong> {snapshot.qualification?.budget||'Not provided'}</p>
      <p><strong>Timeline:</strong> {snapshot.qualification?.timeline||'Not provided'}</p>
      <p><strong>Decision:</strong> {snapshot.assessment.qualification_decision}</p>
    </div>}
    <div aria-live="polite" className="mt-4 max-h-[480px] space-y-3 overflow-y-auto rounded-xl border bg-slate-50 p-4">
      {loading&&<p className="text-sm text-slate-500">Loading conversation…</p>}
      {!loading&&snapshot?.messages.length===0&&<p className="text-sm text-slate-500">No messages yet.</p>}
      {snapshot?.messages.map(m=><div key={m.id} className={'flex '+(m.direction==='outbound'?'justify-end':'justify-start')}>
        <div className={'max-w-[85%] rounded-xl p-3 text-sm '+(m.direction==='outbound'?'bg-indigo-100':'border bg-white')}>
          <p className="mb-1 text-xs font-semibold text-slate-600">{m.direction==='outbound'?'Agent':'Lead / inbound'}</p>
          <p className="whitespace-pre-wrap break-words">{m.message}</p>
          <p className="mt-2 text-xs text-slate-500">{m.created_at}</p>
        </div></div>)}
    </div>
    {canWrite?<><label htmlFor="conversation-budget" className="mt-4 block text-sm font-semibold">Estimated budget range ({currencyCode}, optional)</label><select id="conversation-budget" className="mt-2 w-full rounded-xl border p-3 text-sm" value={budgetRange} disabled={busy||!leadId} onChange={e=>{setBudgetRange(e.target.value);setPendingKey('')}}><option value="">Not provided — enter a free-text message instead</option>{budgetRanges(currencyCode).map(b=><option key={b.value} value={b.value}>{b.label}</option>)}</select><p className="mt-1 text-xs text-slate-500">Customer-style selection for this internal QA sandbox; not a public customer form.</p><label htmlFor="conversation-reply" className="mt-4 block text-sm font-semibold">Simulate the lead's next message</label>
      <textarea id="conversation-reply" rows={3} maxLength={4000} className="mt-2 w-full rounded-xl border p-3 text-sm" placeholder="Example: I plan to proceed next month." value={message} disabled={busy||!leadId} onChange={e=>{setMessage(e.target.value);setPendingKey('')}}/>
      <label className="mt-3 flex items-start gap-2 text-sm"><input type="checkbox" checked={approved} onChange={e=>setApproved(e.target.checked)} className="mt-1"/> I authorize saving this simulated inbound message and its automated outbound response.</label>
      <button type="button" className="mt-3 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40" disabled={!leadId||!approved||!message.trim()&&!budgetRange||busy} onClick={()=>void send()}>{busy?'Processing…':'Send simulated lead message'}</button>
    </>:<p className="mt-4 text-sm text-slate-500">Viewer access: conversation history is read-only.</p>}
    {error&&<p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
  </section>
}
