import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { campaignSession, pauseWorld, stepWorld, waitWorld, worldState } from '../m3-2/native-session.mjs';
import { closeCampaignMenuPaused } from './named-save-restart.mjs';

const out = path.resolve(process.argv[2]), difficulty = process.argv[3] ?? 'normal';
const replayFile = process.argv.find(value => value.startsWith('--replay='))?.slice(9);
const replaySource = replayFile ? JSON.parse(await fs.readFile(path.resolve(replayFile), 'utf8')) : undefined;
const seedFile = process.argv.find(value => value.startsWith('--seed='))?.slice(7);
const creationSeed = replaySource?.identity ?? (seedFile ? JSON.parse(await fs.readFile(path.resolve(seedFile), 'utf8')).identity : undefined);
assert(['easy', 'normal', 'hard'].includes(difficulty)); await fs.mkdir(out, { recursive: false });
const report = { status: 'RUNNING', errors: [], failedResources: [], samples: [], commands: [], difficulty,
    scope: 'Original Soviet 03 source objective chain. Assisted ordinary serialized production, placement, movement, capture and combat commands; accelerated native simulation. Source map/rules/triggers, health, RNG and objectives remain intact. The source lab coordinate guides movement; combat targets must be revealed. Pre-mission UI/movie routing and HD coverage are measured separately.' };
let app, page, labels;
const armyNames = ['HTNK', 'HTK', 'MTNK', 'FV', 'E2', 'SHK', 'YURI', 'V3', 'FLAKT'];
const save = () => fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
async function saveAndRestart() {
    const click = async (action, label) => {
        const button = page.locator(`[data-action=${action}]`);
        if (await button.count()) await button.click();
        else await page.getByRole('button', { name: labels[label], exact: true }).click();
    };
    await page.evaluate(() => window.__ra2debug.gameScreen.menu.open());
    await page.getByRole('button', { name: labels['gui:save'], exact: true }).click();
    await page.waitForSelector('[data-save-scope=campaign][data-mode=save]');
    await page.locator('.save-native-name').fill('Original Soviet 03 beacon defense'); await click('SaveGame', 'gui:save');
    await page.locator('[data-action=AcknowledgeSave]').waitFor(); await click('AcknowledgeSave');
    const record = await page.evaluate(async () => {
        const db = await new Promise(resolve => { const q = indexedDB.open('ra2-hd-campaign-library', 1); q.onsuccess = () => resolve(q.result); });
        try { return await new Promise(resolve => { const q = db.transaction('saves').objectStore('saves').getAll(); q.onsuccess = () => resolve(q.result[0]); }); }
        finally { db.close(); }
    });
    assert.equal(record.mission, 'sov03u.map'); assert.equal(record.checkpoint.options.campaign.difficulty, difficulty);
    report.midMission = await worldState(page);
    await fs.writeFile(path.join(out, 'mid-mission-checkpoint.json'), JSON.stringify(record.checkpoint));
    await page.screenshot({ path: path.join(out, 'native-beacon-countdown-named-save.png') });
    await click('CloseSaves', 'gui:back');
    await closeCampaignMenuPaused(page);
    await stepWorld(page, 180); const reference = await worldState(page);
    await app.close(); app = undefined;
    ({ app, page, labels } = await campaignSession(out, report, { density: 0 }));
    await page.getByRole('button', { name: labels['gui:load'], exact: true }).click();
    await page.locator(`[role=option][data-id="${record.id}"]`).click(); await click('LoadGame', 'gui:load');
    await page.waitForFunction(tick => window.__ra2debug.game?.currentTick === tick
        && window.__ra2debug.gameScreen?.menu?.getCurrentScreen(), record.tick, { timeout: 180000 });
    await pauseWorld(page); assert.deepEqual(await worldState(page), report.midMission);
    assert.equal(await page.locator('[data-campaign-media=s03_f00e]').count(), 0);
    await page.screenshot({ path: path.join(out, 'native-beacon-restored-after-restart.png') });
    await closeCampaignMenuPaused(page);
    await stepWorld(page, 180); assert.deepEqual(await worldState(page), reference);
    report.restart = { tick: record.tick, worldHash: report.midMission.hash, after180TicksHash: reference.hash,
        exactWorldRngVariablesTeamsTimerAndCallbacks: true, originalSource: record.checkpoint.identity,
        noPreMissionMovieReplay: true, checksum: record.checkpoint.checksum };
    await save();
}
const order = async (names, type, target, tile) => {
    const ids = await page.evaluate(({ names, type, target, tile }) => {
        const d = window.__ra2debug, g = d.game;
        const units = g.localPlayer.getOwnedObjects().filter(unit => unit.isUnit() && unit.isSpawned && !unit.isDestroyed
            && (names.includes(unit.name) || names.includes(unit.id))
            && (names.includes(unit.id) || unit.id !== window.__sov03ReservedTransport && !(window.__sov03BaseDefenders ?? []).includes(unit.id)));
        if (units.length) d.actionsApi.orderUnits(units.map(unit => unit.id), type,
            ...(target === undefined ? tile ?? [units[0].id] : [target]));
        return units.map(unit => unit.id);
    }, { names, type, target, tile });
    if (ids.length) report.commands.push({ command: 'order', ids, type, target, tile });
};
const step = async ticks => {
    let result;
    for (let done = 0; done < ticks; done += 90) {
        result = await page.evaluate(count => {
            const d = window.__ra2debug, g = d.game, manager = d.gameScreen.gameTurnMgr;
            const own = g.localPlayer.getOwnedObjects().filter(unit => unit.isSpawned && !unit.isDestroyed);
            const anchors = own.filter(unit => unit.isBuilding() && (unit.rules.constructionYard || unit.name === 'NAPSYB'));
            for (const building of own.filter(unit => unit.isBuilding() && unit.healthTrait.health < 80 && unit.rules.clickRepairable)) {
                const repair = building.traits.getAll().find(trait => 'healLeftover' in trait && typeof trait.isDisabled === 'function');
                if (repair?.isDisabled()) d.actionsApi.toggleRepairWrench(building.id);
            }
            const visible = g.mapShroudTrait.getPlayerShroud(g.localPlayer);
            const supply = own.find(unit => unit.id === window.__sov03ReservedTransport);
            if (supply && window.__sov03ConvoyLoading) {
                const engineers = own.filter(unit => unit.name === 'SENGINEER');
                if (engineers.length) d.actionsApi.orderUnits(engineers.map(unit => unit.id), 17, supply.id);
            }
            if (supply && window.__sov03EscortLeader !== undefined && !own.some(unit => unit.id === window.__sov03EscortLeader)) {
                const escort = own.filter(unit => ['HTNK', 'MTNK'].includes(unit.name)).sort((a, b) =>
                    Math.hypot(a.tile.rx - supply.tile.rx, a.tile.ry - supply.tile.ry)
                    - Math.hypot(b.tile.rx - supply.tile.rx, b.tile.ry - supply.tile.ry))[0];
                if (escort) { window.__sov03EscortLeader = escort.id; d.actionsApi.orderUnits([supply.id], 5, escort.id); }
            }
            const target = g.world.getAllObjects().filter(unit => unit.isUnit() && unit.isSpawned && !unit.isDestroyed
                && unit.owner !== g.localPlayer && !unit.owner.isNeutral && !g.alliances.areAllied(g.localPlayer, unit.owner)
                && !visible.isShrouded(unit.tile, unit.tileElevation)
                && anchors.some(anchor => Math.hypot(anchor.tile.rx - unit.tile.rx, anchor.tile.ry - unit.tile.ry) < 15))
                .sort((a, b) => Number(b.isVehicle()) - Number(a.isVehicle()) || a.id - b.id)[0];
            if (target) {
                const army = own.filter(unit => ['HTNK', 'MTNK', 'FV', 'E2', 'SHK', 'HTK', 'YURI', 'V3', 'FLAKT'].includes(unit.name)
                    && unit.id !== window.__sov03ReservedTransport
                    && Math.hypot(unit.tile.rx - target.tile.rx, unit.tile.ry - target.tile.ry) < 24);
                if (army.length) d.actionsApi.orderUnits(army.map(unit => unit.id), 2, target.id);
            }
            manager.setCampaignPaused(false);
            try { for (let i = 0; i < count && !g.campaign.result && !g.campaign.failure; i++) manager.doGameTurn(performance.now()); }
            finally { manager.setCampaignPaused(true); }
            return { tick: g.currentTick, result: g.campaign.result, failure: g.campaign.failure };
        }, Math.min(90, ticks - done));
        assert(!result.failure, result.failure);
        assert.notEqual(result.result, 'defeat', 'Original source defeat at tick ' + result.tick);
        if (result.result) break;
    }
    return result;
};
const inspect = async label => {
    const sample = await page.evaluate(label => {
        const d = window.__ra2debug, g = d.game, c = g.campaign, shroud = g.mapShroudTrait.getPlayerShroud(g.localPlayer);
        const describe = unit => ({ id: unit.id, name: unit.name, owner: unit.owner.name,
            tile: unit.tile ? [unit.tile.rx, unit.tile.ry] : null, health: unit.healthTrait?.health, spawned: unit.isSpawned,
            elevation: unit.tileElevation, parachuting: !!unit.campaignParadropping });
        return { label, tick: g.currentTick, hash: g.getHash(), failure: c.failure, result: c.result, credits: g.localPlayer.credits,
            player: g.localPlayer.getOwnedObjects(true).filter(unit => !unit.isDestroyed).map(describe),
            visibleHostiles: g.world.getAllObjects().filter(unit => unit.isTechno() && !unit.isDestroyed && unit.owner !== g.localPlayer
                && !unit.owner.isNeutral && !g.alliances.areAllied(g.localPlayer, unit.owner) && !shroud.isShrouded(unit.tile, unit.tileElevation)).map(describe),
            queues: g.localPlayer.production.getAllQueues().map(queue => ({ type: queue.type, status: queue.status,
                items: queue.getAll().map(item => ({ name: item.rules.name, quantity: item.quantity, progress: item.progress })) })),
            variables: [...c.machine.variables], fired: [...c.machine.states].filter(([, state]) => state.fired).map(([id, state]) => [id, state.fired]),
            countdown: g.countdownTimer.snapshot(), buildTrace: c.baseBuilder.trace,
            teams: [...c.teams.instances.values()].filter(team => ['099FE8EC', '08D1E180', '096948D4'].includes(team.type))
                .map(team => ({ type: team.type, phase: team.phase, line: team.line,
                    remaining: team.flight?.remaining, members: team.members.map(describe) })) };
    }, label);
    report.samples.push(sample); await save(); assert(!sample.failure, sample.failure); return sample;
};
const queue = async (name, count) => {
    const result = await page.evaluate(({ name, count }) => {
        const d = window.__ra2debug, g = d.game, type = [2, 3, 7, 1].find(type => g.rules.hasObject(name, type));
        const rule = g.rules.getObject(name, type), production = g.localPlayer.production;
        if (!production.isAvailableForProduction(rule)) return { available: false, name, prerequisites: rule.prerequisite,
            techLevel: rule.techLevel, playerTechLevel: production.maxTechLevel,
            hasFactory: production.hasFactoryFor(rule), meetsPrerequisites: production.meetsPrerequisites(rule) };
        d.actionsApi.queueForProduction(production.getQueueForObject(rule).type, type, name, count); return { available: true };
    }, { name, count });
    assert(result.available, JSON.stringify(result)); report.commands.push({ command: 'produce', name, count });
};
const build = async (name, near) => {
    await queue(name, 1);
    for (let i = 0; i < 80; i++) {
        await step(120);
        const placed = await page.evaluate(({ name, near }) => {
            const d = window.__ra2debug, g = d.game, rule = g.rules.getBuilding(name), q = g.localPlayer.production.getQueueForObject(rule);
            if (q.status !== 3 || q.getFirst()?.rules !== rule) return;
            const worker = g.getConstructionWorker(g.localPlayer), candidates = [];
            const anchor = near ? [...g.localPlayer.buildings].sort((a, b) => Math.hypot(a.tile.rx - near[0], a.tile.ry - near[1])
                - Math.hypot(b.tile.rx - near[0], b.tile.ry - near[1]))[0] : [...g.localPlayer.buildings].find(b => b.rules.constructionYard);
            for (let y = anchor.tile.ry - 18; y <= anchor.tile.ry + 18; y++) for (let x = anchor.tile.rx - 18; x <= anchor.tile.rx + 18; x++) {
                const tile = g.map.tiles.getByMapCoords(x, y);
                if (tile && worker.canPlaceAt(name, tile, { normalizedTile: true })) candidates.push([x, y]);
            }
            candidates.sort((a, b) => Math.hypot(a[0] - anchor.tile.rx, a[1] - anchor.tile.ry)
                - Math.hypot(b[0] - anchor.tile.rx, b[1] - anchor.tile.ry) || a[1] - b[1] || a[0] - b[0]);
            if (!candidates.length) throw new Error('No legal placement: ' + name);
            d.actionsApi.placeBuilding(name, ...candidates[0]); return candidates[0];
        }, { name, near });
        if (placed) { report.commands.push({ command: 'place', name, tile: placed }); await step(120); await inspect('built-' + name); return; }
    }
    throw new Error('Production did not complete: ' + name);
};
try {
    ({ app, page, labels } = await campaignSession(out, report, { density: 0 }));
    await page.evaluate(async ({ difficulty, creationSeed, replay }) => {
        const screen = window.__ra2debug.mainMenuController.screens.get(22), controller = screen.rootController;
        const launch = controller.goToScreen;
        if (creationSeed) controller.goToScreen = function (type, params) {
            controller.goToScreen = launch;
            return launch.call(this, type, { ...params, gameId: creationSeed.gameId, timestamp: creationSeed.timestamp,
                gameOpts: replay ? { ...params.gameOpts, gameSpeed: 0 } : params.gameOpts });
        };
        try { screen.difficulty = difficulty; await screen.launchPrepared('sov03u.map'); }
        finally { controller.goToScreen = launch; }
    }, { difficulty, creationSeed, replay: !!replaySource });
    if (creationSeed) report.creationSeed = { gameId: creationSeed.gameId, timestamp: creationSeed.timestamp,
        policy: 'Only ordinary game-creation seed inputs are reused; every world is freshly initialized from the original map. No checkpoint or post-creation RNG modification.' };
    await waitWorld(page, 'sov03u.map'); await inspect('fresh-source-world');
    report.identity = await page.evaluate(() => { const g = window.__ra2debug.game;
        return { gameId: g.id, timestamp: g.startTimestamp, options: g.gameOpts, launch: g.campaign.launch }; });
    let lab, state;
    if (replaySource) {
        assert.equal(difficulty, replaySource.difficulty);
        const target = replaySource.samples.findLast(sample => sample.label === 'original-lab-capture');
        assert(target && replaySource.appliedCommands.every(command => command.type !== 4));
        assert(await page.evaluate(first => window.__ra2debug.game.currentTick <= first,
            replaySource.appliedCommands[0].tick), 'Fresh slow-speed launch must precede the recorded first command');
        await page.evaluate(commands => {
            const byTick = window.__sov03Replay = new Map();
            for (const command of commands) { const batch = byTick.get(command.tick) ?? []; batch.push(command); byTick.set(command.tick, batch); }
            window.__ra2debug.game.campaign.restoring = true;
        }, replaySource.appliedCommands.filter(command => command.tick < target.tick));
        let current;
        do {
            current = await page.evaluate(target => {
                const d = window.__ra2debug, g = d.game;
                for (let i = 0; i < 240 && g.currentTick < target && !g.campaign.failure && !g.campaign.result; i++) {
                    for (const command of window.__sov03Replay.get(g.currentTick) ?? []) {
                        const action = d.actionFactory.create(command.type); action.unserialize(new Uint8Array(command.data));
                        action.player = g.getPlayer(command.player); g.campaign.journal.record(g, action.player, [action]); action.process();
                    }
                    g.update();
                }
                return { tick: g.currentTick, failure: g.campaign.failure, result: g.campaign.result };
            }, target.tick);
            assert(!current.failure && !current.result, JSON.stringify(current));
        } while (current.tick < target.tick);
        await page.evaluate(() => { const c = window.__ra2debug.game.campaign; c.restoring = false; c.particles.showRestored(); });
        state = await inspect('replayed-source-lab-capture');
        assert.equal(state.tick, target.tick); assert.equal(state.hash, target.hash);
        assert.deepEqual(state.fired, target.fired); assert.deepEqual(state.variables, target.variables); assert.deepEqual(state.countdown, target.countdown);
        lab = replaySource.sourceLab;
        report.replay = { file: path.resolve(replayFile), targetTick: target.tick, matchedWorldHash: state.hash,
            policy: 'Re-execute only recorded ordinary commands into a fresh original world, then continue with new ordinary commands. No checkpoint, rule edit, objective assignment or post-creation RNG mutation. Slow normal speed prevents missing the first command; presentation is suppressed during deterministic command reconstruction.' };
    } else {
    await order(['SMCV'], 9); await step(150);
    assert((await inspect('deployed-yard')).player.some(unit => unit.name === 'NACNST'));
    await build('NAREFN'); await build('NAHAND'); await queue('E2', 8); await build('NAWEAP'); await queue('HTK', 3);
    await queue('HTNK', 6); await build('NAPOWR'); await queue('V3', 2);
    for (let i = 0; i < 60; i++) {
        await step(150); const state = await inspect('army-' + i);
        if (state.player.filter(unit => ['HTNK', 'MTNK'].includes(unit.name)).length >= 5
            && state.player.filter(unit => unit.name === 'V3').length >= 2) break;
    }
    await inspect('base-ready');
    await page.screenshot({ path: path.join(out, 'base-ready.png') });
    report.supply = await page.evaluate(() => {
        const g = window.__ra2debug.game, units = g.localPlayer.getOwnedObjects();
        const truck = units.filter(unit => unit.name === 'HTK' && unit.isSpawned)
            .sort((a, b) => b.healthTrait.health - a.healthTrait.health || b.id - a.id)[0];
        if (!truck) throw new Error('The ordinary supply transport is required');
        window.__sov03ReservedTransport = truck.id;
        window.__sov03ConvoyLoading = true;
        window.__sov03BaseDefenders = units.filter(unit => unit.name === 'YURI').slice(0, 1).map(unit => unit.id);
        window.__ra2debug.actionsApi.orderUnits([truck.id], 11, truck.id);
        return { truck: truck.id, defenders: window.__sov03BaseDefenders };
    });
    await queue('SENGINEER', 2);
    for (let i = 0; i < 25; i++) {
        await step(90);
        if (await page.evaluate(id => window.__ra2debug.game.getObjectById(id).transportTrait.units.length === 2, report.supply.truck)) break;
    }
    report.supply.engineers = await page.evaluate(id => {
        window.__sov03ConvoyLoading = false;
        return window.__ra2debug.game.getObjectById(id).transportTrait.units.map(unit => unit.id);
    }, report.supply.truck);
    assert(report.supply.engineers.length >= 1, 'A normally produced engineer must actually board the guarded convoy');
    await page.evaluate(id => { const d = window.__ra2debug, tanks = d.game.localPlayer.getOwnedObjects().filter(unit => unit.name === 'HTNK' && unit.isSpawned);
        tanks.sort((a, b) => b.healthTrait.health - a.healthTrait.health || b.id - a.id);
        window.__sov03EscortLeader = tanks[0].id; d.actionsApi.orderUnits([id], 5, tanks[0].id); }, report.supply.truck);
    lab = await page.evaluate(() => { const g = window.__ra2debug.game;
        const lab = g.world.getAllObjects().find(unit => unit.name === 'GATECH');
        return lab && { id: lab.id, tile: [lab.tile.rx, lab.tile.ry] }; });
    assert(lab, 'The original Battle Lab must exist'); report.sourceLab = lab;
    const route = [[78, 119], [83, 101], [91, 85], [101, 66], [101, 44], [100, 29]];
    for (const tile of route) {
        await order(armyNames, 4, undefined, tile);
        for (let i = 0; i < 20; i++) {
            await step(120); const state = await inspect('advance-' + tile.join('-') + '-' + i);
            const army = state.player.filter(unit => armyNames.includes(unit.name) && unit.spawned && unit.tile);
            assert(army.length >= 4, 'The ordinary army was lost before reaching the lab');
            if (army.filter(unit => Math.hypot(unit.tile[0] - tile[0], unit.tile[1] - tile[1]) < 9).length >= Math.min(5, army.length)) break;
        }
        await step(90);
    }
    state = await inspect('lab-area');
    for (let i = 0; i < 20; i++) {
        const threat = state.visibleHostiles.filter(unit => !['GATECH', 'GAWEAP', 'GACNST', 'GAREFN'].includes(unit.name)
            && Math.hypot(unit.tile[0] - lab.tile[0], unit.tile[1] - lab.tile[1]) < 12)
            .sort((a, b) => Math.hypot(a.tile[0] - lab.tile[0], a.tile[1] - lab.tile[1])
                - Math.hypot(b.tile[0] - lab.tile[0], b.tile[1] - lab.tile[1]) || a.id - b.id)[0];
        if (!threat) break;
        await order(armyNames, 2, threat.id); await step(180); state = await inspect('lab-defense-' + i);
    }
    await page.evaluate(() => window.__sov03EscortLeader = undefined);
    await order([report.supply.truck], 1, undefined, [100, 30]);
    for (let i = 0; i < 20; i++) {
        await step(90);
        const arrived = await page.evaluate(id => { const g = window.__ra2debug.game, unit = g.localPlayer.getOwnedObjectById(id);
            if (!unit || unit.isDestroyed) throw new Error('The ordinary engineer convoy was destroyed in combat');
            return Math.hypot(unit.tile.rx - 100, unit.tile.ry - 30) < 3; }, report.supply.truck);
        if (arrived) break;
    }
    await order([report.supply.truck], 9); await step(120); state = await inspect('engineers-delivered');
    const engineers = state.player.filter(unit => unit.name === 'SENGINEER' && unit.spawned).map(unit => unit.id);
    assert(engineers.length, 'A normally produced engineer is required');
    await order(engineers.slice(0, 1), 7, lab.id); await step(180); state = await inspect('original-lab-capture');
    assert(state.fired.some(([id]) => id === '09AC9C20'), 'The original lab EnteredBy trigger must fire');
    }
    for (let i = 0; i < 10 && !state.player.some(unit => unit.name === 'NAPSYB'); i++) {
        await step(90); state = await inspect('source-beacon-construction-' + i);
    }
    assert(state.player.some(unit => unit.name === 'NAPSYB'), 'The source production/house-handoff chain must provide the beacon');
    await order(armyNames, 4, undefined, [101, 30]);
    await queue('HTNK', 8); await queue('E2', 12);
    // Original map raises NAFLAK to TechLevel 6; the human house has level 5.
    // Produce the original available Flak Troopers at an ordinary forward barracks.
    await build('NAHAND', lab.tile);
    await page.evaluate(tile => { const d = window.__ra2debug, buildings = [...d.game.localPlayer.buildings].filter(unit => unit.name === 'NAHAND');
        buildings.sort((a, b) => Math.hypot(a.tile.rx - tile[0], a.tile.ry - tile[1]) - Math.hypot(b.tile.rx - tile[0], b.tile.ry - tile[1]));
        d.actionsApi.orderUnits([buildings[0].id], 9, buildings[0].id); }, lab.tile);
    await step(3); await queue('FLAKT', 12);
    for (let i = 0; i < 80; i++) {
        await step(120); state = await inspect('beacon-defense-' + i);
        if (state.result) break;
        if (i === 8) await saveAndRestart();
    }
    report.final = await inspect('final');
    report.appliedCommands = await page.evaluate(() => window.__ra2debug.game.campaign.journal.commands);
    await fs.writeFile(path.join(out, 'applied-command-journal.json'), JSON.stringify(report.appliedCommands));
    assert.equal(report.final.result, 'victory');
    assert(report.final.fired.some(([id]) => id === '0DC7AB70'), 'Source beacon-built stage must occur');
    assert(report.final.fired.some(([id]) => id === '03D97540'), 'Source timer-expiry stage must occur');
    assert(report.final.fired.some(([id]) => id === '09152DB0'), 'Source Allied conversion must occur');
    await page.evaluate(() => { const manager = window.__ra2debug.gameScreen.gameTurnMgr;
        manager.setCampaignPaused(false); manager.doGameTurn(performance.now()); });
    await page.waitForSelector('[data-campaign-result=victory]', { timeout: 30000 });
    await page.screenshot({ path: path.join(out, 'native-original-victory.png') });
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []); assert.deepEqual(report.consoleErrors ?? [], []);
    report.status = 'PASS_NATIVE_ORIGINAL_SOVIET03_OBJECTIVE_CHAIN';
} catch (error) {
    report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1;
    if (page) { await inspect('failure-state').catch(() => {}); report.body = await page.locator('body').innerText().catch(() => '');
        report.appliedCommands = await page.evaluate(() => window.__ra2debug.game?.campaign?.journal.commands).catch(() => []);
        await fs.writeFile(path.join(out, 'applied-command-journal.json'), JSON.stringify(report.appliedCommands));
        await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {}); }
} finally { await save(); await app?.close(); }
console.log(JSON.stringify({ status: report.status, error: report.error, out }));
