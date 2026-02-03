const parsePositiveInt = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const LIMITS = {
  MAX_API_CALLS: 80,
  MAX_TOTAL_TOKENS: 200000,
  WALL_CLOCK_TIMEOUT_MS: 90 * 60 * 1000, // 90 minutes
  MAX_STEP_RETRIES: 3,
  MAX_PLAN_STEPS: 25,
  MAX_FILE_SIZE_BYTES: 50 * 1024, // 50KB per file
  MAX_WORKSPACE_SIZE_BYTES: 1024 * 1024 * 1024, // 1GB per task workspace
  API_TIMEOUT_MS: 120 * 1000, // 120 seconds
  MAX_SUSTAINED_MEMORY_MB: 500,
  MIN_DISK_SPACE_MB: 100,
  CONSECUTIVE_FAILURE_LIMIT: 3,
  API_ERROR_RATE_WINDOW_MS: 60 * 1000, // 60 seconds
  API_ERROR_RATE_LIMIT: 5, // 5 errors within window
  CRITIC_REJECTION_RATE_THRESHOLD: 0.5,
  MIN_STEPS_FOR_REJECTION_RATE: 5
} as const;

/**
 * Per-agent token budgets to prevent token starvation.
 * 
 * Total budget: 200K tokens
 * Allocation strategy:
 * - Reserve tokens for each phase
 * - Ensure downstream agents (Critic, Verifier) have sufficient budget
 * - Account for typical token consumption patterns
 * 
 * Input = user prompts + system prompts + context
 * Output = agent response
 */
export const TOKEN_LIMITS = {
  // Planner: generates execution plan
  PLANNER_INPUT: 4000,   // Task spec + coding profile
  PLANNER_OUTPUT: 2000,  // JSON plan structure
  PLANNER_TOTAL: 6000,
  
  // Coder: generates file content
  CODER_INPUT: 6000,     // Step + task spec + dependencies + prior rejection
  CODER_OUTPUT: 8000,    // Full Kotlin/XML/Gradle file
  CODER_TOTAL: 14000,
  
  // Critic: reviews generated code
  CRITIC_INPUT: 10000,   // File content + step + task spec
  CRITIC_OUTPUT: 1000,   // Review decision + issues
  CRITIC_TOTAL: 11000,
  
  // Verifier: validates entire project
  VERIFIER_INPUT: 8000,  // All file paths + task spec
  VERIFIER_OUTPUT: 1000, // Verification report
  VERIFIER_TOTAL: 9000,
  
  // Total per typical step: Coder (14K) + Critic (11K) = 25K
  // With 25 steps max: 25K * 25 = 625K theoretical, but retry limits reduce this
  // With retry budget: ~8 steps * 25K = 200K practical
} as const;

export const RETRY_CONFIG = {
  // Exponential backoff for rate limiting
  RATE_LIMIT_DELAYS_MS: [1000, 2000, 4000], // 1s, 2s, 4s
  SERVER_ERROR_DELAY_MS: 5000, // 5s for server errors
  MAX_RATE_LIMIT_RETRIES: 3,
  MAX_SERVER_ERROR_RETRIES: 1,
  
  // Jitter factor for backoff randomization
  JITTER_FACTOR: 0.25 // ±25% of base delay
} as const;

export const RATE_LIMITER = {
  REQUESTS_PER_MINUTE: parsePositiveInt(process.env.SWARM_API_RATE_LIMIT, 10),
  BURST: parsePositiveInt(process.env.SWARM_API_RATE_BURST, 3)
} as const;

export const PATHS = {
  OPENCLAW_ROOT: process.env.HOME + '/.openclaw',
  get WORKSPACE_ROOT() {
    return process.env.SWARM_WORKSPACE_ROOT || this.OPENCLAW_ROOT + '/workspace/android-swarm';
  },
  get DATABASE() {
    return this.OPENCLAW_ROOT + '/swarm.db';
  },
  get LOGS_DIR() {
    return this.OPENCLAW_ROOT + '/logs';
  },
  get PID_FILE() {
    return this.OPENCLAW_ROOT + '/swarm.pid';
  },
  get HEARTBEAT_FILE() {
    return this.OPENCLAW_ROOT + '/.heartbeat';
  },
  get EMERGENCY_STOP_FILE() {
    return this.WORKSPACE_ROOT + '/EMERGENCY_STOP';
  }
} as const;

/**
 * Google Gemini API configuration.
 * 
 * Model selection:
 * - gemini-1.5-pro: Best quality, 2M context window (default)
 * - gemini-1.5-flash: Faster, cheaper, 1M context
 * - gemini-1.5-flash-8b: Fastest, cheapest, 1M context
 * 
 * Override via LLM_MODEL environment variable:
 *   export LLM_MODEL=gemini-1.5-flash-8b
 */
export const LLM_CONFIG = {
  // Primary model (configurable via env var)
  MODEL: process.env.LLM_MODEL || 'gemini-1.5-pro',
  
  // Fallback model for cost optimization or API issues
  FALLBACK_MODEL: 'gemini-1.5-flash-8b',
  
  // Gemini API endpoint
  ENDPOINT: 'https://generativelanguage.googleapis.com/v1beta/models',
  
  // API timeout: configurable via SWARM_API_TIMEOUT env var (seconds)
  TIMEOUT_MS: parseInt(process.env.SWARM_API_TIMEOUT || '120') * 1000,
  
  // Gemini 1.5 Pro specifications:
  // - Max input tokens: 2,097,152 (2M context window)
  // - Max output tokens: 8,192
  // - Rate limits (free tier): 15 RPM, 1M TPD
  // - Rate limits (paid tier): varies by plan
} as const;

/**
 * @deprecated Use LLM_CONFIG instead. Kept for backward compatibility.
 * This will be removed in next major version.
 */
export const KIMI_API_CONFIG = {
  ENDPOINT: LLM_CONFIG.ENDPOINT,
  MODEL: LLM_CONFIG.MODEL,
  TIMEOUT_MS: LLM_CONFIG.TIMEOUT_MS,
} as const;
