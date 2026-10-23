import { app } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { installShaderIdentityProbe } from './shader-identity-probe.mjs';

const ownRoot = path.dirname(fileURLToPath(import.meta.url));
const kit = path.resolve(process.env.RA2_DIAGNOSTIC_ROOT ?? path.join(ownRoot, '..'));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const ownBytes = await fs.readFile(path.join(ownRoot, 'companion-manifest.json'));
const own = JSON.parse(ownBytes), baseBytes = await fs.readFile(path.join(kit, 'diagnostic-manifest.json'));
const base = JSON.parse(baseBytes);
if (own.companionId !== 'WINHD-20261008-D38F136-C6-SHADER-IDENTITY-S1'
    || sha(baseBytes) !== 'f7bdd2665e180d4aa7528c3520bea9af45bfa2b4f00b26418eb27ab471bf526a'
    || base.diagnosticId !== 'WINHD-20261008-D38F136-C6'
    || base.diagnosticCommit !== '4d3e41f5ffe2746ada9bc765a407f00638cb4705') throw Error('This companion requires the exact preserved C6 kit');
const expectedFiles = ['shader-identity-bootstrap.mjs', 'shader-identity-entry.mjs', 'shader-identity-probe.mjs',
    'Capture-Shader-Identity.cmd', 'START-HERE.txt'];
if (JSON.stringify(own.files.map(row => row.file).sort()) !== JSON.stringify(expectedFiles.sort()))
    throw Error('Companion catalog mismatch');
for (const row of own.files) {
    const file = path.join(ownRoot, row.file), stat = await fs.lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== row.bytes || sha(await fs.readFile(file)) !== row.sha256)
        throw Error(`Companion file mismatch: ${row.file}`);
}
const identity = { companionId: own.companionId, sourceHead: own.sourceHead,
    manifestSha256: sha(ownBytes), files: own.files, baseManifestSha256: sha(baseBytes) };
if (process.env.RA2_SHADER_IDENTITY_RUNTIME_RECEIPT) {
    const receipt = JSON.parse(await fs.readFile(process.env.RA2_SHADER_IDENTITY_RUNTIME_RECEIPT, 'utf8'));
    identity.runtimeReceipt = { status: receipt.status, runtimeBytes: receipt.runtimeBytes,
        verification: receipt.verification, executionPlatform: process.platform, executionArch: process.arch };
}
process.env.RA2_HD_DIAGNOSTIC = '1'; process.env.RA2_DIAGNOSTIC_ROOT = kit;
const before = new Set(await fs.readdir(path.join(kit, 'Diagnostic-Runs')).catch(() => []));
let output;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const note = async value => {
    const started = Date.now();
    while (!output && Date.now() - started < 120000) await delay(100);
    if (!output) throw Error('Companion report directory was not created');
    await fs.appendFile(path.join(output, 'USER-NOTES.txt'), JSON.stringify(value) + '\n');
};
app.on('browser-window-created', (_, window) => {
    const contents = window.webContents;
    contents.once('did-finish-load', () => {
        void (async () => {
            const evaluate = (fn, value) => contents.executeJavaScript(`(${fn.toString()})(${JSON.stringify(value) ?? ''})`, true);
            const until = async fn => {
                const started = Date.now();
                while (Date.now() - started < 120000) {
                    if (contents.isDestroyed()) throw Error('Companion window closed before capture');
                    if (await evaluate(fn)) return;
                    await delay(100);
                }
                throw Error('Companion capture readiness timed out');
            };
            await until(() => !!window.__ra2WinDiagnostic);
            await evaluate(installShaderIdentityProbe, identity);
            await note({ identity, status: 'INSTALLED', boundary: 'Shader identity companion only; application and resource files remain the preserved C6 bytes.' });
            await until(() => !!window.__ra2debug?.gameScreen?.gameAnimationLoop?.isStarted);
            await delay(20000);
            if (contents.isDestroyed() || !await evaluate(() => document.hasFocus() && document.visibilityState === 'visible'))
                throw Error('Keep the game focused for its automatic shader capture');
            contents.sendInputEvent({ type: 'keyDown', keyCode: 'F9' });
            contents.sendInputEvent({ type: 'keyUp', keyCode: 'F9' });
            await note({ status: 'REQUESTED_F9', secondsAfterObservedFirstLiveLoop: 20 });
        })().catch(async error => {
            await note({ status: 'COMPANION_FAILED', message: error.message });
            if (!window.isDestroyed()) window.setTitle('Shader identity capture failed - close and export reports');
        });
    });
});
// Preserve the existing application entry, sandbox, profile, four phases and export path.
await import(pathToFileURL(path.join(kit, 'resources/app/desktop/diagnostic-entry.mjs')).href);
const created = (await fs.readdir(path.join(kit, 'Diagnostic-Runs'))).filter(name => !before.has(name)
    && /^\d{4}-\d{2}-\d{2}T[0-9-Z]+-stress-4x-none$/.test(name));
if (created.length !== 1) throw Error('Expected one new C6 stress/4X companion run');
output = path.join(kit, 'Diagnostic-Runs', created[0]);
