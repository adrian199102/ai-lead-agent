import OpenAI from 'openai'
import 'dotenv/config'

if (!process.env.OPENAI_API_KEY) {
  throw new Error('OPENAI_API_KEY is required')
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export default openai
