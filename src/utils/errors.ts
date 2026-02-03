export class SwarmError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly transient: boolean = false
  ) {
    super(message);
    this.name = 'SwarmError';
  }
}

export class ValidationError extends SwarmError {
  constructor(message: string) {
    super(message, 'VALIDATION_ERROR', false);
    this.name = 'ValidationError';
  }
}

export class APIError extends SwarmError {
  constructor(
    message: string,
    public readonly statusCode: number,
    transient: boolean = false
  ) {
    super(message, 'API_ERROR', transient);
    this.name = 'APIError';
  }
}

export class TimeoutError extends SwarmError {
  constructor(message: string) {
    super(message, 'TIMEOUT_ERROR', true);
    this.name = 'TimeoutError';
  }
}

export class LimitExceededError extends SwarmError {
  constructor(message: string, public readonly limitType: string) {
    super(message, 'LIMIT_EXCEEDED', false);
    this.name = 'LimitExceededError';
  }
}

export class CircuitBreakerError extends SwarmError {
  constructor(message: string) {
    super(message, 'CIRCUIT_BREAKER', false);
    this.name = 'CircuitBreakerError';
  }
}

export function isTransientError(error: unknown): boolean {
  if (error instanceof SwarmError) {
    return error.transient;
  }
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return message.includes('timeout') || 
           message.includes('network') ||
           message.includes('econnreset') ||
           message.includes('enotfound');
  }
  return false;
}

export function classifyHTTPError(statusCode: number): { transient: boolean; message: string } {
  if (statusCode === 429) {
    return { transient: true, message: 'Rate limit exceeded' };
  }
  if (statusCode >= 500 && statusCode < 600) {
    return { transient: true, message: `Server error: ${statusCode}` };
  }
  if (statusCode >= 400 && statusCode < 500) {
    return { transient: false, message: `Client error: ${statusCode}` };
  }
  return { transient: false, message: `HTTP error: ${statusCode}` };
}
