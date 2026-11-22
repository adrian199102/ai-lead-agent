'use client'
import { browserClient } from '@/lib/supabase/browser'
import { useRouter } from 'next/navigation'
export function SignOut(){const router=useRouter();return <button className="mt-4 block text-sm font-medium text-slate-600 hover:text-indigo-600" onClick={async()=>{await browserClient().auth.signOut();router.push('/login');router.refresh()}}>Sign out</button>}
