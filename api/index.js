// Vercel Node.js Function adapter for the existing Fastify application.
// The Supabase service-role key stays server-side in the Vercel environment.
import { buildApp } from '../server.js'
import db from '../src/services/supabase.js'

const app = buildApp({ db })
const ready = app.ready()

export default async function handler(request, response) {
  await ready
  app.server.emit('request', request, response)
}
