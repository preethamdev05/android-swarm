import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCriticResponse, validatePlannerResponse } from '../utils/llm-validation.js';

test('rejects invalid planner response schema', () => {
  assert.throws(() => validatePlannerResponse({}), /Planner response failed schema validation/);
});

test('rejects invalid critic response schema', () => {
  assert.throws(
    () => validateCriticResponse({ decision: 'ACCEPT' }),
    /Critic response failed schema validation/
  );
});
