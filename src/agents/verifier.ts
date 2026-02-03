import { KimiClient } from '../kimi-client.js';
import { TaskSpec, VerifierOutput } from '../types.js';

export class VerifierAgent {
  constructor(private kimiClient: KimiClient) {}

  /**
   * CORRECTIVE FIX: Updated to return {report, usage} for token accounting.
   */
  async verifyProject(
    files: string[],
    taskSpec: TaskSpec
  ): Promise<{ report: VerifierOutput; usage: { prompt_tokens: number; completion_tokens: number } }> {
    const prompt = this.buildPrompt(files, taskSpec);
    
    const messages = [
      {
        role: 'system',
        content: 'You are a verification agent. Output valid JSON only. No markdown fences. No explanation.'
      },
      {
        role: 'user',
        content: prompt
      }
    ];

    try {
      const response = await this.kimiClient.chat(messages, 'verifier');
      const content = response.choices[0].message.content;
      const usage = response.usage || { prompt_tokens: 0, completion_tokens: 0 };

      let result: any;
      try {
        result = JSON.parse(content);
      } catch (err) {
        console.warn(`Verifier failed to parse JSON: ${err}`);
        // CORRECTIVE FIX: Include usage on parse failure
        return {
          report: {
            warnings: ['Verifier failed to parse response'],
            missing_items: [],
            quality_score: 0.5
          },
          usage
        };
      }

      if (!Array.isArray(result.warnings)) {
        result.warnings = [];
      }
      if (!Array.isArray(result.missing_items)) {
        result.missing_items = [];
      }
      if (typeof result.quality_score !== 'number') {
        result.quality_score = 0.5;
      }

      // CORRECTIVE FIX: Return both report and usage
      return {
        report: result as VerifierOutput,
        usage
      };

    } catch (err) {
      console.warn(`Verifier agent failed: ${err}`);
      // CORRECTIVE FIX: Fallback with zero usage on total failure
      return {
        report: {
          warnings: [`Verifier agent error: ${err}`],
          missing_items: [],
          quality_score: 0.5
        },
        usage: { prompt_tokens: 0, completion_tokens: 0 }
      };
    }
  }

  private buildPrompt(files: string[], taskSpec: TaskSpec): string {
    const filesText = files.map(f => `- ${f}`).join('\n');
    const featuresText = taskSpec.features.map(f => `- ${f}`).join('\n');

    return `Verify complete project:
Files:
${filesText}

Task Spec:
${JSON.stringify(taskSpec, null, 2)}

Output JSON:
{
  "warnings": ["warning1", "warning2"],
  "missing_items": ["item1", "item2"],
  "quality_score": 0.0-1.0
}

Check:
- All features implemented:
${featuresText}
- AndroidManifest.xml present and valid
- build.gradle.kts files present (project and app level)
- settings.gradle.kts present
- gradle.properties present
- Gradle wrapper files present
- No missing dependencies
- Architecture consistency (${taskSpec.architecture})
- UI system consistency (${taskSpec.ui_system})
- Proper package structure
- Required Activities/ViewModels/Composables present
- Resource files present (strings.xml, etc.)

quality_score:
- 1.0 = Perfect, all checks pass
- 0.7-0.9 = Good, minor issues
- 0.5-0.6 = Acceptable, some concerns
- <0.5 = Poor, significant issues

Output JSON only. No markdown fences. No explanation.`;
  }
}
