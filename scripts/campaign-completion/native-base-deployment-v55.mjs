import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { campaignSession, waitWorld, stepWorld } from '../m3-2/native-session.mjs';

const out = path.resolve(process.argv[2]), difficulty = process.argv[3] ?? 'normal';
const observation = process.argv.includes('--observe');
const seed = process.argv.find(value => value.startsWith('--seed='))?.slice(7);
const end = Number(process.argv.find(value => value.startsWith('--end='))?.slice(6) ?? 12000);
await fs.mkdir(out, { recursive: false });
const report = { status: 'RUNNING', difficulty, seed, errors: [], failedResources: [], samples: [],
    scope: 'Fresh original Allied10 without player orders. Observe every source MCV, its original script, legal deployment, paid base construction and AI organization separately. No source, object, health, money, RNG or trigger edits.' };
let app, page;
try {
    ({ app, page } = await campaignSession(out, report, { density: 2 }));
    await page.evaluate(({ difficulty, seed }) => {
        const screen = window.__ra2debug.mainMenuController.screens.get(22);
        if (seed) {
            const root = screen.rootController, go = root.goToScreen;
            root.goToScreen = function(type, params) {
                root.goToScreen = go;
                return go.call(this, type, { ...params, gameId: `campaign-all10-v55-${seed}`, timestamp: 1793815200000 });
            };
        }
        screen.difficulty = difficulty;
        return screen.launchPrepared('all10s.map');
    }, { difficulty, seed });
    await waitWorld(page, 'all10s.map');
    report.start = await page.evaluate(() => {
        const g = window.__ra2debug.game, c = g.campaign, original = c.teams.hunt;
        window.__baseHunts = [];
        window.__baseProduced = [];
        const dispatch = g.events.dispatch;
        g.events.dispatch = function(event) {
            if (event.type === 44 && /^BadGuy[123] House$/.test(event.target?.owner?.name))
                window.__baseProduced.push({ tick: g.currentTick, owner: event.target.owner.name,
                    id: event.target.id, name: event.target.name, factory: event.factory?.id });
            return dispatch.call(this, event);
        };
        c.teams.hunt = function(owner) { window.__baseHunts.push({ tick: g.currentTick, owner: owner.name,
            trace: c.trace.slice(-12) }); return original.call(this, owner); };
        window.__foundationAudit = [];
        window.__installFoundationAudit = () => { for (const u of g.world.getAllObjects().filter(u => ['E2', 'V3'].includes(u.name) && /^BadGuy[23] House$/.test(u.owner.name))) {
            const orders = u.unitOrderTrait, add = orders.addTask, cancel = orders.cancelAllTasks;
            if (orders.foundationAudited) continue;
            orders.foundationAudited = true;
            orders.addTask = function(task) {
                if (task.options?.excludedTiles) {
                    const start = task.onStart;
                    window.__foundationAudit.push({ tick: g.currentTick, unit: u.id, kind: 'scatter-added',
                        warped: u.warpedOutTrait.isActive(), disabled: u.moveTrait.isDisabled(),
                        excluded: task.options.excludedTiles.map(t => [t.rx, t.ry]) });
                    task.onStart = function(actor) {
                        window.__foundationAudit.push({ tick: g.currentTick, unit: u.id, kind: 'scatter-start' });
                        return start.call(this, actor);
                    };
                }
                return add.call(this, task);
            };
            orders.cancelAllTasks = function() {
                if (this.getTasks().some(t => t.options?.excludedTiles) && window.__foundationAudit.length < 1000)
                    window.__foundationAudit.push({ tick: g.currentTick, unit: u.id, kind: 'cancel-foundation-scatter', stack: new Error().stack });
                return cancel.call(this);
            };
        } };
        window.__installFoundationAudit();
        return { gameId: g.id, launch: c.launch, rng: g.prng.snapshot() };
    });
    for (let tick = 0; tick <= end; tick += tick < 4800 ? 150 : 600) {
        const now = await page.evaluate(() => window.__ra2debug.game.currentTick);
        if (tick > now) await stepWorld(page, tick - now);
        if (tick === 3000) await page.evaluate(() => window.__installFoundationAudit());
        const sample = await page.evaluate(() => {
            const g = window.__ra2debug.game, c = g.campaign, teams = c.teams;
            const task = t => ({ type: t.constructor.name, status: t.status, morph: t.morphInto?.name,
                tile: t.targetTile && [t.targetTile.rx, t.targetTile.ry], children: t.children.map(task) });
            const houses = [...c.houses.values()].filter(p => /^BadGuy[123] House$/.test(p.name)).map(p => ({
                name: p.name, credits: p.credits, production: teams.production.has(p), ai: teams.aiEnabled.has(p),
                buildings: [...p.buildings].map(b => ({ id: b.id, name: b.name, tile: [b.tile.rx, b.tile.ry],
                    hp: b.healthTrait.health, destroyed: b.isDestroyed, buildStatus: b.buildStatus })),
                construction: (() => {
                    const queue = p.production.getQueueForObject(g.rules.getBuilding('NAWEAP'));
                    const name = queue.getFirst()?.rules.name;
                    const node = c.baseBuilder.nodes.find(n => n.house === p.name && n.type === name);
                    if (!node) return { status: queue.status, name };
                    const worker = g.getConstructionWorker(p), tile = g.map.tiles.getByMapCoords(node.x, node.y);
                    const art = g.art.getObject(name, 2), cells = [];
                    for (let x = 0; x < art.foundation.width; x++) for (let y = 0; y < art.foundation.height; y++) {
                        const t = g.map.tiles.getByMapCoords(node.x + x, node.y + y);
                        cells.push({ tile: [t.rx, t.ry], ramp: t.rampType, land: t.landType,
                            buildable: worker.isTileBuildable(t, g.rules.getBuilding(name), undefined, true),
                            occupants: g.map.getGroundObjectsOnTile(t).map(o => ({
                            id: o.id, name: o.name, owner: o.owner?.name, tasks: o.unitOrderTrait?.getTasks().map(task),
                        })) });
                    }
                    return { status: queue.status, name, node, canPlace: worker.canPlaceAt(name, tile,
                        { normalizedTile: true, ignoreAdjacent: true, ignoreShroud: true }), cells };
                })(),
                units: p.getOwnedObjects().filter(u => u.isUnit() && u.isSpawned && !u.isDestroyed)
                    .map(u => ({ id: u.id, name: u.name, tile: [u.tile.rx, u.tile.ry], target: u.attackTrait?.currentTarget?.obj?.id })),
            }));
            const mcvs = g.world.getAllObjects().filter(u => u.name === 'SMCV').map(u => {
                const worker = g.getConstructionWorker(u.owner), art = g.art.getObject('NACNST', g.rules.getBuilding('NACNST').type);
                const origin = worker.normalizePlacementTileCoords(art, u.tile), cells = [];
                for (let x = 0; x < art.foundation.width; x++) for (let y = 0; y < art.foundation.height; y++) {
                    const t = g.map.tiles.getByMapCoords(origin.rx + x, origin.ry + y);
                    cells.push({ tile: [origin.rx + x, origin.ry + y], buildable: !!t && worker.isTileBuildable(t, g.rules.getBuilding('NACNST'), [u]),
                        occupants: t ? g.map.getGroundObjectsOnTile(t).map(o => ({ id: o.id, name: o.name,
                            owner: o.owner?.name, moving: o.moveTrait?.isMoving(), spawned: o.isSpawned,
                            warped: o.warpedOutTrait?.isActive(), disabled: o.moveTrait?.isDisabled(),
                            sleeping: o.campaignSleeping, sticky: o.campaignSticky,
                            tasks: o.unitOrderTrait?.getTasks().map(task) })) : [] });
                }
                const assignment = teams.assignments.get(u);
                return { id: u.id, owner: u.owner.name, tile: [u.tile.rx, u.tile.ry], spawned: u.isSpawned,
                    destroyed: u.isDestroyed, direction: u.direction, tasks: u.unitOrderTrait.getTasks().map(task),
                    deployable: worker.canPlaceAt('NACNST', u.tile, { ignoreAdjacent: true, ignoreObjects: [u] }),
                    cells, assignment: assignment && { id: assignment.id, type: assignment.type, line: assignment.line, phase: assignment.phase } };
            });
            return { tick: g.currentTick, hash: g.getHash(), rng: g.prng.snapshot(), houses, mcvs,
                teams: [...teams.instances.values()].filter(t => ['0A287950', '08DB22A0', '08DB1420'].includes(t.type))
                    .map(t => ({ id: t.id, type: t.type, phase: t.phase, line: t.line, started: t.started,
                        tasks: t.tasks.map(p => ({ unit: p.unit.id, task: task(p.task) })), members: t.members.map(u => u.id) })),
                gates: [...c.machine.states].filter(([id]) => ['0A46D390', '0A468930', '0A4685D0', '08DC9190', '08DC95C0', '08DCA960'].includes(id)),
                buildTrace: c.baseBuilder?.trace, aiTrace: teams.sourceAi?.trace,
                hunts: window.__baseHunts,
                foundationAudit: window.__foundationAudit,
                produced: window.__baseProduced,
                offensiveTeams: [...teams.instances.values()].filter(t => t.aiTrigger
                    && c.definition.teams.get(t.type)?.properties.IsBaseDefense?.toLowerCase() !== 'yes')
                    .map(t => ({ owner: t.owner.name, type: t.type, phase: t.phase, line: t.line,
                        members: t.members.filter(u => u.isSpawned && !u.isDestroyed).map(u => ({ id: u.id, name: u.name,
                            moving: u.moveTrait?.isMoving(), tile: [u.tile.rx, u.tile.ry],
                            target: u.attackTrait?.currentTarget?.obj?.id, tasks: u.unitOrderTrait.getTasks().map(task) })) })),
                failure: c.failure, result: c.result };
        });
        report.samples.push(sample);
        await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
        if (!observation && tick >= 6000 && ['BadGuy1 House', 'BadGuy2 House', 'BadGuy3 House'].every(name =>
            sample.produced.some(u => u.owner === name && u.factory !== undefined)
            && sample.offensiveTeams.some(t => t.owner === name && t.members.length && ['active', 'holding'].includes(t.phase)))) break;
        if (sample.result) break;
    }
    if (!observation) for (const name of ['BadGuy1 House', 'BadGuy2 House', 'BadGuy3 House']) {
        const houses = report.samples.map(s => s.houses.find(h => h.name === name));
        assert(houses.some(h => h.production && h.ai && h.buildings.some(b => b.name === 'NACNST' && !b.destroyed)), `${name}: deployment and source production must activate`);
        assert(houses.some(h => h.buildings.some(b => ['NAHAND', 'NAWEAP'].includes(b.name) && !b.destroyed)), `${name}: source factories must be built`);
        assert(report.samples.at(-1).produced.some(u => u.owner === name && u.factory !== undefined), `${name}: a real factory must deliver a paid unit`);
        assert(report.samples.at(-1).aiTrace.some(t => t.house === name), `${name}: original offensive AI organization must run`);
        assert(report.samples.some(s => s.offensiveTeams.some(t => t.owner === name && t.members.length
            && ['active', 'holding'].includes(t.phase))), `${name}: a real original offensive team must assemble`);
    }
    if (!observation) {
        report.reviewDisclosure = 'Diagnostic final reveal and camera framing occur after the original-world production assertions. These screenshots are not mission victory or untouched-shroud evidence.';
        const bases = await page.evaluate(() => {
            const g = window.__ra2debug.game; g.campaign.inspectionModified = true; g.mapShroudTrait.revealMap(g.localPlayer, g);
            return [...g.campaign.houses.values()].filter(p => /^BadGuy[123] House$/.test(p.name)).map(p => ({ name: p.name,
                tile: [...p.buildings].find(b => b.name === 'NACNST' && !b.isDestroyed)?.centerTile })).map(p => ({ name: p.name, tile: [p.tile.rx, p.tile.ry] }));
        });
        for (const base of bases) {
            await page.evaluate(tile => { const d = window.__ra2debug;
                d.worldInteraction.minimapHandler.panToTile(d.game.map.tiles.getByMapCoords(...tile)); }, base.tile);
            await page.waitForTimeout(500);
            await page.screenshot({ path: path.join(out, `actual-${base.name.split(' ')[0]}-paid-base.png`) });
        }
    }
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []);
    report.status = observation ? 'OBSERVED_ORIGINAL_THREE_LANE_MCV_AND_PRODUCTION_STATE' : 'PASS_ORIGINAL_ALL_THREE_LANES_DEPLOY_BUILD_PRODUCE';
} catch (error) {
    report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1;
    await page?.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
} finally {
    await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    await app?.close();
}
console.log(JSON.stringify({ status: report.status, error: report.error, out }));
