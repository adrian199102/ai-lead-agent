// Shared, transport-agnostic inbound envelope for website chat and WhatsApp.
// Transport adapters must authenticate the sender/provider before calling normalizeInbound.
export const CHANNELS = Object.freeze(['website', 'whatsapp'])

export function normalizeInbound({ channel, businessId, conversationId, externalMessageId, text, receivedAt }) {
  if (!CHANNELS.includes(channel)) throw new TypeError('Unsupported customer channel')
  if (typeof businessId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(businessId))
    throw new TypeError('Invalid workspace identifier')
  if (typeof conversationId !== 'string' || !conversationId.trim() || conversationId.length > 200)
    throw new TypeError('Invalid conversation identifier')
  if (typeof externalMessageId !== 'string' || !externalMessageId.trim() || externalMessageId.length > 200)
    throw new TypeError('Missing provider message idempotency key')
  if (typeof text !== 'string' || !text.trim() || text.length > 4000)
    throw new TypeError('Message must contain 1–4000 characters')
  const timestamp = receivedAt ? new Date(receivedAt) : new Date()
  if (Number.isNaN(timestamp.getTime())) throw new TypeError('Invalid received timestamp')
  return Object.freeze({
    channel, businessId, conversationId: conversationId.trim(),
    externalMessageId: externalMessageId.trim(), text: text.trim(),
    receivedAt: timestamp.toISOString()
  })
}

// Provider adapters should implement these operations. Never use a browser-provided
// workspace id or phone number as proof of authorization.
export function assertChannelAdapter(adapter) {
  if (!adapter || typeof adapter.verifyInbound !== 'function' ||
      typeof adapter.sendOutbound !== 'function')
    throw new TypeError('Channel adapter must verify inbound and send outbound')
  return adapter
}
