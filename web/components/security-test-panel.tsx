'use client'

import { useState } from 'react'

type Result = { http_status?: number; mode?: string; event_key?: string; result?: unknown; error?: string }
const modes = [
  { id: 'missing-token', label: '1. Missing token → 401', write: false },
  { id: 'invalid-token', label: '2. Invalid token → 401', write: false },
  { id: 'cross-tenant', label: '3. Other company → 403', write: false },
  { id: 'create', label: '4. Create synthetic lead → 201', write: true },
  { id: 'repeat', label: '5. Repeat same key → 200', write: false },
  { id: 'conflict', label: '6. Changed payload, same key → 409', write: false }
]
export function SecurityTestPanel({ businessId }: { businessId: string }) {
  const [target, setTarget] = useState('')
  const [approved, setApproved] = useState(false)
  const [busy, setBusy] = useState('')
  const [key, setKey] = useState('')
  const [results, setResults] = useState<Result[]>([])
  async function run(mode: string) {
    if (busy) return
    if (mode === 'create' && !approved) return
    if (['repeat', 'conflict'].includes(mode) && !key) return
    if (mode === 'cross-tenant' && !target.trim()) return
    setBusy(mode)
    try {
      const response = await fetch('/api/security-test', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_id: mode === 'cross-tenant' ? target.trim() : businessId, mode, key: ['repeat', 'conflict'].includes(mode) ? key : undefined })
      })
      const data: Result = await response.json()
      setResults(prev => [data, ...prev])
      if (mode === 'create' && data.http_status === 201 && data.event_key) setKey(data.event_key)
    } catch { setResults(prev => [{ error: 'Network request failed' }, ...prev]) }
    finally { setBusy('') }
  }
  return <section className="mt-8 rounded-2xl border bg-white p-6">
    <h2 className="text-lg font-bold">API security test lab</h2>
    <p className="mt-2 text-sm text-slate-600">Uses your signed-in session through a server-side proxy. Tokens and server secrets are never displayed. Only synthetic lead data is submitted. Run these tests separately in each test account.</p>
    <label className="mt-5 block text-sm font-semibold">Other tenant's business UUID (for test 3 only)</label>
    <input value={target} onChange={e => setTarget(e.target.value)} placeholder="Company ABC or DEF UUID" className="mt-2 w-full rounded-xl border p-3 text-sm" />
    <label className="mt-4 flex items-start gap-2 text-sm"><input type="checkbox" checked={approved} onChange={e => setApproved(e.target.checked)} className="mt-1" />I authorize creating one synthetic test lead in my currently selected workspace.</label>
    <div className="mt-5 flex flex-wrap gap-2">{modes.map(m => <button key={m.id} type="button" onClick={() => run(m.id)} disabled={!!busy || (m.write && !approved) || (['repeat','conflict'].includes(m.id) && !key) || (m.id === 'cross-tenant' && !target.trim())} className="rounded-xl border border-indigo-200 px-3 py-2 text-sm font-medium text-indigo-700 disabled:opacity-40">{busy === m.id ? 'Testing…' : m.label}</button>)}</div>
    {results.length > 0 && <div className="mt-6 space-y-3"><h3 className="font-semibold">Responses</h3>{results.map((r,i) => <pre key={i} className="overflow-x-auto rounded-xl bg-slate-100 p-3 text-xs">{JSON.stringify(r,null,2)}</pre>)}</div>}
  </section>
}
