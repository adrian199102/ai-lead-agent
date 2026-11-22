import 'dotenv/config'
import Fastify from 'fastify'
import { qualificationAgent } from './src/agents/qualificationAgent.js'
import { qualifyNewLead } from './src/services/leads.js'

const fastify = Fastify({ logger: true })

const messageSchema = {
  type: 'object',
  required: ['message'],
  additionalProperties: false,
  properties: {
    message: { type: 'string', minLength: 1, maxLength: 4000 },
    name: { type: 'string', minLength: 1, maxLength: 200 },
    phone: { type: 'string', minLength: 3, maxLength: 40 }
  }
}

function requireDevApiKey(request, reply, done) {
  const configured = process.env.DEV_API_KEY
  if (!configured || request.headers['x-api-key'] !== configured) {
    reply.code(401).send({ error: 'Unauthorized' })
    return
  }
  done()
}

fastify.get('/', async () => ({ status: 'AI Agent Running' }))

// Development-only routes. Do not expose publicly without production authentication,
// tenant authorization, and rate limiting.
if (process.env.NODE_ENV !== 'production') {
  fastify.post('/test-agent', {
    preHandler: requireDevApiKey,
    schema: { body: messageSchema }
  }, async (request) => qualificationAgent(request.body.message))

  fastify.post('/leads/qualify', {
    preHandler: requireDevApiKey,
    schema: { body: messageSchema }
  }, async (request, reply) => {
    const { message, name, phone } = request.body
    const qualification = await qualificationAgent(message)
    const result = await qualifyNewLead({ name, phone, message, qualification })
    return reply.code(201).send(result)
  })
}

fastify.setErrorHandler((error, request, reply) => {
  request.log.error({ err: error }, 'Request failed')
  const status = error.statusCode && error.statusCode < 500 ? error.statusCode : 500
  return reply.code(status).send({
    error: status === 500 ? 'Internal server error' : 'Invalid request'
  })
})

const port = Number(process.env.PORT || 3000)
try {
  await fastify.listen({ port, host: process.env.HOST || '127.0.0.1' })
} catch (error) {
  fastify.log.error(error)
  process.exit(1)
}
