import { Orchestrator } from './orchestrator.js';
import { logger } from './logger.js';
import { PATHS } from './constants.js';
import { existsSync, unlinkSync } from 'fs';

export class CLI {
  private orchestrator: Orchestrator;

  constructor() {
    this.orchestrator = new Orchestrator();
  }

  async handleCommand(args: string[]): Promise<void> {
    const command = args[2];

    if (!command || command === 'help') {
      this.printHelp();
      return;
    }

    if (command === 'agent') {
      await this.handleAgentCommand(args);
    } else if (command === 'abort') {
      await this.handleAbortCommand(args);
    } else if (command === 'cleanup') {
      await this.handleCleanupCommand(args);
    } else {
      console.error(`Unknown command: ${command}`);
      this.printHelp();
      process.exit(1);
    }
  }

  private async handleAgentCommand(args: string[]): Promise<void> {
    const messageIndex = args.indexOf('--message');
    if (messageIndex === -1 || messageIndex === args.length - 1) {
      console.error('Missing --message argument');
      console.log('Usage: openclaw agent --message \'build app: {...}\'');
      process.exit(1);
    }

    const messageArg = args[messageIndex + 1];
    
    if (!messageArg.startsWith('build app:')) {
      console.error('Message must start with "build app:"');
      process.exit(1);
    }

    const jsonStr = messageArg.substring('build app:'.length).trim();
    
    let taskSpec: any;
    try {
      taskSpec = JSON.parse(jsonStr);
    } catch (err) {
      console.error('Invalid JSON in task specification');
      console.error(err);
      process.exit(1);
    }

    try {
      console.log('Starting Android Swarm task...');
      const workspacePath = await this.orchestrator.executeTask(taskSpec);
      console.log('\nTask completed successfully!');
      console.log(`Output: ${workspacePath}`);
      console.log('\nTo build the app:');
      console.log(`  cd ${workspacePath}`);
      console.log(`  ./gradlew assembleDebug`);
    } catch (err: any) {
      console.error('\nTask failed:', err.message);
      process.exit(1);
    } finally {
      this.orchestrator.close();
    }
  }

  private async handleAbortCommand(args: string[]): Promise<void> {
    const taskIdIndex = args.indexOf('--task-id');
    
    if (taskIdIndex === -1) {
      console.error('Missing --task-id argument');
      console.log('Usage: openclaw swarm abort --task-id <task_id>');
      process.exit(1);
    }

    const taskId = args[taskIdIndex + 1];
    
    if (!existsSync(PATHS.PID_FILE)) {
      console.log('No task is currently running');
      return;
    }

    const pidStr = require('fs').readFileSync(PATHS.PID_FILE, 'utf8');
    const pid = parseInt(pidStr);

    try {
      process.kill(pid, 'SIGTERM');
      console.log(`Sent abort signal to task (PID ${pid})`);
    } catch (err) {
      console.error(`Failed to abort task: ${err}`);
      process.exit(1);
    }
  }

  private async handleCleanupCommand(args: string[]): Promise<void> {
    const olderThanIndex = args.indexOf('--older-than');
    const failedOnlyIndex = args.indexOf('--failed-only');

    if (olderThanIndex === -1) {
      console.error('Missing --older-than argument');
      console.log('Usage: openclaw swarm cleanup --older-than 7d --failed-only');
      process.exit(1);
    }

    const olderThanArg = args[olderThanIndex + 1];
    const match = olderThanArg.match(/^(\d+)d$/);
    
    if (!match) {
      console.error('Invalid --older-than format (use: 7d, 30d, etc.)');
      process.exit(1);
    }

    const days = parseInt(match[1]);
    const failedOnly = failedOnlyIndex !== -1;

    console.log(`Cleanup not yet implemented`);
    console.log(`Would remove: ${failedOnly ? 'failed' : 'all'} tasks older than ${days} days`);
  }

  private printHelp(): void {
    console.log(`
Android Swarm - OpenClaw Skill

Usage:
  openclaw agent --message 'build app: <spec>'
  openclaw swarm abort --task-id <task_id>
  openclaw swarm cleanup --older-than 7d --failed-only

Examples:
  openclaw agent --message 'build app: {"app_name":"MyApp","features":["login","list"],"architecture":"MVVM","ui_system":"Compose","min_sdk":24,"target_sdk":34,"gradle_version":"8.2.0","kotlin_version":"1.9.20"}'

Environment Variables:
  KIMI_API_KEY              Kimi K2.5 API key (required)
  SWARM_DEBUG               Enable debug logging (1 or 0)
  SWARM_API_TIMEOUT         API timeout in seconds (default: 30)
  SWARM_WORKSPACE_ROOT      Workspace directory (default: ~/.openclaw/workspace/android-swarm)
`);
  }
}
