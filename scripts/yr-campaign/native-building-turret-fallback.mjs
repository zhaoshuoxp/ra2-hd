import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { campaignSession, waitWorld, worldState } from '../m3-2/native-session.mjs';
import { observeProgramLifetime } from '../windows-hd/observe-program-lifetime.mjs';

const [output, identity, requestedDensity] = process.argv.slice(2);
const out = path.resolve(output), density = Number(requestedDensity);
assert([2, 4].includes(density));
await fs.mkdir(out, { recursive: false });
const receipt = JSON.parse(await fs.readFile('docs/campaign-art/yr-v1/building-turrets-registration-r1.json'));
const item = receipt.families.find(item => item.identity === identity); assert(item);
const contract = JSON.parse(await fs.readFile(`desktop/environment-${item.theater.toLowerCase()}-hd-contract.json`));
const attachment = contract.turretAttachments[item.environmentFamily];
const source = attachment.sourceScope.campaignSources[0], family = item.environmentFamily;
const report = { status: 'RUNNING', identity, density, errors: [], failedResources: [],
    scope: 'Fresh original YR map and actual native resource loader. Renderer-only fetch fault injection returns 404 for one declared turret bearing. The complete SHP/turret family must retain original rendering without partial allocation. Formal files, source rules, gameplay, caps and density remain unchanged.' };
let app, page;
try {
    ({ app, page } = await campaignSession(out, report, { edition: 'yr', density }));
    await observeProgramLifetime(page);
    report.fault = await page.evaluate(hash => {
        const target = `/local-hd/${hash}/turret/135.png`, original = window.fetch;
        window.__turretFallbackFault = { target, requests: 0 };
        window.fetch = async function(input, init) {
            if (String(input).endsWith(target)) {
                window.__turretFallbackFault.requests++; return new Response('Diagnostic missing turret bearing', { status: 404 });
            }
            return original.call(this, input, init);
        };
        return { target, status: 404 };
    }, attachment.variants[density].sha256);
    await page.evaluate(mission => window.__ra2debug.mainMenuController.screens.get(22).launchDiagnostic(undefined, mission), source.mission);
    await waitWorld(page, source.mission);
    report.binding = await page.evaluate(({ identity, family }) => {
        const d = window.__ra2debug, g = d.game;
        const actor = g.world.getAllObjects().find(actor => actor.name === identity && actor.isSpawned && !actor.isDestroyed);
        if (!actor) throw Error('Original source actor absent');
        g.campaign.inspectionModified = true; g.mapShroudTrait.revealMap(g.localPlayer, g);
        d.gameScreen.pointer.unlock(true); document.querySelector('[data-campaign-diagnostic]')?.remove();
        d.worldInteraction.minimapHandler.panToTile(actor.tile);
        const r = d.renderableManager.getRenderableByGameObject(actor);
        return { id: actor.id, bodyHd: !!r.mainObj.builder.getHdPage(), turretHd: !!r.buildingTurretHd,
            bodyOverride: !!r.mainObj.builder.hdOverride,
            originalTurretVisible: r.turret.visible,
            originalMaterialsVisible: r.turretBuilders.every(builder => [...builder.sections.values()]
                .every(mesh => mesh.material.colorWrite !== false)),
            family: d.environmentHd.families[family], faultRequests: window.__turretFallbackFault.requests };
    }, { identity, family });
    assert.equal(report.binding.faultRequests, 1);
    assert.equal(report.binding.bodyHd, false); assert.equal(report.binding.bodyOverride, false);
    assert.equal(report.binding.turretHd, false); assert(report.binding.originalTurretVisible);
    assert(report.binding.originalMaterialsVisible); assert.equal(report.binding.family.status, 'ORIGINAL');
    assert.equal(report.binding.family.worldChargeBytes, 0); assert.equal(report.binding.family.gpuBytes, 0);
    report.before = await worldState(page);
    await page.screenshot({ path: path.join(out, 'complete-original-fallback.png') });
    report.after = await worldState(page); assert.deepEqual(report.after, report.before);
    report.programCompilation = await page.evaluate(() => window.__programLifetime);
    assert(report.programCompilation.every(span => span.finished && span.materials.every(material => !material.disposals.length)));
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []);
    report.status = 'PASS_NATIVE_COMPLETE_ORIGINAL_BUILDING_FALLBACK_ON_MISSING_TURRET_DIRECTION';
} catch (error) {
    report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1;
    if (page) await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
} finally {
    await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    await app?.close();
}
console.log(JSON.stringify({ status: report.status, error: report.error, out }));
