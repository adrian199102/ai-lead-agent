import test from 'node:test'
import assert from 'node:assert/strict'
import { buildApp } from '../server.js'

const BUSINESS = '11111111-1111-4111-8111-111111111111'
const LEAD = '22222222-2222-4222-8222-222222222222'
const MESSAGE = '33333333-3333-4333-8333-333333333333'
const URL = '/v1/leads/' + LEAD + '/messages/inbound'
const body = { business_id: BUSINESS, message: 'I plan to proceed next month' }

function fakeDb(role = 'owner') {
  let calls = 0
  let extracts = 0
  return {
    get calls() { return calls },
    get extracts() { return extracts },
    extract: async () => { extracts++; return { budget: null, timeline: 'next month' } },
    auth: { getUser: async token => token === 'valid'
      ? { data: { user: { id: 'user-1' } }, error: null }
      : { data: null, error: { message: 'invalid' } } },
    from: table => ({
      select: () => ({
        eq: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: table === 'lead_message_events' ? null : { role }, error: null }) })
        })
      })
    }),
    rpc: async () => {
      calls++
      return { data: [{ out_message_id: MESSAGE, out_duplicate: calls > 1, out_budget: null, out_timeline: 'next month', out_required_fields: ['budget','timeline'], out_missing_fields: ['budget'], out_completeness_score: 50, out_next_action: 'ask_budget', out_qualification_decision: 'pending' }], error: null }
    }
  }
}

function headers(token = 'valid') {
  return { authorization: 'Bearer ' + token, 'idempotency-key': 'message-event-1' }
}

test('inbound message endpoint authenticates, authorizes and appends', async t => {
  const db = fakeDb()
  const app = buildApp({ db, extract: db.extract, env: { NODE_ENV: 'test' } })
  t.after(() => app.close())
  const first = await app.inject({ method: 'POST', url: URL, headers: headers(), payload: body })
  assert.equal(first.statusCode, 201)
  assert.equal(first.json().message_id, MESSAGE)
  assert.equal(first.json().duplicate, false)
  const replay = await app.inject({ method: 'POST', url: URL, headers: headers(), payload: body })
  assert.equal(replay.statusCode, 200)
  assert.equal(replay.json().duplicate, true)
  assert.equal(db.calls, 2)
  assert.equal(first.json().assessment.next_action, 'ask_budget')
  assert.equal(first.json().qualification.timeline, 'next month')
})

test('inbound endpoint rejects missing auth and viewer writes', async t => {
  const db = fakeDb('viewer')
  const app = buildApp({ db, env: { NODE_ENV: 'test' } })
  t.after(() => app.close())
  const missing = await app.inject({ method: 'POST', url: URL,
    headers: { 'idempotency-key': 'message-event-1' }, payload: body })
  assert.equal(missing.statusCode, 401)
  const forbidden = await app.inject({ method: 'POST', url: URL, headers: headers(), payload: body })
  assert.equal(forbidden.statusCode, 403)
  assert.equal(db.calls, 0)
})
