import test from 'node:test'
import assert from 'node:assert/strict'
import { conversationAgent } from '../src/agents/conversationAgent.js'
const valid={reply:'What service do you need?',intent:'discovery',budget:null,timeline:null,requiresHumanReview:false}
const mock=(value,inspect=()=>{},finish_reason='stop')=>({chat:{completions:{create:async (request,options)=>{inspect(request,options);return {choices:[{finish_reason,message:{content:JSON.stringify(value)}}],usage:{total_tokens:42}}}}}})
test('returns structured reply and preserves explicit budget range',async()=>{
 const result=await conversationAgent({message:'PHP 5000–10000 next month'},{client:mock({...valid,budget:'PHP 5000–10000',timeline:'next month'})})
 assert.equal(result.budget,'PHP 5000–10000');assert.equal(result.timeline,'next month');assert.equal(result.fallback,false);assert.equal(result.usage.total_tokens,42)
})
test('bounds history and approved facts and passes known state',async()=>{
 await conversationAgent({message:'hello',history:Array.from({length:20},(_,i)=>({direction:'inbound',message:String(i)})),state:{budget:'PHP 5000'},knowledge:Array(15).fill('fact')},{client:mock(valid,(r,o)=>{
 const data=JSON.parse(r.messages[1].content);assert.equal(data.history.length,12);assert.equal(data.history[0].message,'8');assert.equal(data.approvedFacts.length,10);assert.equal(data.state.budget,'PHP 5000');assert.equal(r.max_completion_tokens,500);assert.equal(o.maxRetries,0)
 })})
})
test('falls back on malformed output or truncated completion',async()=>{
 for(const [value,reason] of [[{reply:'hello'},'stop'],[valid,'length']]){
 const result=await conversationAgent({message:'hello'},{client:mock(value,()=>{},reason)});assert.equal(result.fallback,true);assert.equal(result.budget,null)
 }
})
test('provider failure produces safe fallback',async()=>{
 const result=await conversationAgent({message:'hello'},{client:{chat:{completions:{create:async()=>{throw new Error('offline')}}}}});assert.equal(result.fallback,true)
})
test('blank message is rejected before provider call',async()=>{
 await assert.rejects(conversationAgent({message:'  '},{client:mock(valid)}),TypeError)
})
test('human review flag is preserved',async()=>{
 const result=await conversationAgent({message:'human please'},{client:mock({...valid,requiresHumanReview:true})});assert.equal(result.requiresHumanReview,true)
})
