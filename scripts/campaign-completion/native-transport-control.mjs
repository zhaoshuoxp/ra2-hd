import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { campaignSession, openMissionSelection, stepWorld, waitWorld } from '../m3-2/native-session.mjs';

const out = path.resolve(process.argv[2]);
await fs.mkdir(out, { recursive: false });
const report = { status: 'RUNNING', errors: [], failedResources: [], samples: [], commands: [],
    scope: 'Original Soviet 02 fresh world, ordinary assisted coastal combat and reactive transport defense. The selected strategy is recorded separately. Verify the specific MCV boat survives combat, returns and executes its original delete instruction. Simulation is accelerated; no direct object, health, rule, trigger or result mutation.' };
let app, page;
const difficulty = process.argv.find(arg => arg.startsWith('--difficulty='))?.slice(13) ?? 'normal';
assert(['easy', 'normal', 'hard'].includes(difficulty));
const strategy = process.argv.find(arg => arg.startsWith('--strategy='))?.slice(11) ?? 'baseline';
assert(['baseline', 'split-defense'].includes(strategy));
const save = () => fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
async function inspect() {
    return page.evaluate(() => {
        const g = window.__ra2debug.game, c = g.campaign;
        const tasks = task => ({ name: task.constructor.name, status: task.status, target: task.target?.tile && [task.target.tile.rx, task.target.tile.ry],
            children: task.children.map(tasks) });
        return { tick: g.currentTick, hash: g.getHash(), failure: c.failure, result: c.result, locked: c.inputLocked,
            mcv: g.localPlayer.getOwnedObjects().filter(o => o.name === 'SMCV' && o.isSpawned).map(o => o.id),
            boats: g.world.getAllObjects().filter(o => o.name === 'SAPC').map(o => ({ id: o.id, owner: o.owner.name,
                spawned: o.isSpawned, health: o.healthTrait.health, tile: [o.tile.rx, o.tile.ry], cargo: o.transportTrait.units.map(p => p.name),
                team: [...c.teams.instances.values()].filter(t => t.phase !== 'finished' && t.members.includes(o)).map(t => ({ type: t.type, line: t.line, phase: t.phase })),
                tasks: o.unitOrderTrait.getTasks().map(tasks), orders: o.unitOrderTrait.orders?.map(order => order.constructor.name) })),
            teams: c.teams.snapshot(), scriptTrace: c.teams.trace, trace: c.trace.slice(-20), waypoints: [16, 55, 57].map(id => {
                const tile = g.map.getTileAtWaypoint(id); return { id, cell: tile && [tile.rx, tile.ry], within: tile && g.map.mapBounds.isWithinBounds(tile) };
            }) };
    });
}
try {
    let labels;
    ({ app, page, labels } = await campaignSession(out, report));
    await openMissionSelection(page, labels);
    await page.locator(`[data-campaign-difficulty-choice=${difficulty}]`).click();
    await page.evaluate(() => window.__ra2debug.mainMenuController.screens.get(22).launchPrepared('sov02t.map'));
    await waitWorld(page, 'sov02t.map');
    report.difficulty = difficulty;
    report.strategy = strategy;
    await page.evaluate(() => {
        window.__boatEvents = [];
        window.__ra2debug.game.events.subscribe(event => {
            if ([event.target, event.source, event.object].some(o => o?.name === 'SAPC')) window.__boatEvents.push({
                tick: window.__ra2debug.game.currentTick, type: event.type,
                target: event.target && [event.target.id, event.target.name], source: event.source && [event.source.id, event.source.name],
                attacker: event.attacker?.obj && [event.attacker.obj.id, event.attacker.obj.name, event.attacker.obj.owner?.name],
            });
        });
    });
    let handoffTick;
    for (let i = 0; i < 400; i++) {
        await page.evaluate(strategy => {
            const d = window.__ra2debug, g = d.game;
            if (g.campaign.inputLocked) return;
            if (strategy === 'baseline') {
                const objects = g.world.getAllObjects();
                const threats = new Set(window.__boatEvents.filter(event => g.currentTick - event.tick < 180 && event.attacker).map(event => event.attacker[0]));
                const hostile = o => o.isTechno() && o.isSpawned && !o.isDestroyed && !o.owner.isNeutral
                    && o.owner !== g.localPlayer && !g.alliances.areAllied(g.localPlayer, o.owner);
                const target = objects.filter(o => threats.has(o.id) && hostile(o)).sort((a, b) => a.id - b.id)[0]
                    ?? objects.filter(o => o.name === 'GAPILL' && !o.isDestroyed && o.tile.rx < 90 && o.tile.ry < 75)
                        .sort((a, b) => a.id - b.id)[0]
                    ?? objects.filter(o => o.isUnit() && hostile(o) && Math.hypot(o.tile.rx - 73, o.tile.ry - 56) < 14)
                        .sort((a, b) => a.id - b.id)[0];
                const ids = g.localPlayer.getOwnedObjects().filter(o => o.isSpawned && ['E2', 'HTNK'].includes(o.name)).map(o => o.id);
                if (!target || !ids.length) return;
                if (g.mapShroudTrait.getPlayerShroud(g.localPlayer).isShrouded(target.tile, target.tileElevation)) d.actionsApi.orderUnits(ids, 4, target.tile.rx, target.tile.ry);
                else d.actionsApi.orderUnits(ids, 2, target.id);
                return;
            }
            const targets = g.world.getAllObjects().filter(o => o.isTechno() && o.isSpawned && !o.isDestroyed && o.tile.rx < 90 && o.tile.ry < 75
                && o.owner !== g.localPlayer && !g.alliances.areAllied(o.owner, g.localPlayer));
            const groups = new Map();
            for (const unit of g.localPlayer.getOwnedObjects().filter(o => o.isSpawned && ['E2', 'HTNK'].includes(o.name))) {
                const target = [...targets].sort((a, b) => Number(a.tag?.id === '0B10A4EC') - Number(b.tag?.id === '0B10A4EC')
                    || Math.hypot(unit.tile.rx - a.tile.rx, unit.tile.ry - a.tile.ry) - Math.hypot(unit.tile.rx - b.tile.rx, unit.tile.ry - b.tile.ry)
                    || a.id - b.id)[0];
                if (target) { const entry = groups.get(target) ?? []; entry.push(unit.id); groups.set(target, entry); }
            }
            for (const [target, ids] of groups) {
                if (g.mapShroudTrait.getPlayerShroud(g.localPlayer).isShrouded(target.tile, target.tileElevation)) d.actionsApi.orderUnits(ids, 4, target.tile.rx, target.tile.ry);
                else d.actionsApi.orderUnits(ids, 2, target.id);
            }
        }, strategy);
        await stepWorld(page, 30);
        const state = await inspect();
        if (i % 10 === 0 || state.boats.some(o => o.cargo.includes('SMCV')) || state.mcv.length) { report.samples.push(state); await save(); }
        if (state.mcv.length && handoffTick === undefined) handoffTick = state.tick;
        if (handoffTick !== undefined && state.tick - handoffTick >= 1200) break;
    }
    report.afterHandoff = await inspect();
    report.boatEvents = await page.evaluate(() => window.__boatEvents);
    assert(report.afterHandoff.mcv.length, 'Original MCV handoff must occur');
    report.playerMove = await page.evaluate(() => {
        const d = window.__ra2debug, g = d.game, boat = g.localPlayer.getOwnedObjects().find(o => o.name === 'SAPC' && o.isSpawned);
        if (!boat) return null;
        const origin = [boat.tile.rx, boat.tile.ry], shroud = g.mapShroudTrait.getPlayerShroud(g.localPlayer), candidates = [];
        for (let x = -10; x <= 10; x++) for (let y = -10; y <= 10; y++) {
            if (Math.hypot(x, y) < 6 || Math.hypot(x, y) > 10) continue;
            const tile = g.map.tiles.getByMapCoords(origin[0] + x, origin[1] + y);
            if (tile && g.map.mapBounds.isWithinBounds(tile) && !shroud.isShrouded(tile, 0)
                && g.map.terrain.getPassableSpeed(tile, boat.rules.speedType, false, false) > 0
                && !g.map.terrain.findObstacles({ tile, onBridge: false }, boat).length) candidates.push(tile);
        }
        const target = candidates[0];
        if (!target) throw Error('No visible passable destination for ordinary transport order');
        d.actionsApi.orderUnits([boat.id], 1, target.rx, target.ry);
        return { id: boat.id, origin, target: [target.rx, target.ry] };
    });
    if (report.playerMove) {
        await stepWorld(page, 180);
        const state = await inspect(), boat = state.boats.find(o => o.id === report.playerMove.id);
        report.playerMove.after = boat;
        assert(boat && Math.hypot(boat.tile[0] - report.playerMove.origin[0], boat.tile[1] - report.playerMove.origin[1]) > 2, 'Human-owned transport must follow the serialized move command');
    }
    const mcvBoat = report.samples.flatMap(sample => sample.boats).find(boat => boat.cargo.includes('SMCV'));
    assert(mcvBoat, 'Observe the real source-created MCV transport before unloading');
    report.mcvBoat = { id: mcvBoat.id, owner: mcvBoat.owner,
        returnObserved: report.samples.some(sample => sample.boats.some(boat => boat.id === mcvBoat.id
            && boat.team.some(team => team.type === '0A30E1FC'))),
        destroyedByCombat: report.boatEvents.some(event => event.type === 3 && event.target?.[0] === mcvBoat.id),
        sourceDelete: report.afterHandoff.scriptTrace.filter(line => line.team === '0A30E1FC' && line.opcode === 37) };
    assert(!report.mcvBoat.destroyedByCombat, 'Combat destruction does not prove a successful scripted exit');
    assert(report.mcvBoat.returnObserved, 'The specific MCV boat must execute its original return team');
    assert(report.mcvBoat.sourceDelete.length, 'The original return team must reach its delete instruction');
    assert(!report.afterHandoff.boats.some(boat => boat.id === mcvBoat.id && boat.spawned), 'Original MCV boat must leave the world');
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []);
    report.status = 'PASS_NATIVE_ORIGINAL_MCV_BOAT_SURVIVES_AND_COMPLETES_SOURCE_RETURN';
} catch (error) {
    report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1;
    if (page) { await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {}); report.body = await page.locator('body').innerText().catch(() => ''); }
} finally {
    if (page) {
        const commands = await page.evaluate(() => window.__ra2debug?.game?.campaign?.journal.commands).catch(() => undefined);
        if (commands) await fs.writeFile(path.join(out, 'applied-command-journal.json'), JSON.stringify(commands) + '\n');
    }
    await save(); await app?.close();
}
console.log(JSON.stringify({ status: report.status, error: report.error, out }));
