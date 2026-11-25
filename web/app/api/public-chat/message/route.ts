import { NextRequest } from 'next/server'
import { adminClient,hashToken,uuid,fail } from '@/lib/website-chat'
export const dynamic='force-dynamic'
export async function POST(request:NextRequest){
 let body:{widget_id?:string;token?:string;event_key?:string;message?:string;budget?:string;timeline?:string}
 try{body=await request.json()}catch{return fail('Invalid JSON',400)}
 if(!uuid.test(body.widget_id||'')||!body.token||!/^[0-9a-f]{64}$/i.test(body.token)
 ||!body.event_key||!/^[-_a-zA-Z0-9]{8,100}$/.test(body.event_key)
 ||typeof body.message!=='string'||!body.message.trim()||body.message.length>4000
 ||(body.budget!==undefined&&(typeof body.budget!=='string'||body.budget.length>100))
 ||(body.timeline!==undefined&&(typeof body.timeline!=='string'||body.timeline.length>100)))
 return fail('Invalid message parameters',400)
 try{
  const {data,error}=await adminClient().rpc('website_chat_send',{
   p_widget_id:body.widget_id,p_token_hash:hashToken(body.token),p_event_key:body.event_key,
   p_message:body.message.trim(),p_budget:body.budget||null,p_timeline:body.timeline||null
  })
  if(error)return fail(error.code==='42501'?'Chat session expired or unavailable':error.code==='23505'?'Message key conflict':'Unable to send message',error.code==='42501'?401:error.code==='23505'?409:error.code==='22023'?429:503)
  return Response.json({result:data?.[0]||null},{headers:{'Cache-Control':'no-store'}})
 }catch{return fail('Chat service unavailable',503)}
}
