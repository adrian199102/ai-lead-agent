import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import 'dotenv/config'
import Fastify from 'fastify'
import { timingSafeEqual, createHash } from 'node:crypto'
import { orchestrateConversation } from './src/services/conversationOrchestrator.js'
import { createConversationStore } from './src/services/conversationStore.js'
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

  // Server-to-server only; the web proxy supplies a dedicated shared secret.
  fastify.post('/v1/website-chat/conversation', {
    schema:{body:{type:'object',additionalProperties:false,required:['widget_id','token','event_key','message'],properties:{
      widget_id:{type:'string',format:'uuid'},token:{type:'string',pattern:'^[a-fA-F0-9]{64} and tenant membership before any privileged database write.
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

  // Synthetic QA only: deterministic blank qualification, never calls the AI extractor.
  fastify.post('/v1/leads/qa-fresh', {
    schema: {
      body: { type: 'object', additionalProperties: false, required: ['business_id'],
        properties: { business_id: { type: 'string', format: 'uuid' } } },
      headers: { type: 'object', required: ['idempotency-key'],
        properties: { authorization: { type: 'string' },
          'idempotency-key': { type: 'string', minLength: 1, maxLength: 200 } } }
    }
  }, async (request, reply) => {
    const bearer = request.headers.authorization
    if (!bearer?.startsWith('Bearer ') || !bearer.slice(7).trim())
      return reply.code(401).send({ error: 'Unauthorized' })
    const { data: auth, error: authError } = await db.auth.getUser(bearer.slice(7))
    if (authError || !auth?.user?.id) return reply.code(401).send({ error: 'Unauthorized' })
    const businessId = request.body.business_id
    const { data: membership, error: membershipError } = await db.from('business_memberships')
      .select('role').eq('business_id', businessId).eq('user_id', auth.user.id).maybeSingle()
    if (membershipError) throw new Error('Unable to verify workspace membership', { cause: membershipError })
    if (!membership || !['owner', 'admin', 'agent'].includes(membership.role))
      return reply.code(403).send({ error: 'Forbidden' })

    const name = 'QA Fresh Lead'
    const message = 'Synthetic QA lead: budget and timeline not provided.'
    const eventKey = request.headers['idempotency-key']
    const hash = payloadHash({ name, phone: null, message })
    const { data: existing, error: lookupError } = await db.from('inbound_events')
      .select('lead_id,payload_hash').eq('business_id', businessId)
      .eq('event_key', eventKey).maybeSingle()
    if (lookupError) throw new Error('Unable to check QA event', { cause: lookupError })
    if (existing) {
      if (existing.payload_hash !== hash) return reply.code(409).send({ error: 'Idempotency key conflict' })
      return reply.code(200).send({ lead_id: existing.lead_id, duplicate: true })
    }
    const result = await qualifyNewLead({
      businessId, eventKey, name, phone: null, message,
      qualification: { budget: null, timeline: null }
    }, db)
    return reply.code(result.duplicate ? 200 : 201).send(result)
  })

  // Inbound message persistence and qualification reassessment run in one transaction.
  fastify.post('/v1/leads/:leadId/messages/inbound', {
    schema: {
      params: {
        type: 'object', required: ['leadId'],
        properties: { leadId: { type: 'string', format: 'uuid' } }
      },
      body: {
        type: 'object', additionalProperties: false, required: ['business_id', 'message'],
        properties: {
          business_id: { type: 'string', format: 'uuid' },
          message: { type: 'string', minLength: 1, maxLength: 4000 }
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

    const { business_id: businessId, message } = request.body
    const leadId = request.params.leadId
    const { data: membership, error: membershipError } = await db.from('business_memberships')
      .select('role').eq('business_id', businessId).eq('user_id', auth.user.id).maybeSingle()
    if (membershipError) throw new Error('Unable to verify business membership', { cause: membershipError })
    if (!membership || !['owner', 'admin', 'agent'].includes(membership.role)) {
      return reply.code(403).send({ error: 'Forbidden' })
    }
    // Check the event before invoking the model; the RPC remains authoritative for races.
    const hash = payloadHash({ name: leadId, phone: null, message })
    const eventKey = request.headers['idempotency-key']
    const { data: existing, error: eventError } = await db.from('lead_message_events')
      .select('payload_hash,lead_id').eq('business_id', businessId)
      .eq('event_key', eventKey).maybeSingle()
    if (eventError) throw new Error('Unable to check message event', { cause: eventError })
    if (existing && (existing.payload_hash !== hash || existing.lead_id !== leadId)) {
      return reply.code(409).send({ error: 'Idempotency key conflict' })
    }
    // Never overwrite previously known budget/timeline with an absent extraction.
    const qualification = existing ? { budget: null, timeline: null } : await extract(message)
    const { data, error } = await db.rpc('append_assess_and_reply_inbound_message', {
      p_business_id: businessId,
      p_lead_id: leadId,
      p_event_key: eventKey,
      p_payload_hash: hash,
      p_message: message,
      p_budget: qualification.budget ?? null,
      p_timeline: qualification.timeline ?? null
    })
    if (error) {
      if (error.code === '23505') return reply.code(409).send({ error: 'Idempotency key conflict' })
      if (error.code === 'P0002') return reply.code(404).send({ error: 'Lead or qualification state not found' })
      if (error.code === '22023') return reply.code(400).send({ error: 'Invalid inbound qualification' })
      throw new Error('Unable to persist inbound qualification', { cause: error })
    }
    const row = data?.[0]
    if (!row?.out_message_id) throw new Error('Missing persisted message ID')
    return reply.code(row.out_duplicate ? 200 : 201).send({
      message_id: row.out_message_id, lead_id: leadId, duplicate: row.out_duplicate,
      outbound: { message_id: row.out_outbound_message_id, message: row.out_outbound_reply, direction: 'outbound' },
      qualification: { budget: row.out_budget, timeline: row.out_timeline },
      assessment: {
        completeness_score: row.out_completeness_score,
        required_fields: row.out_required_fields,
        missing_fields: row.out_missing_fields,
        next_action: row.out_next_action,
        qualification_decision: row.out_qualification_decision,
        requires_human_review: row.out_next_action === 'review_qualification'
      }
    })
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

// Start the local HTTP listener only when this file is executed directly.
// Serverless runtimes import buildApp and must never bind a TCP port.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { default: db } = await import('./src/services/supabase.js')
  const app = buildApp({ db })
  try {
    await app.listen({ port: Number(process.env.PORT || 3000), host: process.env.HOST || '127.0.0.1' })
  } catch (error) {
    app.log.error(error)
    process.exit(1)
  }
}
},
      event_key:{type:'string',pattern:'^[a-zA-Z0-9_-]{8,100} and tenant membership before any privileged database write.
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

  // Synthetic QA only: deterministic blank qualification, never calls the AI extractor.
  fastify.post('/v1/leads/qa-fresh', {
    schema: {
      body: { type: 'object', additionalProperties: false, required: ['business_id'],
        properties: { business_id: { type: 'string', format: 'uuid' } } },
      headers: { type: 'object', required: ['idempotency-key'],
        properties: { authorization: { type: 'string' },
          'idempotency-key': { type: 'string', minLength: 1, maxLength: 200 } } }
    }
  }, async (request, reply) => {
    const bearer = request.headers.authorization
    if (!bearer?.startsWith('Bearer ') || !bearer.slice(7).trim())
      return reply.code(401).send({ error: 'Unauthorized' })
    const { data: auth, error: authError } = await db.auth.getUser(bearer.slice(7))
    if (authError || !auth?.user?.id) return reply.code(401).send({ error: 'Unauthorized' })
    const businessId = request.body.business_id
    const { data: membership, error: membershipError } = await db.from('business_memberships')
      .select('role').eq('business_id', businessId).eq('user_id', auth.user.id).maybeSingle()
    if (membershipError) throw new Error('Unable to verify workspace membership', { cause: membershipError })
    if (!membership || !['owner', 'admin', 'agent'].includes(membership.role))
      return reply.code(403).send({ error: 'Forbidden' })

    const name = 'QA Fresh Lead'
    const message = 'Synthetic QA lead: budget and timeline not provided.'
    const eventKey = request.headers['idempotency-key']
    const hash = payloadHash({ name, phone: null, message })
    const { data: existing, error: lookupError } = await db.from('inbound_events')
      .select('lead_id,payload_hash').eq('business_id', businessId)
      .eq('event_key', eventKey).maybeSingle()
    if (lookupError) throw new Error('Unable to check QA event', { cause: lookupError })
    if (existing) {
      if (existing.payload_hash !== hash) return reply.code(409).send({ error: 'Idempotency key conflict' })
      return reply.code(200).send({ lead_id: existing.lead_id, duplicate: true })
    }
    const result = await qualifyNewLead({
      businessId, eventKey, name, phone: null, message,
      qualification: { budget: null, timeline: null }
    }, db)
    return reply.code(result.duplicate ? 200 : 201).send(result)
  })

  // Inbound message persistence and qualification reassessment run in one transaction.
  fastify.post('/v1/leads/:leadId/messages/inbound', {
    schema: {
      params: {
        type: 'object', required: ['leadId'],
        properties: { leadId: { type: 'string', format: 'uuid' } }
      },
      body: {
        type: 'object', additionalProperties: false, required: ['business_id', 'message'],
        properties: {
          business_id: { type: 'string', format: 'uuid' },
          message: { type: 'string', minLength: 1, maxLength: 4000 }
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

    const { business_id: businessId, message } = request.body
    const leadId = request.params.leadId
    const { data: membership, error: membershipError } = await db.from('business_memberships')
      .select('role').eq('business_id', businessId).eq('user_id', auth.user.id).maybeSingle()
    if (membershipError) throw new Error('Unable to verify business membership', { cause: membershipError })
    if (!membership || !['owner', 'admin', 'agent'].includes(membership.role)) {
      return reply.code(403).send({ error: 'Forbidden' })
    }
    // Check the event before invoking the model; the RPC remains authoritative for races.
    const hash = payloadHash({ name: leadId, phone: null, message })
    const eventKey = request.headers['idempotency-key']
    const { data: existing, error: eventError } = await db.from('lead_message_events')
      .select('payload_hash,lead_id').eq('business_id', businessId)
      .eq('event_key', eventKey).maybeSingle()
    if (eventError) throw new Error('Unable to check message event', { cause: eventError })
    if (existing && (existing.payload_hash !== hash || existing.lead_id !== leadId)) {
      return reply.code(409).send({ error: 'Idempotency key conflict' })
    }
    // Never overwrite previously known budget/timeline with an absent extraction.
    const qualification = existing ? { budget: null, timeline: null } : await extract(message)
    const { data, error } = await db.rpc('append_assess_and_reply_inbound_message', {
      p_business_id: businessId,
      p_lead_id: leadId,
      p_event_key: eventKey,
      p_payload_hash: hash,
      p_message: message,
      p_budget: qualification.budget ?? null,
      p_timeline: qualification.timeline ?? null
    })
    if (error) {
      if (error.code === '23505') return reply.code(409).send({ error: 'Idempotency key conflict' })
      if (error.code === 'P0002') return reply.code(404).send({ error: 'Lead or qualification state not found' })
      if (error.code === '22023') return reply.code(400).send({ error: 'Invalid inbound qualification' })
      throw new Error('Unable to persist inbound qualification', { cause: error })
    }
    const row = data?.[0]
    if (!row?.out_message_id) throw new Error('Missing persisted message ID')
    return reply.code(row.out_duplicate ? 200 : 201).send({
      message_id: row.out_message_id, lead_id: leadId, duplicate: row.out_duplicate,
      outbound: { message_id: row.out_outbound_message_id, message: row.out_outbound_reply, direction: 'outbound' },
      qualification: { budget: row.out_budget, timeline: row.out_timeline },
      assessment: {
        completeness_score: row.out_completeness_score,
        required_fields: row.out_required_fields,
        missing_fields: row.out_missing_fields,
        next_action: row.out_next_action,
        qualification_decision: row.out_qualification_decision,
        requires_human_review: row.out_next_action === 'review_qualification'
      }
    })
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

// Start the local HTTP listener only when this file is executed directly.
// Serverless runtimes import buildApp and must never bind a TCP port.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { default: db } = await import('./src/services/supabase.js')
  const app = buildApp({ db })
  try {
    await app.listen({ port: Number(process.env.PORT || 3000), host: process.env.HOST || '127.0.0.1' })
  } catch (error) {
    app.log.error(error)
    process.exit(1)
  }
}
},message:{type:'string',minLength:1,maxLength:4000}
    }}}
  },async(request,reply)=>{
    const secret=env.CONVERSATION_INTERNAL_SECRET
    const supplied=request.headers['x-conversation-secret']
    if(env.INTELLIGENT_CONVERSATION_ENABLED!=='true'||!secret||secret.length<32) return reply.code(503).send({error:'Chat unavailable'})
    if(typeof supplied!=='string'||!timingSafeEqual(createHash('sha256').update(secret).digest(),createHash('sha256').update(supplied).digest())) return reply.code(401).send({error:'Unauthorized'})
    const {widget_id,token,event_key,message}=request.body
    if(!message.trim()) return reply.code(400).send({error:'Invalid message'})
    try{
      const result=await orchestrateConversation({widgetId:widget_id,tokenHash:createHash('sha256').update(token).digest('hex'),eventKey:event_key,message},{store:createConversationStore(db)})
      if(result.status==='busy') return reply.code(429).send({error:'Message processing; retry shortly'})
      return reply.header('Cache-Control','no-store').send({result:{out_lead_id:result.leadId,out_reply:result.reply,out_completeness:result.completeness,out_next_action:result.nextAction}})
    }catch(error){
      const status=error.code==='42501'?401:error.code==='23505'?409:error.code==='22023'?429:503
      return reply.code(status).send({error:status===401?'Chat session unavailable':status===409?'Message key conflict':status===429?'Please retry shortly':'Chat service unavailable'})
    }
  })

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

  // Synthetic QA only: deterministic blank qualification, never calls the AI extractor.
  fastify.post('/v1/leads/qa-fresh', {
    schema: {
      body: { type: 'object', additionalProperties: false, required: ['business_id'],
        properties: { business_id: { type: 'string', format: 'uuid' } } },
      headers: { type: 'object', required: ['idempotency-key'],
        properties: { authorization: { type: 'string' },
          'idempotency-key': { type: 'string', minLength: 1, maxLength: 200 } } }
    }
  }, async (request, reply) => {
    const bearer = request.headers.authorization
    if (!bearer?.startsWith('Bearer ') || !bearer.slice(7).trim())
      return reply.code(401).send({ error: 'Unauthorized' })
    const { data: auth, error: authError } = await db.auth.getUser(bearer.slice(7))
    if (authError || !auth?.user?.id) return reply.code(401).send({ error: 'Unauthorized' })
    const businessId = request.body.business_id
    const { data: membership, error: membershipError } = await db.from('business_memberships')
      .select('role').eq('business_id', businessId).eq('user_id', auth.user.id).maybeSingle()
    if (membershipError) throw new Error('Unable to verify workspace membership', { cause: membershipError })
    if (!membership || !['owner', 'admin', 'agent'].includes(membership.role))
      return reply.code(403).send({ error: 'Forbidden' })

    const name = 'QA Fresh Lead'
    const message = 'Synthetic QA lead: budget and timeline not provided.'
    const eventKey = request.headers['idempotency-key']
    const hash = payloadHash({ name, phone: null, message })
    const { data: existing, error: lookupError } = await db.from('inbound_events')
      .select('lead_id,payload_hash').eq('business_id', businessId)
      .eq('event_key', eventKey).maybeSingle()
    if (lookupError) throw new Error('Unable to check QA event', { cause: lookupError })
    if (existing) {
      if (existing.payload_hash !== hash) return reply.code(409).send({ error: 'Idempotency key conflict' })
      return reply.code(200).send({ lead_id: existing.lead_id, duplicate: true })
    }
    const result = await qualifyNewLead({
      businessId, eventKey, name, phone: null, message,
      qualification: { budget: null, timeline: null }
    }, db)
    return reply.code(result.duplicate ? 200 : 201).send(result)
  })

  // Inbound message persistence and qualification reassessment run in one transaction.
  fastify.post('/v1/leads/:leadId/messages/inbound', {
    schema: {
      params: {
        type: 'object', required: ['leadId'],
        properties: { leadId: { type: 'string', format: 'uuid' } }
      },
      body: {
        type: 'object', additionalProperties: false, required: ['business_id', 'message'],
        properties: {
          business_id: { type: 'string', format: 'uuid' },
          message: { type: 'string', minLength: 1, maxLength: 4000 }
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

    const { business_id: businessId, message } = request.body
    const leadId = request.params.leadId
    const { data: membership, error: membershipError } = await db.from('business_memberships')
      .select('role').eq('business_id', businessId).eq('user_id', auth.user.id).maybeSingle()
    if (membershipError) throw new Error('Unable to verify business membership', { cause: membershipError })
    if (!membership || !['owner', 'admin', 'agent'].includes(membership.role)) {
      return reply.code(403).send({ error: 'Forbidden' })
    }
    // Check the event before invoking the model; the RPC remains authoritative for races.
    const hash = payloadHash({ name: leadId, phone: null, message })
    const eventKey = request.headers['idempotency-key']
    const { data: existing, error: eventError } = await db.from('lead_message_events')
      .select('payload_hash,lead_id').eq('business_id', businessId)
      .eq('event_key', eventKey).maybeSingle()
    if (eventError) throw new Error('Unable to check message event', { cause: eventError })
    if (existing && (existing.payload_hash !== hash || existing.lead_id !== leadId)) {
      return reply.code(409).send({ error: 'Idempotency key conflict' })
    }
    // Never overwrite previously known budget/timeline with an absent extraction.
    const qualification = existing ? { budget: null, timeline: null } : await extract(message)
    const { data, error } = await db.rpc('append_assess_and_reply_inbound_message', {
      p_business_id: businessId,
      p_lead_id: leadId,
      p_event_key: eventKey,
      p_payload_hash: hash,
      p_message: message,
      p_budget: qualification.budget ?? null,
      p_timeline: qualification.timeline ?? null
    })
    if (error) {
      if (error.code === '23505') return reply.code(409).send({ error: 'Idempotency key conflict' })
      if (error.code === 'P0002') return reply.code(404).send({ error: 'Lead or qualification state not found' })
      if (error.code === '22023') return reply.code(400).send({ error: 'Invalid inbound qualification' })
      throw new Error('Unable to persist inbound qualification', { cause: error })
    }
    const row = data?.[0]
    if (!row?.out_message_id) throw new Error('Missing persisted message ID')
    return reply.code(row.out_duplicate ? 200 : 201).send({
      message_id: row.out_message_id, lead_id: leadId, duplicate: row.out_duplicate,
      outbound: { message_id: row.out_outbound_message_id, message: row.out_outbound_reply, direction: 'outbound' },
      qualification: { budget: row.out_budget, timeline: row.out_timeline },
      assessment: {
        completeness_score: row.out_completeness_score,
        required_fields: row.out_required_fields,
        missing_fields: row.out_missing_fields,
        next_action: row.out_next_action,
        qualification_decision: row.out_qualification_decision,
        requires_human_review: row.out_next_action === 'review_qualification'
      }
    })
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

// Start the local HTTP listener only when this file is executed directly.
// Serverless runtimes import buildApp and must never bind a TCP port.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { default: db } = await import('./src/services/supabase.js')
  const app = buildApp({ db })
  try {
    await app.listen({ port: Number(process.env.PORT || 3000), host: process.env.HOST || '127.0.0.1' })
  } catch (error) {
    app.log.error(error)
    process.exit(1)
  }
}
