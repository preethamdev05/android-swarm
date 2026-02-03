import test from 'node:test';
import assert from 'node:assert/strict';
import { ExitCode, getExitCodeForError } from '../utils/exit-codes.js';
import { APIError, LimitExceededError, TimeoutError, ValidationError, VerificationError } from '../utils/errors.js';

test('maps validation errors to exit code 1', () => {
  const err = new ValidationError('bad input');
  assert.equal(getExitCodeForError(err), ExitCode.ValidationError);
});

test('maps API errors to exit code 2', () => {
  const err = new APIError('quota', 403, false);
  assert.equal(getExitCodeForError(err), ExitCode.ApiOrTimeoutError);
});

test('maps timeouts to exit code 2', () => {
  const err = new TimeoutError('timeout');
  assert.equal(getExitCodeForError(err), ExitCode.ApiOrTimeoutError);
});

test('maps token limit exceeded to exit code 2', () => {
  const err = new LimitExceededError('Token limit exceeded', 'tokens');
  assert.equal(getExitCodeForError(err), ExitCode.ApiOrTimeoutError);
});

test('maps verification failure to exit code 3', () => {
  const err = new VerificationError('verification failed');
  assert.equal(getExitCodeForError(err), ExitCode.VerificationFailure);
});
