// Lightweight deployment health endpoint. Does not import secrets or database clients.
export default function handler(_request, response) {
  response.setHeader('Cache-Control', 'no-store')
  response.status(200).json({ service: 'ai-lead-agent-api', status: 'online', authentication_tests: 'pending' })
}
