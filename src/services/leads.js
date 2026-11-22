import supabase from './supabase.js'

function assertDb(result, operation) {
  if (result.error) throw new Error(`${operation} failed: ${result.error.message}`)
  return result.data
}

export async function qualifyNewLead({ name, phone, message, qualification }) {
  const lead = assertDb(
    await supabase.from('leads').insert({
      name: name || null,
      phone: phone || null,
      stage: 'new',
      status: 'active',
      message_count: 1
    }).select('id').single(),
    'Create lead'
  )

  assertDb(
    await supabase.from('messages').insert({
      lead_id: lead.id,
      direction: 'inbound',
      message
    }),
    'Save inbound message'
  )

  assertDb(
    await supabase.from('lead_state').insert({
      lead_id: lead.id,
      budget: qualification.budget,
      timeline: qualification.timeline,
      qualified: false,
      score: 0,
      last_agent: 'qualification'
    }),
    'Save lead state'
  )

  return { lead_id: lead.id, qualification }
}
