import test from 'node:test'
import assert from 'node:assert/strict'
import {createConversationStore} from '../src/services/conversationStore.js'
test('maps reservation, context and completion to RPCs',async()=>{
 const calls=[];let time=100
 const db={rpc:async(name,args)=>{calls.push([name,args]);return {data:name==='reserve_conversation_turn'?{status:'reserved',id:'lease'}:name==='get_conversation_context'?{history:[]}: {reply:'Hello'}}}}
 const store=createConversationStore(db,{clock:()=>time})
 await store.reserve({widgetId:'widget',tokenHash:'hash',eventKey:'event',message:'Hi'})
 await store.context('lease');time=150
 await store.commit('lease',{reply:'Hello',usage:{prompt_tokens:10,completion_tokens:5}})
 assert.deepEqual(calls.map(c=>c[0]),['reserve_conversation_turn','get_conversation_context','complete_conversation_turn'])
 assert.equal(calls[2][1].p_message,'Hi');assert.equal(calls[2][1].p_input_tokens,10);assert.equal(calls[2][1].p_output_tokens,5);assert.equal(calls[2][1].p_processing_time_ms,50)
 await assert.rejects(store.context('lease'),/Unknown reservation/)
})
test('rejects unknown lease and propagates RPC errors',async()=>{
 const store=createConversationStore({rpc:async()=>({error:{message:'Denied',code:'42501'}})})
 await assert.rejects(store.context('unknown'),/Unknown reservation/)
 await assert.rejects(store.reserve({}),{code:'42501'})
})
test('release clears local ownership',async()=>{
 const store=createConversationStore({rpc:async(name)=>({data:name==='reserve_conversation_turn'?{status:'reserved',id:'lease'}:true})})
 await store.reserve({message:'Hi'});assert.equal(await store.release('lease'),true);assert.equal(await store.release('lease'),false)
})
