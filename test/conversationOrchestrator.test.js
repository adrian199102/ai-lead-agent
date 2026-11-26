import test from 'node:test'
import assert from 'node:assert/strict'
import {orchestrateConversation} from '../src/services/conversationOrchestrator.js'
const input={widgetId:'widget',tokenHash:'a'.repeat(64),eventKey:'event-123',message:'Hello'}
test('completed and busy reservations never call model',async()=>{
 for(const status of ['completed','busy']){
 const result=await orchestrateConversation(input,{store:{reserve:async()=>({status,result:{reply:'saved'}})},agent:async()=>assert.fail('unexpected model call')})
 assert.deepEqual(result,status==='completed'?{reply:'saved'}:{status:'busy'})
 }
})
test('reserved turn loads context and commits model output',async()=>{
 const calls=[]
 const store={reserve:async()=>({status:'reserved',id:'r'}),context:async id=>{calls.push(id);return {history:[{message:'prior'}]}},commit:async(id,result)=>{calls.push(id);return result}}
 const result=await orchestrateConversation(input,{store,agent:async ctx=>{assert.equal(ctx.history[0].message,'prior');return {reply:'Hello'}}})
 assert.equal(result.reply,'Hello');assert.deepEqual(calls,['r','r'])
})
test('failure releases reservation',async()=>{
 let released=false
 await assert.rejects(orchestrateConversation(input,{store:{reserve:async()=>({status:'reserved',id:'r'}),context:async()=>{throw Error('failed')},release:async()=>{released=true}}}))
 assert.equal(released,true)
})
test('invalid message never reaches database',async()=>{
 await assert.rejects(orchestrateConversation({...input,message:' '},{store:{reserve:async()=>assert.fail('unexpected reservation')}}),TypeError)
})
