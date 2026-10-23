// Capture reusable neutral-building components and local lamps in the copied app.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { startSession } from '../../m1/allied-units/desktop-session.mjs';
import { validateBridgeContacts } from './native-bridge-contacts.mjs';
import { recordOilMotion } from './record-oil-motion.mjs';

const [receipt, output] = process.argv.slice(2);
const edition = process.argv.includes('--edition=ra2') ? 'ra2' : 'yr';
const density = process.argv.includes('--density=2') ? 2 : 4;
const originalOil = process.argv.includes('--oil-original');
const started = performance.now();
const session = await startSession(receipt, output, edition, false, async ({ page }) => {
    await page.evaluate(({ density, originalOil }) => {
        const graphics = window.__ra2debug.generalOptions.graphics;
        graphics.hdEnabled.value = !originalOil;
        graphics.hdDensity.value = density;
    }, { density, originalOil });
});
const { page, app, report, stage, close } = session;
report.startupToMatchMs = performance.now()-started;
report.disclosure = 'Native map placements with revealed visibility and free camera for QA; controlled native ownership/damage and engineer repair orders. No rules, map layout or animation timing edits. Not full-match user acceptance.';
let failure;
try {
    report.density = density;
    report.oilMaterialMode = originalOil ? 'ORIGINAL' : 'HD';
    report.scene = await page.evaluate(() => {
        const d = window.__ra2debug, g = d.game;
        d.worldScene.cameraPan.freeCamera.value = true;
        window.__allied.detailSize = [960, 720];
        window.__feedbackLamps = [];
        const lamps = g.getWorld().getAllObjects().filter(o => o.rules.lightIntensity).map(o => {
            const r = d.renderableManager.getRenderableByGameObject(o);
            r?.get3DObject()?.traverse(mesh => {
                if (mesh.renderOrder === 999995) window.__feedbackLamps.push(mesh);
            });
            return { id: o.id, name: o.name, tile: [o.tile.rx, o.tile.ry],
                intensity: o.rules.lightIntensity,
                tint: [o.rules.lightRedTint, o.rules.lightGreenTint, o.rules.lightBlueTint] };
        });
        return { lamps, ambient: d.worldView.lighting?.getAmbient(),
            buildings: g.getWorld().getAllObjects().filter(o => ['CAAIRP', 'CAOILD'].includes(o.name))
                .map(o => ({ id: o.id, name: o.name, tile: [o.tile.rx, o.tile.ry] })) };
    });
    report.cases = [];
    if (process.argv.includes('--performance')) {
        const route = [...report.scene.buildings, ...report.scene.lamps].slice(0, 4).map(o => o.tile);
        assert.equal(route.length, 4);
        const samples = [];
        for (const tile of route) {
            await page.evaluate(tile => {
                const d = window.__ra2debug;
                d.worldInteraction.minimapHandler.panToTile(d.game.map.tiles.getByMapCoords(...tile));
            }, tile);
            await page.waitForTimeout(250);
            samples.push(...await page.evaluate(() => {
                const r = window.__ra2debug.renderer, samples = [];
                for (let i=0; i<20; i++) { const start=performance.now(); r.render(); samples.push(performance.now()-start); }
                return samples;
            }));
        }
        const sorted = [...samples].sort((a,b) => a-b);
        report.performance = { basis: 'Same native route and 3840x2160 output. Synchronous renderer CPU submission cost after panning; excludes GPU completion and full gameplay frame cost.',
            route, samples, medianMs: sorted[Math.floor(sorted.length*.5)], p95Ms: sorted[Math.floor(sorted.length*.95)],
            output: await page.evaluate(() => { const c=window.__ra2debug.renderer.renderer.domElement; return [c.width,c.height]; }),
            processes: await app.evaluate(({app}) => app.getAppMetrics().map(p => ({type:p.type,memory:p.memory}))) };
    }
    if (process.argv.includes('--expect-fixed')) for (const lamp of report.scene.lamps) {
        if (['INBLULMP', 'BLUELAMP'].includes(lamp.name)) assert(lamp.tint[1] < .1, 'Blue lamp still has strong green');
    }
    const selectedNames = process.argv.includes('--oil-only') ? ['CAOILD']
        : ['CAAIRP', 'CAOILD', 'INBLULMP', 'INYELWLAMP', 'INGALITE'];
    for (const name of selectedNames) {
        const object = [...report.scene.buildings, ...report.scene.lamps].find(o => o.name === name);
        if (!object) continue;
        await page.evaluate(id => {
            const d = window.__ra2debug, o = d.game.getWorld().getAllObjects().find(o => o.id === id);
            window.__allied.actor = o;
            d.worldInteraction.minimapHandler.panToTile(o.tile);
        }, object.id);
        await page.waitForTimeout(300);
        await stage(name + '-hd');
        if (name === 'CAOILD' && process.argv.includes('--oil-clip')) await recordOilMotion(session, 'oil-normal-motion');
        const sample = await page.evaluate(id => {
            const d = window.__ra2debug, o = d.game.getWorld().getAllObjects().find(o => o.id === id);
            const r = d.renderableManager.getRenderableByGameObject(o);
            const parts = [r.mainObj, r.bib, ...[...(r.animObjects?.values() ?? [])].flat()].filter(Boolean);
            const describe = part => ({ member: part.builder.shpFile?.filename,
                frame: part.builder.getFrame(), hd: part.builder.hdOverride?.identity,
                position: part.get3DObject()?.position.toArray(), visible: part.get3DObject()?.visible });
            const result = { ...window.__feedbackLamps.length && { lampCount: window.__feedbackLamps.length },
                parts: parts.map(describe), tick: d.game.currentTick };
            const saved = parts.map(p => p.builder.hdOverride);
            const shot = () => {
                d.worldScene.scene.updateMatrixWorld(false);
                d.worldScene.meshBatchManager.updateMeshes();
                d.worldScene.meshBatchManager.processRenderQueue();
                d.renderer.render();
                return d.renderer.renderer.domElement.toDataURL('image/png').split(',')[1];
            };
            result.hd = shot();
            try {
                parts.forEach(p => p.setHdOverride(undefined));
                result.original = shot();
            } finally { parts.forEach((p, i) => p.setHdOverride(saved[i])); }
            try {
                window.__feedbackLamps.forEach(m => { m.visible = false; });
                result.noLamps = shot();
            } finally { window.__feedbackLamps.forEach(m => { m.visible = true; }); }
            return result;
        }, object.id);
        for (const mode of ['hd', 'original', 'noLamps']) {
            await fs.writeFile(path.join(output, `${name}-${mode}-same-tick.png`), Buffer.from(sample[mode], 'base64'));
            delete sample[mode];
        }
        report.cases.push({ ...object, ...sample });
        if (['CAAIRP', 'CAOILD'].includes(name) && process.argv.includes('--states')) {
            await page.evaluate(id => {
                const d = window.__ra2debug, o = d.game.getWorld().getAllObjects().find(o => o.id === id);
                d.game.changeObjectOwner(o, d.localPlayer);
                window.__feedbackPhases = [];
                window.__feedbackTimer = setInterval(() => {
                    const r = d.renderableManager.getRenderableByGameObject(o);
                    window.__feedbackPhases.push({ tick: d.game.currentTick,
                        health: o.healthTrait.health,
                        frames: [...r.animObjects.values()].flat().map(p => p.builder.getFrame()),
                        hd: [...r.animObjects.values()].flat().every(p => !!p.builder.hdOverride) });
                }, 30);
            }, object.id);
            await stage(name + '-player');
            if (name === 'CAOILD' && process.argv.includes('--oil-clip')) {
                await recordOilMotion(session, 'oil-player-normal-motion');
                await page.evaluate(id => {
                    const d = window.__ra2debug, o = d.game.getWorld().getAllObjects().find(o => o.id === id);
                    d.game.changeObjectOwner(o, window.__allied.enemy);
                }, object.id);
                await stage(name + '-enemy-normal');
                await recordOilMotion(session, 'oil-enemy-normal-motion');
                await page.evaluate(id => {
                    const d = window.__ra2debug, o = d.game.getWorld().getAllObjects().find(o => o.id === id);
                    d.game.changeObjectOwner(o, d.localPlayer);
                }, object.id);
            }
            await page.waitForTimeout(6000);
            await page.evaluate(id => {
                const d = window.__ra2debug, o = d.game.getWorld().getAllObjects().find(o => o.id === id);
                o.healthTrait.inflictDamage(Math.floor(o.healthTrait.maxHitPoints*.65), o, d.game);
            }, object.id);
            await page.waitForTimeout(200);
            await stage(name + '-damaged');
            if (name === 'CAOILD' && process.argv.includes('--oil-clip')) await recordOilMotion(session, 'oil-damaged-motion');
            await page.waitForTimeout(6000);
            const states = await page.evaluate(id => {
                clearInterval(window.__feedbackTimer);
                const d = window.__ra2debug, o = d.game.getWorld().getAllObjects().find(o => o.id === id);
                const r = d.renderableManager.getRenderableByGameObject(o);
                return { health: o.healthTrait.health, owner: o.owner.color,
                    phases: window.__feedbackPhases,
                    parts: [r.mainObj, r.bib, ...[...r.animObjects.values()].flat()].filter(Boolean)
                        .map(p => ({ frame: p.builder.getFrame(), hd: p.builder.hdOverride?.identity })) };
            }, object.id);
            assert(states.health < 50 && states.parts.every(p => Boolean(p.hd) === !originalOil));
            assert(states.phases.every(p => p.hd === !originalOil));
            assert(new Set(states.phases.map(p => p.frames.join(','))).size > 2, 'Native animation did not advance');
            report.cases.at(-1).states = states;
            await page.evaluate(id => {
                const d = window.__ra2debug, o = d.game.getWorld().getAllObjects().find(o => o.id === id);
                d.game.changeObjectOwner(o, window.__allied.enemy);
            }, object.id);
            await page.waitForTimeout(100);
            await stage(name + '-enemy-damaged');
            if (name === 'CAOILD' && process.argv.includes('--oil-clip')) await recordOilMotion(session, 'oil-enemy-damaged-motion');
        }
    }
    if (process.argv.includes('--bridge-contacts')) await validateBridgeContacts(session);
    assert(report.cases.length || report.bridges?.length, 'No native components, lamps or bridges found');
    report.resources = await page.evaluate(() => ({ terrain: window.__ra2debug.terrainHd,
        environment: window.__ra2debug.environmentHd }));
    report.glError = await page.evaluate(() => window.__ra2debug.renderer.renderer.getContext().getError());
    assert.equal(report.glError, 0);
} catch (error) { failure = error; }
finally { await close(failure); }
if (!failure) {
    try {
        const terrain = report.resources.terrain.worldChargeBytes ?? 0;
        const environment = report.resources.environment.worldChargeBytes ?? 0;
        const faction = report.worldAllocation.total;
        report.combinedWorld = { terrain, environment, faction, total: terrain+environment+faction,
            limit: (density === 2 ? 512 : 1280)*1024*1024 };
        assert(report.combinedWorld.total <= report.combinedWorld.limit);
        assert.equal(report.errors.length, 0);
    } catch (error) { failure = error; report.status = 'FAIL'; report.failure = error.stack; }
    await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2)+'\n');
}
if (failure) throw failure;
console.log(JSON.stringify({ status: report.status, map: report.selectedMap, cases: report.cases.length }));
