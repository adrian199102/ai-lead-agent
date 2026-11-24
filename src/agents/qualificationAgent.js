export function normalizeBudget(value) {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed ? trimmed.slice(0, 200) : null
  }
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return String(value)
  }
  return null
}

export async function qualificationAgent(message) {
  // The selected budget band is supplied explicitly by the customer-facing form.
  // Preserve it as a category, not a falsely precise numeric amount.
  const explicitBand = message.match(/my estimated budget range is (Below PHP 5,000|PHP 5,000[–-]14,999|PHP 15,000[–-]29,999|PHP 30,000[–-]49,999|PHP 50,000[–-]99,999|PHP 100,000 or more|Not sure yet)(?=[.!]|$)/i)
  const selectedBudget = explicitBand ? explicitBand[1] : null
  // Import the live provider only when the real agent runs. Tests inject a mock
  // extractor and must not require production credentials during module load.
  const { default: openai } = await import('../services/openai.js')
  const completion = await openai.chat.completions.create({
    model: 'gpt-4.1-mini',
    messages: [
      {
        role: 'system',
        content: 'Extract budget and timeline from the lead message. Budget may be a customer-selected range (e.g. PHP 5,000–14,999) rather than an exact amount; preserve the range verbatim and never invent a precise number. Return a JSON object with keys budget and timeline. Use null for information not provided. Never invent details.'
      },
      { role: 'user', content: message }
    ],
    response_format: { type: 'json_object' }
  })

  const raw = completion.choices[0]?.message?.content
  if (!raw) throw new Error('AI returned an empty response')
  const parsed = JSON.parse(raw)
  return {
    budget: selectedBudget || normalizeBudget(parsed.budget),
    timeline: typeof parsed.timeline === 'string' ? parsed.timeline.slice(0, 200) : null
  }
}
