'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { browserClient } from '@/lib/supabase/browser'

export function WorkspaceInvitations({businessId,role,pending}:{businessId:string;role:string;pending:{id:string;businessName:string;role:string}[]}) {
 const router=useRouter()
 const [email,setEmail]=useState('')
 const [inviteRole,setInviteRole]=useState('viewer')
 const [busy,setBusy]=useState(false)
 const [notice,setNotice]=useState('')
 async function invite(e:React.FormEvent<HTMLFormElement>){
  e.preventDefault();setBusy(true);setNotice('')
  const {error}=await browserClient().rpc('invite_workspace_member',{p_business_id:businessId,p_email:email.trim(),p_role:inviteRole})
  setBusy(false)
  if(error){setNotice(error.message);return}
  setEmail('');setNotice('Invitation created. The invited user can accept it after signing in.');router.refresh()
 }
 async function accept(id:string){
  setBusy(true);setNotice('')
  const {data,error}=await browserClient().rpc('accept_workspace_invitation',{p_invitation_id:id})
  setBusy(false)
  if(error){setNotice(error.message);return}
  router.replace('/dashboard?business='+encodeURIComponent(data as string));router.refresh()
 }
 return <section className="mt-8 rounded-2xl border bg-white p-6">
  <h2 className="text-lg font-bold">Workspace access</h2>
  {pending.length>0&&<div className="mt-4 space-y-3"><p className="text-sm font-semibold">Your pending invitations</p>{pending.map(p=><div key={p.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3"><span className="text-sm">{p.businessName} · {p.role}</span><button disabled={busy} onClick={()=>accept(p.id)} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white disabled:opacity-50">Accept invitation</button></div>)}</div>}
  {(role==='owner'||role==='admin')&&<form onSubmit={invite} className="mt-5 flex flex-wrap items-end gap-3"><div className="min-w-56 flex-1"><label htmlFor="invite-email" className="block text-sm font-medium">Invite an existing confirmed account</label><input id="invite-email" type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="teammate@example.com" className="mt-2 w-full rounded-xl border px-4 py-2"/></div><div><label htmlFor="invite-role" className="block text-sm font-medium">Role</label><select id="invite-role" value={inviteRole} onChange={e=>setInviteRole(e.target.value)} className="mt-2 rounded-xl border px-4 py-2"><option value="viewer">Viewer</option><option value="agent">Agent</option>{role==='owner'&&<option value="admin">Admin</option>}</select></div><button disabled={busy} className="rounded-xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy?'Inviting…':'Send invitation'}</button></form>}
  {notice&&<p role="status" className="mt-3 text-sm text-slate-700">{notice}</p>}
  <p className="mt-3 text-xs text-slate-500">Invitations require an existing verified account. Invitees must accept before gaining workspace access. Only owners can invite administrators.</p>
 </section>
}
