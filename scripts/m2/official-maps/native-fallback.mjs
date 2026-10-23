// Reject a changed seven-member outpost dependency atomically, then test missing-pack re-entry.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { startSession } from '../../m1/allied-units/desktop-session.mjs';

const [receipt, output] = process.argv.slice(2);
const density = process.argv.includes('--density=2') ? 2 : 4;
const selected = JSON.parse(await fs.readFile('desktop/environment-hd-contract.json')).selectedPack;
const manifest = JSON.parse(await fs.readFile(path.join('.local/environment-packs', selected.revision, 'manifest.json')));
const family = manifest.families['environment-ctoutp'];
const hash = family.members.find(member => member.member === 'ctoutp_d.shp').sha256;
const session = await startSession(receipt, output, 'ra2', false, async ({ page }) => {
    await page.evaluate(({ density, hash }) => {
        const d = window.__ra2debug;
        d.generalOptions.graphics.hdEnabled.value = true; d.generalOptions.graphics.hdDensity.value = density;
        window.__m23FallbackMode = 'corrupt-member'; window.__m23Injected = [];
        const fetch = window.fetch;
        window.fetch = async (...args) => {
            const url = String(args[0]);
            if (window.__m23FallbackMode === 'missing-pack' && url === '/local-environment/selection.json') {
                window.__m23Injected.push({ mode: 'missing-pack', url });
                return new Response(null, { status: 404 });
            }
            const response = await fetch.apply(window, args);
            if (window.__m23FallbackMode === 'corrupt-member' && url.includes('/local-environment/')
                && url.endsWith('/manifest.json') && url.includes('/' + hash + '/')) {
                const bytes = new Uint8Array(await response.arrayBuffer()); bytes[0] ^= 1;
                window.__m23Injected.push({ mode: 'corrupt-member', url });
                return new Response(bytes, { status: 200 });
            }
            return response;
        };
    }, { density, hash });
});
const { page, report, close } = session;
let failure;
const sample = () => page.evaluate(() => {
    const d = window.__ra2debug;
    return { environment: d.environmentHd, terrain: { density: d.terrainHd.density,
        worldChargeBytes: d.terrainHd.worldChargeBytes, budget: d.terrainHd.budget },
        outposts: d.game.getWorld().getAllObjects().filter(object => object.name === 'CAOUTP').map(object => {
            const r = d.renderableManager.getRenderableByGameObject(object);
            return { name: object.name, id: object.id, mainHd: r.mainObj.builder.hdOverride?.identity,
                bibHd: r.bib?.builder.hdOverride?.identity,
                animationHd: [...r.animObjects.values()].flat().map(anim => anim.builder.hdOverride?.identity ?? null) };
        }), injected: window.__m23Injected, glError: d.renderer.renderer.getContext().getError() };
});
try {
    report.disclosure = 'Scoped fetch-response fault injection in the copied app; no resource bytes are edited. Corrupt one new seven-member family, retain peer HD, then re-enter with a missing environment selector and check disposal.';
    report.corruptMember = await sample();
    const rejected = report.corruptMember.environment.families['environment-ctoutp'];
    assert.equal(rejected.status, 'ORIGINAL'); assert(rejected.reason.includes('environment-manifest-hash'));
    assert.equal(rejected.worldChargeBytes, 0);
    assert(report.corruptMember.outposts.length && report.corruptMember.outposts.every(object =>
        !object.mainHd && !object.bibHd && object.animationHd.every(value => !value)));
    assert(Object.values(report.corruptMember.environment.families).some(value => value.status === 'PUBLISHED_COMPLETE_FAMILY'));
    await page.screenshot({ path: path.join(output, 'corrupt-family-native.png') });
    await page.evaluate(() => {
        clearInterval(window.__allied.timer);
        const d = window.__ra2debug;
        window.__m23OldGame = d.game; window.__m23OldEnvironment = d.environmentHd; window.__m23OldTerrain = d.terrainHd;
        window.__m23FallbackMode = 'missing-pack';
    });
    await page.evaluate(async () => { await window.r.reset; });
    await page.waitForFunction(() => window.__ra2debug?.game?.status === 1
        && window.__ra2debug.game !== window.__m23OldGame, undefined, { timeout: 90000 });
    await page.evaluate(() => window.__installAlliedFixtures());
    report.missingPack = await sample();
    assert.equal(report.missingPack.environment.worldChargeBytes, 0);
    assert(report.missingPack.outposts.every(object => !object.mainHd && !object.bibHd && object.animationHd.every(value => !value)));
    report.release = await page.evaluate(() => ({ environment: window.__m23OldEnvironment, terrain: window.__m23OldTerrain }));
    assert(report.release.environment.disposed && report.release.environment.worldChargeBytes === 0);
    assert(report.release.terrain.disposed && report.release.terrain.worldChargeBytes === 0);
    assert.equal(report.missingPack.terrain.density, density);
    assert.equal(report.corruptMember.glError, 0); assert.equal(report.missingPack.glError, 0);
    await page.screenshot({ path: path.join(output, 'missing-pack-native.png') });
    assert.equal(report.errors.length, 0);
} catch (error) { failure = error; }
await close(failure);
if (failure) throw failure;
console.log(JSON.stringify({ status: report.status, density, rejectedFamily: 'environment-ctoutp', members: family.members.length }));
