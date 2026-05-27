export function routeLead(state) {

  if (!state.name) {
    return 'engagement'
  }

  if (!state.budget || !state.timeline) {
    return 'qualification'
  }

  if (state.qualified) {
    return 'scheduling'
  }

  return 'followup'
}