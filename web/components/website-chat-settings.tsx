'use client'
import { useState } from 'react'
export function WebsiteChatSettings({businessId,role,widget}:{businessId:string;role:string;widget:{id:string;enabled:boolean}|null}){
 const [current,setCurrent]=useState(widget)
 const [busy,setBusy]=useState(false)
 const [error,setError]=useState('')
 const [message,setMessage]=useState('')
 const canEdit=['owner','admin'].includes(role)
 async function save(enabled:boolean){
  setBusy(true);setError('');setMessage('')
  try{
   const response=await fetch('/api/website-chat-settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({business_id:businessId,enabled})})
   const data=await response.json()
   if(!response.ok)throw new Error(data.error||'Unable to save')
   setCurrent(data.widget);setMessage(enabled?'Public chat enabled':'Public chat disabled')
  }catch(e){setError(e instanceof Error?e.message:'Unable to save')}finally{setBusy(false)}
 }
 const url=current&&typeof window!=='undefined'?window.location.origin+'/chat/'+current.id:''
 return <section className="mt-8 rounded-2xl border bg-white p-6">
  <h2 className="text-lg font-bold">Website chat</h2>
  <p className="mt-1 text-sm text-slate-600">Public customer chat uses anonymous sessions and the same qualification workflow. Enable only when backend credentials and acceptance tests are ready.</p>
  <p className="mt-3 text-sm"><strong>Status:</strong> {current?.enabled?'Enabled':'Disabled'}</p>
  {current&&<p className="mt-2 break-all text-sm">Widget ID: {current.id}</p>}
  {url&&<a className="mt-2 block break-all text-sm text-indigo-700 underline" href={url} target="_blank" rel="noreferrer">{url}</a>}
  {canEdit?<button disabled={busy} className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-white disabled:opacity-40" onClick={()=>void save(!current?.enabled)}>{busy?'Saving…':current?.enabled?'Disable website chat':'Enable website chat'}</button>:<p className="mt-3 text-sm text-slate-500">Only owners and admins can change chat settings.</p>}
  {message&&<p className="mt-2 text-sm text-green-700">{message}</p>}
  {error&&<p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
 </section>
}
