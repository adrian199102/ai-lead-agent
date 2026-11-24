/**
 * Deterministic conversation planner. The persisted assessment is authoritative:
 * never infer requirements from a global default or mark a lead qualified here.
 */
const QUESTIONS = Object.freeze({
  budget: 'What is your estimated budget?',
  timeline: 'When are you planning to proceed?'
})

export function planQualificationReply(assessment) {
  if (!assessment || !Array.isArray(assessment.required_fields) || !Array.isArray(assessment.missing_fields)) {
    throw new TypeError('A persisted qualification assessment is required')
  }
  const required = assessment.required_fields
  const missing = assessment.missing_fields
  if (required.length === 0 || required.some(field => !Object.hasOwn(QUESTIONS, field)) ||
      missing.some(field => !required.includes(field))) {
    throw new TypeError('Invalid qualification requirements')
  }
  if (assessment.qualification_decision === 'qualified') {
    return { status: 'qualified', next_action: 'complete', reply: 'Thank you. Your qualification is complete.' }
  }
  if (assessment.qualification_decision === 'disqualified') {
    return { status: 'disqualified', next_action: 'complete', reply: 'Thank you for sharing your information.' }
  }
  const next = required.find(field => missing.includes(field))
  if (next) return { status: 'awaiting_response', next_action: 'ask_' + next, reply: QUESTIONS[next] }
  return {
    status: 'awaiting_review', next_action: 'review_qualification',
    reply: 'Thank you. We have the details we need, and our team will review them.'
  }
}
