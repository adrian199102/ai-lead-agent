// Create a fresh store for each request; never share it across requests.
export function createConversationStore(db,{model='gpt-4.1-mini',clock=Date.now}={}) {
 const pending=new Map()
 async function rpc(name,args){
  const {data,error}=await db.rpc(name,args)
  if(error) throw Object.assign(new Error(error.message),{code:error.code})
  return data
 }
 return {
 async reserve({widgetId,tokenHash,eventKey,message}){
  const result=await rpc('reserve_conversation_turn',{p_widget_id:widgetId,p_token_hash:tokenHash,p_event_key:eventKey,p_message:message})
  if(result?.status==='reserved') pending.set(result.id,{message,started:clock()})
  return result
 },
 async context(id){
  if(!pending.has(id)) throw new Error('Unknown reservation')
  return rpc('get_conversation_context',{p_lease_id:id})
 },
 async commit(id,result){
  const turn=pending.get(id)
  if(!turn) throw new Error('Unknown reservation')
  const saved=await rpc('complete_conversation_turn',{p_lease_id:id,p_message:turn.message,p_reply:result.reply,p_budget:result.budget??null,p_timeline:result.timeline??null,p_input_tokens:result.usage?.prompt_tokens??null,p_output_tokens:result.usage?.completion_tokens??null,p_processing_time_ms:Math.max(0,Math.round(clock()-turn.started)),p_model:model,p_requires_human_review:result.requiresHumanReview===true})
  pending.delete(id)
  return saved
 },
 async release(id){
  if(!pending.has(id)) return false
  try{return await rpc('release_conversation_turn',{p_lease_id:id})}finally{pending.delete(id)}
 }
 }
}
