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

/**
 * Determines if an error is transient (should be retried) or fatal.
 * 
 * Transient errors:
 * - Network errors (ECONNRESET, ENOTFOUND, etc.)
 * - Timeouts
 * - Server errors (5xx)
 * - Rate limiting (429)
 * 
 * Fatal errors:
 * - Authentication failures (401)
 * - Authorization/quota failures (403)
 * - Invalid requests (400)
 * - Validation errors
 */
export function isTransientError(error: unknown): boolean {
  if (error instanceof SwarmError) {
    return error.transient;
  }
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return message.includes('timeout') || 
           message.includes('network') ||
           message.includes('econnreset') ||
           message.includes('enotfound') ||
           message.includes('econnrefused') ||
           message.includes('etimedout');
  }
  return false;
}

/**
 * Classifies HTTP status codes into transient vs. fatal categories.
 * Includes Kimi-specific error handling.
 * 
 * @param statusCode - HTTP status code from API response
 * @returns Classification with transient flag and user-friendly message
 */
export function classifyHTTPError(statusCode: number): { transient: boolean; message: string } {
  // Rate limiting - transient, retry with backoff
  if (statusCode === 429) {
    return { 
      transient: true, 
      message: 'Rate limit exceeded. Retrying with backoff...' 
    };
  }
  
  // Server errors - transient, single retry
  if (statusCode >= 500 && statusCode < 600) {
    return { 
      transient: true, 
      message: `Server error (${statusCode}). Retrying...` 
    };
  }
  
  // Authentication - fatal
  if (statusCode === 401) {
    return { 
      transient: false, 
      message: 'Authentication failed. Check KIMI_API_KEY environment variable.' 
    };
  }
  
  // Quota/Authorization - fatal
  if (statusCode === 403) {
    return { 
      transient: false, 
      message: 'API quota exceeded or access forbidden. Check your Kimi account billing.' 
    };
  }
  
  // Bad request - fatal (includes context_length_exceeded, invalid_request_error)
  if (statusCode === 400) {
    return { 
      transient: false, 
      message: 'Invalid request. Possible causes: context length exceeded, malformed input, or unsupported parameters.' 
    };
  }
  
  // Not found - fatal
  if (statusCode === 404) {
    return { 
      transient: false, 
      message: 'API endpoint not found. Check KIMI_API_CONFIG.ENDPOINT configuration.' 
    };
  }
  
  // Other client errors (402, 405-499) - fatal
  if (statusCode >= 400 && statusCode < 500) {
    return { 
      transient: false, 
      message: `Client error (${statusCode}). Request cannot be completed.` 
    };
  }
  
  // Unknown status code - conservative: treat as fatal
  return { 
    transient: false, 
    message: `HTTP error: ${statusCode}` 
  };
}
