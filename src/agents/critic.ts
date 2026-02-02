import { KimiClient } from '../kimi-client.js';
import { TaskSpec, Step, CriticOutput } from '../types.js';
import { CODING_PROFILE } from '../coding-profile.js';

export class CriticAgent {
  constructor(private kimiClient: KimiClient) {}

  async reviewFile(
    filePath: string,
    fileContent: string,
    step: Step,
    taskSpec: TaskSpec
  ): Promise<CriticOutput> {
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

      let result: any;
      try {
        result = JSON.parse(content);
      } catch (err) {
        console.warn(`Critic failed to parse JSON, treating as ACCEPT: ${err}`);
        return { decision: 'ACCEPT', issues: [] };
      }

      if (!result.decision || !['ACCEPT', 'REJECT'].includes(result.decision)) {
        console.warn('Critic returned invalid decision, treating as ACCEPT');
        return { decision: 'ACCEPT', issues: [] };
      }

      if (!Array.isArray(result.issues)) {
        result.issues = [];
      }

      return result as CriticOutput;

    } catch (err) {
      console.warn(`Critic agent failed, treating as ACCEPT: ${err}`);
      return { decision: 'ACCEPT', issues: [] };
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
