// Deterministic first-pass qualification. AI extracts facts; policy decides next step.
// Scores represent information completeness, NOT likelihood of conversion.
export function evaluateQualification(qualification = {}) {
  const budget = typeof qualification.budget === 'string' && qualification.budget.trim()
    ? qualification.budget.trim().slice(0, 200) : null
  const timeline = typeof qualification.timeline === 'string' && qualification.timeline.trim()
    ? qualification.timeline.trim().slice(0, 200) : null
  const missing_fields = []
  if (!budget) missing_fields.push('budget')
  if (!timeline) missing_fields.push('timeline')
  const completeness_score = (budget ? 50 : 0) + (timeline ? 50 : 0)
  const next_action = !budget ? 'ask_budget' : !timeline ? 'ask_timeline' : 'review_qualification'
  return {
    version: 1,
    completeness_score,
    missing_fields,
    next_action,
    requires_human_review: missing_fields.length === 0,
    // A lead is never marked qualified solely from extracted budget/timeline.
    qualification_decision: 'pending'
  }
}
