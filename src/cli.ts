import { Orchestrator } from './orchestrator.js';
import { logger } from './logger.js';
import { PATHS } from './constants.js';
import { ValidationError } from './utils/errors.js';
import { existsSync, unlinkSync } from 'fs';

/**
 * Command-line interface for android-swarm orchestrator.
 * 
 * Exit codes:
 * - 0: Success
 * - 1: Error (validation, execution failure, etc.)
 */
export class CLI {
  private orchestrator: Orchestrator;

  constructor() {
    this.orchestrator = new Orchestrator();
  }

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
    } else {
      console.error(`\n❌ Unknown command: "${command}"`);
      console.error('\nRun "node dist/index.js help" for usage information.');
      process.exit(1);
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
      process.exit(1);
    }

    const messageArg = args[messageIndex + 1];
    
    // Validate message format
    if (!messageArg.startsWith('build app:')) {
      console.error('\n❌ Error: Message must start with "build app:"\n');
      console.error('Correct format:');
      console.error('  build app: {"app_name":"...", ...}\n');
      process.exit(1);
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
      process.exit(1);
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
      process.exit(1);
    }

    try {
      console.log('\n⚙️  Starting Android Swarm task...\n');
      console.log('App:', taskSpec.app_name);
      console.log('Features:', taskSpec.features.join(', '));
      console.log('Architecture:', taskSpec.architecture);
      console.log('UI System:', taskSpec.ui_system);
      console.log('');
      
      const workspacePath = await this.orchestrator.executeTask(taskSpec);
      
      console.log('\n✅ Task completed successfully!');
      console.log(`\n📁 Output: ${workspacePath}`);
      console.log('\n🛠️  To build the generated app:');
      console.log(`  cd ${workspacePath}`);
      console.log(`  ./gradlew assembleDebug\n`);
      
      process.exit(0);
    } catch (err: any) {
      if (err instanceof ValidationError) {
        console.error(`\n❌ Validation Error: ${err.message}\n`);
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
      process.exit(1);
    } finally {
      this.orchestrator.close();
    }
  }

  private async handleAbortCommand(args: string[]): Promise<void> {
    const taskIdIndex = args.indexOf('--task-id');
    
    if (taskIdIndex === -1 || taskIdIndex === args.length - 1) {
      console.error('\n❌ Error: Missing --task-id argument\n');
      console.log('Usage:');
      console.log('  node dist/index.js abort --task-id <task_id>\n');
      process.exit(1);
    }

    const taskId = args[taskIdIndex + 1];
    
    // Validate task ID format (UUID)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(taskId)) {
      console.error(`\n❌ Error: Invalid task ID format\n`);
      console.error('Task IDs are UUIDs (e.g., "550e8400-e29b-41d4-a716-446655440000")\n');
      process.exit(1);
    }
    
    if (!existsSync(PATHS.PID_FILE)) {
      console.log('\nℹ️  No task is currently running\n');
      process.exit(0);
    }

    const pidStr = require('fs').readFileSync(PATHS.PID_FILE, 'utf8');
    const pid = parseInt(pidStr);

    try {
      process.kill(pid, 'SIGTERM');
      console.log(`\n✅ Sent abort signal to task (PID ${pid})\n`);
      process.exit(0);
    } catch (err) {
      console.error(`\n❌ Failed to abort task: ${err}\n`);
      process.exit(1);
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
      process.exit(1);
    }

    const olderThanArg = args[olderThanIndex + 1];
    const match = olderThanArg.match(/^(\d+)d$/);
    
    if (!match) {
      console.error('\n❌ Error: Invalid --older-than format\n');
      console.error('Format: <number>d (e.g., 7d, 30d, 90d)\n');
      process.exit(1);
    }

    const days = parseInt(match[1]);
    const failedOnly = failedOnlyIndex !== -1;

    console.log('\nℹ️  Cleanup functionality not yet implemented\n');
    console.log(`Would remove: ${failedOnly ? 'failed' : 'all'} tasks older than ${days} days\n`);
    process.exit(0);
  }

  private printHelp(): void {
    console.log(`
┌──────────────────────────────────────────────────────────────┐
│  Android Swarm - Multi-Agent Kotlin/Android Generator      │
└──────────────────────────────────────────────────────────────┘

🛠️  Usage:

  Generate Android app:
    node dist/index.js agent --message 'build app: <spec>'

  Abort running task:
    node dist/index.js abort --task-id <task_id>

  Cleanup old tasks:
    node dist/index.js cleanup --older-than 7d [--failed-only]

📝 Examples:

  Simple Todo app:
    node dist/index.js agent --message 'build app: {"app_name":"TodoApp","features":["add_task","list_tasks","complete_task"],"architecture":"MVVM","ui_system":"Compose","min_sdk":24,"target_sdk":34,"gradle_version":"8.2.0","kotlin_version":"1.9.20"}'

  E-commerce app:
    node dist/index.js agent --message 'build app: {"app_name":"ShopApp","features":["product_list","product_detail","cart","checkout"],"architecture":"MVP","ui_system":"Views","min_sdk":21,"target_sdk":33,"gradle_version":"8.1.0","kotlin_version":"1.9.10"}'

⚙️  Environment Variables:

  KIMI_API_KEY             Kimi K2.5 API key (REQUIRED)
  SWARM_DEBUG              Enable debug logging (1 or 0, default: 0)
  SWARM_API_TIMEOUT        API timeout in seconds (default: 30)
  SWARM_WORKSPACE_ROOT     Workspace directory (default: ~/.openclaw/workspace/android-swarm)

📄 Output:

  Generated projects: ~/.openclaw/workspace/android-swarm/<task_id>/
  Logs:              ~/.openclaw/logs/swarm-<date>.log
  Database:          ~/.openclaw/swarm.db

ℹ️  Exit Codes:

  0  Success
  1  Error (validation, execution failure, etc.)

🔗 More Info:

  GitHub: https://github.com/preethamdev05/android-swarm
  README: https://github.com/preethamdev05/android-swarm#readme
`);
  }
}
