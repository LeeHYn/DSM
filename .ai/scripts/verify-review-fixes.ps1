param([ValidateSet('backend', 'frontend', 'checks')][string]$Group = 'checks')
$ErrorActionPreference = 'Stop'
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
@'
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const group = process.argv[2];
const root = path.resolve(process.argv[3]);
const back = path.join(root, 'DSM_Back');
const front = path.join(root, 'DSM_Front');
const node = process.execPath;
const jest = ['node_modules/jest/bin/jest.js', '--runInBand', '--no-cache'];
const suites = {
  backend: [
    ['Backend unit', back, node, jest],
    ['Backend full HTTP E2E', back, node, [...jest, '--config', 'test/jest-e2e.json']],
    ['Production startup', back, node, ['--test', 'test/production-start.test.cjs']],
  ],
  frontend: [['Frontend unit', front, node, jest]],
  checks: [
    ['Backend types', back, node, ['node_modules/typescript/bin/tsc', '--noEmit', '--incremental', 'false', '-p', 'tsconfig.spec.json']],
    ['Frontend types', front, node, ['node_modules/typescript/bin/tsc', '--noEmit', '--incremental', 'false']],
    ['Backend lint', back, node, ['node_modules/eslint/bin/eslint.js', '{src,apps,libs,test}/**/*.ts']],
    ['Frontend lint', front, node, ['node_modules/eslint/bin/eslint.js', 'src', 'index.js']],
    ['Setup preservation', root, 'powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', '.ai/scripts/test-setup-ai.ps1']],
    ['Git whitespace', root, 'git', ['diff', '--check']],
  ],
};
if (!Object.hasOwn(suites, group)) throw new Error('Invalid verification group');
const logfile = path.join(root, '.local', `fix-20260922-${group}.log`);
fs.writeFileSync(logfile, `FIX-20260922 ${group} ${new Date().toISOString()}\n`, 'utf8');
let failed = false;
for (const [name, cwd, command, args] of suites[group]) {
  const result = spawnSync(command, args, {
    cwd, encoding: 'utf8', windowsHide: true, timeout: 300000, maxBuffer: 100 * 1024 * 1024,
  });
  fs.appendFileSync(logfile, `\n${name}\n${command} ${args.join(' ')}\n${result.stdout || ''}${result.stderr || ''}\nEXIT ${result.status}${result.error ? ` ${result.error.message}` : ''}\n`);
  console.log(`${name}: ${result.status}`);
  if (result.status !== 0) failed = true;
}
process.exitCode = failed ? 1 : 0;
'@ | node - $Group $repoRoot
exit $LASTEXITCODE
