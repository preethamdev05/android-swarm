import { KimiClient } from '../kimi-client.js';
import { TaskSpec, Step, CriticIssue } from '../types.js';
import { CODING_PROFILE } from '../coding-profile.js';
import { LIMITS } from '../constants.js';

export class CoderAgent {
  constructor(private kimiClient: KimiClient) {}

  async generateFile(
    step: Step,
    taskSpec: TaskSpec,
    completedFiles: string[],
    priorRejection?: CriticIssue[]
  ): Promise<string> {
    const prompt = this.buildPrompt(step, taskSpec, completedFiles, priorRejection);
    
    const messages = [
      {
        role: 'system',
        content: 'You are a code generation agent. Output only the complete file content. No markdown fences. No explanation. No comments outside code.'
      },
      {
        role: 'user',
        content: prompt
      }
    ];

    const response = await this.kimiClient.chat(messages, 'coder');
    const content = response.choices[0].message.content;

    if (content.length > LIMITS.MAX_FILE_SIZE_BYTES) {
      console.warn(`File content exceeds ${LIMITS.MAX_FILE_SIZE_BYTES} bytes, truncating`);
      return content.substring(0, LIMITS.MAX_FILE_SIZE_BYTES);
    }

    return content;
  }

  private buildPrompt(
    step: Step,
    taskSpec: TaskSpec,
    completedFiles: string[],
    priorRejection?: CriticIssue[]
  ): string {
    let prompt = `Generate file: ${step.file_path}
Type: ${step.file_type}
Description: ${step.description}

Task Spec:
${JSON.stringify(taskSpec, null, 2)}

Architecture: ${taskSpec.architecture}
UI System: ${taskSpec.ui_system}
Min SDK: ${taskSpec.min_sdk}
Target SDK: ${taskSpec.target_sdk}
Kotlin Version: ${taskSpec.kotlin_version}
Gradle Version: ${taskSpec.gradle_version}

`;

    if (completedFiles.length > 0) {
      prompt += `Dependencies (already completed):\n${completedFiles.map(f => `- ${f}`).join('\n')}\n\n`;
    }

    if (priorRejection && priorRejection.length > 0) {
      prompt += `Prior Rejection:\n${JSON.stringify(priorRejection, null, 2)}\n\nAddress all BLOCKER issues. Fix reported problems.\n\n`;
    }

    prompt += `Constraints:
- Complete, buildable file only
- Follow coding profile (see below)
- No placeholders or TODOs
- Max 8000 tokens output
- For Kotlin files: include package declaration matching directory structure
- For Kotlin files: proper imports, no wildcards
- For XML files: proper namespaces and resource references
- For Gradle files: use Kotlin DSL (.gradle.kts syntax)
- For AndroidManifest.xml: include all required tags and permissions

Coding Profile:
${CODING_PROFILE}

Output only the complete file content. No markdown fences. No explanation.`;

    return prompt;
  }
}
