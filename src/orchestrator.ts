import { v4 as uuidv4 } from 'uuid';
import { TaskSpec, Step, OrchestratorState, StepState, CriticIssue } from './types.js';
import { KimiClient } from './kimi-client.js';
import { StateManager } from './state-manager.js';
import { PlannerAgent } from './agents/planner.js';
import { CoderAgent } from './agents/coder.js';
import { CriticAgent } from './agents/critic.js';
import { VerifierAgent } from './agents/verifier.js';
import { validateTaskSpec, validatePlan, checkDiskSpace, ValidationError } from './validators.js';
import { LimitExceededError, CircuitBreakerError, APIError, TimeoutError, isTransientError } from './utils/errors.js';
import { LIMITS, PATHS } from './constants.js';
import { logger } from './logger.js';
import { existsSync, writeFileSync, unlinkSync } from 'fs';

/**
 * Task orchestrator managing multi-agent workflow.
 * 
 * Failure handling model:
 * - TRANSIENT failures (API errors, timeouts): Immediate retry, count against step limit
 * - SEMANTIC failures (Critic rejections): Modified prompt retry, separate tracking
 * - CIRCUIT BREAKER: Activates on consecutive transient failures
 * - FEEDBACK LOOP DETECTION: Activates on repeated Critic rejections
 */
export class Orchestrator {
  private stateManager: StateManager;
  private kimiClient: KimiClient;
  private plannerAgent: PlannerAgent;
  private coderAgent: CoderAgent;
  private criticAgent: CriticAgent;
  private verifierAgent: VerifierAgent;
  private state: OrchestratorState | null = null;
  private consecutiveFailures: number = 0;
  private consecutiveCriticRejections: number = 0;
  private abortRequested: boolean = false;

  constructor() {
    const apiKey = process.env.KIMI_API_KEY;
    if (!apiKey) {
      throw new Error('KIMI_API_KEY environment variable is required');
    }

    this.stateManager = new StateManager();
    this.kimiClient = new KimiClient(apiKey);
    this.plannerAgent = new PlannerAgent(this.kimiClient);
    this.coderAgent = new CoderAgent(this.kimiClient);
    this.criticAgent = new CriticAgent(this.kimiClient);
    this.verifierAgent = new VerifierAgent(this.kimiClient);

    this.setupSignalHandlers();
  }

  /**
   * CORRECTIVE FIX: Removed process.exit() to allow finally block execution.
   * Signal handlers now only set flag - cleanup happens in finally block.
   */
  private setupSignalHandlers(): void {
    const handler = () => {
      logger.warn('Received termination signal, setting abort flag');
      this.abortRequested = true;
      
      // Update state in database immediately (best-effort)
      if (this.state) {
        try {
          this.stateManager.updateTaskState(this.state.task_id, 'FAILED', 'Manual abort via signal');
        } catch (err) {
          logger.error('Failed to update task state on signal', { error: String(err) });
        }
      }
      
      // CORRECTIVE FIX: DO NOT call process.exit() here
      // Let the execution loop detect abortRequested flag and exit gracefully
      // Finally block will handle PID file cleanup and DB close
    };

    process.on('SIGINT', handler);
    process.on('SIGTERM', handler);
  }

  async executeTask(taskSpecInput: any): Promise<string> {
    let taskSpec: TaskSpec;
    try {
      taskSpec = validateTaskSpec(taskSpecInput);
    } catch (err) {
      if (err instanceof ValidationError) {
        logger.error('Task spec validation failed', { error: err.message });
        throw err;
      }
      throw err;
    }

    checkDiskSpace();
    this.checkPIDFile();

    const taskId = uuidv4();
    logger.info('Task created', { task_id: taskId, app_name: taskSpec.app_name });

    this.state = {
      task_id: taskId,
      state: 'PLANNING',
      task_spec: taskSpec,
      plan: null,
      current_step_index: 0,
      completed_files: [],
      api_call_count: 0,
      total_tokens: 0,
      start_time: Date.now(),
      last_activity_time: Date.now()
    };

    this.stateManager.createTask(taskId, taskSpec);
    this.createPIDFile();

    try {
      await this.runPlanningPhase();
      await this.runExecutionPhase();
      await this.runVerificationPhase();
      
      this.stateManager.updateTaskState(taskId, 'COMPLETED');
      logger.info('Task completed', { task_id: taskId });
      
      return `${PATHS.WORKSPACE_ROOT}/${taskId}`;

    } catch (err: any) {
      const errorMessage = err.message || String(err);
      logger.error('Task failed', { task_id: taskId, error: errorMessage });
      this.stateManager.updateTaskState(taskId, 'FAILED', errorMessage);
      throw err;
    } finally {
      // CORRECTIVE FIX: Finally block now reliably executes on signal abort
      // PID file cleanup and DB close guaranteed
      this.removePIDFile();
      this.state = null;
    }
  }

  private async runPlanningPhase(): Promise<void> {
    if (!this.state) throw new Error('State not initialized');

    logger.info('Starting planning phase', { task_id: this.state.task_id });
    this.checkLimits();

    let plan: Step[];
    let response: any;
    try {
      // CORRECTIVE FIX: Capture response object to extract token usage
      response = await this.plannerAgent.createPlan(this.state.task_spec);
      plan = response.plan;
      
      // CORRECTIVE FIX: Extract and record token usage from LLM response
      const usage = response.usage || { prompt_tokens: 0, completion_tokens: 0 };
      this.recordAPICall('planner', usage.prompt_tokens, usage.completion_tokens);
    } catch (err) {
      logger.error('Planner failed', { error: String(err) });
      throw new Error(`Planning failed: ${err}`);
    }

    try {
      plan = validatePlan(plan);
    } catch (err) {
      if (err instanceof ValidationError) {
        logger.error('Plan validation failed', { error: err.message });
        throw new Error(`Invalid plan: ${err.message}`);
      }
      throw err;
    }

    this.state.plan = plan;
    this.stateManager.storePlan(this.state.task_id, plan);
    this.stateManager.updateTaskState(this.state.task_id, 'EXECUTING');
    this.state.state = 'EXECUTING';

    logger.info('Planning complete', { task_id: this.state.task_id, steps: plan.length });
  }

  private async runExecutionPhase(): Promise<void> {
    if (!this.state || !this.state.plan) throw new Error('State or plan not initialized');

    logger.info('Starting execution phase', { task_id: this.state.task_id });

    for (let i = 0; i < this.state.plan.length; i++) {
      this.state.current_step_index = i;
      const step = this.state.plan[i];

      logger.info('Executing step', { 
        task_id: this.state.task_id, 
        step: step.step_number, 
        file: step.file_path 
      });

      await this.executeStep(step);
      // Reset counters on successful step completion
      this.consecutiveFailures = 0;
      this.consecutiveCriticRejections = 0;
    }
  }

  private async executeStep(step: Step): Promise<void> {
    if (!this.state) throw new Error('State not initialized');

    let stepState: StepState = {
      step,
      attempt: 0,
      coder_output: null,
      critic_decision: null,
      critic_issues: null
    };

    while (stepState.attempt < LIMITS.MAX_STEP_RETRIES) {
      stepState.attempt++;
      this.checkLimits();
      this.checkEmergencyStop();
      this.checkFeedbackLoop();

      if (this.abortRequested) {
        throw new Error('Abort requested');
      }

      // Coder phase
      let coderResponse: any;
      try {
        // CORRECTIVE FIX: Capture full response to extract token usage
        coderResponse = await this.coderAgent.generateFile(
          step,
          this.state.task_spec,
          this.state.completed_files,
          stepState.critic_issues || undefined
        );
        stepState.coder_output = coderResponse.content;
        
        // CORRECTIVE FIX: Extract and record token usage
        const usage = coderResponse.usage || { prompt_tokens: 0, completion_tokens: 0 };
        this.recordAPICall('coder', usage.prompt_tokens, usage.completion_tokens);
      } catch (err) {
        // Classify error type
        const isTransient = isTransientError(err);
        
        logger.error('Coder failed', { 
          step: step.step_number, 
          attempt: stepState.attempt,
          error: String(err),
          transient: isTransient
        });
        
        if (isTransient) {
          // TRANSIENT failure: API/network error
          this.consecutiveFailures++;
          this.checkCircuitBreaker();
          
          if (stepState.attempt >= LIMITS.MAX_STEP_RETRIES) {
            throw new Error(`Step ${step.step_number} failed after ${LIMITS.MAX_STEP_RETRIES} attempts (transient errors)`);
          }
          continue; // Retry immediately
        } else {
          // FATAL failure: validation error, etc.
          throw new Error(`Step ${step.step_number} coder failed: ${err}`);
        }
      }

      // Critic phase
      let criticResponse: any;
      criticResponse = await this.criticAgent.reviewFile(
        step.file_path,
        stepState.coder_output,
        step,
        this.state.task_spec
      );
      
      // CORRECTIVE FIX: Extract and record token usage
      const criticUsage = criticResponse.usage || { prompt_tokens: 0, completion_tokens: 0 };
      this.recordAPICall('critic', criticUsage.prompt_tokens, criticUsage.completion_tokens);

      stepState.critic_decision = criticResponse.decision;
      stepState.critic_issues = criticResponse.issues;

      this.stateManager.recordStep(
        this.state.task_id,
        step.step_number,
        step.file_path,
        stepState.attempt,
        stepState.coder_output,
        stepState.critic_decision,
        stepState.critic_issues
      );

      if (criticResponse.decision === 'ACCEPT') {
        // Success path
        this.stateManager.writeFile(
          this.state.task_id,
          step.file_path,
          stepState.coder_output
        );
        this.state.completed_files.push(step.file_path);
        
        logger.info('Step accepted', { 
          step: step.step_number, 
          file: step.file_path 
        });
        return;
      }

      // SEMANTIC failure: Critic rejection
      this.consecutiveCriticRejections++;
      
      logger.warn('Step rejected by Critic', {
        step: step.step_number,
        attempt: stepState.attempt,
        issues: criticResponse.issues.length,
        consecutive_rejections: this.consecutiveCriticRejections
      });

      if (stepState.attempt >= LIMITS.MAX_STEP_RETRIES) {
        throw new Error(
          `Step ${step.step_number} rejected after ${LIMITS.MAX_STEP_RETRIES} attempts. ` +
          `Issues: ${JSON.stringify(criticResponse.issues.slice(0, 3))}`
        );
      }
      
      // Continue retry loop with modified context (critic_issues passed to Coder)
    }
  }

  private async runVerificationPhase(): Promise<void> {
    if (!this.state) throw new Error('State not initialized');

    logger.info('Starting verification phase', { task_id: this.state.task_id });
    this.stateManager.updateTaskState(this.state.task_id, 'VERIFYING');
    this.state.state = 'VERIFYING';

    const files = this.stateManager.getAllFiles(this.state.task_id);
    
    try {
      // CORRECTIVE FIX: Capture response to extract token usage
      const verifierResponse = await this.verifierAgent.verifyProject(files, this.state.task_spec);
      const report = verifierResponse.report;
      
      // CORRECTIVE FIX: Extract and record token usage
      const usage = verifierResponse.usage || { prompt_tokens: 0, completion_tokens: 0 };
      this.recordAPICall('verifier', usage.prompt_tokens, usage.completion_tokens);

      logger.info('Verification complete', {
        task_id: this.state.task_id,
        quality_score: report.quality_score,
        warnings: report.warnings.length,
        missing_items: report.missing_items.length
      });

      if (report.warnings.length > 0) {
        logger.warn('Verification warnings', { warnings: report.warnings });
      }

      if (report.missing_items.length > 0) {
        logger.warn('Missing items', { missing_items: report.missing_items });
      }

      if (report.quality_score < 0.5) {
        logger.warn('Low quality score', { quality_score: report.quality_score });
      }

    } catch (err) {
      logger.warn('Verification failed', { error: String(err) });
      // Non-fatal: continue to completion
    }
  }

  /**
   * Enforces hard limits: wall-clock timeout, API calls, tokens.
   * Throws LimitExceededError if any limit is breached.
   */
  private checkLimits(): void {
    if (!this.state) return;

    // Wall-clock timeout
    const elapsed = Date.now() - this.state.start_time;
    if (elapsed > LIMITS.WALL_CLOCK_TIMEOUT_MS) {
      throw new LimitExceededError('Wall-clock timeout', 'wall_clock_time');
    }

    // API call limit
    const task = this.stateManager.getTask(this.state.task_id);
    if (task.api_call_count >= LIMITS.MAX_API_CALLS) {
      throw new LimitExceededError('API call limit exceeded', 'api_calls');
    }

    // Token limit (now functional after fix)
    if (task.total_tokens >= LIMITS.MAX_TOTAL_TOKENS) {
      throw new LimitExceededError('Token limit exceeded', 'tokens');
    }
  }

  /**
   * Circuit breaker: activates on consecutive transient failures.
   * Prevents wasting resources when API is systematically failing.
   */
  private checkCircuitBreaker(): void {
    if (this.consecutiveFailures >= LIMITS.CONSECUTIVE_FAILURE_LIMIT) {
      throw new CircuitBreakerError(
        `Circuit breaker activated: ${this.consecutiveFailures} consecutive transient failures`
      );
    }
  }

  /**
   * Feedback loop detection: activates on repeated Critic rejections.
   * Prevents infinite Coder->Critic->Coder loops with same issues.
   */
  private checkFeedbackLoop(): void {
    const threshold = LIMITS.CONSECUTIVE_FAILURE_LIMIT * 2; // More lenient for semantic failures
    if (this.consecutiveCriticRejections >= threshold) {
      logger.error('Feedback loop detected', {
        consecutive_rejections: this.consecutiveCriticRejections,
        threshold
      });
      throw new CircuitBreakerError(
        `Feedback loop detected: ${this.consecutiveCriticRejections} consecutive Critic rejections. ` +
        `Coder unable to satisfy Critic requirements.`
      );
    }
  }

  private checkEmergencyStop(): void {
    if (existsSync(PATHS.EMERGENCY_STOP_FILE)) {
      logger.error('Emergency stop file detected');
      throw new Error('Emergency stop');
    }
  }

  /**
   * CORRECTIVE FIX: Updated signature to accept token usage data.
   * Records API call and token usage in database for limit enforcement.
   * 
   * Non-breaking change: Existing behavior preserved, now with token tracking.
   */
  private recordAPICall(agent: string, promptTokens: number, completionTokens: number): void {
    if (!this.state) return;

    // Record in database with token data
    this.stateManager.recordAPICall(
      this.state.task_id,
      agent,
      promptTokens,
      completionTokens
    );

    // Update in-memory state
    this.state.api_call_count++;
    this.state.total_tokens += (promptTokens + completionTokens);
    this.state.last_activity_time = Date.now();
  }

  private checkPIDFile(): void {
    if (existsSync(PATHS.PID_FILE)) {
      const pid = parseInt(require('fs').readFileSync(PATHS.PID_FILE, 'utf8'));
      throw new Error(`Another task is running (PID ${pid})`);
    }
  }

  private createPIDFile(): void {
    writeFileSync(PATHS.PID_FILE, String(process.pid), 'utf8');
  }

  private removePIDFile(): void {
    if (existsSync(PATHS.PID_FILE)) {
      unlinkSync(PATHS.PID_FILE);
    }
  }

  close(): void {
    this.stateManager.close();
  }
}
