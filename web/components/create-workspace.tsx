'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { LoaderCircle, Plus } from 'lucide-react'
import { browserClient } from '@/lib/supabase/browser'

export function CreateWorkspace({ compact = false }: { compact?: boolean }) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [open, setOpen] = useState(!compact)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function createWorkspace(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    setError('')
    setBusy(true)
    try {
      const { data, error: rpcError } = await browserClient().rpc('create_business_workspace', {
        p_name: name.trim(),
      })
      if (rpcError) throw rpcError
      if (typeof data !== 'string') throw new Error('Workspace creation did not return an ID.')
      // Clear the form before navigation: the dashboard can update without
      // unmounting this client component, otherwise the spinner stays visible.
      setBusy(false)
      setName('')
      setOpen(false)
      router.replace('/dashboard?business=' + encodeURIComponent(data))
      router.refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to create workspace. Please try again.')
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-xl border border-indigo-200 bg-white px-4 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-50">
        <Plus size={16} /> New workspace
      </button>
    )
  }

  return (
    <section className={compact ? 'mt-5 rounded-2xl border bg-white p-5' : 'mt-6 max-w-lg'}>
      <h3 className="text-lg font-bold">Create a business workspace</h3>
      <p className="mt-1 text-sm text-slate-600">Your workspace keeps leads and team data separate from other businesses.</p>
      <form onSubmit={createWorkspace} className="mt-5 flex flex-col gap-3">
        <label htmlFor="business-name" className="text-sm font-semibold">Business name</label>
        <input id="business-name" type="text" required minLength={2} maxLength={120}
          autoComplete="organization" disabled={busy} value={name}
          onChange={event => setName(event.target.value)}
          placeholder="e.g. Acme Realty"
          className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 disabled:opacity-60" />
        {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={busy || name.trim().length < 2}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white disabled:cursor-wait disabled:opacity-60">
            {busy ? <><LoaderCircle size={18} className="animate-spin" /> Creating workspace…</> : 'Create workspace'}
          </button>
          {compact && <button type="button" disabled={busy} onClick={() => { setOpen(false); setError('') }}
            className="text-sm text-slate-600 disabled:opacity-50">Cancel</button>}
        </div>
      </form>
    </section>
  )
}
