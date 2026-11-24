import { NextRequest, NextResponse } from 'next/server'
import { serverClient } from '@/lib/supabase/server'
export const dynamic = 'force-dynamic'
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(request:NextRequest) {
 const supabase=await serverClient()
 const {data:{user}}=await supabase.auth.getUser()
 if(!user) return NextResponse.json({error:'Unauthorized'},{status:401})
 let body:{business_id?:string;lead_id?:string;action?:string;note?:string;approved?:boolean}
 try {body=await request.json()}catch{return NextResponse.json({error:'Invalid JSON'},{status:400})}
 if(!UUID.test(body.business_id||'')||!UUID.test(body.lead_id||'')||
   !['approve','reject','request_info'].includes(body.action||'')||
   body.approved!==true||typeof body.note!=='string'||body.note.length>2000)
   return NextResponse.json({error:'Invalid review parameters'},{status:400})
 const {data:membership,error:membershipError}=await supabase.from('business_memberships').select('role')
   .eq('business_id',body.business_id!).eq('user_id',user.id).maybeSingle()
 if(membershipError)return NextResponse.json({error:'Membership lookup failed'},{status:503})
 if(!membership||!['owner','admin'].includes(membership.role))return NextResponse.json({error:'Only owners and admins may review'},{status:403})
 const {data,error}=await supabase.rpc('submit_qualification_review',{
   p_business_id:body.business_id,p_lead_id:body.lead_id,p_action:body.action,p_note:body.note
 })
 if(error) return NextResponse.json({error:error.message},{status:error.code==='23505'?409:error.code==='42501'?403:error.code==='22023'?400:500})
 return NextResponse.json({result:data})
}
