import test from 'node:test'
import assert from 'node:assert/strict'
import { planQualificationReply } from '../src/agents/conversationPlanner.js'

test('asks only for missing fields under default policy', () => {
  assert.deepEqual(planQualificationReply({
    required_fields: ['budget', 'timeline'], missing_fields: ['budget'], qualification_decision: 'pending'
  }), { status: 'awaiting_response', next_action: 'ask_budget', reply: 'What is your estimated budget?' })
})

test('timeline-only workspace requests human review when complete', () => {
  const result = planQualificationReply({
    required_fields: ['timeline'], missing_fields: [], qualification_decision: 'pending'
  })
  assert.equal(result.status, 'awaiting_review')
  assert.equal(result.next_action, 'review_qualification')
})

test('never asks budget when workspace requires timeline only', () => {
  const result = planQualificationReply({
    required_fields: ['timeline'], missing_fields: ['timeline'], qualification_decision: 'pending'
  })
  assert.equal(result.next_action, 'ask_timeline')
})

test('does not automatically qualify complete leads', () => {
  assert.equal(planQualificationReply({
    required_fields: ['budget', 'timeline'], missing_fields: [], qualification_decision: 'pending'
  }).status, 'awaiting_review')
})

test('rejects missing and inconsistent assessment input', () => {
  assert.throws(() => planQualificationReply(null), TypeError)
  assert.throws(() => planQualificationReply({
    required_fields: ['timeline'], missing_fields: ['budget'], qualification_decision: 'pending'
  }), TypeError)
})
