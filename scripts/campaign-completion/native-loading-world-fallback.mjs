import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { PNG } from 'pngjs';
import { campaignSession, waitWorld } from '../m3-2/native-session.mjs';

const [outArg, stageArg, proofArg] = process.argv.slice(2);
const out = path.resolve(outArg), stage = path.resolve(stageArg), proofFile = path.resolve(proofArg);
await fs.mkdir(out, { recursive: false });
const receipt = JSON.parse(await fs.readFile(path.join(stage, 'receipt.json')));
const loading = JSON.parse(await fs.readFile(path.join(stage, 'files/interface-hd.json'))).loading;
const proof = JSON.parse(await fs.readFile(proofFile));
const original = await fs.readFile(path.resolve(path.dirname(proofFile), proof.original));
assert.equal(createHash('sha256').update(original).digest('hex'), proof.originalPngSha256);
assert(loading.world); assert.equal(proof.loadingSourceSha256, receipt.source.sha256);
const originalFrameSha256 = createHash('sha256').update(PNG.sync.read(original).data).digest('hex');
const mission = receipt.mission, stem = mission.slice(0, -4);
const formalFile = path.join('.local/campaign/ra2', stem, 'manifest.json'), before = await fs.readFile(formalFile);
const report = { status: 'RUNNING', errors: [], failedResources: [], warnings: [],
    scope: 'Specialized staged world-payload corruption probe. Original map, objectives, rules, formal resources and real profiles are unchanged. The complete Original loading page must recover; this is not a storyline event or objective-completion run.' };
let app, page;
try {
    ({ app, page } = await campaignSession(out, report, { density: 4 }));
    page.on('console', message => { if (message.type() === 'warning') report.warnings.push(message.text()); });
    const files = Object.fromEntries(await Promise.all((await fs.readdir(path.join(stage, 'files'))).map(async name => {
        let bytes = await fs.readFile(path.join(stage, 'files', name));
        if (name === loading.world.file) bytes = Buffer.concat([bytes, Buffer.from('staged-corruption-probe')]);
        return [`/local-campaign/ra2/${stem}/${name}`, { data: bytes.toString('base64'),
            type: name.endsWith('.png') ? 'image/png' : name.endsWith('.svg') ? 'image/svg+xml' : 'application/json' }];
    })));
    await page.evaluate(files => {
        const previous = window.fetch;
        window.__worldFallbackProbe = { requests: [], restore: () => window.fetch = previous };
        window.fetch = (input, options) => {
            const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, location.href);
            if (Object.hasOwn(files, url.pathname) && (options?.method ?? (input instanceof Request ? input.method : 'GET')) === 'GET') {
                window.__worldFallbackProbe.requests.push(url.pathname.split('/').at(-1));
                const payload = files[url.pathname], bytes = Uint8Array.from(atob(payload.data), character => character.charCodeAt(0));
                return Promise.resolve(new Response(bytes, { headers: { 'content-type': payload.type } }));
            }
            return previous.call(window, input, options);
        };
        const factory = window.__ra2debug.mainMenuController.screens.get(22).rootController.screens.get(1).loadingScreenApiFactory;
        const create = factory.create.bind(factory);
        factory.create = (...args) => {
            const api = create(...args), start = api.start.bind(api);
            api.start = async (...parameters) => {
                await start(...parameters); window.__heldLoading = api;
                await new Promise(resolve => window.__releaseLoading = resolve);
            };
            return api;
        };
    }, files);
    await page.evaluate(mission => window.__ra2debug.mainMenuController.screens.get(22).launchPrepared(mission), mission);
    await page.waitForFunction(() => window.__heldLoading && document.querySelector('[data-campaign-loading]'), undefined, { timeout: 90000 });
    report.fallback = await page.evaluate(async () => {
        const presentation = window.__heldLoading.presentation, frame = presentation.sprites.mission.frames[0];
        const digest = await crypto.subtle.digest('SHA-256', frame.data);
        return { hdAbsent: !presentation.hd, backdropAbsent: !presentation.backdrop,
            source: presentation.sprites.mission.image, size: [frame.width, frame.height],
            originalFrameSha256: [...new Uint8Array(digest)].map(n => n.toString(16).padStart(2, '0')).join(''),
            worldCanvasAbsent: !document.querySelector('[data-campaign-backdrop]'), ui: window.__ra2debug.uiArt.metrics() };
    });
    assert(report.fallback.hdAbsent && report.fallback.backdropAbsent && report.fallback.worldCanvasAbsent);
    assert.equal(report.fallback.source, receipt.source.member);
    assert.deepEqual(report.fallback.size, [800, 520]);
    assert.equal(report.fallback.originalFrameSha256, originalFrameSha256);
    assert.equal(report.fallback.ui.domImageGpuBytesUpperBound, 0);
    assert(report.fallback.ui.reservedBytes <= report.fallback.ui.budget);
    assert(report.warnings.some(message => message.includes('Campaign world retains Original')));
    await page.screenshot({ path: path.join(out, 'original-loading-after-world-corruption.png') });
    report.stagedRequests = await page.evaluate(() => {
        const probe = window.__worldFallbackProbe; probe.restore(); return probe.requests;
    });
    assert(report.stagedRequests.includes(loading.world.file));
    await page.evaluate(() => window.__releaseLoading()); await waitWorld(page, mission);
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []);
    assert(before.equals(await fs.readFile(formalFile)));
    report.formalManifestUnchanged = true;
    report.status = 'PASS_CORRUPT_WORLD_COMPLETE_ORIGINAL_FALLBACK_AND_HD_DISPOSAL';
} catch (error) {
    report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1;
    if (page) await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
} finally {
    await app?.close();
    await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
}
console.log(JSON.stringify({ status: report.status, error: report.error, out }));
