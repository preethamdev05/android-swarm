import { Orchestrator } from './orchestrator.js';
import { PATHS } from './constants.js';
import { ValidationError, VerificationError } from './utils/errors.js';
import { ExitCode, getExitCodeForError } from './utils/exit-codes.js';
import { cleanupStalePidFile } from './utils/pid.js';
import { startUIServer } from './ui-server.js';
import { validateTaskSpec } from './validators.js';

/**
 * Command-line interface for android-swarm orchestrator.
 * 
 * Exit codes:
 * - 0: Success
 * - 1: Validation errors
 * - 2: API/timeout/quota/token limit errors
 * - 3: Verification failure (strict mode)
 * - 4: Unexpected system errors
 */
export class CLI {
  private orchestrator: Orchestrator | null = null;

  async handleCommand(args: string[]): Promise<void> {
    const command = args[2];

    if (!command || command === 'help') {
      this.printHelp();
      process.exit(0);
    }

    if (command === 'agent') {
      await this.handleAgentCommand(args);
    } else if (command === 'abort') {
      await this.handleAbortCommand(args);
    } else if (command === 'cleanup') {
      await this.handleCleanupCommand(args);
    } else if (command === 'ui') {
      await this.handleUICommand(args);
    } else {
      console.error(`\n❌ Unknown command: "${command}"`);
      console.error('\nRun "node dist/index.js help" for usage information.');
      process.exit(ExitCode.ValidationError);
    }
  }

  private async handleAgentCommand(args: string[]): Promise<void> {
    const messageIndex = args.indexOf('--message');
    if (messageIndex === -1 || messageIndex === args.length - 1) {
      console.error('\n❌ Error: Missing --message argument\n');
      console.log('Usage:');
      console.log('  node dist/index.js agent --message \'build app: {...}\'\n');
      console.log('Example:');
      console.log('  node dist/index.js agent --message \'build app: {"app_name":"TodoApp","features":["add_task"],"architecture":"MVVM","ui_system":"Compose","min_sdk":24,"target_sdk":34,"gradle_version":"8.2.0","kotlin_version":"1.9.20"}\'\n');
      process.exit(ExitCode.ValidationError);
    }

    const messageArg = args[messageIndex + 1];
    const strictVerification = args.includes('--strict-verification');
    
    // Validate message format
    if (!messageArg.startsWith('build app:')) {
      console.error('\n❌ Error: Message must start with "build app:"\n');
      console.error('Correct format:');
      console.error('  build app: {"app_name":"...", ...}\n');
      process.exit(ExitCode.ValidationError);
    }

    const jsonStr = messageArg.substring('build app:'.length).trim();
    
    let taskSpec: any;
    try {
      taskSpec = JSON.parse(jsonStr);
    } catch (err: any) {
      console.error('\n❌ Error: Invalid JSON in task specification\n');
      console.error('JSON parsing error:', err.message);
      console.error('\nReceived:', jsonStr.substring(0, 100) + (jsonStr.length > 100 ? '...' : ''));
      console.error('\nTip: Ensure proper JSON formatting with double quotes around strings.\n');
      process.exit(ExitCode.ValidationError);
    }

    // Validate required fields exist
    const requiredFields = ['app_name', 'features', 'architecture', 'ui_system', 'min_sdk', 'target_sdk', 'gradle_version', 'kotlin_version'];
    const missingFields = requiredFields.filter(field => !(field in taskSpec));
    
    if (missingFields.length > 0) {
      console.error(`\n❌ Error: Missing required fields: ${missingFields.join(', ')}\n`);
      console.error('Required task specification fields:');
      console.error('  - app_name: string (alphanumeric + underscore only)');
      console.error('  - features: string[] (1-10 features)');
      console.error('  - architecture: "MVVM" | "MVP" | "MVI"');
      console.error('  - ui_system: "Views" | "Compose"');
      console.error('  - min_sdk: number (21-34)');
      console.error('  - target_sdk: number (>= min_sdk, <= 34)');
      console.error('  - gradle_version: string (e.g., "8.2.0")');
      console.error('  - kotlin_version: string (e.g., "1.9.20")\n');
      process.exit(ExitCode.ValidationError);
    }

    let validatedSpec = taskSpec;
    try {
      validatedSpec = validateTaskSpec(taskSpec);
    } catch (err: any) {
      if (err instanceof ValidationError) {
        console.error(`\n❌ Error: ${err.message}\n`);
        process.exit(ExitCode.ValidationError);
      }
      throw err;
    }

    // Lazy initialization: only create orchestrator when needed for agent command
    // This allows help/abort/cleanup commands to work without KIMI_API_KEY
    try {
      this.orchestrator = new Orchestrator({ strictVerification });
    } catch (err: any) {
      if (err.message.includes('KIMI_API_KEY')) {
        console.error('\n❌ Error: KIMI_API_KEY environment variable is required\n');
        console.error('Set your API key:');
        console.error('  export KIMI_API_KEY="sk-your-key-here"\n');
        console.error('Get your API key from: https://platform.moonshot.cn/console/api-keys\n');
        process.exit(ExitCode.ValidationError);
      }
      throw err;
    }

    try {
      console.log('\n⚙️  Starting Android Swarm task...\n');
      console.log('App:', validatedSpec.app_name);
      console.log('Features:', validatedSpec.features.join(', '));
      console.log('Architecture:', validatedSpec.architecture);
      console.log('UI System:', validatedSpec.ui_system);
      console.log('');
      
      const workspacePath = await this.orchestrator.executeTask(validatedSpec);
      
      console.log('\n✅ Task completed successfully!');
      console.log(`\n📁 Output: ${workspacePath}`);
      console.log('\n🛠️  To build the generated app:');
      console.log(`  cd ${workspacePath}`);
      console.log(`  ./gradlew assembleDebug\n`);
      
      process.exit(ExitCode.Success);
    } catch (err: any) {
      if (err instanceof ValidationError) {
        console.error(`\n❌ Validation Error: ${err.message}\n`);
      } else if (err instanceof VerificationError) {
        console.error(`\n❌ Verification Failed (strict mode): ${err.message}\n`);
      } else {
        console.error(`\n❌ Task Failed: ${err.message}\n`);
      }
      
      // Provide helpful context based on error type
      if (err.message.includes('quota')) {
        console.error('Tip: Check your Kimi API account billing and quota limits.');
      } else if (err.message.includes('KIMI_API_KEY')) {
        console.error('Tip: Set KIMI_API_KEY environment variable with your API key.');
      } else if (err.message.includes('Token limit')) {
        console.error('Tip: Reduce number of features or simplify task specification.');
      } else if (err.message.includes('Wall-clock timeout')) {
        console.error('Tip: Task is too complex. Split into smaller tasks or reduce features.');
      }
      
      console.error('');
      process.exit(getExitCodeForError(err));
    } finally {
      if (this.orchestrator) {
        this.orchestrator.close();
      }
    }
  }

  private async handleAbortCommand(args: string[]): Promise<void> {
    const taskIdIndex = args.indexOf('--task-id');
    
    if (taskIdIndex === -1 || taskIdIndex === args.length - 1) {
      console.error('\n❌ Error: Missing --task-id argument\n');
      console.log('Usage:');
      console.log('  node dist/index.js abort --task-id <task_id>\n');
      process.exit(ExitCode.ValidationError);
    }

    const taskId = args[taskIdIndex + 1];
    
    // Validate task ID format (UUID)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(taskId)) {
      console.error(`\n❌ Error: Invalid task ID format\n`);
      console.error('Task IDs are UUIDs (e.g., "550e8400-e29b-41d4-a716-446655440000")\n');
      process.exit(ExitCode.ValidationError);
    }
    
    const inspection = cleanupStalePidFile(PATHS.PID_FILE);
    if (inspection.status === 'missing' || inspection.status === 'stale' || inspection.status === 'invalid') {
      console.log('\nℹ️  No task is currently running\n');
      process.exit(ExitCode.Success);
    }

    const pid = inspection.pid || 0;

    try {
      process.kill(pid, 'SIGTERM');
      console.log(`\n✅ Sent abort signal to task (PID ${pid})\n`);
      process.exit(ExitCode.Success);
    } catch (err) {
      console.error(`\n❌ Failed to abort task: ${err}\n`);
      process.exit(ExitCode.UnexpectedError);
    }
  }

  private async handleCleanupCommand(args: string[]): Promise<void> {
    const olderThanIndex = args.indexOf('--older-than');
    const failedOnlyIndex = args.indexOf('--failed-only');

    if (olderThanIndex === -1 || olderThanIndex === args.length - 1) {
      console.error('\n❌ Error: Missing --older-than argument\n');
      console.log('Usage:');
      console.log('  node dist/index.js cleanup --older-than 7d [--failed-only]\n');
      console.log('Examples:');
      console.log('  node dist/index.js cleanup --older-than 7d');
      console.log('  node dist/index.js cleanup --older-than 30d --failed-only\n');
      process.exit(ExitCode.ValidationError);
    }

    const olderThanArg = args[olderThanIndex + 1];
    const match = olderThanArg.match(/^(\d+)d$/);
    
    if (!match) {
      console.error('\n❌ Error: Invalid --older-than format\n');
      console.error('Format: <number>d (e.g., 7d, 30d, 90d)\n');
      process.exit(ExitCode.ValidationError);
    }

    const days = parseInt(match[1]);
    const failedOnly = failedOnlyIndex !== -1;

    console.log('\nℹ️  Cleanup functionality not yet implemented\n');
    console.log(`Would remove: ${failedOnly ? 'failed' : 'all'} tasks older than ${days} days\n`);
    process.exit(ExitCode.Success);
  }

  private async handleUICommand(args: string[]): Promise<void> {
    const portIndex = args.indexOf('--port');
    const portValue = portIndex !== -1 ? args[portIndex + 1] : undefined;
    const portEnv = process.env.SWARM_UI_PORT;
    const port = portValue
      ? Number.parseInt(portValue, 10)
      : portEnv
        ? Number.parseInt(portEnv, 10)
        : 8080;

    if (Number.isNaN(port) || port <= 0) {
      console.error('\n❌ Error: Invalid --port value\n');
      console.error('Usage:');
      console.error('  node dist/index.js ui --port 8080\n');
      process.exit(ExitCode.ValidationError);
    }

    const server = startUIServer({ port });

    console.log(`\n✅ UI server running at http://127.0.0.1:${port}\n`);
    console.log('Press Ctrl+C to stop the UI server.\n');
    server.waitForClose();
  }

  private printHelp(): void {
    console.log(`
┌──────────────────────────────────────────────────────────────┐
│  Android Swarm - Multi-Agent Kotlin/Android Generator      │
└──────────────────────────────────────────────────────────────┘

🛠️  Usage:

  Generate Android app:
    node dist/index.js agent --message 'build app: <spec>' [--strict-verification]

  Abort running task:
    node dist/index.js abort --task-id <task_id>

  Cleanup old tasks:
    node dist/index.js cleanup --older-than 7d [--failed-only]

  Local read-only UI:
    node dist/index.js ui --port 8080

📝 Examples:

  Simple Todo app:
    node dist/index.js agent --message 'build app: {"app_name":"TodoApp","features":["add_task","list_tasks","complete_task"],"architecture":"MVVM","ui_system":"Compose","min_sdk":24,"target_sdk":34,"gradle_version":"8.2.0","kotlin_version":"1.9.20"}'

  E-commerce app:
    node dist/index.js agent --message 'build app: {"app_name":"ShopApp","features":["product_list","product_detail","cart","checkout"],"architecture":"MVP","ui_system":"Views","min_sdk":21,"target_sdk":33,"gradle_version":"8.1.0","kotlin_version":"1.9.10"}'

  Strict verification mode:
    node dist/index.js agent --strict-verification --message 'build app: {"app_name":"ShopApp","features":["product_list","product_detail","cart","checkout"],"architecture":"MVP","ui_system":"Views","min_sdk":21,"target_sdk":33,"gradle_version":"8.1.0","kotlin_version":"1.9.10"}'

⚙️  Environment Variables:

  KIMI_API_KEY             Kimi K2.5 API key (REQUIRED)
  SWARM_DEBUG              Enable debug logging (1 or 0, default: 0)
  SWARM_API_TIMEOUT        API timeout in seconds (default: 30)
  SWARM_WORKSPACE_ROOT     Workspace directory (default: ~/.openclaw/workspace/android-swarm)
  SWARM_UI_PORT            Local UI port (default: 8080)

📄 Output:

  Generated projects: ~/.openclaw/workspace/android-swarm/<task_id>/
  Logs:              ~/.openclaw/logs/swarm-<date>.log
  Database:          ~/.openclaw/swarm.db

ℹ️  Exit Codes:

  0  Success
  1  Validation errors
  2  API / timeout / quota / token limit errors
  3  Verification failure (--strict-verification)
  4  Unexpected system errors

🔗 More Info:

  GitHub: https://github.com/preethamdev05/android-swarm
  README: https://github.com/preethamdev05/android-swarm#readme
`);
  }
}
