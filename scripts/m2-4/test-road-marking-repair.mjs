import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const output = path.resolve(process.argv[2]);
fs.mkdirSync(output, { recursive: false });
const setup = path.join(output, 'yr-edition.ts');
fs.writeFileSync(setup, "(globalThis as any).location = { search: '?edition=yr' };\n");
const cases = [
    ['urban', 'ra2', 'scripts/m2-4/urban-terrain-loading.test.ts'],
    ['newurban', 'yr', 'scripts/m2-4/newurban-terrain-loading.test.ts'],
    ['desert', 'ra2', 'scripts/m2-4/desert-terrain-loading.test.ts'],
    ['temperate', 'ra2', 'scripts/m2/official-maps/terrain-loading.test.ts'],
    ['ui', 'ra2', 'scripts/ui/long-play-ui.test.ts'],
];
const summary = { status: 'RUNNING', cases: [] };
for (const [name, edition, file] of cases) {
    const args = ['test', '--preload', './scripts/windows-hd/browser-test-setup.ts', '--timeout', '30000'];
    if (edition === 'yr') args.push('--preload', setup);
    args.push(file);
    const run = spawnSync('bun', args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
        env: { ...process.env, RA2_TEST_RESOURCE_ROOT: path.resolve('.local'), FORCE_COLOR: '0' } });
    const log = (run.stdout ?? '') + (run.stderr ?? '');
    fs.writeFileSync(path.join(output, name + '.log'), log);
    const count = label => Number(log.match(new RegExp(`^\\s*(\\d+) ${label}\\s*$`, 'm'))?.[1] ?? 0);
    summary.cases.push({ name, edition, command: ['bun', ...args], exitCode: run.status,
        pass: count('pass'), fail: count('fail'), assertions: Number(log.match(/(\d+) expect\(\) calls/)?.[1] ?? 0) });
    fs.writeFileSync(path.join(output, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
    console.log(JSON.stringify(summary.cases.at(-1)));
}
summary.status = summary.cases.every(row => row.exitCode === 0 && row.fail === 0) ? 'PASS' : 'FAIL';
fs.writeFileSync(path.join(output, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
assert.equal(summary.status, 'PASS');
