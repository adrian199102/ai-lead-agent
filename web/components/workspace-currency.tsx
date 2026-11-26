'use client'
import {useEffect,useState} from 'react'
import {useRouter} from 'next/navigation'
import {browserClient} from '@/lib/supabase/browser'
import {SUPPORTED_CURRENCIES} from '@/lib/budget-ranges'
export function WorkspaceCurrency({businessId,role}:{businessId:string;role:string}){
 const router=useRouter()
 const [currency,setCurrency]=useState('USD')
 const [saved,setSaved]=useState('USD')
 const [loading,setLoading]=useState(true)
 const [busy,setBusy]=useState(false)
 const [error,setError]=useState('')
 const [notice,setNotice]=useState('')
 const editable=role==='owner'||role==='admin'
 useEffect(()=>{let active=true;setLoading(true);setError('');setNotice('')
  void browserClient().from('business_currency_settings').select('currency_code').eq('business_id',businessId).maybeSingle().then(({data,error})=>{
   if(!active)return
   if(error)setError(error.message)
   const code=data?.currency_code||'USD'
   setCurrency(code);setSaved(code);setLoading(false)
  })
  return ()=>{active=false}
 },[businessId])
 async function save(){
  if(!editable||busy)return
  setBusy(true);setError('');setNotice('')
  const {error}=await browserClient().rpc('set_business_currency',{p_business_id:businessId,p_currency_code:currency})
  if(error)setError(error.message)
  else {setSaved(currency);setNotice('Workspace currency saved. New budget selections use '+currency+'. Existing recorded budgets are unchanged.');router.refresh()}
  setBusy(false)
 }
 return <section className="mt-8 rounded-2xl border bg-white p-6">
  <h2 className="text-lg font-bold">Workspace currency</h2>
  <p className="mt-2 text-sm text-slate-600">Choose the currency used for new estimated budget selections. Default: USD. This does not convert existing lead budgets or exchange rates.</p>
  {loading?<p className="mt-4 text-sm">Loading currency…</p>:<div className="mt-4 flex flex-wrap items-end gap-3">
   <label className="text-sm font-semibold">Budget currency
    <select className="mt-2 block min-w-60 rounded-xl border p-3 font-normal" value={currency} disabled={!editable||busy} onChange={e=>{setCurrency(e.target.value);setNotice('')}}>
     {SUPPORTED_CURRENCIES.map(c=><option key={c.code} value={c.code}>{c.label}</option>)}
    </select>
   </label>
   {editable&&<button type="button" disabled={busy||currency===saved} onClick={()=>void save()} className="rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-40">{busy?'Saving…':'Save currency'}</button>}
  </div>}
  {!editable&&<p className="mt-3 text-sm text-slate-500">Only owners and admins may change workspace currency.</p>}
  {error&&<p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
  {notice&&<p role="status" className="mt-3 text-sm text-green-700">{notice}</p>}
 </section>
}
