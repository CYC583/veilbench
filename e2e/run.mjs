// Keep the browser test runner outside the application dependency tree.
import { spawnSync } from 'node:child_process';
import { delimiter, dirname, join } from 'node:path';
import { existsSync } from 'node:fs';
const version = '1.60.0';
const args = process.argv.slice(2);
if (!process.env.VB_PLAYWRIGHT_RUNNER) {
  const child = spawnSync('npm', ['exec', '--yes', '--package=@playwright/test@' + version, '--', 'node', import.meta.filename, ...args],
    { stdio: 'inherit', env: { ...process.env, VB_PLAYWRIGHT_RUNNER: '1' } });
  process.exit(child.status ?? 1);
}
const bin = process.env.PATH.split(delimiter).find(path => existsSync(join(dirname(path), '@playwright/test/cli.js')));
if (!bin) throw Error('Pinned Playwright installation not found');
const modulePath = join(dirname(bin), '@playwright/test');
const install = args[0] === 'install';
const result = spawnSync(process.execPath, [join(modulePath, 'cli.js'), ...(install ? args : ['test', '-c', 'playwright.config.cjs', ...args])],
  { stdio: 'inherit', env: { ...process.env, VB_PLAYWRIGHT_MODULE: modulePath } });
process.exit(result.status ?? 1);
