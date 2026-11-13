import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { campaignSession, waitWorld, stepWorld } from '../m3-2/native-session.mjs';
const out = path.resolve(process.argv[2]), mission = process.argv[3];
await fs.mkdir(out, { recursive: false });
const report = {
    status: 'RUNNING', mission, errors: [], failedResources: [], samples: [],
    scope: 'Fresh original mission, no player orders. Accelerated observation turns only. Camera framing is diagnostic; source/rules/health/objectives are unchanged.'
};
let app, page;
try {
    ({ app, page } = await campaignSession(out, report, { density: 2 }));
    await page.evaluate(mission => window.__ra2debug.mainMenuController.screens.get(22).launchPrepared(mission), mission);
    await waitWorld(page, mission);
    const ticks = mission === 'all09t.map' ? [0, 180, 300, 350, 450, 900]
        : mission === 'all11t.map' ? [0, 60, 180, 600, 1800, 2400, 3000, 4500, 6000]
            : [0, 900, 3600, 6000, 9000];
    for (const tick of ticks) {
        const current = await page.evaluate(() => window.__ra2debug.game.currentTick);
        if (tick > current)
            await stepWorld(page, tick - current);
        const sample = await page.evaluate(() => {
            const d = window.__ra2debug, g = d.game, c = g.campaign;
            const actor = u => {
                const r = d.renderableManager.getRenderableByGameObject(u);
                return {
                    id: u.id, name: u.name, owner: u.owner?.name, neutral: u.owner?.isNeutral,
                    spawned: u.isSpawned, destroyed: u.isDestroyed, tile: [u.tile?.rx, u.tile?.ry],
                    hp: u.healthTrait?.getHitPoints(), zone: u.zone, stance: u.stance, facing: u.turretTrait?.facing,
                    sequence: r?.currentSequenceParams?.type, turret: r?.turret?.visible,
                    hdTurret: r?.buildingTurretHd && {
                        disposed: r.buildingTurretHd.resources.disposed,
                        parts: r.buildingTurretHd.resources.parts.size, meshes: r.buildingTurretHd.meshes.size
                    },
                    parasite: u.parasiteableTrait?.getParasite()?.id,
                    grabAnim: r?.squidGrabAnim && { built: !!r.squidGrabAnim.get3DObject(), props: r.squidGrabAnim.getAnimProps() },
                    tasks: u.unitOrderTrait?.getTasks().map(t => ({ type: t.constructor.name,
                        children: t.children.map(c => c.constructor.name) })),
                    target: u.attackTrait?.currentTarget?.obj?.id, sleeping: u.campaignSleeping, sticky: u.campaignSticky,
                    armed: !!u.primaryWeapon, insignificant: u.rules.insignificant
                };
            };
            const objects = g.world.getAllObjects();
            return {
                tick: g.currentTick, hash: g.getHash(), failure: c.failure, result: c.result,
                sourceLaunch: c.launch, triggerStates: [...c.machine.states].filter(([id]) => ['0A46D390', '0A468930', '0A4685D0', '08DC9190', '08DC95C0', '08DCA960'].includes(id)), houses: [...c.houses.values()].map(p => ({
                    name: p.name, neutral: p.isNeutral, combatant: p.isCombatant(), buildings: [...p.buildings].map(b => [b.name, b.rules.index, b.tile.rx, b.tile.ry, b.isDestroyed])
                })), sourceTrace: c.trace.slice(-20), production: [...c.teams.production].map(p => ({
                    name: p.name, defeated: p.defeated,
                    credits: p.credits, buildings: [...p.buildings].filter(b => !b.isDestroyed).map(b => [b.name, b.tile.rx, b.tile.ry])
                })),
                buildTrace: c.baseBuilder?.trace ?? c.teams.baseBuilder?.trace, aiTrace: c.teams.sourceAi?.trace,
                teams: [...c.teams.instances.values()].map(t => ({ id: t.id, type: t.type, owner: t.owner.name,
                    phase: t.phase, line: t.line, members: t.members.map(u => u.id) })),
                actors: objects.filter(u => u.isTechno() && (['GHOST', 'TANY', 'SQD', 'TUG', 'CRUISE', 'APOC', 'CAOUTP', 'NASAM', 'NAFLAK', 'CIV1', 'CIV2', 'CIV3', 'SMCV', 'NACNST', 'GACNST'].includes(u.name)
                    || u.parasiteableTrait?.getParasite())).map(actor)
            };
        });
        report.samples.push(sample);
        if (mission === 'all09t.map' && [300, 350].includes(tick) || mission === 'all11t.map' && [60, 180, 600].includes(tick)) {
            await page.evaluate(() => {
                const d = window.__ra2debug, g = d.game;
                const u = g.world.getAllObjects().find(u => u.isSpawned && (u.name === 'GHOST' || u.parasiteableTrait?.getParasite()));
                if (u)
                    d.worldInteraction.minimapHandler.panToTile(u.tile);
            });
            await page.screenshot({ path: path.join(out, `native-tick-${sample.tick}.png`) });
        }
        if (sample.result)
            break;
    }
    assert.deepEqual(report.errors, []);
    assert.deepEqual(report.failedResources, []);
    report.status = 'PASS_ORIGINAL_NO_ORDER_OBSERVATION_ONLY';
}
catch (error) {
    report.status = 'FAIL';
    report.error = error.stack;
    process.exitCode = 1;
    await page?.screenshot({ path: path.join(out, 'failure.png') }).catch(() => { });
}
finally {
    await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    await app?.close();
}
console.log(JSON.stringify({ status: report.status, error: report.error, out }));
