import { TaskSpec, Step } from './types.js';
import { LIMITS } from './constants.js';
import { existsSync, statfsSync } from 'fs';
import { homedir } from 'os';

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export function validateTaskSpec(spec: any): TaskSpec {
  if (typeof spec !== 'object' || spec === null) {
    throw new ValidationError('Task spec must be an object');
  }

  if (typeof spec.app_name !== 'string' || spec.app_name.length === 0) {
    throw new ValidationError('app_name must be a non-empty string');
  }

  if (!/^[a-zA-Z0-9_]+$/.test(spec.app_name)) {
    throw new ValidationError('app_name must be alphanumeric + underscore only');
  }

  if (!Array.isArray(spec.features) || spec.features.length === 0) {
    throw new ValidationError('features must be a non-empty array');
  }

  if (spec.features.length > 10) {
    throw new ValidationError('features array must have at most 10 items');
  }

  for (const feature of spec.features) {
    if (typeof feature !== 'string' || feature.length === 0) {
      throw new ValidationError('Each feature must be a non-empty string');
    }
  }

  if (!['MVVM', 'MVP', 'MVI'].includes(spec.architecture)) {
    throw new ValidationError('architecture must be MVVM, MVP, or MVI');
  }

  if (!['Views', 'Compose'].includes(spec.ui_system)) {
    throw new ValidationError('ui_system must be Views or Compose');
  }

  if (typeof spec.min_sdk !== 'number' || spec.min_sdk < 21 || spec.min_sdk > 34) {
    throw new ValidationError('min_sdk must be an integer between 21 and 34');
  }

  if (typeof spec.target_sdk !== 'number' || spec.target_sdk < spec.min_sdk || spec.target_sdk > 34) {
    throw new ValidationError('target_sdk must be >= min_sdk and <= 34');
  }

  if (typeof spec.gradle_version !== 'string' || !/^\d+\.\d+\.\d+$/.test(spec.gradle_version)) {
    throw new ValidationError('gradle_version must be a semantic version string (e.g., "8.2.0")');
  }

  if (typeof spec.kotlin_version !== 'string' || !/^\d+\.\d+\.\d+$/.test(spec.kotlin_version)) {
    throw new ValidationError('kotlin_version must be a semantic version string (e.g., "1.9.20")');
  }

  return spec as TaskSpec;
}

export function validatePlan(plan: any): Step[] {
  if (!Array.isArray(plan)) {
    throw new ValidationError('Plan must be an array');
  }

  if (plan.length === 0 || plan.length > LIMITS.MAX_PLAN_STEPS) {
    throw new ValidationError(`Plan must have 1-${LIMITS.MAX_PLAN_STEPS} steps`);
  }

  const stepNumbers = new Set<number>();

  for (const step of plan) {
    if (typeof step.step_number !== 'number' || step.step_number < 1) {
      throw new ValidationError('step_number must be a positive integer');
    }

    if (stepNumbers.has(step.step_number)) {
      throw new ValidationError(`Duplicate step_number: ${step.step_number}`);
    }
    stepNumbers.add(step.step_number);

    if (!['foundation', 'feature', 'integration', 'finalization'].includes(step.phase)) {
      throw new ValidationError(`Invalid phase: ${step.phase}`);
    }

    if (typeof step.file_path !== 'string' || step.file_path.length === 0) {
      throw new ValidationError('file_path must be a non-empty string');
    }

    if (!validateFilePath(step.file_path)) {
      throw new ValidationError(`Invalid file_path: ${step.file_path}`);
    }

    if (!['kotlin', 'xml', 'gradle', 'manifest'].includes(step.file_type)) {
      throw new ValidationError(`Invalid file_type: ${step.file_type}`);
    }

    if (!Array.isArray(step.dependencies)) {
      throw new ValidationError('dependencies must be an array');
    }

    for (const dep of step.dependencies) {
      if (typeof dep !== 'number') {
        throw new ValidationError('Each dependency must be a step_number (number)');
      }
    }

    if (typeof step.description !== 'string' || step.description.length === 0) {
      throw new ValidationError('description must be a non-empty string');
    }
  }

  for (const step of plan) {
    for (const dep of step.dependencies) {
      if (!stepNumbers.has(dep)) {
        throw new ValidationError(`Step ${step.step_number} has invalid dependency: ${dep}`);
      }
    }
  }

  return plan as Step[];
}

export function validateFilePath(path: string): boolean {
  if (path.startsWith('/')) return false;
  if (path.includes('..')) return false;
  if (path.length === 0) return false;
  return true;
}

export function checkDiskSpace(): void {
  try {
    const stats = statfsSync(homedir());
    const freeSpaceMB = (stats.bavail * stats.bsize) / (1024 * 1024);
    
    if (freeSpaceMB < LIMITS.MIN_DISK_SPACE_MB) {
      throw new ValidationError(`Insufficient disk space: ${freeSpaceMB.toFixed(0)}MB free, ${LIMITS.MIN_DISK_SPACE_MB}MB required`);
    }
  } catch (err) {
    if (err instanceof ValidationError) throw err;
  }
}
