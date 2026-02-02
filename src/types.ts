export interface TaskSpec {
  app_name: string;
  features: string[];
  architecture: 'MVVM' | 'MVP' | 'MVI';
  ui_system: 'Views' | 'Compose';
  min_sdk: number;
  target_sdk: number;
  gradle_version: string;
  kotlin_version: string;
}

export interface Step {
  step_number: number;
  phase: 'foundation' | 'feature' | 'integration' | 'finalization';
  file_path: string;
  file_type: 'kotlin' | 'xml' | 'gradle' | 'manifest';
  dependencies: number[];
  description: string;
}

export interface CriticIssue {
  severity: 'BLOCKER' | 'MAJOR' | 'MINOR';
  line: number | null;
  message: string;
}

export interface CriticOutput {
  decision: 'ACCEPT' | 'REJECT';
  issues: CriticIssue[];
}

export interface VerifierOutput {
  warnings: string[];
  missing_items: string[];
  quality_score: number;
}

export type TaskState = 'PLANNING' | 'EXECUTING' | 'VERIFYING' | 'COMPLETED' | 'FAILED';

export interface OrchestratorState {
  task_id: string;
  state: TaskState;
  task_spec: TaskSpec;
  plan: Step[] | null;
  current_step_index: number;
  completed_files: string[];
  api_call_count: number;
  total_tokens: number;
  start_time: number;
  last_activity_time: number;
}

export interface StepState {
  step: Step;
  attempt: number;
  coder_output: string | null;
  critic_decision: 'ACCEPT' | 'REJECT' | null;
  critic_issues: CriticIssue[] | null;
}

export interface KimiAPIResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
  };
}

export interface KimiAPIError {
  status: number;
  message: string;
  transient: boolean;
}
