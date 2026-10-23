// Runs as Node before any GUI timing; the preserved C7 kit is read-only.
import fs from 'node:fs/promises';
import { constants, createReadStream } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

export const BASE_MANIFEST = '1133beff253fc177d8b4a007077560a0a3a6de3aeb65f833464085dd65485458';
const hash = async file => {
    const digest = createHash('sha256');
    for await (const bytes of createReadStream(file)) digest.update(bytes);
    return digest.digest('hex');
};
export async function stageRuntime(kit, ownRoot, manifest) {
    const folder = await fs.mkdtemp(path.join(ownRoot, 'Runtime-'));
    const excluded = new Set(['Launch-Diagnostics.cmd', 'Export-Reports.cmd', 'Verify-Kit.cmd', 'Run-Control.cmd', 'START-HERE.txt']);
    const files = manifest.files.filter(row => !row.file.startsWith('resources/app/')
        && !row.file.startsWith('RA2-HD-') && !row.file.startsWith('Reference/') && !excluded.has(row.file));
    for (const row of files) {
        assert(!path.isAbsolute(row.file) && !row.file.includes('\\') && !row.file.split('/').includes('..'));
        const source = path.join(kit, row.file), target = path.join(folder, row.file), stat = await fs.lstat(source);
        assert(stat.isFile() && !stat.isSymbolicLink() && stat.size === row.bytes);
        assert.equal(await hash(source), row.sha256);
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.copyFile(source, target, constants.COPYFILE_EXCL);
        assert.equal(await hash(target), row.sha256);
    }
    const directory = path.join(folder, 'resources/app');
    await fs.mkdir(directory, { recursive: true });
    const metadata = { name: 'ra2-hd-c7-manual-capture', version: '1.0.0', private: true, type: 'module',
        main: path.relative(directory, path.join(ownRoot, 'manual-capture-entry.mjs')) };
    await fs.writeFile(path.join(directory, 'package.json'), JSON.stringify(metadata, null, 2) + '\n', { flag: 'wx' });
    return { status: 'PASS_BYTE_IDENTICAL_RUNTIME_STAGING', folder, files,
        runtimeBytes: files.reduce((total, row) => total + row.bytes, 0), package: metadata,
        boundary: 'Exact runtime copies and a diagnostic entry only; C7 game and sibling art are reused in place.' };
}

async function main() {
    assert.equal(process.platform, 'win32', 'Use Capture-Manual-Play.cmd on Windows');
    const ownRoot = path.dirname(fileURLToPath(import.meta.url)), kit = path.resolve(ownRoot, '..');
    const bytes = await fs.readFile(path.join(kit, 'diagnostic-manifest.json'));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), BASE_MANIFEST);
    const manifest = JSON.parse(bytes);
    const { verifyKit } = await import(pathToFileURL(path.join(kit, 'resources/app/desktop/diagnostic-export.mjs')).href);
    console.log('Verifying the preserved C7 kit before timing...');
    const verification = await verifyKit(kit); assert.equal(verification.status, 'PASS');
    console.log('Preparing an isolated copy of the exact C7 runtime...');
    const staged = await stageRuntime(kit, ownRoot, manifest), receipt = path.join(staged.folder, 'runtime-receipt.json');
    await fs.writeFile(receipt, JSON.stringify({ ...staged, verification }, null, 2) + '\n', { flag: 'wx' });
    const env = { ...process.env, RA2_HD_DIAGNOSTIC: '1', RA2_DIAGNOSTIC_ROOT: kit,
        RA2_MANUAL_CAPTURE_RUNTIME_RECEIPT: receipt };
    delete env.ELECTRON_RUN_AS_NODE;
    console.log('After the automatic test, continue playing. Press F8 during low frame rate, then F9 after F8 completes.');
    const child = spawn(path.join(staged.folder, 'Red Alert 2 HD.exe'),
        ['--diag-scene=stress', '--diag-mode=4x', '--diag-seconds=15'], { env, stdio: 'inherit', shell: false });
    const result = await new Promise((resolve, reject) => {
        child.once('error', reject); child.once('exit', (code, signal) => resolve({ code, signal }));
    });
    assert.equal(result.code, 0, `Capture exited with ${result.code ?? result.signal}`);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try { await main(); }
    catch (error) { console.error(error.message); process.exitCode = 1; }
}
