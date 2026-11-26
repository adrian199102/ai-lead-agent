import test from 'node:test'
import assert from 'node:assert/strict'
import { buildApp } from '../server.js'

const BUSINESS = '11111111-1111-4111-8111-111111111111'
const LEAD = '22222222-2222-4222-8222-222222222222'
function fakeDb(role = 'owner') {
  let extracts = 0
  let writes = 0
  return {
    get extracts() { return extracts },
    get writes() { return writes },
    auth: { getUser: async token => token === 'valid' ?
      { data: { user: { id: 'user-1' } }, error: null } :
      { data: null, error: { message: 'Invalid token' } } },
    from: table => ({
      select: () => ({
        eq: () => ({
          eq: () => ({ maybeSingle: async () => ({
            data: table === 'business_memberships' ? { role } : null, error: null
          }) })
        })
      })
    }),
    rpc: async (fn, args) => {
      writes++
      assert.equal(fn, 'create_qualified_lead')
      assert.equal(args.p_budget, null)
      assert.equal(args.p_timeline, null)
      return { data: [{ out_lead_id: LEAD, out_duplicate: false }], error: null }
    }
  }
}
function request(app, token = 'valid') {
  return app.inject({ method: 'POST', url: '/v1/leads/qa-fresh',
    headers: { authorization: 'Bearer ' + token, 'idempotency-key': 'qa-fresh-test-key' },
    payload: { business_id: BUSINESS } })
}

test('fresh QA lead bypasses extraction and persists blank qualification', async t => {
  const db = fakeDb()
  // The assessment lookup must reflect the saved policy snapshot.
  db.from = table => ({
    select: () => ({
      eq: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: table === 'business_memberships' ? { role: 'owner' } : null, error: null }),
          eq: () => ({ maybeSingle: async () => ({
            data: { policy_version: 1, required_fields: ['budget', 'timeline'],
              missing_fields: ['budget', 'timeline'], completeness_score: 0,
              next_action: 'ask_budget', qualification_decision: 'pending' }, error: null
          }) })
        })
      })
    })
  })
  const app = buildApp({ db, extract: async () => { throw Error('extractor must not run') }, env: { NODE_ENV: 'test' } })
  t.after(() => app.close())
  const response = await request(app)
  assert.equal(response.statusCode, 201)
  assert.equal(response.json().lead_id, LEAD)
  assert.deepEqual(response.json().assessment.missing_fields, ['budget', 'timeline'])
  assert.equal(response.json().assessment.completeness_score, 0)
  assert.equal(db.writes, 1)
})

test('fresh QA endpoint rejects unauthenticated and viewer writes', async t => {
  const db = fakeDb('viewer')
  const app = buildApp({ db, env: { NODE_ENV: 'test' } })
  t.after(() => app.close())
  assert.equal((await request(app, 'invalid')).statusCode, 401)
  assert.equal((await request(app)).statusCode, 403)
  assert.equal(db.writes, 0)
})
