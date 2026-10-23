import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { DIAGNOSTIC_ID, SCHEMA_VERSION } from './diagnostic-schema.mjs';
import { writeEvidenceZip } from './diagnostic-zip.mjs';

// Verification hashes archive bytes, not Electron's virtual ASAR filesystem.
process.noAsar = true;

export const REPORT_FILES = ['run.json', 'machine.json', 'os.json', 'phases.json', 'errors.json',
    'process-metrics.json', 'trace.json', 'cpu.cpuprofile', 'trace-status.json', 'summary.json', 'USER-NOTES.txt'];
const LAUNCHERS = ['Launch-Diagnostics.cmd', 'Export-Reports.cmd', 'Verify-Kit.cmd', 'Run-Control.cmd'];
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

async function regularFile(root, relative, optional = false) {
    const file = path.resolve(root, relative);
    try {
        const stat = await fs.lstat(file);
        if (!stat.isFile() || stat.isSymbolicLink() || await fs.realpath(file) !== file) throw Error(`Unsafe file: ${relative}`);
        return file;
    } catch (error) { if (optional && error.code === 'ENOENT') return undefined; throw error; }
}

export async function exportReports(root) {
    root = await fs.realpath(root);
    const manifestFile = await regularFile(root, 'diagnostic-manifest.json');
    const manifestBytes = await fs.readFile(manifestFile), manifest = JSON.parse(manifestBytes);
    if (manifest.diagnosticId !== DIAGNOSTIC_ID || manifest.schemaVersion !== SCHEMA_VERSION) throw Error('Diagnostic identity mismatch');
    const runs = path.join(root, 'Diagnostic-Runs');
    const stat = await fs.lstat(runs);
    if (!stat.isDirectory() || stat.isSymbolicLink() || await fs.realpath(runs) !== runs) throw Error('Unsafe report directory');
    const entries = [{ name: 'diagnostic-manifest.json', file: manifestFile }], runIdentities = [];
    for (const item of await fs.readdir(runs, { withFileTypes: true })) {
        if (!item.isDirectory() || !/^\d{4}-\d{2}-\d{2}T[0-9-Z]+-[a-z0-9-]+$/.test(item.name)) continue;
        const directory = path.join(runs, item.name);
        if (await fs.realpath(directory) !== directory) throw Error('Report directory link refused');
        const identity = JSON.parse(await fs.readFile(await regularFile(directory, 'run.json'), 'utf8'));
        if (identity.diagnosticId !== manifest.diagnosticId || identity.manifestSha256 !== sha(manifestBytes))
            throw Error(`Run identity mismatch: ${item.name}`);
        runIdentities.push({ directory: item.name, experimentId: identity.config.experimentId, status: identity.status });
        for (const name of REPORT_FILES) {
            const file = await regularFile(directory, name, true);
            if (file) entries.push({ name: `runs/${item.name}/${name}`, file });
        }
    }
    for (const name of LAUNCHERS) entries.push({ name: `launchers/${name}`, file: await regularFile(root, name) });
    const verification = await regularFile(runs, 'verification.json', true);
    if (verification) entries.push({ name: 'verification.json', file: verification });
    if (!runIdentities.length && !verification) throw Error('No diagnostic reports found; run or verify the kit first');
    const catalog = [];
    for (const entry of entries) {
        const bytes = await fs.readFile(entry.file);
        catalog.push({ file: entry.name, bytes: bytes.length, sha256: sha(bytes) });
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const receiptFile = path.join(runs, `export-${stamp}.json`);
    await fs.writeFile(receiptFile, JSON.stringify({ schemaVersion: SCHEMA_VERSION, diagnosticId: DIAGNOSTIC_ID,
        runIdentities, files: catalog, excluded: ['Profile', 'Local Storage', 'cookies', 'credentials', 'user files'] }, null, 2), { flag: 'wx' });
    entries.push({ name: 'return-manifest.json', file: receiptFile });
    const destination = path.join(root, `${DIAGNOSTIC_ID}-RETURN-${stamp}.zip`);
    await writeEvidenceZip(destination, entries);
    return { destination, runs: runIdentities.length, files: entries.length };
}

export async function verifyKit(root) {
    root = await fs.realpath(root);
    const manifest = JSON.parse(await fs.readFile(await regularFile(root, 'diagnostic-manifest.json'), 'utf8'));
    if (manifest.diagnosticId !== DIAGNOSTIC_ID || manifest.schemaVersion !== SCHEMA_VERSION) throw Error('Diagnostic identity mismatch');
    const failures = [];
    for (const row of manifest.files) {
        if (path.isAbsolute(row.file) || row.file.includes('\\') || row.file.split('/').includes('..')) throw Error('Unsafe manifest path');
        try {
            const file = await regularFile(root, row.file), stat = await fs.stat(file);
            const { createReadStream } = await import('node:fs');
            const hash = createHash('sha256');
            for await (const bytes of createReadStream(file)) hash.update(bytes);
            if (stat.size !== row.bytes || hash.digest('hex') !== row.sha256) failures.push(row.file);
        } catch { failures.push(row.file); }
    }
    const runs = path.join(root, 'Diagnostic-Runs');
    await fs.mkdir(runs, { recursive: true });
    const runStat = await fs.lstat(runs);
    if (!runStat.isDirectory() || runStat.isSymbolicLink() || await fs.realpath(runs) !== runs) throw Error('Unsafe report directory');
    const result = { schemaVersion: SCHEMA_VERSION, diagnosticId: DIAGNOSTIC_ID,
        manifestSha256: sha(await fs.readFile(path.join(root, 'diagnostic-manifest.json'))),
        checked: manifest.files.length, failures, status: failures.length ? 'FAIL' : 'PASS',
        verifiedAt: new Date().toISOString() };
    await fs.writeFile(path.join(root, 'Diagnostic-Runs/verification.json'), JSON.stringify(result, null, 2));
    return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
    try {
        const result = process.argv.includes('--verify') ? await verifyKit(root) : await exportReports(root);
        console.log(JSON.stringify(result, null, 2));
        if (result.status === 'FAIL') process.exitCode = 1;
    } catch (error) { console.error(error.message); process.exitCode = 1; }
}
