import Ajv, { ErrorObject } from 'ajv';
import { CriticOutput, Step } from '../types.js';

const ajv = new Ajv({ allErrors: true, allowUnionTypes: true });

const plannerSchema = {
  type: 'array',
  minItems: 1,
  maxItems: 25,
  items: {
    type: 'object',
    additionalProperties: false,
    required: [
      'step_number',
      'phase',
      'file_path',
      'file_type',
      'dependencies',
      'description'
    ],
    properties: {
      step_number: { type: 'integer', minimum: 1 },
      phase: { enum: ['foundation', 'feature', 'integration', 'finalization'] },
      file_path: { type: 'string', minLength: 1 },
      file_type: { enum: ['kotlin', 'xml', 'gradle', 'manifest'] },
      dependencies: {
        type: 'array',
        items: { type: 'integer', minimum: 1 },
        uniqueItems: true
      },
      description: { type: 'string', minLength: 1 }
    }
  }
} as const;

const criticSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['decision', 'issues'],
  properties: {
    decision: { enum: ['ACCEPT', 'REJECT'] },
    issues: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['severity', 'line', 'message'],
        properties: {
          severity: { enum: ['BLOCKER', 'MAJOR', 'MINOR'] },
          line: {
            anyOf: [
              { type: 'integer', minimum: 1 },
              { type: 'null' }
            ]
          },
          message: { type: 'string', minLength: 1 }
        }
      }
    }
  }
} as const;

const validatePlanner = ajv.compile(plannerSchema);
const validateCritic = ajv.compile(criticSchema);

function formatErrors(errors?: ErrorObject[] | null): string {
  if (!errors || errors.length === 0) {
    return 'Unknown schema validation error';
  }
  return errors
    .map(error => `${error.instancePath || '(root)'} ${error.message || ''}`.trim())
    .join('; ');
}

export function validatePlannerResponse(payload: unknown): Step[] {
  const valid = validatePlanner(payload);
  if (!valid) {
    throw new Error(`Planner response failed schema validation: ${formatErrors(validatePlanner.errors)}`);
  }
  return payload as Step[];
}

export function validateCriticResponse(payload: unknown): CriticOutput {
  const valid = validateCritic(payload);
  if (!valid) {
    throw new Error(`Critic response failed schema validation: ${formatErrors(validateCritic.errors)}`);
  }
  return payload as CriticOutput;
}
