#!/usr/bin/env node

const { existsSync, readdirSync, statSync } = require('fs');
const { join } = require('path');
const { spawnSync } = require('child_process');

const migrationsDir = join(__dirname, '..', 'prisma', 'migrations');

if (!process.env.DATABASE_URL) {
  console.warn('[prisma-prestart] DATABASE_URL is not set. Skipping Prisma schema sync.');
  process.exit(0);
}

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

function resolvePrismaBins() {
  const suffix = process.platform === 'win32' ? '.cmd' : '';
  const candidates = [
    join(__dirname, '..', 'node_modules', '.bin', `prisma${suffix}`),
    join(__dirname, '..', '..', 'node_modules', '.bin', `prisma${suffix}`),
  ].filter((p) => existsSync(p));

  candidates.push(`prisma${suffix}`);
  return candidates;
}

function runPrisma(args = []) {
  const bins = resolvePrismaBins();
  let lastError = null;

  const cwd = join(__dirname, '..');
  const env = { ...process.env };
  if (!env.DIRECT_URL && env.DATABASE_URL) {
    env.DIRECT_URL = env.DATABASE_URL;
  }

  for (const bin of bins) {
    const result = spawnSync(bin, args, {
      stdio: 'inherit',
      shell: false,
      cwd,
      env,
    });

    if (!result.error && result.status === 0) {
      return;
    }

    lastError = result.error || new Error(`Exit code ${result.status}`);

    if (result.error?.code !== 'ENOENT') {
      console.error(`[prisma-prestart] "${bin} ${args.join(' ')}" failed:`, lastError.message);
      process.exit(result.status ?? 1);
    }
  }

  const npxBin = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const result = spawnSync(npxBin, ['prisma', ...args], {
    stdio: 'inherit',
    shell: false,
    cwd,
    env,
  });

  if (result.error) {
    console.error(`[prisma-prestart] Failed to run prisma via npx:`, result.error.message);
    process.exit(result.status ?? 1);
  }

  if (result.status !== 0) {
    console.error(`[prisma-prestart] "npx prisma ${args.join(' ')}" exited with code ${result.status}.`);
    process.exit(result.status ?? 1);
  }
}

if (hasMigrations(migrationsDir)) {
  console.log('[prisma-prestart] Migrations found, running prisma migrate deploy...');
  runPrisma(['migrate', 'deploy']);
} else {
  console.log(
    '[prisma-prestart] No migrations directory detected. Running "prisma db push" to ensure the Supabase schema is in sync...'
  );

  const skipGenerate = process.env.PRISMA_DB_PUSH_SKIP_GENERATE !== 'false';
  const args = ['db', 'push'];
  if (skipGenerate) args.push('--skip-generate');
  if (skipGenerate) {
    console.log(
      '[prisma-prestart] Skipping Prisma Client generation. Set PRISMA_DB_PUSH_SKIP_GENERATE=false to re-run generation during start.'
    );
  }

  runPrisma(args);
}
