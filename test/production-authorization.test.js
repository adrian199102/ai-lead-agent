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
  assert.equal(db.calls.rpc, 1)
})
