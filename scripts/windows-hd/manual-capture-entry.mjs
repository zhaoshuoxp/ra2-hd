import { app } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { BASE_MANIFEST } from './manual-capture-bootstrap.mjs';

const ownRoot = path.dirname(fileURLToPath(import.meta.url));
const kit = path.resolve(process.env.RA2_DIAGNOSTIC_ROOT ?? path.join(ownRoot, '..'));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const ownBytes = await fs.readFile(path.join(ownRoot, 'companion-manifest.json'));
const own = JSON.parse(ownBytes), baseBytes = await fs.readFile(path.join(kit, 'diagnostic-manifest.json'));
const base = JSON.parse(baseBytes);
if (own.companionId !== 'WINHD-20261008-D38F136-C7-MANUAL-M1' || sha(baseBytes) !== BASE_MANIFEST
    || base.diagnosticId !== 'WINHD-20261008-D38F136-C7'
    || base.diagnosticCommit !== '3ab266e3b0b2c755f33ac65ca0866b1055f019d0') throw Error('This companion requires the exact preserved C7 kit');
const expectedFiles = ['manual-capture-bootstrap.mjs', 'manual-capture-entry.mjs', 'Capture-Manual-Play.cmd', 'START-HERE.txt'];
if (JSON.stringify(own.files.map(row => row.file).sort()) !== JSON.stringify(expectedFiles.sort()))
    throw Error('Companion catalog mismatch');
for (const row of own.files) {
    const file = path.join(ownRoot, row.file), stat = await fs.lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== row.bytes || sha(await fs.readFile(file)) !== row.sha256)
        throw Error(`Companion file mismatch: ${row.file}`);
}
const probePath = 'resources/app/desktop/diagnostic-renderer.mjs';
if (sha(await fs.readFile(path.join(kit, probePath))) !== base.files.find(row => row.file === probePath)?.sha256)
    throw Error('Preserved diagnostic probe mismatch');
const { installDiagnosticProbe } = await import(pathToFileURL(path.join(kit, probePath)).href);
const originalSource = installDiagnosticProbe.toString();
const replaceOnce = (source, before, after) => {
    if (source.split(before).length !== 2) throw Error('Unsupported preserved probe shape');
    return source.replace(before, after);
};
let source = replaceOnce(originalSource, 'active.cameraRoute = { base: { ...route },',
    "active.cameraRoute = active.manualCamera ? { mode: 'manual-input', start: { ...route } } : { base: { ...route },");
source = replaceOnce(source, 'root.worldScene.cameraPan.setPan({ x: route.x - 350',
    'if (!active.manualCamera) root.worldScene.cameraPan.setPan({ x: route.x - 350');
source = replaceOnce(source, 'visibilityEvents: [], focusEvents: [], resizeEvents: [] };',
    "visibilityEvents: [], focusEvents: [], resizeEvents: [] };\n            if (label.startsWith('manual-') || label === 'instrumented-cpu-multiprocess-trace') active.manualCamera = true;\n            api.manualCapturePhase = active.manualCamera ? { label: active.label, status: 'CAPTURING' } : null;");
source = replaceOnce(source, 'active = undefined;\n            if (route && root.worldScene) root.worldScene.cameraPan.setPan(route);',
    "if (result.manualCamera) {\n                if (result.cameraRoute && root.worldScene) result.cameraRoute.end = { ...root.worldScene.cameraPan.getPan() };\n                api.manualCapturePhase.status = 'COMPLETE';\n            }\n            active = undefined;\n            if (!result.manualCamera && route && root.worldScene) root.worldScene.cameraPan.setPan(route);");
const expectedInstall = `(${originalSource})()`, manualInstall = `(${source})()`;
const identity = { companionId: own.companionId, sourceHead: own.sourceHead, manifestSha256: sha(ownBytes),
    files: own.files, baseManifestSha256: sha(baseBytes),
    originalProbeSourceSha256: sha(originalSource), manualProbeSourceSha256: sha(source),
    scope: 'Manual F8 and late F9 preserve live camera input; automatic phases and game bytes are unchanged.' };
if (process.env.RA2_MANUAL_CAPTURE_RUNTIME_RECEIPT) {
    const receipt = JSON.parse(await fs.readFile(process.env.RA2_MANUAL_CAPTURE_RUNTIME_RECEIPT, 'utf8'));
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
    const contents = window.webContents, execute = contents.executeJavaScript;
    let installed = false;
    // Replace only the exact, hash-pinned diagnostic installation, then restore the API.
    contents.executeJavaScript = function (script, ...args) {
        if (script !== expectedInstall) return execute.call(this, script, ...args);
        this.executeJavaScript = execute; installed = true;
        return execute.call(this, manualInstall, ...args);
    };
    contents.once('destroyed', () => { if (!installed) contents.executeJavaScript = execute; });
    contents.once('did-finish-load', () => {
        void (async () => {
            const started = Date.now();
            while (!installed && !contents.isDestroyed() && Date.now() - started < 120000) await delay(100);
            if (!installed) throw Error('Manual diagnostic probe was not installed');
            await note({ identity, status: 'INSTALLED', manualCamera: 'PRESERVED',
                boundary: 'Tooling only; no frame cap, sync, quality, rules, art, allocation or rendering repair.' });
        })().catch(async error => {
            if (!contents.isDestroyed()) contents.executeJavaScript = execute;
            await note({ status: 'COMPANION_FAILED', message: error.message });
            if (!window.isDestroyed()) window.setTitle('Manual capture failed - close and export reports');
        });
    });
});
await import(pathToFileURL(path.join(kit, 'resources/app/desktop/diagnostic-entry.mjs')).href);
const created = (await fs.readdir(path.join(kit, 'Diagnostic-Runs'))).filter(name => !before.has(name)
    && /^\d{4}-\d{2}-\d{2}T[0-9-Z]+-stress-4x-none$/.test(name));
if (created.length !== 1) throw Error('Expected one new C7 stress/4X manual-capture run');
output = path.join(kit, 'Diagnostic-Runs', created[0]);
