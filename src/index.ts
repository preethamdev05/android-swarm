#!/usr/bin/env node

import { CLI } from './cli.js';
import { getExitCodeForError } from './utils/exit-codes.js';

async function main() {
  const cli = new CLI();
  
  try {
    await cli.handleCommand(process.argv);
  } catch (err) {
    console.error('Fatal error:', err);
    process.exit(getExitCodeForError(err));
  }
}

main();
