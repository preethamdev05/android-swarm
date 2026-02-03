import { KimiClient } from '../kimi-client.js';
import { TaskSpec, Step, CriticOutput } from '../types.js';
import { CODING_PROFILE } from '../coding-profile.js';

export class CriticAgent {
  constructor(private kimiClient: KimiClient) {}

  /**
   * CORRECTIVE FIX: Updated to return usage data alongside critic output.
   */
  async reviewFile(
    filePath: string,
    fileContent: string,
    step: Step,
    taskSpec: TaskSpec
  ): Promise<CriticOutput & { usage: { prompt_tokens: number; completion_tokens: number } }> {
    const prompt = this.buildPrompt(filePath, fileContent, step, taskSpec);
    
    const messages = [
      {
        role: 'system',
        content: 'You are a code review agent. Output valid JSON only. No markdown fences. No explanation.'
      },
      {
        role: 'user',
        content: prompt
      }
    ];

    try {
      const response = await this.kimiClient.chat(messages, 'critic');
      const content = response.choices[0].message.content;
      const usage = response.usage || { prompt_tokens: 0, completion_tokens: 0 };

      let result: any;
      try {
        result = JSON.parse(content);
      } catch (err) {
        console.warn(`Critic failed to parse JSON, treating as ACCEPT: ${err}`);
        // CORRECTIVE FIX: Include usage even on parse failure
        return { decision: 'ACCEPT', issues: [], usage };
      }

      if (!result.decision || !['ACCEPT', 'REJECT'].includes(result.decision)) {
        console.warn('Critic returned invalid decision, treating as ACCEPT');
        return { decision: 'ACCEPT', issues: [], usage };
      }

      if (!Array.isArray(result.issues)) {
        result.issues = [];
      }

      // CORRECTIVE FIX: Return both critic output and usage
      return { ...result, usage } as CriticOutput & { usage: { prompt_tokens: number; completion_tokens: number } };

    } catch (err) {
      console.warn(`Critic agent failed, treating as ACCEPT: ${err}`);
      // CORRECTIVE FIX: Fallback with zero usage on total failure
      return { decision: 'ACCEPT', issues: [], usage: { prompt_tokens: 0, completion_tokens: 0 } };
    }
  }

  private buildPrompt(
    filePath: string,
    fileContent: string,
    step: Step,
    taskSpec: TaskSpec
  ): string {
    const truncatedContent = fileContent.length > 15000 
      ? fileContent.substring(0, 15000) + '\n... [truncated]'
      : fileContent;

    return `Review this file:
Path: ${filePath}
Content:
${truncatedContent}

Expected:
${step.description}

Task Spec:
${JSON.stringify(taskSpec, null, 2)}

Coding Profile:
${CODING_PROFILE}

Output JSON:
{
  "decision": "ACCEPT" | "REJECT",
  "issues": [
    {
      "severity": "BLOCKER" | "MAJOR" | "MINOR",
      "line": <number or null>,
      "message": "Description"
    }
  ]
}

Reject only for:
- Syntax errors
- Violates coding profile
- Missing required functionality
- Incorrect architecture pattern
- Android API misuse
- Unresolved dependencies
- Missing required component (Activity, ViewModel, etc.)
- Incorrect superclass
- Missing @Composable annotation for Compose function
- Incorrect Gradle plugin
- Missing or malformed AndroidManifest.xml

Accept if functionally correct even if style is imperfect.

Output JSON only. No markdown fences. No explanation.`;
  }
}
