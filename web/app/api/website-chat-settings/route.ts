import { NextRequest, NextResponse } from 'next/server'
import { serverClient } from '@/lib/supabase/server'
import { uuid } from '@/lib/website-chat'
export const dynamic='force-dynamic'
export async function POST(request:NextRequest){
 let body:{business_id?:string;enabled?:boolean}
 try{body=await request.json()}catch{return NextResponse.json({error:'Invalid JSON'},{status:400})}
 if(!uuid.test(body.business_id||'')||typeof body.enabled!=='boolean')return NextResponse.json({error:'Invalid settings'},{status:400})
 const db=await serverClient()
 const {data:{user}}=await db.auth.getUser()
 if(!user)return NextResponse.json({error:'Unauthorized'},{status:401})
 const {data:member}=await db.from('business_memberships').select('role').eq('business_id',body.business_id!).eq('user_id',user.id).maybeSingle()
 if(!member||!['owner','admin'].includes(member.role))return NextResponse.json({error:'Forbidden'},{status:403})
 const {data:existing,error:lookupError}=await db.from('website_chat_widgets').select('id').eq('business_id',body.business_id!).maybeSingle()
 if(lookupError)return NextResponse.json({error:'Settings unavailable'},{status:503})
 const result=existing
  ?await db.from('website_chat_widgets').update({enabled:body.enabled}).eq('business_id',body.business_id!).select('id,enabled').single()
  :await db.from('website_chat_widgets').insert({business_id:body.business_id!,enabled:body.enabled}).select('id,enabled').single()
 if(result.error)return NextResponse.json({error:'Unable to save settings'},{status:503})
 return NextResponse.json({widget:result.data})
}
