import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {buildApp} from '../server.js'
const secret='s'.repeat(40)
const payload={widget_id:'dac936fd-f0d1-48df-bf57-d639351b5db5',token:'a'.repeat(64),event_key:'test-event-001',message:'Hello'}
const env={NODE_ENV:'test',INTELLIGENT_CONVERSATION_ENABLED:'true',CONVERSATION_INTERNAL_SECRET:secret}
const url='/v1/website-chat/conversation'
test('disabled engine and invalid secret never access database',async()=>{
 for(const [settings,header,status] of [[{...env,INTELLIGENT_CONVERSATION_ENABLED:'false'},secret,503],[env,'wrong',401]]){
 const app=buildApp({env:settings,db:{rpc:async()=>assert.fail('unexpected database access')}})
 try{const r=await app.inject({method:'POST',url,payload,headers:{'x-conversation-secret':header}});assert.equal(r.statusCode,status)}finally{await app.close()}
 }
})
test('completed turn replays without model or further RPC calls',async()=>{
 const calls=[]
 const app=buildApp({env,db:{rpc:async(name,args)=>{calls.push([name,args]);return {data:{status:'completed',result:{leadId:'lead',reply:'Saved reply',completeness:0,nextAction:'ask_budget'}}}}}})
 try{const r=await app.inject({method:'POST',url,payload,headers:{'x-conversation-secret':secret}})
 assert.equal(r.statusCode,200);assert.equal(r.json().result.out_reply,'Saved reply');assert.equal(calls.length,1);assert.equal(calls[0][0],'reserve_conversation_turn');assert.equal(calls[0][1].p_token_hash,createHash('sha256').update(payload.token).digest('hex'))
 }finally{await app.close()}
})
test('busy reservation returns retryable response',async()=>{
 const app=buildApp({env,db:{rpc:async()=>({data:{status:'busy'}})}})
 try{const r=await app.inject({method:'POST',url,payload,headers:{'x-conversation-secret':secret}});assert.equal(r.statusCode,429)}finally{await app.close()}
})
