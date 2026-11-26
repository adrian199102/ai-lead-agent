'use client'
import { useEffect, useState } from 'react'
import { browserClient } from '@/lib/supabase/browser'

type Field = 'budget' | 'timeline'
const fields: {id:Field; label:string; description:string}[] = [
 {id:'budget',label:'Budget',description:'Ask the lead for their estimated budget.'},
 {id:'timeline',label:'Timeline',description:'Ask when the lead plans to proceed.'}
]
const defaultFields:Field[]=['budget','timeline']
export function QualificationRules({businessId,role}:{businessId:string;role:string}) {
 const [selected,setSelected]=useState<Field[]>(defaultFields)
 const [saved,setSaved]=useState<Field[]>(defaultFields)
 const [loading,setLoading]=useState(true)
 const [busy,setBusy]=useState(false)
 const [error,setError]=useState('')
 const [notice,setNotice]=useState('')
 const canEdit=role==='owner'||role==='admin'
 useEffect(()=>{
  let active=true
  async function load(){
   setLoading(true);setError('');setNotice('')
   const {data,error}=await browserClient().from('business_qualification_rules').select('required_fields').eq('business_id',businessId).maybeSingle()
   if(!active)return
   if(error)setError('Unable to load qualification rules: '+error.message)
   else {
    const configured=Array.isArray(data?.required_fields)?data.required_fields:defaultFields
    const normalized=defaultFields.filter(field=>configured.includes(field))
    setSelected(normalized);setSaved(normalized)
   }
   setLoading(false)
  }
  void load()
  return ()=>{active=false}
 },[businessId])
 function toggle(field:Field){
  if(!canEdit||busy)return
  setNotice('')
  setSelected(previous=>previous.includes(field)?previous.filter(item=>item!==field):defaultFields.filter(item=>item===field||previous.includes(item)))
 }
 async function save(){
  if(!canEdit||busy)return
  if(selected.length===0){setError('Select at least one required field.');return}
  setBusy(true);setError('');setNotice('')
  const {error}=await browserClient().rpc('set_business_qualification_rules',{p_business_id:businessId,p_required_fields:selected})
  if(error)setError(error.message)
  else {setSaved([...selected]);setNotice('Qualification rules saved. They apply to newly created lead assessments.')}
  setBusy(false)
 }
 const dirty=selected.join(',')!==saved.join(',')
 return <section className="mt-8 rounded-2xl border bg-white p-6">
  <h2 className="text-lg font-bold">Qualification rules</h2>
  <p className="mt-2 text-sm text-slate-600">Choose the information the qualification engine requires for new leads in this workspace.</p>
  {loading?<p className="mt-4 text-sm text-slate-500">Loading qualification rules…</p>:<>
   <div className="mt-5 space-y-3">{fields.map(field=><label key={field.id} className="flex items-start gap-3 rounded-xl border p-4">
    <input type="checkbox" className="mt-1 h-4 w-4 accent-indigo-600" checked={selected.includes(field.id)} disabled={!canEdit||busy} onChange={()=>toggle(field.id)}/>
    <span><span className="block text-sm font-semibold">{field.label}</span><span className="block text-sm text-slate-500">{field.description}</span></span>
   </label>)}</div>
   {canEdit?<div className="mt-4 flex flex-wrap items-center gap-3"><button type="button" disabled={busy||!dirty||selected.length===0} onClick={()=>void save()} className="rounded-xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">{busy?'Saving…':'Save qualification rules'}</button><span className="text-xs text-slate-500">At least one field is required.</span></div>:<p className="mt-4 text-sm text-slate-500">Read-only access. Only workspace Owners and Administrators can change these rules.</p>}
  </>}
  {error&&<p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
  {notice&&<p role="status" className="mt-3 text-sm text-green-700">{notice}</p>}
  <p className="mt-3 text-xs text-slate-500">Changing requirements does not retroactively recalculate existing assessments.</p>
 </section>
}
