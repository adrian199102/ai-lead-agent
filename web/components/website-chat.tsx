'use client'
import { useState } from 'react'
type Line={who:'visitor'|'agent';text:string}
export function WebsiteChat({widgetId}:{widgetId:string}){
 const [token,setToken]=useState('')
 const [lines,setLines]=useState<Line[]>([])
 const [message,setMessage]=useState('')
 const [budget,setBudget]=useState('')
 const [timeline,setTimeline]=useState('')
 const [busy,setBusy]=useState(false)
 const [error,setError]=useState('')
 const [consent,setConsent]=useState(false)
 const [contactConsent,setContactConsent]=useState(false)
 const [contactMethod,setContactMethod]=useState<'email'|'phone'>('email')
 const [contactDetail,setContactDetail]=useState('')
 const [eventKey,setEventKey]=useState('')
 async function begin(){
  if(!consent||!contactConsent||!contactDetail.trim())return
  setBusy(true);setError('')
  try{
   const r=await fetch('/api/public-chat/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({widget_id:widgetId,contact_method:contactMethod,contact_detail:contactDetail.trim(),contact_consent:contactConsent})})
   const d=await r.json()
   if(!r.ok)throw new Error(d.error||'Chat unavailable')
   setToken(d.token)
  }catch(e){setError(e instanceof Error?e.message:'Unable to start chat')}finally{setBusy(false)}
 }
 async function send(){
  if(!token||!message.trim()||busy)return
  setBusy(true);setError('')
  const key=eventKey||crypto.randomUUID()
  setEventKey(key)
  try{
   const r=await fetch('/api/public-chat/message',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
    widget_id:widgetId,token,event_key:key,message:message.trim(),budget:budget||undefined,timeline:timeline||undefined
   })})
   const d=await r.json()
   if(!r.ok)throw new Error(d.error||'Unable to send')
   setLines(previous=>[...previous,{who:'visitor',text:message.trim()},{who:'agent',text:d.result?.out_reply||'Message received'}])
   setMessage('');setBudget('');setTimeline('');setEventKey('')
  }catch(e){setError(e instanceof Error?e.message:'Unable to send')}finally{setBusy(false)}
 }
 return <section className="rounded-2xl border bg-white p-5 shadow-sm">
  <h1 className="text-xl font-bold">Chat with our assistant</h1>
  <p className="mt-1 text-sm text-slate-600">Automated lead qualification. Your messages may be reviewed by a person.</p>
  {!token?<div className="mt-5 space-y-4">
   <label className="block text-sm font-semibold" htmlFor="contact-method">Preferred contact method</label>
   <select id="contact-method" className="w-full rounded-lg border p-2" value={contactMethod} onChange={e=>{setContactMethod(e.target.value as 'email'|'phone');setContactDetail('')}}><option value="email">Email</option><option value="phone">Phone</option></select>
   <label className="block text-sm font-semibold" htmlFor="contact-detail">{contactMethod==='email'?'Email address':'Phone number (international format)'}</label>
   <input id="contact-detail" className="w-full rounded-lg border p-2" type={contactMethod==='email'?'email':'tel'} autoComplete={contactMethod==='email'?'email':'tel'} value={contactDetail} onChange={e=>setContactDetail(e.target.value)} placeholder={contactMethod==='email'?'name@example.com':'+639171234567'} maxLength={254} required />
   <fieldset className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
    <legend className="px-1 text-sm font-semibold">Your permissions</legend>
    <label className="flex items-start gap-3 text-sm"><input className="mt-1 shrink-0" type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/> <span>I agree to share my messages for lead qualification and follow-up.</span></label>
    <label className="flex items-start gap-3 text-sm"><input className="mt-1 shrink-0" type="checkbox" checked={contactConsent} onChange={e=>setContactConsent(e.target.checked)}/> <span>I agree that this business may contact me using the {contactMethod==='email'?'email address':'phone number'} I provided about my inquiry. This does not subscribe me to marketing messages.</span></label>
   </fieldset>
   <button disabled={!consent||!contactConsent||!contactDetail.trim()||busy} onClick={()=>void begin()} className="rounded-lg bg-indigo-600 px-4 py-2 text-white disabled:opacity-40">{busy?'Connecting…':'Start chat'}</button>
  </div>:<>
   <div role="log" aria-live="polite" className="mt-4 max-h-80 min-h-32 space-y-2 overflow-y-auto rounded-lg bg-slate-50 p-3">
    {lines.length===0&&<p className="text-sm text-slate-500">How can we help you?</p>}
    {lines.map((line,i)=><div key={i} className={'rounded-lg p-3 text-sm '+(line.who==='visitor'?'ml-8 bg-indigo-100':'mr-8 bg-white')}><strong>{line.who==='visitor'?'You':'Assistant'}</strong><p className="whitespace-pre-wrap">{line.text}</p></div>)}
   </div>
   <label className="mt-4 block text-sm font-semibold">Estimated budget (optional)</label>
   <select value={budget} onChange={e=>{setBudget(e.target.value);setEventKey('')}} className="mt-1 w-full rounded-lg border p-2 text-sm"><option value="">Not sure / prefer not to say</option><option value="USD below $5,000">Below $5,000</option><option value="USD $5,000–$14,999">$5,000–$14,999</option><option value="USD $15,000–$29,999">$15,000–$29,999</option><option value="USD $30,000–$49,999">$30,000–$49,999</option><option value="USD $50,000–$99,999">$50,000–$99,999</option><option value="USD $100,000 or more">$100,000 or more</option></select>
   <label className="mt-3 block text-sm font-semibold">Timeline (optional)</label>
   <select value={timeline} onChange={e=>{setTimeline(e.target.value);setEventKey('')}} className="mt-1 w-full rounded-lg border p-2 text-sm"><option value="">Not sure yet</option><option value="immediately">Immediately</option><option value="next month">Next month</option><option value="within 3 months">Within 3 months</option><option value="later">Later</option></select>
   <label className="mt-3 block text-sm font-semibold">Your message</label>
   <textarea maxLength={4000} rows={3} value={message} onChange={e=>{setMessage(e.target.value);setEventKey('')}} className="mt-1 w-full rounded-lg border p-2" placeholder="Tell us what you're looking for"/>
   <button disabled={busy||!message.trim()} onClick={()=>void send()} className="mt-3 rounded-lg bg-indigo-600 px-4 py-2 text-white disabled:opacity-40">{busy?'Sending…':'Send message'}</button>
  </>}
  {error&&<p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
 </section>
}
