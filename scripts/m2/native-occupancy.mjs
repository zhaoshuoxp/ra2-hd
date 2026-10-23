// Matched native ownership transitions for every occupiable/capturable map building.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { startSession } from '../m1/allied-units/desktop-session.mjs';

const [receipt, output] = process.argv.slice(2);
const edition = process.argv.includes('--ra2') ? 'ra2' : 'yr';
const density = process.argv.includes('--density=2') ? 2 : 4;
const only = process.argv.find(a => a.startsWith('--only='))?.slice(7).split(',');
const damageEvacOnly = process.argv.includes('--damage-evac-only');
process.argv.push(`--map=${edition === 'yr' ? 'X' : ''}MP03T4.map`);
const session = await startSession(receipt, output, edition, false, async ({ page }) => {
    await page.evaluate(density => {
        const g = window.__ra2debug.generalOptions.graphics;
        g.hdEnabled.value = true; g.hdDensity.value = density;
    }, density);
});
const { page, report, close } = session;
let failure;
try {
    report.disclosure = 'Unchanged retail map/rules/projection/scale/ticks. Revealed map, suspended bot AI and legal spawned infantry/engineers are controlled fixtures. Camera pan clamps are bypassed to center edge buildings; no zoom change. Ownership changes use native entry/capture tasks. Matched Original/HD frames are rendered in one synchronous call by temporarily restoring the complete building family to Original.';
    report.selection = await page.evaluate(() => ({ terrain: window.__ra2debug.terrainHd,
        environment: window.__ra2debug.environmentHd }));
    report.allowedColors = await page.evaluate(() => ['Gold', 'DarkRed', 'DarkBlue', 'DarkGreen', 'Orange',
        'DarkSky', 'Purple', 'Magenta'].map(name => ({ name, color: window.__ra2debug.game.rules.colors.get(name) })));
    await page.evaluate(() => {
        const d = window.__ra2debug, f = window.__allied;
        clearInterval(f.timer);
        d.worldScene.cameraPan.freeCamera.value = true;
        d.game.mapShroudTrait.revealMap(f.enemy, d.game);
        f.targets = d.game.getWorld().getAllObjects().filter(o => o.isBuilding()
            && (o.garrisonTrait || (o.rules.capturable && /HOSP/.test(o.name))));
        f.binding = o => {
            const r = d.renderableManager.getRenderableByGameObject(o);
            const parts = [r.mainObj, r.bib, ...[...r.animObjects.values()].flat()].filter(Boolean);
            return { id: o.id, name: o.name, tile: [o.tile.rx, o.tile.ry], owner: o.owner.name,
                ownerColor: o.owner.color, lastOwnerColor: r.lastOwnerColor,
                health: o.healthTrait.health, occupants: o.garrisonTrait?.units.length,
                threshold: o.garrisonTrait?.evacThreshold,
                parts: parts.map(p => ({ frame: p.builder.getFrame(), identity: p.builder.hdOverride?.identity,
                    palette: p.builder.palette.colors.slice(16, 32), source: p.builder.shpFile.filename })) };
        };
        f.command = (owner, ids, order, target) => {
            const old = d.actionsApi.localPlayer, queue = d.actionsApi.actionQueue;
            try {
                d.actionsApi.localPlayer = owner;
                if (owner !== d.localPlayer) d.actionsApi.actionQueue = { push: a => a.process() };
                d.actionsApi.orderUnits(ids, order, target);
            } finally { d.actionsApi.localPlayer = old; d.actionsApi.actionQueue = queue; }
        };
    });
    report.placed = await page.evaluate(() => window.__allied.targets.map(window.__allied.binding));
    const names = [...new Set(report.placed.filter(o => !damageEvacOnly || o.occupants !== undefined)
        .map(o => o.name))].filter(n => !only || only.includes(n));
    assert(names.length > 0);
    const capture = async (name, id) => {
        const data = await page.evaluate(id => {
            const d = window.__ra2debug, f = window.__allied, o = f.targets.find(o => o.id === id);
            const r = d.renderableManager.getRenderableByGameObject(o);
            const parts = [r.mainObj, r.bib, ...[...r.animObjects.values()].flat()].filter(Boolean);
            const saved = parts.map(p => p.builder.hdOverride);
            const position = r.getPosition().clone().project(d.worldScene.camera);
            const c = d.renderer.renderer.domElement, v = d.worldScene.viewport;
            const ratio = c.width / d.renderer.width;
            const xy = [(v.x + (position.x + 1) * v.width / 2) * ratio,
                (v.y + (1 - position.y) * v.height / 2) * ratio];
            const shot = () => {
                d.worldScene.scene.updateMatrixWorld(false);
                d.worldScene.meshBatchManager.updateMeshes();
                d.worldScene.meshBatchManager.processRenderQueue();
                d.renderer.render(); return c.toDataURL('image/png').split(',')[1];
            };
            const state = f.binding(o);
            const hd = shot();
            const points = [];
            for (const part of parts) {
                const mesh = part.builder.mesh, vertices = mesh.geometry.getAttribute('position');
                for (let i = 0; i < vertices.count; i++) {
                    const p = r.getPosition().clone().set(vertices.getX(i), vertices.getY(i), vertices.getZ(i))
                        .applyMatrix4(mesh.matrixWorld).project(d.worldScene.camera);
                    points.push([(v.x + (p.x + 1) * v.width / 2) * ratio,
                        (v.y + (1 - p.y) * v.height / 2) * ratio]);
                }
            }
            const bounds = [Math.floor(Math.min(...points.map(p => p[0]))),
                Math.floor(Math.min(...points.map(p => p[1]))), Math.ceil(Math.max(...points.map(p => p[0]))),
                Math.ceil(Math.max(...points.map(p => p[1])))];
            try {
                parts.forEach(p => p.setHdOverride(undefined));
                const original = shot();
                return { hd, original, state, saved: saved.map(h => h?.identity), bounds,
                    projected: xy, buffer: [c.width, c.height], tick: d.game.currentTick };
            } finally { parts.forEach((p, i) => p.setHdOverride(saved[i])); }
        }, id);
        assert.notEqual(data.hd, data.original, `${name}: Original restoration did not change the framebuffer`);
        for (const mode of ['hd', 'original']) {
            await fs.writeFile(path.join(output, `${name}-${mode}.png`), Buffer.from(data[mode], 'base64'));
            delete data[mode];
        }
        report.cases.push({ name, ...data });
        await fs.writeFile(path.join(output, 'occupancy.json'), JSON.stringify(report, null, 2) + '\n');
    };
    report.cases = [];
    for (const name of names) {
        const target = report.placed.find(o => o.name === name);
        await page.evaluate(id => {
            const f = window.__allied, d = window.__ra2debug;
            f.target = f.targets.find(o => o.id === id);
            d.worldInteraction.minimapHandler.panToTile(f.target.tile);
        }, target.id);
        await page.waitForTimeout(200);
        if (damageEvacOnly) {
            await page.evaluate(() => {
                const f = window.__allied;
                f.unit = f.spawn('E1', 3, f.target.tile, f.enemy);
                f.command(f.enemy, [f.unit.id], 8, f.target.id);
            });
            await page.waitForFunction(() => window.__allied.target.garrisonTrait.units.length === 1,
                undefined, { timeout: 45000 });
            await page.evaluate(() => {
                const f = window.__allied, d = window.__ra2debug;
                const health = Math.min(20, f.target.garrisonTrait.evacThreshold * 100 - 1);
                f.target.healthTrait.inflictDamage(Math.ceil(f.target.healthTrait.maxHitPoints * (1 - health / 100)),
                    f.target, d.game);
            });
            await page.waitForFunction(() => !window.__allied.target.garrisonTrait.units.length
                && window.__allied.target.owner === window.__ra2debug.game.getCivilianPlayer());
            await page.waitForTimeout(180);
            await capture(name + '-damage-auto-evacuated', target.id);
            await page.evaluate(() => window.__ra2debug.game.unspawnObject(window.__allied.unit));
            console.log(`PASS damage evacuation ${name}`);
            continue;
        }
        await capture(name + '-neutral', target.id);
        for (const side of ['player', 'enemy']) {
            await page.evaluate(side => {
                const f = window.__allied;
                f.unit = f.spawn(f.target.garrisonTrait ? 'E1' : 'ENGINEER', 3, f.target.tile, f[side]);
                f.command(f[side], [f.unit.id], f.target.garrisonTrait ? 8 : 15, f.target.id);
            }, side);
            await page.waitForFunction(side => {
                const f = window.__allied;
                return f.target.owner === f[side] && (!f.target.garrisonTrait || f.target.garrisonTrait.units.length === 1);
            }, side, { timeout: 45000 });
            await page.waitForTimeout(180);
            const b = await page.evaluate(() => window.__allied.binding(window.__allied.target));
            assert.deepEqual(b.ownerColor, b.lastOwnerColor);
            assert(b.parts.some(p => p.identity), `${name} HD binding missing`);
            await capture(name + '-occupied-' + side, target.id);
            if (side === 'enemy') {
                await page.evaluate(() => {
                    const f = window.__allied, d = window.__ra2debug;
                    const damage = f.target.garrisonTrait ? Math.max(30, f.target.garrisonTrait.evacThreshold * 100 + 5) : 45;
                    f.target.healthTrait.inflictDamage(Math.floor(f.target.healthTrait.maxHitPoints * (1 - damage / 100)), f.target, d.game);
                });
                await page.waitForTimeout(180);
                await capture(name + '-damaged-occupied', target.id);
            }
            if (b.occupants !== undefined) {
                await page.evaluate(side => {
                    const f = window.__allied;
                    f.command(f[side], [f.target.id], 10);
                }, side);
                await page.waitForFunction(() => !window.__allied.target.garrisonTrait.units.length);
                await page.waitForTimeout(150);
                assert(await page.evaluate(() => window.__allied.target.owner === window.__ra2debug.game.getCivilianPlayer()));
                await capture(name + '-evacuated-' + side, target.id);
                await page.evaluate(() => window.__ra2debug.game.unspawnObject(window.__allied.unit));
            }
        }
        console.log(`PASS ${name}`);
    }
    report.instanceTransitions = [];
    if (!damageEvacOnly) for (const target of report.placed.filter(o => o.occupants !== undefined
        && (!only || only.includes(o.name)) && report.placed.find(p => p.name === o.name).id !== o.id)) {
        await page.evaluate(({ id, center }) => {
            const f = window.__allied;
            f.target = f.targets.find(o => o.id === id);
            if (center) window.__ra2debug.worldInteraction.minimapHandler.panToTile(f.target.tile);
        }, { id: target.id, center: !!only });
        if (only) await page.waitForTimeout(200);
        for (const side of ['player', 'enemy']) {
            await page.evaluate(side => {
                const f = window.__allied;
                f.unit = f.spawn('E1', 3, f.target.tile, f[side]);
                f.command(f[side], [f.unit.id], 8, f.target.id);
            }, side);
            await page.waitForFunction(side => window.__allied.target.owner === window.__allied[side]
                && window.__allied.target.garrisonTrait.units.length === 1, side, { timeout: 45000 });
            await page.waitForTimeout(120);
            const state = await page.evaluate(() => window.__allied.binding(window.__allied.target));
            assert.deepEqual(state.ownerColor, state.lastOwnerColor);
            assert(state.parts.some(p => p.identity));
            report.instanceTransitions.push({ side, ...state });
            if (only) await capture(`${target.name}-instance-${target.id}-occupied-${side}`, target.id);
            await page.evaluate(side => {
                const f = window.__allied; f.command(f[side], [f.target.id], 10);
            }, side);
            await page.waitForFunction(() => !window.__allied.target.garrisonTrait.units.length);
            await page.evaluate(() => window.__ra2debug.game.unspawnObject(window.__allied.unit));
        }
    }
    report.ownerTransitionStatus = 'PASS'; report.coveredFamilies = names;
    assert.equal(report.errors.length, 0);
} catch (error) { failure = error; }
await close(failure);
if (failure) throw failure;
