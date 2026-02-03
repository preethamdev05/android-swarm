import { KimiClient } from '../kimi-client.js';
import { TaskSpec, Step } from '../types.js';
import { CODING_PROFILE } from '../coding-profile.js';
import { TOKEN_LIMITS } from '../constants.js';

export class PlannerAgent {
  constructor(private kimiClient: KimiClient) {}

  /**
   * CORRECTIVE FIX: Updated to return {plan, usage} for token accounting.
   * Orchestrator extracts usage data for limit enforcement.
   */
  async createPlan(taskSpec: TaskSpec): Promise<{ plan: Step[]; usage: { prompt_tokens: number; completion_tokens: number } }> {
    const prompt = this.buildPrompt(taskSpec);
    
    const messages = [
      {
        role: 'system',
        content: 'You are a planning agent. Output valid JSON only. No markdown fences. No explanation.'
      },
      {
        role: 'user',
        content: prompt
      }
    ];

    const response = await this.kimiClient.chat(messages, 'planner');
    const content = response.choices[0].message.content;

    let plan: any;
    try {
      plan = JSON.parse(content);
    } catch (err) {
      throw new Error(`Failed to parse planner response as JSON: ${err}`);
    }

    if (!Array.isArray(plan)) {
      throw new Error('Planner response must be a JSON array');
    }

    // CORRECTIVE FIX: Return both plan and usage data
    return {
      plan: plan as Step[],
      usage: response.usage || { prompt_tokens: 0, completion_tokens: 0 }
    };
  }

  private buildPrompt(taskSpec: TaskSpec): string {
    const featuresText = taskSpec.features.map(f => `- ${f}`).join('\n');

    return `Task: ${JSON.stringify(taskSpec, null, 2)}

Output a plan as JSON array with this schema:
[
  {
    "step_number": 1,
    "phase": "foundation|feature|integration|finalization",
    "file_path": "relative/path/File.kt",
    "file_type": "kotlin|xml|gradle|manifest",
    "dependencies": [2, 5],
    "description": "Brief description"
  }
]

Constraints:
- 1–25 steps total
- Cover all features:
${featuresText}
- Use architecture: ${taskSpec.architecture}
- UI system: ${taskSpec.ui_system}
- Min SDK: ${taskSpec.min_sdk}
- Target SDK: ${taskSpec.target_sdk}
- Gradle version: ${taskSpec.gradle_version}
- Kotlin version: ${taskSpec.kotlin_version}
- No invented features
- Dependencies refer to step_number values
- file_path must be relative (no leading /, no ..)
- Include AndroidManifest.xml
- Include build.gradle.kts files (project and app level)
- Include settings.gradle.kts
- Include gradle.properties
- Include gradle wrapper files

Plan Structure:
- Phase "foundation": Build files, manifest, project structure, gradle wrapper
- Phase "feature": Core feature implementation files (Activities, ViewModels, Composables, etc.)
- Phase "integration": Navigation, dependency injection, data layer integration
- Phase "finalization": Resources (strings.xml, colors.xml, themes.xml), final configuration

Output JSON array only. No markdown fences. No explanation.`;
  }
}
