import test from 'node:test'
import assert from 'node:assert/strict'
import { evaluateQualification } from '../src/services/qualificationEngine.js'

test('missing facts produce a budget question without claiming qualification', () => {
  assert.deepEqual(evaluateQualification(), {
    version: 1, completeness_score: 0, missing_fields: ['budget', 'timeline'],
    next_action: 'ask_budget', requires_human_review: false,
    qualification_decision: 'pending'
  })
})
test('known budget leads to timeline question', () => {
  const result = evaluateQualification({ budget: 'PHP 100,000', timeline: null })
  assert.equal(result.completeness_score, 50)
  assert.equal(result.next_action, 'ask_timeline')
})
test('both fields require review rather than automatic qualification', () => {
  const result = evaluateQualification({ budget: '100k', timeline: 'next month' })
  assert.equal(result.completeness_score, 100)
  assert.deepEqual(result.missing_fields, [])
  assert.equal(result.next_action, 'review_qualification')
  assert.equal(result.requires_human_review, true)
  assert.equal(result.qualification_decision, 'pending')
})
test('blank or malformed model outputs cannot inflate completeness', () => {
  const result = evaluateQualification({ budget: '  ', timeline: { injected: true } })
  assert.equal(result.completeness_score, 0)
  assert.equal(result.next_action, 'ask_budget')
})
