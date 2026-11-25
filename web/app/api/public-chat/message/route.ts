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
  if(process.env.INTELLIGENT_CONVERSATION_ENABLED==='true'){
   const base=process.env.CONVERSATION_API_URL
   const secret=process.env.CONVERSATION_INTERNAL_SECRET
   if(!base||!secret||secret.length<32)return fail('Chat service unavailable',503)
   const url=new URL('/v1/website-chat/conversation',base)
   if(url.protocol!=='https:'&&!(process.env.NODE_ENV==='development'&&url.hostname==='localhost'))return fail('Chat service unavailable',503)
   const upstream=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','x-conversation-secret':secret},body:JSON.stringify({widget_id:body.widget_id,token:body.token,event_key:body.event_key,message:body.message.trim()}),cache:'no-store',redirect:'error',signal:AbortSignal.timeout(25000)})
   if(!upstream.ok)return fail(upstream.status===401?'Chat session unavailable':upstream.status===409?'Message key conflict':upstream.status===429?'Please retry shortly':'Chat service unavailable',[401,409,429].includes(upstream.status)?upstream.status:503)
   const payload=await upstream.json()
   if(typeof payload?.result?.out_reply!=='string')return fail('Chat service unavailable',503)
   return Response.json(payload,{headers:{'Cache-Control':'no-store'}})
  }
  const {data,error}=await adminClient().rpc('website_chat_send',{
   p_widget_id:body.widget_id,p_token_hash:hashToken(body.token),p_event_key:body.event_key,
   p_message:body.message.trim(),p_budget:body.budget||null,p_timeline:body.timeline||null
  })
  if(error)return fail(error.code==='42501'?'Chat session expired or unavailable':error.code==='23505'?'Message key conflict':'Unable to send message',error.code==='42501'?401:error.code==='23505'?409:error.code==='22023'?429:503)
  return Response.json({result:data?.[0]||null},{headers:{'Cache-Control':'no-store'}})
 }catch{return fail('Chat service unavailable',503)}
}
