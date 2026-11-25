import { createClient } from '@supabase/supabase-js'
import { createHash, randomBytes } from 'node:crypto'
export const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function adminClient() {
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL
 const key=process.env.SUPABASE_SERVICE_ROLE_KEY
 if(!url||!key) throw new Error('Public chat backend is not configured')
 return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}})
}
export function newToken(){return randomBytes(32).toString('hex')}
export function hashToken(token:string){return createHash('sha256').update(token).digest('hex')}
export function fail(error:string,status:number){return Response.json({error},{status,headers:{'Cache-Control':'no-store'}})}
