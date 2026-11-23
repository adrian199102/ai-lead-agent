import test from 'node:test'
import assert from 'node:assert/strict'
import { buildApp } from '../server.js'

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const payload = { business_id: A, message: 'Budget 100k next month' }
const headers = { authorization: 'Bearer test-token', 'idempotency-key': 'evt-1' }

function fakeDb({ user = 'user-a', role = 'agent' } = {}) {
  const calls = { rpc: 0, extract: 0 }
  return {
    calls,
    auth: { async getUser(token) { return token === 'test-token' && user
      ? { data: { user: { id: user } }, error: null }
      : { data: null, error: { message: 'invalid' } } } },
    from(table) {
      const values = {}
      return {
        select() { return this },
        eq(k, v) { values[k] = v; return this },
        async maybeSingle() {
          if (table === 'business_memberships') {
            return { data: values.business_id === A && values.user_id === user && role ? { role } : null, error: null }
          }
          if (table === 'inbound_events') return { data: null, error: null }
          if (table === 'qualification_assessments') return { data: { policy_version: 1, required_fields: ['budget', 'timeline'], missing_fields: [], completeness_score: 100, next_action: 'review_qualification', qualification_decision: 'pending' }, error: null }
          throw new Error('Unexpected table')
        }
      }
    },
    async rpc(name, args) {
      assert.equal(name, 'create_qualified_lead')
      assert.equal(args.p_business_id, A)
      calls.rpc++
      return { data: [{ out_lead_id: B, out_duplicate: false }], error: null }
    }
  }
}

test('production endpoint rejects missing and invalid bearer tokens', async t => {
  const db = fakeDb()
  const app = buildApp({ db, env: { NODE_ENV: 'test' }, extract: async () => ({}) })
  t.after(() => app.close())
  for (const authorization of [undefined, 'Bearer invalid']) {
    const h = { ...headers }
    if (authorization) h.authorization = authorization
    else delete h.authorization
    const res = await app.inject({ method: 'POST', url: '/v1/leads/qualify', headers: h, payload })
    assert.equal(res.statusCode, 401)
  }
  assert.equal(db.calls.rpc, 0)
})

test('cross-tenant access and viewer writes are denied', async t => {
  const db = fakeDb()
  const app = buildApp({ db, env: { NODE_ENV: 'test' }, extract: async () => { db.calls.extract++; return {} } })
  t.after(() => app.close())
  const other = await app.inject({ method: 'POST', url: '/v1/leads/qualify', headers, payload: { ...payload, business_id: B } })
  assert.equal(other.statusCode, 403)
  assert.equal(db.calls.rpc, 0)
  assert.equal(db.calls.extract, 0)
  const viewerDb = fakeDb({ role: 'viewer' })
  const viewerApp = buildApp({ db: viewerDb, env: { NODE_ENV: 'test' }, extract: async () => ({}) })
  t.after(() => viewerApp.close())
  const viewer = await viewerApp.inject({ method: 'POST', url: '/v1/leads/qualify', headers, payload })
  assert.equal(viewer.statusCode, 403)
  assert.equal(viewerDb.calls.rpc, 0)
})

test('authorized tenant agent can qualify a lead', async t => {
  const db = fakeDb()
  const app = buildApp({ db, env: { NODE_ENV: 'test' }, extract: async () => ({ budget: '100k', timeline: 'next month' }) })
  t.after(() => app.close())
  const res = await app.inject({ method: 'POST', url: '/v1/leads/qualify', headers, payload })
  assert.equal(res.statusCode, 201, res.body)
  assert.equal(res.json().lead_id, B)
  assert.equal(res.json().assessment.completeness_score, 100)
  assert.equal(res.json().assessment.next_action, 'review_qualification')
  assert.equal(res.json().assessment.qualification_decision, 'pending')
  assert.equal(db.calls.rpc, 1)
})


test('simultaneous same-key requests converge to one logical lead', async t => {
  const db = fakeDb()
  const stored = new Map()
  let writes = 0
  db.from = table => {
    const values = {}
    return {
      select() { return this },
      eq(k, v) { values[k] = v; return this },
      async maybeSingle() {
        if (table === 'business_memberships') {
          return { data: values.business_id === A && values.user_id === 'user-a' ? { role: 'agent' } : null, error: null }
        }
        if (table === 'qualification_assessments') return { data: { policy_version: 1, required_fields: ['budget', 'timeline'], missing_fields: ['budget','timeline'], completeness_score: 0, next_action: 'ask_budget', qualification_decision: 'pending' }, error: null }
        return { data: null, error: null }
      }
    }
  }
  db.rpc = async (_name, args) => {
    const key = args.p_business_id + ':' + args.p_event_key
    await new Promise(resolve => setTimeout(resolve, 5))
    if (!stored.has(key)) {
      stored.set(key, B)
      writes++
      return { data: [{ out_lead_id: B, out_duplicate: false }], error: null }
    }
    return { data: [{ out_lead_id: B, out_duplicate: true }], error: null }
  }
  const app = buildApp({ db, env: { NODE_ENV: 'test' }, extract: async () => ({ budget: null, timeline: null }) })
  t.after(() => app.close())
  const responses = await Promise.all(Array.from({ length: 10 }, () =>
    app.inject({ method: 'POST', url: '/v1/leads/qualify', headers, payload })
  ))
  assert.equal(writes, 1)
  assert.equal(responses.filter(r => r.statusCode === 201).length, 1)
  assert.equal(responses.filter(r => r.statusCode === 200).length, 9)
  assert.ok(responses.every(r => r.json().lead_id === B))
})


test('RBAC qualification matrix: owner, admin, agent permitted; viewer and unknown denied', async t => {
  for (const [role, expected] of [
    ['owner', 201],
    ['admin', 201],
    ['agent', 201],
    ['viewer', 403],
    ['billing', 403],
    [null, 403]
  ]) {
    const db = fakeDb({ role })
    let extracted = 0
    const app = buildApp({
      db,
      env: { NODE_ENV: 'test' },
      extract: async () => { extracted++; return { budget: null, timeline: null } }
    })
    t.after(() => app.close())
    const response = await app.inject({
      method: 'POST', url: '/v1/leads/qualify', headers, payload
    })
    assert.equal(response.statusCode, expected, 'role=' + role + ': ' + response.body)
    assert.equal(db.calls.rpc, expected === 201 ? 1 : 0, 'role=' + role)
    assert.equal(extracted, expected === 201 ? 1 : 0, 'role=' + role)
  }
})

test('RBAC ignores a client-supplied user ID and uses the verified session', async t => {
  const db = fakeDb({ user: 'user-a', role: 'owner' })
  const app = buildApp({ db, env: { NODE_ENV: 'test' }, extract: async () => ({}) })
  t.after(() => app.close())
  const response = await app.inject({
    method: 'POST', url: '/v1/leads/qualify', headers,
    payload: { ...payload, user_id: 'another-user' }
  })
  assert.equal(response.statusCode, 201, response.body)
  assert.equal(db.calls.rpc, 1)
})

test('RBAC prevents authenticated users from qualifying leads for an unowned tenant', async t => {
  for (const role of ['owner', 'admin', 'agent']) {
    const db = fakeDb({ role })
    let extracted = 0
    const app = buildApp({
      db, env: { NODE_ENV: 'test' },
      extract: async () => { extracted++; return {} }
    })
    t.after(() => app.close())
    const response = await app.inject({
      method: 'POST', url: '/v1/leads/qualify', headers,
      payload: { ...payload, business_id: B }
    })
    assert.equal(response.statusCode, 403, 'role=' + role)
    assert.equal(db.calls.rpc, 0)
    assert.equal(extracted, 0)
  }
})
