#!/usr/bin/env node
// Daily check-in entry point for GitHub Actions

import { loadConfig } from './config.js';
import { runCheckin } from './checkin.js';

async function main() {
  try {
    const config = loadConfig();
    await runCheckin(config);
  } catch (err) {
    console.error('Fatal error:', err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

main();
