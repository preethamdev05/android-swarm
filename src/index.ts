#!/usr/bin/env node

import { CLI } from './cli.js';

async function main() {
  const cli = new CLI();
  
  try {
    await cli.handleCommand(process.argv);
  } catch (err) {
    console.error('Fatal error:', err);
    process.exit(1);
  }
}

main();
