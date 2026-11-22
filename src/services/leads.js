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
  return { lead_id: row.out_lead_id, duplicate: row.out_duplicate, qualification }
}
