import dotenv from 'dotenv'
dotenv.config()

import Fastify from 'fastify'

import { qualificationAgent }
from './src/agents/qualificationAgent.js'

const fastify = Fastify({
  logger: true
})

fastify.get('/', async () => {
  return {
    status: 'AI Agent Running'
  }
})

fastify.post('/test-agent', async (request) => {

  const { message } = request.body

  const result =
    await qualificationAgent(message)

  return result
})

fastify.listen({
  port: 3000
})