import { NextRequest } from 'next/server'
import { adminClient, newToken, hashToken, uuid, fail } from '@/lib/website-chat'
export const dynamic='force-dynamic'
export async function POST(request:NextRequest){
 let body:{widget_id?:string;contact_method?:string;contact_detail?:string;contact_consent?:boolean}
 try{body=await request.json()}catch{return fail('Invalid JSON',400)}
 if(!uuid.test(body.widget_id||''))return fail('Invalid widget',400)
 const contact=typeof body.contact_detail==='string'?body.contact_detail.trim():''
 if(body.contact_consent!==true||!['email','phone'].includes(body.contact_method||'')||contact.length>254||!(body.contact_method==='email'?/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact):/^\+[1-9]\d{7,14}$/.test(contact)))return fail('A valid contact method, contact detail, and explicit permission to contact you are required',400)
 try{
  const token=newToken()
  const {error}=await adminClient().rpc('website_chat_start',{p_widget_id:body.widget_id,p_token_hash:hashToken(token),p_contact_method:body.contact_method,p_contact_detail:contact,p_contact_consent:true})
  if(error)return fail('Chat unavailable. Please try again later.',error.code==='22023'?429:503)
  return Response.json({token,expires_in_seconds:86400},{headers:{'Cache-Control':'no-store'}})
 }catch{return fail('Chat service unavailable',503)}
}
