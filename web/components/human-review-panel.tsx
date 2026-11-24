'use client'
import { useEffect,useState } from 'react'
type Lead={id:string;name:string|null}
type Review={id:string;lead_id:string;action:string;note:string|null;reviewer_id:string;created_at:string}
type Assessment={lead_id:string;completeness_score:number;missing_fields:string[];qualification_decision:string;next_action:string}
export function HumanReviewPanel({businessId,role,leads,assessments,initialReviews}:{businessId:string;role:string;leads:Lead[];assessments:Assessment[];initialReviews:Review[]}) {
 const [items,setItems]=useState(assessments)
 const [reviews,setReviews]=useState(initialReviews)
 const [leadId,setLeadId]=useState('')
 const [action,setAction]=useState<'approve'|'reject'|'request_info'>('approve')
 const [note,setNote]=useState('')
 const [approved,setApproved]=useState(false)
 const [busy,setBusy]=useState(false)
 const [error,setError]=useState('')
 const [success,setSuccess]=useState('')
 const canReview=['owner','admin'].includes(role)
 useEffect(()=>{setItems(assessments);setReviews(initialReviews);setLeadId('');setAction('approve');setNote('');setApproved(false);setError('');setSuccess('')},[businessId,assessments,initialReviews])
 const queue=items.filter(a=>a.qualification_decision==='pending'&&a.completeness_score===100&&a.next_action==='review_qualification')
 const selected=items.find(a=>a.lead_id===leadId)
 async function submit(){
  if(!canReview||!selected||!approved||busy)return
  setBusy(true);setError('');setSuccess('')
  try{
   const response=await fetch('/api/qualification-review',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
    business_id:businessId,lead_id:leadId,action,note,approved:true
   })})
   const data=await response.json()
   if(!response.ok)throw new Error(data.error||'Review failed')
   const decision=action==='approve'?'qualified':action==='reject'?'disqualified':'pending'
   setItems(previous=>previous.map(a=>a.lead_id===leadId?{...a,qualification_decision:decision,next_action:action==='request_info'?'human_follow_up':'complete'}:a))
   setReviews(previous=>[{id:data.result?.[0]?.audit_id||crypto.randomUUID(),lead_id:leadId,action,note:note.trim()||null,reviewer_id:'Current user',created_at:new Date().toISOString()},...previous])
   setSuccess('Review saved. '+(action==='request_info'?'The lead needs manual follow-up.':'Decision finalized.'))
   setApproved(false);setNote('');setLeadId('')
  }catch(e){setError(e instanceof Error?e.message:'Review failed')}
  finally{setBusy(false)}
 }
 return <section id="human-reviews" className="mt-8 rounded-2xl border bg-white p-6">
  <h2 className="text-lg font-bold">Human qualification review</h2>
  <p className="mt-1 text-sm text-slate-600">Review queue · owner/admin decisions · auditable actions</p>
  <div className="mt-5 rounded-xl bg-slate-50 p-4 text-sm"><strong>Ready for review: {queue.length}</strong><p className="mt-1 text-slate-500">Only complete, pending assessments are shown here. Refresh the dashboard to see newly completed conversations.</p></div>
  <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b text-slate-500"><th className="p-3">Lead</th><th className="p-3">Completeness</th><th className="p-3">Decision</th><th className="p-3">Action</th></tr></thead><tbody>{queue.map(a=><tr key={a.lead_id} className="border-b"><td className="p-3">{leads.find(l=>l.id===a.lead_id)?.name||'Lead'} <span className="block text-xs text-slate-500">{a.lead_id}</span></td><td className="p-3">{a.completeness_score}%</td><td className="p-3">{a.qualification_decision}</td><td className="p-3">{canReview?<button type="button" className="rounded-lg border px-3 py-1 text-indigo-700" onClick={()=>{setLeadId(a.lead_id);setError('');setSuccess('')}}>Review</button>:'Read only'}</td></tr>)}</tbody></table>{queue.length===0&&<p className="p-4 text-sm text-slate-500">No leads currently awaiting review.</p>}</div>
  {canReview&&selected&&<div className="mt-5 rounded-xl border p-4"><h3 className="font-semibold">Review selected lead</h3><p className="mt-1 text-xs text-slate-500">{leadId}</p>
   <label className="mt-4 block text-sm font-semibold" htmlFor="review-action">Decision</label>
   <select id="review-action" className="mt-2 w-full rounded-lg border p-2 text-sm" value={action} onChange={e=>{setAction(e.target.value as typeof action);setApproved(false)}}>
    <option value="approve">Approve — qualified</option><option value="reject">Reject — disqualified</option><option value="request_info">Request more information — manual follow-up</option>
   </select>
   <label htmlFor="review-note" className="mt-4 block text-sm font-semibold">Review note {action==='approve'?'(optional)':'(required)'}</label>
   <textarea id="review-note" rows={3} maxLength={2000} className="mt-2 w-full rounded-lg border p-3 text-sm" value={note} onChange={e=>setNote(e.target.value)} placeholder="Reason or additional information needed"/>
   <label className="mt-3 flex gap-2 text-sm"><input type="checkbox" checked={approved} onChange={e=>setApproved(e.target.checked)}/> I confirm this human review decision.</label>
   <button type="button" disabled={!approved||busy||(action!=='approve'&&!note.trim())} className="mt-4 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40" onClick={()=>void submit()}>{busy?'Saving…':'Submit review'}</button>
  </div>}
  {error&&<p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
  {success&&<p role="status" className="mt-3 text-sm text-green-700">{success}</p>}
  <h3 className="mt-7 font-semibold">Review audit history</h3>
  <div className="mt-3 max-h-72 overflow-y-auto">{reviews.length===0?<p className="text-sm text-slate-500">No review actions recorded.</p>:reviews.map(r=><div key={r.id} className="border-b py-3 text-sm"><strong>{r.action.replace('_',' ')}</strong> · {leads.find(l=>l.id===r.lead_id)?.name||r.lead_id}<p className="text-xs text-slate-500">{r.created_at} · Reviewer: {r.reviewer_id}</p>{r.note&&<p className="mt-1 whitespace-pre-wrap">{r.note}</p>}</div>)}</div>
 </section>
}
