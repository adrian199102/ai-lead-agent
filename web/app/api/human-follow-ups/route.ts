import { NextRequest,NextResponse } from 'next/server'
import { serverClient } from '@/lib/supabase/server'
export const dynamic='force-dynamic'
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export async function POST(request:NextRequest){
 const db=await serverClient()
 const {data:{user}}=await db.auth.getUser()
 if(!user)return NextResponse.json({error:'Unauthorized'},{status:401})
 let b:Record<string,unknown>
 try{b=await request.json()}catch{return NextResponse.json({error:'Invalid JSON'},{status:400})}
 if(typeof b.business_id!=='string'||!uuid.test(b.business_id)||typeof b.lead_id!=='string'||!uuid.test(b.lead_id)||
 !['assign','update','resolve','reopen'].includes(String(b.action))||
 (b.question!=null&&(typeof b.question!=='string'||b.question.length>2000))||
 (b.response!=null&&(typeof b.response!=='string'||b.response.length>4000))||
 (b.assigned_to!=null&&(typeof b.assigned_to!=='string'||!uuid.test(b.assigned_to)))||
 (b.due_at!=null&&(typeof b.due_at!=='string'||Number.isNaN(Date.parse(b.due_at)))))
 return NextResponse.json({error:'Invalid follow-up parameters'},{status:400})
 const {data:membership,error:membershipError}=await db.from('business_memberships').select('role').eq('business_id',b.business_id).eq('user_id',user.id).maybeSingle()
 if(membershipError)return NextResponse.json({error:'Membership lookup failed'},{status:503})
 if(!membership||!['owner','admin'].includes(membership.role))return NextResponse.json({error:'Only owners and admins can manage follow-ups'},{status:403})
 const {data,error}=await db.rpc('manage_human_follow_up',{
 p_business_id:b.business_id,p_lead_id:b.lead_id,p_action:b.action,
 p_question:b.question??null,p_response:b.response??null,
 p_assigned_to:b.assigned_to??null,p_due_at:b.due_at??null
 })
 if(error)return NextResponse.json({error:error.message},{status:error.code==='42501'?403:error.code==='23505'?409:error.code==='22023'?400:error.code==='P0002'?404:500})
 return NextResponse.json({result:data})
}
