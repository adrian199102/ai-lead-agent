import { NextRequest } from 'next/server'
import { adminClient, newToken, hashToken, uuid, fail } from '@/lib/website-chat'
export const dynamic='force-dynamic'
export async function POST(request:NextRequest){
 let body:{widget_id?:string}
 try{body=await request.json()}catch{return fail('Invalid JSON',400)}
 if(!uuid.test(body.widget_id||''))return fail('Invalid widget',400)
 try{
  const token=newToken()
  const {error}=await adminClient().rpc('website_chat_start',{p_widget_id:body.widget_id,p_token_hash:hashToken(token)})
  if(error)return fail('Chat unavailable. Please try again later.',error.code==='22023'?429:503)
  return Response.json({token,expires_in_seconds:86400},{headers:{'Cache-Control':'no-store'}})
 }catch{return fail('Chat service unavailable',503)}
}
