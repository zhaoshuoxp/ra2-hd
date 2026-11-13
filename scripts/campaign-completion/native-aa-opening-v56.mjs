import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { campaignSession, waitWorld } from '../m3-2/native-session.mjs';
import { waitForCampaignFullscreen } from './native-media-wait.mjs';

const out = path.resolve(process.argv[2]), density = Number(process.argv[3] ?? 4);
const mission = process.argv.find(a => a.startsWith('--mission='))?.slice(10) ?? 'all11t.map';
const attempts = Number(process.argv.find(a => a.startsWith('--attempts='))?.slice(11) ?? 3);
const wide = process.argv.includes('--wide');
const repairMatrices = process.argv.includes('--repair-matrices');
const strict = process.argv.includes('--assert');
await fs.mkdir(out, { recursive: false });
const report = { status: 'RUNNING', errors: [], failedResources: [], density, mission, wide, attempts: [],
    scope: 'Repeated fresh unchanged original mission openings. Ordinary public Abort between starts, optional window resizing and real-time rendering. Read each preplaced AA turret and actual HD draw callbacks before camera tours or allocation fault injection. No source, actor, health, ownership, rules, goals or RNG edits.' };
let app, page, labels;
try {
    ({ app, page, labels } = await campaignSession(out, report, { density }));
    if (wide) await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1774, 1163));
    for (let attempt = 0; attempt < attempts; attempt++) {
        await page.evaluate(mission => window.__ra2debug.mainMenuController.screens.get(22).launchPrepared(mission), mission);
        await waitWorld(page, mission);
        const samples = [];
        for (const phase of ['first-paused', 'initial-real-time', 'base-paused', 'offscreen-paused', 'return-paused', 'sustained-real-time']) {
            if (phase === 'base-paused') await page.evaluate(() => {
                const d = window.__ra2debug, objects = [...d.game.localPlayer.buildings];
                const yard = objects.find(u => ['NAWEAP', 'GAWEAP'].includes(u.name)) ?? objects.find(u => u.name === 'NASAM');
                if (yard) { window.__aaBaseTile = yard.centerTile; d.worldInteraction.minimapHandler.panToTile(yard.centerTile); }
            });
            if (phase === 'offscreen-paused') await page.evaluate(() => {
                const d = window.__ra2debug, g = d.game, base = window.__aaBaseTile;
                const far = g.map.tiles.getAll().filter(t => g.map.isWithinBounds(t)).sort((a, b) =>
                    Math.hypot(b.rx - base.rx, b.ry - base.ry) - Math.hypot(a.rx - base.rx, a.ry - base.ry))[0];
                d.worldInteraction.minimapHandler.panToTile(far);
            });
            if (phase === 'return-paused') await page.evaluate(() => {
                const d = window.__ra2debug;
                d.worldInteraction.minimapHandler.panToTile(window.__aaBaseTile);
            });
            if (phase.includes('real-time')) {
                await waitForCampaignFullscreen(page);
                await page.evaluate(() => { const s = window.__ra2debug.gameScreen;
                    s.gameTurnMgr.setPaused(false); s.gameTurnMgr.setCampaignPaused(false); s.gameAnimationLoop.start(); });
                await page.waitForTimeout(phase === 'initial-real-time' ? 1500 : 4000);
                await page.evaluate(() => { const s = window.__ra2debug.gameScreen;
                    s.gameTurnMgr.setPaused(true); s.gameTurnMgr.setCampaignPaused(true); });
            }
            await page.evaluate(() => {
                const d = window.__ra2debug;
                const observe = hd => {
                    if (!hd) return;
                    for (const [, [depth, surface]] of hd.meshes) for (const mesh of [depth, surface]) {
                        if (mesh.userData.aaDrawObserved) continue;
                        mesh.userData.aaDrawObserved = true; mesh.userData.aaDrawCount = 0; mesh.userData.aaColorDrawCount = 0;
                        const before = mesh.onBeforeRender;
                        mesh.onBeforeRender = function(...args) {
                            this.userData.aaDrawCount++;
                            if (args[4].colorWrite) this.userData.aaColorDrawCount++;
                            return before.apply(this, args);
                        };
                    }
                };
                for (const u of d.game.world.getAllObjects().filter(u => ['NASAM', 'NAFLAK'].includes(u.name))) {
                    const r = d.renderableManager.getRenderableByGameObject(u);
                    if (!r || r.__aaBindingObserved) continue;
                    r.__aaBindingObserved = true;
                    let current = r.buildingTurretHd;
                    observe(current);
                    Object.defineProperty(r, 'buildingTurretHd', {
                        configurable: true, enumerable: true, get: () => current,
                        set: value => { current = value; observe(value); },
                    });
                }
            });
            await page.waitForTimeout(500);
            const state = await page.evaluate(() => {
                const d = window.__ra2debug, g = d.game;
                const materials = m => ({ id: m.uuid, colorWrite: m.colorWrite, depthWrite: m.depthWrite,
                    opacity: m.opacity, transparent: m.transparent, visible: m.visible,
                    clipping: m.clippingPlanes?.map(p => [p.normal.x, p.normal.y, p.normal.z, p.constant]) });
                return { tick: g.currentTick, hash: g.getHash(), rng: g.prng.snapshot(),
                    viewport: [innerWidth, innerHeight, devicePixelRatio],
                    actors: g.world.getAllObjects().filter(u => ['NASAM', 'NAFLAK'].includes(u.name)).map(u => {
                        const r = d.renderableManager.getRenderableByGameObject(u), hd = r?.buildingTurretHd;
                        return { id: u.id, name: u.name, owner: u.owner.name, local: u.owner === g.localPlayer,
                            tile: [u.tile.rx, u.tile.ry], hp: u.healthTrait.health,
                            destroyed: u.isDestroyed, spawned: u.isSpawned, buildStatus: u.buildStatus,
                            facing: u.turretTrait?.facing, currentAnim: r?.currentAnimType, rootVisible: r?.target?.visible,
                            culled: r?.target?.[Symbol.for('ra2.viewCulled')], turretVisible: r?.turret?.visible,
                            native: r?.turretBuilders?.flatMap(b => [...b.sections.values()].map(m => ({
                                visible: m.visible, opacity: m.getOpacity?.(), material: materials(m.material) }))),
                            hd: hd && { disposed: hd.resources.disposed, density: hd.resources.density,
                                savedMaterials: hd.materials.map(materials), meshes: [...hd.meshes].map(([heading, [depth, surface]]) => {
                                    const expected = surface.parent.matrixWorld.clone().multiply(surface.matrix);
                                    const vertices = surface.geometry.getAttribute('position'), points = [];
                                    for (let i = 0; i < vertices.count; i++) points.push(r.target.position.clone()
                                        .fromBufferAttribute(vertices, i).applyMatrix4(expected).project(r.camera));
                                    const min = axis => Math.min(...points.map(p => p[axis]));
                                    const max = axis => Math.max(...points.map(p => p[axis]));
                                    return { heading, visible: surface.visible, drawn: surface.userData.aaDrawCount,
                                        colorDrawn: surface.userData.aaColorDrawCount, depthDrawn: depth.userData.aaDrawCount,
                                        material: materials(surface.material), parentVisible: surface.parent?.visible,
                                        matrix: surface.matrixWorld.elements, expected: expected.elements,
                                        intersectsView: max('x') >= -1 && min('x') <= 1 && max('y') >= -1 && min('y') <= 1
                                            && max('z') >= -1 && min('z') <= 1 };
                                }) } };
                    }) };
            });
            samples.push({ phase, ...state });
            await page.screenshot({ path: path.join(out, `attempt-${attempt}-${phase}.png`) });
            report.current = { attempt, samples };
            await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
            if (strict && phase !== 'first-paused') for (const actor of state.actors.filter(u => u.local
                && u.hp > 0 && u.buildStatus === 1 && !u.culled && u.rootVisible)) {
                assert(actor.turretVisible, `${phase}: ${actor.name} ${actor.id} ready turret hidden`);
                if (actor.hd) assert.equal(actor.hd.meshes.filter(m => m.visible).length, 1,
                    `${phase}: ${actor.name} ${actor.id} must select one HD heading`);
                else assert(actor.native.some(m => m.visible && m.material.colorWrite && m.material.opacity > 0),
                    `${phase}: ${actor.name} ${actor.id} native fallback is hidden`);
                for (const mesh of actor.hd?.meshes.filter(m => m.visible) ?? []) {
                    assert.deepEqual(mesh.matrix, mesh.expected, `${phase}: ${actor.name} ${actor.id} stale world transform`);
                    if (mesh.intersectsView) assert(mesh.colorDrawn > 0, `${phase}: ${actor.name} ${actor.id} has no real color draw`);
                }
            }
        }
        report.attempts.push({ attempt, samples }); delete report.current;
        if (repairMatrices) {
            const before = await page.evaluate(() => { const g = window.__ra2debug.game;
                return { tick: g.currentTick, hash: g.getHash(), rng: g.prng.snapshot() }; });
            await page.evaluate(() => {
                const d = window.__ra2debug;
                for (const u of d.game.world.getAllObjects().filter(u => ['NASAM', 'NAFLAK'].includes(u.name))) {
                    const hd = d.renderableManager.getRenderableByGameObject(u)?.buildingTurretHd;
                    for (const [, meshes] of hd?.meshes ?? []) for (const mesh of meshes) mesh.updateMatrix();
                }
            });
            await page.waitForTimeout(500);
            const after = await page.evaluate(() => { const g = window.__ra2debug.game;
                return { tick: g.currentTick, hash: g.getHash(), rng: g.prng.snapshot() }; });
            assert.deepEqual(after, before);
            report.attempts.at(-1).diagnosticMatrixRepair = { before, after,
                disclosure: 'One-time renderer-only local-matrix update; source simulation and camera remain unchanged.' };
            await page.screenshot({ path: path.join(out, `attempt-${attempt}-diagnostic-matrix-repair.png`) });
        }
        await page.evaluate(() => window.__ra2debug.gameScreen.menu.open());
        await page.getByRole('button', { name: labels['gui:abortmission'], exact: true }).click();
        await page.getByRole('button', { name: labels['gui:quit'], exact: true }).click();
        await page.waitForSelector('[data-campaign-missions][data-campaign-ready=true]');
    }
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []);
    report.status = strict ? 'PASS_ORIGINAL_REPEATED_AA_OPENINGS_ACTUAL_TRANSFORMS_AND_COLOR_DRAWS'
        : 'OBSERVED_ORIGINAL_AA_OPENING_METADATA_AND_ACTUAL_DRAW_CALLBACKS';
} catch (error) {
    report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1;
    await page?.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
} finally {
    await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    await app?.close();
}
console.log(JSON.stringify({ status: report.status, error: report.error, out }));
