// Runs as Node inside the C6 executable, before any game timing or GUI capture.
import fs from 'node:fs/promises';
import { constants, createReadStream } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const hash = async file => {
    const digest = createHash('sha256');
    for await (const bytes of createReadStream(file)) digest.update(bytes);
    return digest.digest('hex');
};
export function runtimeRows(manifest) {
    const excluded = new Set(['Launch-Diagnostics.cmd', 'Export-Reports.cmd', 'Verify-Kit.cmd', 'Run-Control.cmd', 'START-HERE.txt']);
    return manifest.files.filter(row => !row.file.startsWith('resources/app/')
        && !row.file.startsWith('RA2-HD-') && !row.file.startsWith('Reference/') && !excluded.has(row.file));
}
export async function stageRuntime(kit, ownRoot, manifest) {
    const folder = await fs.mkdtemp(path.join(ownRoot, 'Runtime-'));
    const files = runtimeRows(manifest);
    for (const row of files) {
        assert(!path.isAbsolute(row.file) && !row.file.includes('\\') && !row.file.split('/').includes('..'));
        const source = path.join(kit, row.file), target = path.join(folder, row.file), stat = await fs.lstat(source);
        assert(stat.isFile() && !stat.isSymbolicLink() && stat.size === row.bytes);
        assert.equal(await hash(source), row.sha256);
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.copyFile(source, target, constants.COPYFILE_EXCL);
        assert.equal(await hash(target), row.sha256);
    }
    const packageDirectory = path.join(folder, 'resources/app');
    await fs.mkdir(packageDirectory, { recursive: true });
    const metadata = { name: 'ra2-hd-c6-shader-identity', version: '1.0.0', private: true, type: 'module',
        main: path.relative(packageDirectory, path.join(ownRoot, 'shader-identity-entry.mjs')) };
    await fs.writeFile(path.join(packageDirectory, 'package.json'), JSON.stringify(metadata, null, 2) + '\n', { flag: 'wx' });
    return { status: 'PASS_BYTE_IDENTICAL_RUNTIME_STAGING', folder, files,
        runtimeBytes: files.reduce((total, row) => total + row.bytes, 0), package: metadata,
        boundary: 'Exact runtime copies and a companion entry only. Full C6 application and sibling art are reused in place.' };
}

async function main() {
    assert.equal(process.platform, 'win32', 'Launch this companion on Windows using Capture-Shader-Identity.cmd');
    const ownRoot = path.dirname(fileURLToPath(import.meta.url)), kit = path.resolve(ownRoot, '..');
    const bytes = await fs.readFile(path.join(kit, 'diagnostic-manifest.json'));
    assert.equal(createHash('sha256').update(bytes).digest('hex'),
        'f7bdd2665e180d4aa7528c3520bea9af45bfa2b4f00b26418eb27ab471bf526a');
    const manifest = JSON.parse(bytes);
    const { verifyKit } = await import(pathToFileURL(path.join(kit, 'resources/app/desktop/diagnostic-export.mjs')).href);
    console.log('Verifying the unchanged C6 kit before capture...');
    const verification = await verifyKit(kit); assert.equal(verification.status, 'PASS');
    console.log('Preparing an isolated copy of the exact C6 Windows runtime...');
    const staged = await stageRuntime(kit, ownRoot, manifest);
    const receipt = path.join(staged.folder, 'runtime-receipt.json');
    await fs.writeFile(receipt, JSON.stringify({ ...staged, verification }, null, 2) + '\n', { flag: 'wx' });
    const env = { ...process.env, RA2_HD_DIAGNOSTIC: '1', RA2_DIAGNOSTIC_ROOT: kit,
        RA2_SHADER_IDENTITY_RUNTIME_RECEIPT: receipt };
    delete env.ELECTRON_RUN_AS_NODE;
    console.log('Capture starts automatically. Keep the game focused; do not press F8/F9.');
    const child = spawn(path.join(staged.folder, 'Red Alert 2 HD.exe'),
        ['--diag-scene=stress', '--diag-mode=4x', '--diag-seconds=15'], { env, stdio: 'inherit', shell: false });
    const result = await new Promise((resolve, reject) => {
        child.once('error', reject); child.once('exit', (code, signal) => resolve({ code, signal }));
    });
    assert.equal(result.code, 0, `Capture runtime exited with ${result.code ?? result.signal}`);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try { await main(); }
    catch (error) { console.error(error.message); process.exitCode = 1; }
}
