import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';

const require = createRequire(import.meta.url);
const child = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'dev', '--hostname', '127.0.0.1', '--port', '3000', ...process.argv.slice(2)], {
  stdio: 'inherit',
  // Polling avoids macOS file-descriptor limits in restricted workspaces.
  env: { ...process.env, WATCHPACK_POLLING: process.env.WATCHPACK_POLLING ?? 'true' },
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 0; });
