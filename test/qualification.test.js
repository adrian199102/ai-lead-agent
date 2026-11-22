import test from 'node:test'
import assert from 'node:assert/strict'
import { buildApp } from '../server.js'
import { qualifyNewLead, payloadHash } from '../src/services/leads.js'

const env = { NODE_ENV: 'test', DEV_API_KEY: 'secret', DEV_BUSINESS_ID: 'tenant-a' }
const body = { name: 'Test', message: 'Budget 100k next month' }
const headers = { 'x-api-key': 'secret', 'idempotency-key': 'event-1' }

function fakeDb() {
  const events = new Map()
  const records = { leads: [], messages: [], states: [] }
  return {
    records,
    from(table) {
      assert.equal(table, 'inbound_events')
      const q = {}
      return {
        select() { return this },
        eq(k,v) { q[k]=v; return this },
        async maybeSingle() { return { data: events.get(q.business_id + ':' + q.event_key) ?? null, error: null } }
      }
    },
    async rpc(name, args) {
      assert.equal(name, 'create_qualified_lead')
      const key = args.p_business_id + ':' + args.p_event_key
      const old = events.get(key)
      if (old) {
        if (old.payload_hash !== args.p_payload_hash) return { error: { message: 'Idempotency key reused with different payload' } }
        return { data: [{ out_lead_id: old.lead_id, out_duplicate: true }] }
      }
      const id = 'lead-1'
      records.leads.push({ id, business_id: args.p_business_id })
      records.messages.push({ lead_id: id, message: args.p_message })
      records.states.push({ lead_id: id, budget: args.p_budget, timeline: args.p_timeline })
      events.set(key, { lead_id: id, payload_hash: args.p_payload_hash })
      return { data: [{ out_lead_id: id, out_duplicate: false }] }
    }
  }
}

test('persists a lead, message and qualification under configured tenant', async t => {
  const db = fakeDb()
  const app = buildApp({ db, env, extract: async () => ({ budget: '100k', timeline: 'next month' }) })
  t.after(() => app.close())
  const res = await app.inject({ method: 'POST', url: '/leads/qualify', headers, payload: body })
  assert.equal(res.statusCode, 201)
  assert.equal(db.records.leads[0].business_id, 'tenant-a')
  assert.equal(db.records.messages[0].message, body.message)
  assert.equal(db.records.states[0].budget, '100k')
})

test('duplicate event does not write a second lead', async t => {
  const db = fakeDb()
  let calls = 0
  const app = buildApp({ db, env, extract: async () => { calls++; return { budget: null, timeline: null } } })
  t.after(() => app.close())
  const first = await app.inject({ method:'POST', url:'/leads/qualify', headers, payload:body })
  const second = await app.inject({ method:'POST', url:'/leads/qualify', headers, payload:body })
  assert.equal(first.statusCode,201)
  assert.equal(second.statusCode,200)
  assert.equal(second.json().duplicate,true)
  assert.equal(db.records.leads.length,1)
  assert.equal(calls,1)
})

test('conflicting reuse of idempotency key is rejected', async t => {
  const db = fakeDb()
  const app = buildApp({ db, env, extract: async () => ({ budget:null,timeline:null }) })
  t.after(() => app.close())
  await app.inject({ method:'POST', url:'/leads/qualify', headers, payload:body })
  const res = await app.inject({ method:'POST', url:'/leads/qualify', headers, payload:{...body,message:'Different message'} })
  assert.equal(res.statusCode,409)
})

test('unauthorized request and invalid payload are rejected', async t => {
  const app = buildApp({ db:fakeDb(), env, extract: async () => ({}) })
  t.after(() => app.close())
  const denied = await app.inject({ method:'POST', url:'/leads/qualify', headers:{...headers,'x-api-key':'wrong'}, payload:body })
  assert.equal(denied.statusCode,401)
  const invalid = await app.inject({ method:'POST', url:'/leads/qualify', headers, payload:{ message:'' } })
  assert.equal(invalid.statusCode,400)
})

test('production has no qualification routes', async t => {
  const app = buildApp({ db:fakeDb(), env:{...env,NODE_ENV:'production'}, extract: async()=>({}) })
  t.after(() => app.close())
  const res = await app.inject({ method:'POST', url:'/leads/qualify', headers, payload:body })
  assert.equal(res.statusCode,404)
})

test('RPC failure does not claim persistence', async () => {
  await assert.rejects(() => qualifyNewLead({
    businessId:'tenant-a',eventKey:'e',message:'test',qualification:{budget:null,timeline:null}
  },{ rpc:async()=>({error:{message:'db unavailable'}}) }), /Failed to persist/)
  assert.equal(payloadHash({message:'test'}).length,64)
})
