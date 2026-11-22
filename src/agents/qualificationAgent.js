import openai from '../services/openai.js'

export async function qualificationAgent(message) {
  const completion = await openai.chat.completions.create({
    model: 'gpt-4.1-mini',
    messages: [
      {
        role: 'system',
        content: 'Extract budget and timeline from the lead message. Return a JSON object with keys budget and timeline. Use null for information not provided. Never invent details.'
      },
      { role: 'user', content: message }
    ],
    response_format: { type: 'json_object' }
  })

  const raw = completion.choices[0]?.message?.content
  if (!raw) throw new Error('AI returned an empty response')
  const parsed = JSON.parse(raw)
  return {
    budget: typeof parsed.budget === 'string' ? parsed.budget.slice(0, 200) : null,
    timeline: typeof parsed.timeline === 'string' ? parsed.timeline.slice(0, 200) : null
  }
}
