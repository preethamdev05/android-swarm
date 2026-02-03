import { TaskSpec, Step } from './types.js';
import { LIMITS } from './constants.js';
import { existsSync, statfsSync } from 'fs';
import { homedir } from 'os';
import { resolve, normalize } from 'path';
import { ValidationError } from './utils/errors.js';

// Re-export ValidationError for backward compatibility
export { ValidationError } from './utils/errors.js';

// Reserved keywords that cannot be used in app_name or feature names
// Safety check: prevents generation of invalid Java/Kotlin package names
const RESERVED_KEYWORDS = new Set([
  'abstract', 'assert', 'boolean', 'break', 'byte', 'case', 'catch', 'char',
  'class', 'const', 'continue', 'default', 'do', 'double', 'else', 'enum',
  'extends', 'final', 'finally', 'float', 'for', 'goto', 'if', 'implements',
  'import', 'instanceof', 'int', 'interface', 'long', 'native', 'new', 'package',
  'private', 'protected', 'public', 'return', 'short', 'static', 'strictfp',
  'super', 'switch', 'synchronized', 'this', 'throw', 'throws', 'transient',
  'try', 'void', 'volatile', 'while', 'fun', 'val', 'var', 'object', 'companion'
]);

export function validateTaskSpec(spec: any): TaskSpec {
  if (typeof spec !== 'object' || spec === null) {
    throw new ValidationError('Task spec must be an object');
  }

  // Validate app_name with enhanced checks
  if (typeof spec.app_name !== 'string' || spec.app_name.length === 0) {
    throw new ValidationError('app_name must be a non-empty string');
  }

  if (spec.app_name.length > 256) {
    throw new ValidationError('app_name must be at most 256 characters');
  }

  if (!/^[a-zA-Z0-9_]+$/.test(spec.app_name)) {
    throw new ValidationError('app_name must be alphanumeric + underscore only');
  }

  // Safety check: prevent reserved keywords
  if (RESERVED_KEYWORDS.has(spec.app_name.toLowerCase())) {
    throw new ValidationError(`app_name "${spec.app_name}" is a reserved keyword`);
  }

  // Validate features array
  if (!Array.isArray(spec.features) || spec.features.length === 0) {
    throw new ValidationError('features must be a non-empty array');
  }

  if (spec.features.length > 10) {
    throw new ValidationError('features array must have at most 10 items');
  }

  // Enhanced feature validation
  const featureSet = new Set<string>();
  for (const feature of spec.features) {
    if (typeof feature !== 'string' || feature.length === 0) {
      throw new ValidationError('Each feature must be a non-empty string');
    }

    if (feature.length > 128) {
      throw new ValidationError('Feature name must be at most 128 characters');
    }

    // Safety: alphanumeric + underscore/hyphen only
    if (!/^[a-zA-Z0-9_-]+$/.test(feature)) {
      throw new ValidationError(`Feature "${feature}" contains invalid characters (only alphanumeric, underscore, hyphen allowed)`);
    }

    // Safety: prevent duplicate features
    if (featureSet.has(feature)) {
      throw new ValidationError(`Duplicate feature: "${feature}"`);
    }
    featureSet.add(feature);

    // Safety: prevent reserved keywords
    if (RESERVED_KEYWORDS.has(feature.toLowerCase())) {
      throw new ValidationError(`Feature "${feature}" is a reserved keyword`);
    }
  }

  // Architecture validation (strict enum)
  if (!['MVVM', 'MVP', 'MVI'].includes(spec.architecture)) {
    throw new ValidationError('architecture must be MVVM, MVP, or MVI (case-sensitive)');
  }

  // UI system validation (strict enum)
  if (!['Views', 'Compose'].includes(spec.ui_system)) {
    throw new ValidationError('ui_system must be Views or Compose (case-sensitive)');
  }

  // SDK version validation
  if (typeof spec.min_sdk !== 'number' || spec.min_sdk < 21 || spec.min_sdk > 34) {
    throw new ValidationError('min_sdk must be an integer between 21 and 34');
  }

  if (typeof spec.target_sdk !== 'number' || spec.target_sdk < spec.min_sdk || spec.target_sdk > 34) {
    throw new ValidationError('target_sdk must be >= min_sdk and <= 34');
  }

  // Version string validation
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

    // Critical: validate file path safety
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

  // Validate dependencies reference existing steps
  for (const step of plan) {
    for (const dep of step.dependencies) {
      if (!stepNumbers.has(dep)) {
        throw new ValidationError(`Step ${step.step_number} has invalid dependency: ${dep}`);
      }
    }
  }

  return plan as Step[];
}

/**
 * Validates file paths for safety against directory traversal and injection attacks.
 * 
 * Safety requirements:
 * - No absolute paths (must be relative)
 * - No directory traversal (..)
 * - No special characters that could be exploited
 * - Maximum length enforcement
 * - Must not resolve outside of workspace
 * 
 * @param path - The file path to validate
 * @returns true if path is safe, false otherwise
 */
export function validateFilePath(path: string): boolean {
  // Basic checks
  if (!path || path.length === 0) return false;
  if (path.length > 512) return false; // Maximum path length
  
  // Safety: no absolute paths
  if (path.startsWith('/')) return false;
  
  // Safety: no directory traversal
  if (path.includes('..')) return false;
  
  // Safety: no null bytes or special characters
  if (path.includes('\0') || path.includes('\n') || path.includes('\r')) return false;
  
  // Safety: validate path components
  const components = path.split('/');
  for (const component of components) {
    if (component === '' || component === '.') continue;
    
    // Each component must be valid filename
    if (!/^[a-zA-Z0-9_.-]+$/.test(component)) return false;
    
    // No hidden files (starting with .)
    if (component.startsWith('.') && component !== '.') return false;
  }
  
  return true;
}

/**
 * Validates and sanitizes a file path to ensure it stays within workspace boundaries.
 * This provides defense-in-depth against path traversal attacks.
 * 
 * @param basePath - The base workspace directory
 * @param filePath - The relative file path to sanitize
 * @returns The normalized absolute path if safe
 * @throws ValidationError if path would escape workspace
 */
export function sanitizeFilePath(basePath: string, filePath: string): string {
  // First apply basic validation
  if (!validateFilePath(filePath)) {
    throw new ValidationError(`Invalid file path: ${filePath}`);
  }
  
  // Resolve to absolute path
  const normalizedBase = resolve(basePath);
  const normalizedPath = resolve(normalizedBase, filePath);
  
  // Critical safety check: ensure path is within workspace
  if (!normalizedPath.startsWith(normalizedBase + '/') && normalizedPath !== normalizedBase) {
    throw new ValidationError(`Path "${filePath}" would escape workspace boundary`);
  }
  
  return normalizedPath;
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
    // Silently ignore other errors (statfsSync may not be available on all platforms)
  }
}
