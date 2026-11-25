import { conversationAgent } from '../agents/conversationAgent.js'

// Store contract: reserve atomically validates session, tenant, limits and payload hash,
// returns an existing completed result, a busy status, or an exclusive reservation.
// Context is loaded server-side within that reservation; never accept it from the browser.
// commit must atomically persist inbound/outbound, assessment, usage and replay result.
// release must be conditional on reservation ownership and safe after an ambiguous commit.
export async function orchestrateConversation({widgetId,tokenHash,eventKey,message}, {store,agent=conversationAgent}) {
 if(typeof message!=='string'||!message.trim()||message.length>4000) throw new TypeError('Invalid message')
 if(typeof eventKey!=='string'||!/^[-_a-zA-Z0-9]{8,100}$/.test(eventKey)) throw new TypeError('Invalid event key')
 if(typeof tokenHash!=='string'||!/^[a-f0-9]{64}$/i.test(tokenHash)) throw new TypeError('Invalid token hash')
 const reservation=await store.reserve({widgetId,tokenHash,eventKey,message:message.trim()})
 if(reservation.status==='completed') return reservation.result
 if(reservation.status==='busy') return {status:'busy'}
 if(reservation.status!=='reserved'||!reservation.id) throw new Error('Conversation reservation denied')
 try {
  const context=await store.context(reservation.id)
  const result=await agent({message:message.trim(),history:context.history??[],state:context.state??{},knowledge:context.knowledge??[]})
  return await store.commit(reservation.id,{reply:result.reply,intent:result.intent,budget:result.budget,timeline:result.timeline,requiresHumanReview:result.requiresHumanReview,usage:result.usage,fallback:result.fallback})
 } catch(error) {
  try { await store.release(reservation.id) } catch { /* lease expiry is the recovery path */ }
  throw error
 }
}
