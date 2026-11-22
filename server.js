import 'dotenv/config'
import Fastify from 'fastify'
import { qualificationAgent } from './src/agents/qualificationAgent.js'
import { qualifyNewLead, payloadHash } from './src/services/leads.js'

export function buildApp({ extract = qualificationAgent, db, env = process.env } = {}) {
  const fastify = Fastify({ logger: env.NODE_ENV !== 'test' })
  const messageSchema = {
    type: 'object', required: ['message'], additionalProperties: false,
    properties: {
      message: { type: 'string', minLength: 1, maxLength: 4000 },
      name: { type: 'string', minLength: 1, maxLength: 200 },
      phone: { type: 'string', minLength: 3, maxLength: 40 }
    }
  }
  const qualifySchema = {
    body: messageSchema,
    headers: {
      type: 'object', required: ['x-api-key', 'idempotency-key'],
      properties: {
        'x-api-key': { type: 'string' },
        'idempotency-key': { type: 'string', minLength: 1, maxLength: 200 }
      }
    }
  }

  async function requireDevKey(request, reply) {
    if (!env.DEV_API_KEY || request.headers['x-api-key'] !== env.DEV_API_KEY) {
      return reply.code(401).send({ error: 'Unauthorized' })
    }
  }

  fastify.get('/', async () => ({ status: 'AI Agent Running' }))

  // Verify user JWT and tenant membership before any privileged database write.
  fastify.post('/v1/leads/qualify', {
    schema: {
      body: {
        type: 'object', additionalProperties: false, required: ['business_id', 'message'],
        properties: {
          business_id: { type: 'string', format: 'uuid' },
          message: { type: 'string', minLength: 1, maxLength: 4000 },
          name: { type: 'string', minLength: 1, maxLength: 200 },
          phone: { type: 'string', minLength: 3, maxLength: 40 }
        }
      },
      headers: {
        type: 'object', required: ['idempotency-key'],
        properties: {
          authorization: { type: 'string' },
          'idempotency-key': { type: 'string', minLength: 1, maxLength: 200 }
        }
      }
    }
  }, async (request, reply) => {
    const bearer = request.headers.authorization
    if (!bearer?.startsWith('Bearer ') || !bearer.slice(7).trim()) {
      return reply.code(401).send({ error: 'Unauthorized' })
    }
    const { data: auth, error: authError } = await db.auth.getUser(bearer.slice(7))
    if (authError || !auth?.user?.id) return reply.code(401).send({ error: 'Unauthorized' })
    const { business_id: businessId, name, phone, message } = request.body
    const { data: membership, error: membershipError } = await db.from('business_memberships')
      .select('role').eq('business_id', businessId).eq('user_id', auth.user.id).maybeSingle()
    if (membershipError) throw new Error('Unable to verify business membership', { cause: membershipError })
    if (!membership || !['owner', 'admin', 'agent'].includes(membership.role)) {
      return reply.code(403).send({ error: 'Forbidden' })
    }
    const eventKey = request.headers['idempotency-key']
    const hash = payloadHash({ name, phone, message })
    const { data: existing, error: lookupError } = await db.from('inbound_events')
      .select('lead_id,payload_hash').eq('business_id', businessId)
      .eq('event_key', eventKey).maybeSingle()
    if (lookupError) throw new Error('Unable to check inbound event', { cause: lookupError })
    if (existing) {
      if (existing.payload_hash !== hash) return reply.code(409).send({ error: 'Idempotency key conflict' })
      return reply.code(200).send({ lead_id: existing.lead_id, duplicate: true })
    }
    const qualification = await extract(message)
    try {
      const result = await qualifyNewLead({ businessId, eventKey, name, phone, message, qualification }, db)
      return reply.code(result.duplicate ? 200 : 201).send(result)
    } catch (error) {
      if (error.cause?.message?.includes('Idempotency key reused')) {
        return reply.code(409).send({ error: 'Idempotency key conflict' })
      }
      throw error
    }
  })

  if (env.NODE_ENV !== 'production') {
    fastify.post('/test-agent', {
      preHandler: requireDevKey, schema: { body: messageSchema }
    }, async request => extract(request.body.message))

    fastify.post('/leads/qualify', {
      preHandler: requireDevKey, schema: qualifySchema
    }, async (request, reply) => {
      if (!env.DEV_BUSINESS_ID) return reply.code(503).send({ error: 'Development business not configured' })
      const { message, name, phone } = request.body
      const eventKey = request.headers['idempotency-key']
      const hash = payloadHash({ message, name, phone })
      // Fast duplicate check avoids a second model call. The database RPC remains
      // the final authority for races and conflicting payloads.
      const existing = await db.from('inbound_events')
        .select('lead_id,payload_hash')
        .eq('business_id', env.DEV_BUSINESS_ID)
        .eq('event_key', eventKey)
        .maybeSingle()
      if (existing.error) throw new Error('Unable to check inbound event', { cause: existing.error })
      if (existing.data) {
        if (existing.data.payload_hash !== hash) return reply.code(409).send({ error: 'Idempotency key conflict' })
        return reply.code(200).send({ lead_id: existing.data.lead_id, duplicate: true })
      }
      const qualification = await extract(message)
      try {
        const result = await qualifyNewLead({
          businessId: env.DEV_BUSINESS_ID, eventKey, name, phone, message, qualification
        }, db)
        return reply.code(result.duplicate ? 200 : 201).send(result)
      } catch (error) {
        if (error.cause?.message?.includes('Idempotency key reused')) {
          return reply.code(409).send({ error: 'Idempotency key conflict' })
        }
        throw error
      }
    })
  }
  fastify.setErrorHandler((error, request, reply) => {
    request.log.error({ err: error }, 'Request failed')
    const status = error.statusCode && error.statusCode < 500 ? error.statusCode : 500
    return reply.code(status).send({
      error: status === 500 ? 'Internal server error' : error.message
    })
  })
  return fastify
}

if (process.env.NODE_ENV !== 'test') {
  const { default: db } = await import('./src/services/supabase.js')
  const app = buildApp({ db })
  try {
    await app.listen({ port: Number(process.env.PORT || 3000), host: process.env.HOST || '127.0.0.1' })
  } catch (error) {
    app.log.error(error)
    process.exit(1)
  }
}
