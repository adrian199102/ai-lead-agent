'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { LoaderCircle } from 'lucide-react'
import { browserClient } from '@/lib/supabase/browser'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [signup, setSignup] = useState(false)
  const [busy, setBusy] = useState(false)
  const [redirecting, setRedirecting] = useState(false)
  const [notice, setNotice] = useState('')
  const router = useRouter()

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setRedirecting(false)
    setNotice('')
    try {
      const supabase = browserClient()
      const { data, error } = signup
        ? await supabase.auth.signUp({
            email,
            password,
            options: { emailRedirectTo: window.location.origin + '/auth/callback' },
          })
        : await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error

      if (signup && !data.session) {
        setNotice('Check your email to confirm your account, then sign in.')
        setBusy(false)
      } else {
        // Keep the loading indicator visible while Next.js loads the dashboard.
        setRedirecting(true)
        router.replace('/dashboard')
        router.refresh()
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Authentication failed')
      setRedirecting(false)
      setBusy(false)
    }
  }

  const loadingText = redirecting
    ? 'Opening your workspace…'
    : signup
      ? 'Creating your account…'
      : 'Signing you in…'

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md rounded-3xl border bg-white p-9 shadow-xl">
        <Link href="/" className="text-sm font-bold text-indigo-600">← AI Lead Agent</Link>
        <h1 className="mt-8 text-3xl font-bold">{signup ? 'Create your account' : 'Welcome back'}</h1>
        <p className="mt-2 text-slate-500">
          {signup ? 'Start your AI lead management workspace.' : 'Sign in to manage your leads.'}
        </p>
        <form onSubmit={submit} aria-busy={busy} className="mt-8 flex flex-col gap-4">
          <label className="flex flex-col gap-2 text-sm font-medium">
            Email
            <input type="email" autoComplete="email" required disabled={busy}
              value={email} onChange={e => setEmail(e.target.value)} />
          </label>
          <label className="flex flex-col gap-2 text-sm font-medium">
            Password
            <input type="password" minLength={6}
              autoComplete={signup ? 'new-password' : 'current-password'}
              required disabled={busy} value={password}
              onChange={e => setPassword(e.target.value)} />
          </label>
          <button type="submit" disabled={busy}
            className="mt-2 flex min-h-12 items-center justify-center gap-2 rounded-xl bg-indigo-600 p-3 font-semibold text-white disabled:cursor-wait disabled:opacity-75">
            {busy ? (
              <>
                <LoaderCircle aria-hidden="true" size={19} className="animate-spin" />
                <span>{loadingText}</span>
              </>
            ) : signup ? 'Create account' : 'Sign in'}
          </button>
        </form>
        <p role="status" aria-live="polite" className="mt-3 min-h-5 text-center text-sm text-slate-500">
          {busy ? loadingText : ''}
        </p>
        {notice && <p role="alert" className="mt-4 rounded-lg bg-slate-100 p-3 text-sm">{notice}</p>}
        <button type="button" disabled={busy}
          className="mt-4 text-sm font-medium text-indigo-600 disabled:opacity-50"
          onClick={() => { setSignup(!signup); setNotice('') }}>
          {signup ? 'Already registered? Sign in' : 'New here? Create an account'}
        </button>
      </div>
    </main>
  )
}
