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

fastify.get('/', async () => ({ status: 'AI Agent Running' }))

// Local development only: extraction without persistence.
fastify.post('/test-agent', { schema: { body: messageSchema } }, async (request) => {
  return qualificationAgent(request.body.message)
})

// MVP: create a lead, persist its inbound message and extracted state.
fastify.post('/leads/qualify', { schema: { body: messageSchema } }, async (request, reply) => {
  const { message, name, phone } = request.body
  const qualification = await qualificationAgent(message)
  const result = await qualifyNewLead({ name, phone, message, qualification })
  return reply.code(201).send(result)
})

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
