#!/usr/bin/env node

const { existsSync, readdirSync, statSync } = require('fs');
const { join } = require('path');
const { spawnSync } = require('child_process');

const migrationsDir = join(__dirname, '..', 'prisma', 'migrations');

function hasMigrations(dir) {
  if (!existsSync(dir)) {
    return false;
  }

  try {
    return readdirSync(dir).some((entry) => {
      const fullPath = join(dir, entry);
      return statSync(fullPath).isDirectory();
    });
  } catch (error) {
    console.warn('[prisma-prestart] Unable to inspect migrations directory:', error.message);
    return false;
  }
}

function runPrisma(command, args = []) {
  const result = spawnSync(command, args, { stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.error) {
    console.error(`[prisma-prestart] Failed to run "${command} ${args.join(' ')}":`, result.error.message);
    process.exit(result.status ?? 1);
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

if (hasMigrations(migrationsDir)) {
  console.log('[prisma-prestart] Migrations found, running prisma migrate deploy...');
  runPrisma('prisma', ['migrate', 'deploy']);
} else {
  console.log('[prisma-prestart] No migrations found, skipping prisma migrate deploy.');
}
