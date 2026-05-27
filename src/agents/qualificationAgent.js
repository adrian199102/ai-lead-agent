import openai from '../services/openai.js'

export async function qualificationAgent(message) {

  const completion =
    await openai.chat.completions.create({

      model: 'gpt-4.1-mini',

      messages: [
        {
          role: 'system',
          content: `
Extract:
- budget
- timeline

Return JSON only.
`
        },
        {
          role: 'user',
          content: message
        }
      ],

      response_format: {
        type: 'json_object'
      }
    })

  return JSON.parse(
    completion.choices[0].message.content
  )
}