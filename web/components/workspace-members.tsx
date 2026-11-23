'use client'
import { useEffect, useState } from 'react'
import { browserClient } from '@/lib/supabase/browser'
import { useRouter } from 'next/navigation'

type Member = { user_id: string; email: string; role: string }
export function WorkspaceMembers({businessId,role}:{businessId:string;role:string}) {
 const [members,setMembers]=useState<Member[]>([])
 const [busy,setBusy]=useState('')
 const [error,setError]=useState('')
 const [loaded,setLoaded]=useState(false)
 const router=useRouter()
 async function load(){
  const {data,error}=await browserClient().rpc('list_workspace_members',{p_business_id:businessId})
  if(error){setError(error.message)}else{setMembers((data||[]) as Member[]);setError('')}
  setLoaded(true)
 }
 useEffect(()=>{setLoaded(false);setMembers([]);void load()},[businessId])
 async function change(member:Member,next:string){
  if(next===member.role)return
  setBusy(member.user_id);setError('')
  const {error}=await browserClient().rpc('update_workspace_member_role',{p_business_id:businessId,p_user_id:member.user_id,p_role:next})
  if(error)setError(error.message)
  else {await load();router.refresh()}
  setBusy('')
 }
 async function remove(member:Member){
  if(!window.confirm('Remove '+member.email+' from this workspace?'))return
  setBusy(member.user_id);setError('')
  const {error}=await browserClient().rpc('remove_workspace_member',{p_business_id:businessId,p_user_id:member.user_id})
  if(error)setError(error.message)
  else {await load();router.refresh()}
  setBusy('')
 }
 return <section className="mt-8 rounded-2xl border bg-white p-6">
  <h2 className="text-lg font-bold">Workspace members</h2>
  <p className="mt-2 text-sm text-slate-600">Manage member access for this workspace. Owners cannot be removed or reassigned here.</p>
  {error&&<p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
  {!loaded?<p className="mt-4 text-sm text-slate-500">Loading members…</p>:<div className="mt-4 space-y-3">{members.map(member=>{
   const canManage=(role==='owner'&&member.role!=='owner')||(role==='admin'&&['agent','viewer'].includes(member.role))
   return <div key={member.user_id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3">
    <div className="min-w-0"><p className="break-all text-sm font-medium">{member.email}</p><p className="text-xs capitalize text-slate-500">{member.role}</p></div>
    {canManage&&<div className="flex items-center gap-2"><label className="sr-only" htmlFor={'member-'+member.user_id}>Member role</label><select id={'member-'+member.user_id} value={member.role} disabled={!!busy} onChange={e=>void change(member,e.target.value)} className="rounded-lg border p-2 text-sm"><option value="viewer">Viewer</option><option value="agent">Agent</option>{role==='owner'&&<option value="admin">Admin</option>}</select><button type="button" disabled={!!busy} onClick={()=>void remove(member)} className="rounded-lg border border-red-200 px-3 py-2 text-sm text-red-700 disabled:opacity-50">Remove</button></div>}
   </div>
  })}</div>}
 </section>
}
