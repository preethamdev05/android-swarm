export const LIMITS = {
  MAX_API_CALLS: 80,
  MAX_TOTAL_TOKENS: 200000,
  WALL_CLOCK_TIMEOUT_MS: 90 * 60 * 1000,
  MAX_STEP_RETRIES: 3,
  MAX_PLAN_STEPS: 25,
  MAX_FILE_SIZE_BYTES: 50 * 1024,
  API_TIMEOUT_MS: 30 * 1000,
  MAX_SUSTAINED_MEMORY_MB: 500,
  MIN_DISK_SPACE_MB: 100,
  CONSECUTIVE_FAILURE_LIMIT: 3,
  API_ERROR_RATE_WINDOW_MS: 60 * 1000,
  API_ERROR_RATE_LIMIT: 5,
  CRITIC_REJECTION_RATE_THRESHOLD: 0.5,
  MIN_STEPS_FOR_REJECTION_RATE: 5
} as const;

export const TOKEN_LIMITS = {
  PLANNER_INPUT: 4000,
  PLANNER_OUTPUT: 2000,
  CODER_INPUT: 6000,
  CODER_OUTPUT: 8000,
  CRITIC_INPUT: 10000,
  CRITIC_OUTPUT: 1000,
  VERIFIER_INPUT: 8000,
  VERIFIER_OUTPUT: 1000
} as const;

export const RETRY_CONFIG = {
  RATE_LIMIT_DELAYS_MS: [1000, 2000, 4000],
  SERVER_ERROR_DELAY_MS: 5000,
  MAX_RATE_LIMIT_RETRIES: 3,
  MAX_SERVER_ERROR_RETRIES: 1
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
  get EMERGENCY_STOP_FILE() {
    return this.WORKSPACE_ROOT + '/EMERGENCY_STOP';
  }
} as const;

export const KIMI_API_CONFIG = {
  ENDPOINT: 'https://api.moonshot.cn/v1/chat/completions',
  MODEL: 'kimi-k2.5',
  TIMEOUT_MS: parseInt(process.env.SWARM_API_TIMEOUT || '30') * 1000
} as const;
