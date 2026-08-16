import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import process from 'node:process';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const frontendDirectory = path.resolve(scriptDirectory, '..');
const projectDirectory = path.resolve(frontendDirectory, '..');
const composeFile = path.join(projectDirectory, 'compose.yaml');
const e2eComposeFile = path.join(projectDirectory, 'compose.e2e.yaml');
const projectName = 'vpnshiki-e2e';
const require = createRequire(import.meta.url);
const playwrightCli = require.resolve('@playwright/test/cli');

const testEnvironment = {
  ...process.env,
  POSTGRES_DB: 'vpnshiki_e2e',
  POSTGRES_USER: 'vpnshiki_e2e',
  POSTGRES_PASSWORD: 'vpnshiki_e2e_password',
  POSTGRES_PORT: process.env.E2E_POSTGRES_PORT ?? '55432',
  BACKEND_PORT: process.env.E2E_BACKEND_PORT ?? '18000',
  FRONTEND_PORT: process.env.E2E_FRONTEND_PORT ?? '18080',
  ADMIN_NAME: 'e2e-admin',
  ADMIN_PASSWORD: 'e2e-admin-password',
  E2E_ADMIN_NAME: 'e2e-admin',
  E2E_ADMIN_PASSWORD: 'e2e-admin-password',
  E2E_BASE_URL: `http://127.0.0.1:${process.env.E2E_FRONTEND_PORT ?? '18080'}`,
};

const composeArguments = [
  'compose',
  '--project-name', projectName,
  '--file', composeFile,
  '--file', e2eComposeFile,
];

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? projectDirectory,
    env: testEnvironment,
    stdio: options.stdio ?? 'inherit',
  });

  if (result.error) throw result.error;
  return result.status ?? 1;
}

function cleanup() {
  run('docker', [...composeArguments, 'down', '--volumes', '--remove-orphans'], { stdio: 'inherit' });
}

let exitCode = 1;

try {
  // Remove a stack left by an interrupted previous run before creating a fresh database.
  run('docker', [...composeArguments, 'down', '--volumes', '--remove-orphans'], { stdio: 'ignore' });

  const composeExitCode = run('docker', [
    ...composeArguments,
    'up',
    '--detach',
    '--build',
    '--wait',
    '--wait-timeout',
    '120',
  ]);

  if (composeExitCode !== 0) throw new Error(`Не удалось запустить E2E-стенд (код ${composeExitCode})`);

  exitCode = run(process.execPath, [playwrightCli, 'test'], { cwd: frontendDirectory });
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
} finally {
  cleanup();
}

process.exitCode = exitCode;
