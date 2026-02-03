import { APIError, LimitExceededError, TimeoutError, ValidationError, VerificationError, CircuitBreakerError, SwarmError } from './errors.js';

export enum ExitCode {
  Success = 0,
  ValidationError = 1,
  ApiOrTimeoutError = 2,
  VerificationFailure = 3,
  UnexpectedError = 4
}

export function getExitCodeForError(error: unknown): ExitCode {
  if (error instanceof ValidationError) {
    return ExitCode.ValidationError;
  }

  if (error instanceof VerificationError) {
    return ExitCode.VerificationFailure;
  }

  if (error instanceof APIError || error instanceof TimeoutError) {
    return ExitCode.ApiOrTimeoutError;
  }

  if (error instanceof LimitExceededError) {
    return ExitCode.ApiOrTimeoutError;
  }

  if (error instanceof CircuitBreakerError) {
    return ExitCode.ApiOrTimeoutError;
  }

  if (error instanceof SwarmError) {
    return ExitCode.UnexpectedError;
  }

  return ExitCode.UnexpectedError;
}
