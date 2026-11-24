'use client'
import {useEffect,useState} from 'react'
import {useRouter} from 'next/navigation'
type Lead={id:string;name:string|null}
type Assessment={lead_id:string;next_action:string;qualification_decision:string}
type FollowUp={id:string;lead_id:string;assigned_to:string|null;question:string;response:string|null;due_at:string|null;status:string;created_at:string}
type Member={user_id:string;role:string;email?:string}
export function HumanFollowUps({businessId,role,leads,assessments,initialFollowUps,members}:{businessId:string;role:string;leads:Lead[];assessments:Assessment[];initialFollowUps:FollowUp[];members:Member[]}){
 const router=useRouter()
 const [items,setItems]=useState(initialFollowUps)
 const [leadId,setLeadId]=useState('')
 const [question,setQuestion]=useState('')
 const [response,setResponse]=useState('')
 const [assignee,setAssignee]=useState('')
 const [due,setDue]=useState('')
 const [editing,setEditing]=useState<string|null>(null)
 const [busy,setBusy]=useState(false)
 const [message,setMessage]=useState('')
 const [error,setError]=useState('')
 const canManage=['owner','admin'].includes(role)
 useEffect(()=>{setItems(initialFollowUps);setLeadId('');setQuestion('');setResponse('');setAssignee('');setDue('')},[businessId,initialFollowUps])
 const memberLabel=(id:string|null)=>id?(members.find(m=>m.user_id===id)?.email||'Workspace member ('+id.slice(0,8)+'…)'):'Unassigned'
 const overdue=items.filter(f=>f.status==='open'&&f.due_at&&new Date(f.due_at).getTime()<Date.now()).length
 const awaiting=assessments.filter(a=>a.qualification_decision==='pending'&&a.next_action==='human_follow_up'&&!items.some(f=>f.lead_id===a.lead_id))
 async function act(action:'assign'|'update'|'resolve'|'reopen',id:string){
  if(busy||!canManage)return
  setBusy(true);setError('');setMessage('')
  try{
   const res=await fetch('/api/human-follow-ups',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
    business_id:businessId,lead_id:id,action,question:question||null,response:response||null,
    assigned_to:assignee||null,due_at:due?new Date(due).toISOString():null
   })})
   const data=await res.json()
   if(!res.ok)throw new Error(data.error||'Unable to save follow-up')
   setMessage('Follow-up '+action+' saved. Dashboard data is updating automatically.')
   setEditing(null)
   router.refresh()
   setLeadId('');setQuestion('');setResponse('');setAssignee('');setDue('')
  }catch(e){setError(e instanceof Error?e.message:'Unable to save')}
  finally{setBusy(false)}
 }
 return <section id="human-follow-ups" className="mt-8 rounded-2xl border bg-white p-6">
  <h2 className="text-lg font-bold">Human follow-up management</h2>
  <p className="mt-1 text-sm text-slate-600">Internal assignment, due dates, response tracking and review handback · no external messages</p>
  <div className="mt-4 grid gap-3 sm:grid-cols-3 text-sm">
   <div className="rounded-lg bg-slate-50 p-3">Awaiting assignment: <strong>{awaiting.length}</strong></div>
   <div className="rounded-lg bg-slate-50 p-3">Open: <strong>{items.filter(f=>f.status==='open').length}</strong></div>
   <div className="rounded-lg bg-slate-50 p-3">Resolved: <strong>{items.filter(f=>f.status==='resolved').length}</strong></div>
   <div className="rounded-lg bg-slate-50 p-3">Overdue: <strong className={overdue?'text-red-700':''}>{overdue}</strong></div>
  </div>
  {canManage&&awaiting.length>0&&<div className="mt-5 rounded-xl border p-4">
   <h3 className="font-semibold">Assign a follow-up</h3>
   <label className="mt-3 block text-sm" htmlFor="follow-lead">Lead awaiting follow-up</label>
   <select id="follow-lead" className="mt-1 w-full rounded-lg border p-2 text-sm" value={leadId} onChange={e=>setLeadId(e.target.value)}>
    <option value="">Select lead</option>{awaiting.map(a=><option key={a.lead_id} value={a.lead_id}>{leads.find(l=>l.id===a.lead_id)?.name||a.lead_id}</option>)}
   </select>
   <label className="mt-3 block text-sm" htmlFor="follow-question">Question / information needed (optional; defaults to review note)</label>
   <textarea id="follow-question" className="mt-1 w-full rounded-lg border p-2 text-sm" maxLength={2000} rows={2} value={question} onChange={e=>setQuestion(e.target.value)}/>
   <label className="mt-3 block text-sm" htmlFor="follow-assignee">Assign to</label>
   <select id="follow-assignee" className="mt-1 w-full rounded-lg border p-2 text-sm" value={assignee} onChange={e=>setAssignee(e.target.value)}>
    <option value="">Me (current reviewer)</option>{members.filter(m=>['owner','admin','agent'].includes(m.role)).map(m=><option key={m.user_id} value={m.user_id}>{memberLabel(m.user_id)} ({m.role})</option>)}
   </select>
   <label className="mt-3 block text-sm" htmlFor="follow-due">Due date (optional)</label>
   <input id="follow-due" type="datetime-local" className="mt-1 w-full rounded-lg border p-2 text-sm" value={due} onChange={e=>setDue(e.target.value)}/>
   <button type="button" disabled={!leadId||busy} onClick={()=>void act('assign',leadId)} className="mt-3 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">Assign follow-up</button>
  </div>}
  <h3 className="mt-6 font-semibold">Follow-up tracker</h3>
  {items.length===0?<p className="mt-3 text-sm text-slate-500">No follow-ups created yet. Use Request More Information in Human Qualification Review to start one.</p>:
  <div className="mt-3 space-y-4">{items.map(f=><div key={f.id} className="rounded-xl border p-4 text-sm">
   <div className="flex flex-wrap items-center justify-between gap-2"><strong>{leads.find(l=>l.id===f.lead_id)?.name||f.lead_id}</strong><span className="rounded bg-slate-100 px-2 py-1">{f.status}</span></div>
   <p className="mt-2"><strong>Needed:</strong> {f.question}</p>
   <p className="mt-1 text-slate-600">Assigned: {memberLabel(f.assigned_to)} · Due: {f.due_at?new Date(f.due_at).toLocaleString():'Not set'}</p>
   {f.status==='open'&&f.due_at&&new Date(f.due_at).getTime()<Date.now()&&<p className="mt-1 font-semibold text-red-700">Overdue</p>}
   {f.response&&<p className="mt-2"><strong>Response:</strong> {f.response}</p>}
   {canManage&&f.status==='open'&&<div className="mt-3"><button type="button" className="rounded-lg border px-3 py-2" onClick={()=>{setEditing(editing===f.id?null:f.id);setLeadId(f.lead_id);setQuestion(f.question);setAssignee(f.assigned_to||'');setDue(f.due_at?new Date(new Date(f.due_at).getTime()-new Date(f.due_at).getTimezoneOffset()*60000).toISOString().slice(0,16):'')}}>Edit assignment / due date</button>{editing===f.id&&<div className="mt-3 grid gap-2 rounded-lg bg-slate-50 p-3"><label>Question<textarea className="mt-1 w-full rounded border p-2" value={question} maxLength={2000} onChange={e=>setQuestion(e.target.value)}/></label><label>Assignee<select className="mt-1 w-full rounded border p-2" value={assignee} onChange={e=>setAssignee(e.target.value)}>{members.filter(m=>['owner','admin','agent'].includes(m.role)).map(m=><option key={m.user_id} value={m.user_id}>{memberLabel(m.user_id)} ({m.role})</option>)}</select></label><label>Due date<input type="datetime-local" className="mt-1 w-full rounded border p-2" value={due} onChange={e=>setDue(e.target.value)}/></label><button type="button" className="rounded-lg bg-indigo-600 px-3 py-2 text-white disabled:opacity-40" disabled={busy||!assignee} onClick={()=>void act('update',f.lead_id)}>Save changes</button></div>}</div>}
   {canManage&&<div className="mt-3">
    {f.status==='open'?<><textarea aria-label={'Response for '+f.lead_id} className="w-full rounded-lg border p-2" rows={2} maxLength={4000} placeholder="Record the information received (required to resolve)" value={leadId===f.lead_id?response:''} onChange={e=>{setLeadId(f.lead_id);setResponse(e.target.value)}}/>
    <button type="button" disabled={busy||!(leadId===f.lead_id&&response.trim())} onClick={()=>void act('resolve',f.lead_id)} className="mt-2 rounded-lg bg-indigo-600 px-3 py-2 text-white disabled:opacity-40">Resolve and return to review</button></>:
    <button type="button" disabled={busy} onClick={()=>void act('reopen',f.lead_id)} className="rounded-lg border px-3 py-2">Reopen</button>}
   </div>}
  </div>)}</div>}
  {message&&<p role="status" className="mt-4 text-sm text-green-700">{message}</p>}
  {error&&<p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
 </section>
}
