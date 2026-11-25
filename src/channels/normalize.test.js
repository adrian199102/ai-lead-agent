import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeInbound, assertChannelAdapter } from './normalize.js'

const input = { channel: 'website', businessId: '11111111-1111-4111-8111-111111111111',
  conversationId: 'session-1', externalMessageId: 'event-1', text: ' Next month ' }
test('website messages normalize to one shared envelope', () => {
  const value = normalizeInbound(input)
  assert.equal(value.text, 'Next month')
  assert.equal(value.channel, 'website')
  assert.equal(value.externalMessageId, 'event-1')
})
test('WhatsApp uses the same envelope', () => {
  assert.equal(normalizeInbound({...input,channel:'whatsapp'}).channel, 'whatsapp')
})
test('reject invalid channels, empty messages and missing idempotency', () => {
  assert.throws(() => normalizeInbound({...input,channel:'internal'}))
  assert.throws(() => normalizeInbound({...input,text:'  '}))
  assert.throws(() => normalizeInbound({...input,externalMessageId:''}))
})
test('adapters must verify incoming requests and send outbound messages', () => {
  assert.throws(() => assertChannelAdapter({sendOutbound(){}}))
  assert.ok(assertChannelAdapter({verifyInbound(){},sendOutbound(){}}))
})
