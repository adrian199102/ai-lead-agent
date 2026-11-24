'use client'

import { useEffect, useState } from 'react'

type Lead = { id: string; name: string | null }
type TestResult = { http_status?: number; mode?: string; event_key?: string; lead_id?: string; result?: { message_id?: string; duplicate?: boolean; error?: string; outbound?: { message_id?: string; message?: string; direction?: string }; qualification?: { budget?: string | null; timeline?: string | null }; assessment?: { completeness_score?: number; missing_fields?: string[]; next_action?: string; qualification_decision?: string } }; error?: string }
type Mode = 'create' | 'repeat' | 'conflict'

export function InboundMessageTestPanel({ businessId, role, leads }: { businessId: string; role: string; leads: Lead[] }) {
  const [leadId, setLeadId] = useState(leads[0]?.id ?? '')
  const [freshLeads, setFreshLeads] = useState<Lead[]>([])
  const [createError, setCreateError] = useState('')
  const [freshBusy, setFreshBusy] = useState(false)
  const [approved, setApproved] = useState(false)
  const [scenario, setScenario] = useState<'timeline' | 'budget' | 'both'>('timeline')
  const [busy, setBusy] = useState<Mode | ''>('')
  const [eventKey, setEventKey] = useState('')
  const [createdMessageId, setCreatedMessageId] = useState('')
  const [results, setResults] = useState<TestResult[]>([])
  const canWrite = ['owner', 'admin', 'agent'].includes(role)
  useEffect(() => {
    setLeadId(leads[0]?.id ?? '')
    setFreshLeads([])
    setCreateError('')
    setApproved(false)
    setScenario('timeline')
    setEventKey('')
    setCreatedMessageId('')
    setResults([])
  }, [businessId, leads])
  function chooseLead(id: string) {
    setLeadId(id)
    setApproved(false)
    setEventKey('')
    setCreatedMessageId('')
    setResults([])
  }
  async function createFreshLead() {
    if (busy || freshBusy || !canWrite || !approved) return
    setFreshBusy(true)
    setCreateError('')
    try {
      const response = await fetch('/api/fresh-qa-lead', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_id: businessId, approved: true })
      })
      const data: { http_status?: number; result?: { lead_id?: string; assessment?: { completeness_score?: number; missing_fields?: string[] } }; error?: string } = await response.json()
      if (data.http_status !== 201 || !data.result?.lead_id) {
        setCreateError(data.error || 'Fresh lead creation failed (HTTP ' + (data.http_status ?? response.status) + ').')
        return
      }
      const lead = { id: data.result.lead_id, name: 'QA Fresh Lead' }
      setFreshLeads(previous => [lead, ...previous])
      chooseLead(lead.id)
      setApproved(true)
    } catch {
      setCreateError('Network error; refresh to check for a new lead before retrying.')
    } finally { setFreshBusy(false) }
  }
  async function run(mode: Mode) {
    if (busy || !approved || !canWrite || !leadId || (mode !== 'create' && !eventKey)) return
    setBusy(mode)
    try {
      const response = await fetch('/api/inbound-message-test', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_id: businessId, lead_id: leadId, mode,
          key: mode === 'create' ? undefined : eventKey, approved: true, scenario
        })
      })
      const data: TestResult = await response.json()
      setResults(previous => [data, ...previous])
      if (mode === 'create' && data.http_status === 201 && data.event_key && data.result?.message_id) {
        setEventKey(data.event_key)
        setCreatedMessageId(data.result.message_id)
      }
    } catch {
      setResults(previous => [{ error: 'Network error; verify message records before retrying.' }, ...previous])
    } finally { setBusy('') }
  }
  const expected: Record<Mode, number> = { create: 201, repeat: 200, conflict: 409 }
  return <section className="mt-8 rounded-2xl border bg-white p-6">
    <h2 className="text-lg font-bold">Inbound message acceptance lab</h2>
    <p className="mt-2 text-sm text-slate-600">Test atomic message creation, idempotent replay, and conflict detection using your signed-in session. Only fixed synthetic QA messages are sent. Each successful Create adds one real test message to the selected lead.</p>
    <div className="mt-5 flex flex-wrap items-center gap-3"><button type="button" onClick={() => void createFreshLead()} disabled={!canWrite || !approved || !!busy || freshBusy} className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">{freshBusy ? 'Creating fresh QA lead…' : 'Create Fresh QA Lead'}</button><span className="text-xs text-slate-500">Creates a new synthetic lead with Budget and Timeline empty. Check the authorization box first.</span></div>
    {createError && <p role="alert" className="mt-3 text-sm text-red-700">{createError}</p>}
    <label htmlFor="qa-inbound-lead" className="mt-5 block text-sm font-semibold">Existing test lead</label>
    <select id="qa-inbound-lead" value={leadId} onChange={event => chooseLead(event.target.value)} className="mt-2 w-full rounded-xl border p-3 text-sm" disabled={!!busy || freshBusy || !canWrite}>
      {leads.length === 0 && freshLeads.length === 0 && <option value="">No leads available</option>}
      {freshLeads.map(lead => <option key={lead.id} value={lead.id}>{lead.name} — {lead.id}</option>)}
      {leads.map(lead => <option key={lead.id} value={lead.id}>{lead.name || 'Unnamed lead'} — {lead.id}</option>)}
    </select>
    {!canWrite && <p className="mt-3 text-sm text-amber-700">Read-only access. Viewers cannot append inbound messages.</p>}
    <label htmlFor="qa-inbound-scenario" className="mt-4 block text-sm font-semibold">Synthetic qualification scenario</label>
    <select id="qa-inbound-scenario" value={scenario} disabled={!!busy || !!eventKey} onChange={event => setScenario(event.target.value as 'timeline' | 'budget' | 'both')} className="mt-2 w-full rounded-xl border p-3 text-sm">
      <option value="timeline">Timeline only — next month</option>
      <option value="budget">Budget range only — ₱5,000–₱14,999</option>
      <option value="both">Budget and timeline</option>
    </select>
    <label className="mt-4 flex items-start gap-2 text-sm">
      <input type="checkbox" checked={approved} onChange={event => setApproved(event.target.checked)} disabled={!canWrite || !!busy || freshBusy} className="mt-1" />
      I authorize creating a synthetic inbound message on this selected lead and testing its replay/conflict behavior.
    </label>
    <div className="mt-5 flex flex-wrap gap-2">
      {([
        ['create', '1. Create inbound message → 201'],
        ['repeat', '2. Repeat same key → 200'],
        ['conflict', '3. Changed message, same key → 409']
      ] as const).map(([mode, label]) => <button key={mode} type="button" onClick={() => void run(mode)}
        disabled={!!busy || freshBusy || !approved || !canWrite || !leadId || (mode !== 'create' && !eventKey)}
        className="rounded-xl border border-indigo-200 px-3 py-2 text-sm font-medium text-indigo-700 disabled:opacity-40">
        {busy === mode ? 'Testing…' : label}
      </button>)}
    </div>
    {eventKey && <p className="mt-3 text-xs text-slate-500">Test event key: <code className="break-all">{eventKey}</code></p>}
    {results.length > 0 && <div className="mt-6 space-y-3">
      <h3 className="font-semibold">Responses</h3>
      {results.map((result, index) => {
        const mode = result.mode as Mode | undefined
        const matches = mode && result.http_status === expected[mode] &&
          (mode === 'create' ? result.result?.duplicate === false && !!result.result?.message_id :
            mode === 'repeat' ? result.result?.duplicate === true && result.result?.message_id === createdMessageId :
            result.result?.error === 'Idempotency key conflict')
        return <div key={index} className="rounded-xl border p-3">
          <p className={'mb-2 text-sm font-semibold ' + (matches ? 'text-green-700' : 'text-amber-700')}>
            {matches ? 'PASS' : 'CHECK'} — {mode || 'Request'} — HTTP {result.http_status ?? 'unavailable'}
          </p>
          {result.result?.outbound?.message && <div className="mb-3 rounded-lg border border-indigo-100 bg-indigo-50 p-3 text-sm"><strong>Automated outbound response:</strong><p className="mt-1">{result.result.outbound.message}</p><p className="mt-1 text-xs text-slate-500">Persisted message ID: {result.result.outbound.message_id}</p></div>}
          <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-lg bg-slate-100 p-3 text-xs">{JSON.stringify(result, null, 2)}</pre>
        </div>
      })}
    </div>}
    <p className="mt-4 text-xs text-slate-500">New inbound events also create one persisted outbound follow-up, visible in the API response. Replays reuse the same outbound message ID. Each response now includes the persisted qualification fields and recalculated assessment. Database counts are verified separately. The buttons validate API responses, not database persistence.</p>
  </section>
}
