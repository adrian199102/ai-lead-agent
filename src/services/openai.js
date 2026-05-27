import OpenAI from 'openai'
import dotenv from 'dotenv'

dotenv.config()

const apiKey = process.env.OPENAI_API_KEY

console.log('OPENAI KEY:', apiKey)

const openai = new OpenAI({
  apiKey: apiKey
})

export default openai