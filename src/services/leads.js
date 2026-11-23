import { createHash } from 'node:crypto'

export function payloadHash({ name, phone, message }) {
  return createHash('sha256').update(JSON.stringify({
    name: name ?? null, phone: phone ?? null, message
  })).digest('hex')
}

export async function qualifyNewLead({ businessId, eventKey, name, phone, message, qualification }, db) {
  if (!businessId || !eventKey) throw new Error('Business ID and event key required')
  const { data, error } = await db.rpc('create_qualified_lead', {
    p_business_id: businessId,
    p_event_key: eventKey,
    p_payload_hash: payloadHash({ name, phone, message }),
    p_name: name ?? null,
    p_phone: phone ?? null,
    p_message: message,
    p_budget: qualification.budget,
    p_timeline: qualification.timeline
  })
  if (error) throw new Error('Failed to persist qualification', { cause: error })
  const row = data?.[0]
  if (!row?.out_lead_id) throw new Error('Missing lead ID from database')
  // The database trigger snapshots the workspace's rules atomically with lead creation.
  // Read that snapshot rather than recomputing a possibly different global policy.
  const { data: saved, error: assessmentError } = await db.from('qualification_assessments')
    .select('policy_version,required_fields,missing_fields,completeness_score,next_action,qualification_decision')
    .eq('business_id', businessId).eq('lead_id', row.out_lead_id)
    .eq('policy_version', 1).maybeSingle()
  if (assessmentError || !saved) throw new Error('Unable to read persisted qualification assessment', { cause: assessmentError })
  return {
    lead_id: row.out_lead_id, duplicate: row.out_duplicate, qualification,
    assessment: {
      version: saved.policy_version,
      completeness_score: saved.completeness_score,
      missing_fields: saved.missing_fields,
      next_action: saved.next_action,
      requires_human_review: saved.next_action === 'review_qualification',
      qualification_decision: saved.qualification_decision
    }
  }
}
