import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { campaignSession, stepWorld } from '../m3-2/native-session.mjs';
import { readFeedbackSource, replayFeedbackOpening, advanceFeedbackSource } from './feedback-source-replay-v53.mjs';
import { OrdinaryCampaignCommands } from './ordinary-commands.mjs';

const out = path.resolve(process.argv[2]), density = Number(process.argv[3] ?? 4);
const observation = process.argv.includes('--observe');
const verifyTransforms = process.argv.includes('--world-transforms');
await fs.mkdir(out, { recursive: false });
const source = await readFeedbackSource(path.join(import.meta.dirname, 'fixtures/all12-source-commands-v26.json'));
source.samples = [];
const report = { status: 'RUNNING', errors: [], failedResources: [], density, samples: [], commands: [],
    scope: 'Original Allied12 source opening and ordinary player production. Diagnostic reveal and camera tours inspect all original Flak turrets and newly paid Patriot turrets during normal rendering, damage, ownership and view return. No source/rule/health/resource-budget edits or allocation fault injection.' };
let app, page;
try {
    ({ app, page } = await campaignSession(out, report, { density }));
    report.opening = await replayFeedbackOpening(page, source, 3366, { openingGraceVersion: 1,
        demolitionSafetyVersion: 1, retaliationVersion: 1, neutralStructureTargetingVersion: 1, civilianTargetingVersion: 2 });
    await page.evaluate(() => {
        const g = window.__ra2debug.game;
        g.campaign.inspectionModified = true;
        g.mapShroudTrait.revealMap(g.localPlayer, g);
        window.__aaSample = () => {
            const d = window.__ra2debug, g = d.game;
            return g.world.getAllObjects().filter(u => u.isSpawned && !u.isDestroyed && ['NASAM', 'NAFLAK'].includes(u.name)).map(u => {
                const r = d.renderableManager.getRenderableByGameObject(u), hd = r?.buildingTurretHd;
                const materials = r?.turretBuilders?.flatMap(b => [...b.sections.values()].map(m => ({
                    visible: m.visible, opacity: m.getOpacity?.() ?? m.material.opacity,
                    colorWrite: m.material.colorWrite, depthWrite: m.material.depthWrite,
                    clippingPlanes: m.getClippingPlanes?.().map(p => [p.normal.x, p.normal.y, p.normal.z, p.constant]),
                })));
                return { id: u.id, name: u.name, owner: u.owner.name, tile: [u.tile.rx, u.tile.ry],
                    hp: u.healthTrait.health, facing: u.turretTrait?.facing, buildStatus: u.buildStatus,
                    rootVisible: r?.target?.visible, culled: r?.target?.[Symbol.for('ra2.viewCulled')],
                    animation: r?.currentAnimType, turretVisible: r?.turret?.visible,
                    materials, hd: hd && { disposed: hd.resources.disposed, density: hd.resources.density,
                        meshes: [...hd.meshes].filter(([, [, surface]]) => surface.visible).map(([heading, [depth, surface]]) => ({
                            heading, opacity: surface.material.opacity, parent: surface.parent?.name,
                            matrix: surface.matrixWorld.elements, depthVisible: depth.visible,
                            expected: surface.parent.matrixWorld.clone().multiply(surface.matrix).elements,
                        })) } };
            });
        };
    });
    const tour = async label => {
        const actors = await page.evaluate(() => window.__aaSample());
        for (let index = 0; index < actors.length; index++) {
            const actor = actors[index];
            await page.evaluate(tile => { const d = window.__ra2debug;
                d.worldInteraction.minimapHandler.panToTile(d.game.map.tiles.getByMapCoords(...tile)); }, actor.tile);
            await page.waitForTimeout(350);
            const sample = await page.evaluate(id => ({ tick: window.__ra2debug.game.currentTick,
                actor: window.__aaSample().find(u => u.id === id) }), actor.id);
            report.samples.push({ label, ...sample });
            const u = sample.actor;
            if (!observation && u.buildStatus === 1) {
                assert(u.turretVisible, `${label}: ${u.name} ${u.id} turret parent hidden`);
                if (u.hd) assert(u.hd.meshes.some(m => m.opacity > 0), `${label}: ${u.name} ${u.id} HD heading invisible`);
                else assert(u.materials.some(m => m.colorWrite && m.opacity > 0), `${label}: ${u.name} ${u.id} original fallback invisible`);
                if (verifyTransforms) for (const mesh of u.hd?.meshes ?? [])
                    assert.deepEqual(mesh.matrix, mesh.expected, `${label}: ${u.name} ${u.id} stale world transform`);
            }
            if (index === 0 || actor.name === 'NASAM') await page.screenshot({ path: path.join(out, `${label}-${actor.name}-${actor.id}.png`) });
        }
        await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    };
    const settle = async () => {
        await page.evaluate(() => {
            const d = window.__ra2debug;
            d.game.desiredSpeed.value = 3;
            d.gameScreen.gameTurnMgr.setPaused(false); d.gameScreen.gameTurnMgr.setCampaignPaused(false);
            d.gameScreen.gameAnimationLoop.start();
        });
        await page.waitForTimeout(4500);
        await page.evaluate(() => {
            const manager = window.__ra2debug.gameScreen.gameTurnMgr;
            manager.setPaused(true); manager.setCampaignPaused(true);
        });
    };
    await tour('first-view-paused');
    await settle();
    await tour('original-sustained-opening');
    const commands = new OrdinaryCampaignCommands(page, report);
    if (!await page.evaluate(() => window.__ra2debug.game.localPlayer.getOwnedObjects().some(u => u.name === 'GAPILE' && u.isSpawned && !u.isDestroyed)))
        await commands.build('GAPILE');
    await commands.build('NASAM');
    await commands.build('NASAM');
    await commands.step(180, { defend: false, repair: false });
    await settle();
    await tour('paid-player-patriots');
    await stepWorld(page, 900);
    await settle();
    await tour('sustained-return');
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []);
    report.status = observation ? 'OBSERVED_ORIGINAL_AND_PAID_AA_TURRET_STATES' : 'PASS_ORIGINAL_AND_PAID_AA_TURRETS_SUSTAINED_VIEW_RETURN';
} catch (error) {
    report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1;
    await page?.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
} finally {
    await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    await app?.close();
}
console.log(JSON.stringify({ status: report.status, error: report.error, out }));
