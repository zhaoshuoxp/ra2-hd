import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import integrationFiles from './test-support/integration-files.json' with { type: 'json' };

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const option = name => { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1]; };
const mode = option('--mode') ?? 'all';
if (!['all', 'source', 'integration'].includes(mode)) throw Error('Use --mode all|source|integration');
const resourceRoot = option('--resource-root') ?? process.env.RA2_TEST_RESOURCE_ROOT;
if (mode !== 'source' && !resourceRoot) throw Error('Integration requires --resource-root /path/to/imported/.local');
const output = path.resolve(option('--output') ?? '.artifacts/test-suite');
fs.mkdirSync(output, { recursive: true });
const walk = directory => fs.readdirSync(path.join(root, directory), { withFileTypes: true }).flatMap(entry => {
    const file = `${directory}/${entry.name}`;
    return entry.isDirectory() ? walk(file) : /\.test\.[cm]?[jt]sx?$/.test(entry.name) ? [file] : [];
});
const all = [...walk('scripts'), ...walk('src/test')].sort();
const integrations = new Set(integrationFiles);
for (const file of integrations) if (!all.includes(file)) throw Error(`Stale integration classification: ${file}`);
const selected = all.filter(file => mode === 'all' || (mode === 'integration') === integrations.has(file));
const omitted = all.filter(file => !selected.includes(file));
const summary = { mode, platform: process.platform, resourceRoot: mode === 'source' ? null : path.resolve(resourceRoot),
    files: [], omitted, counts: { pass: 0, failedCases: 0, loadErrors: 0, skipped: 0, processErrors: 0 },
    acceptance: mode === 'all' ? 'PENDING' : 'PARTIAL_RUN_NOT_FULL_SUITE_ACCEPTANCE' };
const rawFile = path.join(output, 'raw.log');
fs.writeFileSync(rawFile, '');
const temporary = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ra2-test-suite-')));
try {
    for (const file of selected) {
        // Edition modules are cached per process; test both Yuri catalog boundaries independently.
        const editions = file === 'scripts/m1/yuri-buildings/contracts.test.ts' ? ['yr', 'ra2'] : [undefined];
        for (const edition of editions) {
            const env = { ...process.env, TMPDIR: temporary, TEMP: temporary, TMP: temporary, FORCE_COLOR: '0' };
            delete env.C_TEST_FAMILIES;
            delete env.C_TEST_EDITION;
            delete env.RA2_UI_RESOURCE_ROOT;
            delete env.BUILDUP_STORAGE_AUTHORING;
            if (edition) env.C_TEST_EDITION = edition;
            if (mode !== 'source') env.RA2_TEST_RESOURCE_ROOT = path.resolve(resourceRoot);
            else delete env.RA2_TEST_RESOURCE_ROOT;
            const command = ['test', '--preload', './scripts/windows-hd/browser-test-setup.ts', '--timeout', '30000', `./${file}`];
            const run = spawnSync(process.execPath, command, { cwd: root, env, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
            const text = (run.stdout ?? '') + (run.stderr ?? '');
            fs.appendFileSync(rawFile, `\nCOMMAND ${JSON.stringify([process.execPath, ...command])} EDITION ${edition ?? 'default'}\n${text}`);
            const count = name => Number(text.match(new RegExp(`^\\s*(\\d+) ${name}\\s*$`, 'm'))?.[1] ?? 0);
            const row = { file, edition: edition ?? 'default', exitCode: run.status, signal: run.signal,
                pass: count('pass'), failedCases: count('fail'), loadErrors: count('errors?'), skipped: count('skip'),
                processErrors: run.error || run.signal || (run.status !== 0 && !count('fail') && !count('errors?')) ? 1 : 0 };
            // Bun includes between-test loading errors in its fail count: do not count them twice.
            row.failedCases = Math.max(0, row.failedCases - row.loadErrors);
            summary.files.push(row);
            for (const key of Object.keys(summary.counts)) summary.counts[key] += row[key];
            console.log(`${run.status === 0 ? 'PASS' : 'FAIL'} ${file}${edition ? ` (${edition})` : ''}: ${row.pass} pass, ${row.failedCases} failed cases, ${row.loadErrors} loading errors, ${row.skipped} skipped`);
            fs.writeFileSync(path.join(output, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
        }
    }
} finally { fs.rmSync(temporary, { recursive: true, force: true }); }
const failed = summary.files.some(row => row.exitCode !== 0) || summary.counts.skipped > 0;
if (mode === 'all') summary.acceptance = failed ? 'NOT_PASSING' : 'HOST_TESTS_PASS_NATIVE_RUNTIME_NOT_RUN';
summary.temporaryFilesRemoved = true;
fs.writeFileSync(path.join(output, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify({ ...summary, files: summary.files.length, omittedFiles: omitted.length, omitted: undefined }, null, 2));
process.exitCode = failed ? 1 : 0;
