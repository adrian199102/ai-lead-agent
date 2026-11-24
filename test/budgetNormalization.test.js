import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeBudget } from '../src/agents/qualificationAgent.js'

test('numeric AI budget is normalized to text for persistence', () => {
  assert.equal(normalizeBudget(100000), '100000')
  assert.equal(normalizeBudget(0), '0')
  assert.equal(normalizeBudget('PHP 100,000'), 'PHP 100,000')
})

test('invalid budget values cannot be persisted as facts', () => {
  for (const value of [null, undefined, NaN, Infinity, -100, {}, [], true, '  ']) {
    assert.equal(normalizeBudget(value), null)
  }
})
