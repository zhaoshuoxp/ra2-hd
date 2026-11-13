import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { campaignSession, pauseWorld, worldState } from '../m3-2/native-session.mjs';
import { closeCampaignMenuPaused } from '../campaign-completion/named-save-restart.mjs';
import { OrdinaryCampaignCommands } from '../campaign-completion/ordinary-commands.mjs';
import { observeMissionMedia } from './observe-mission-media.mjs';

const out = path.resolve(process.argv[2]), checkpoint = JSON.parse(await fs.readFile(path.resolve(process.argv[3])));
await fs.mkdir(out, { recursive: false });
const report = { status: 'RUNNING', errors: [], failedResources: [], commands: [], stages: [],
    assistance: 'Explicit continuation from the real named naval/landing checkpoint, followed by ordinary serialized movement, attack and capture orders. This is a restore/mission-stage observer; fresh mission initialization continues to use the original map.',
    sourceCheckpoint: { identity: checkpoint.identity, tick: checkpoint.tick, checksum: checkpoint.checksum } };
let session, commands, stopMedia;
const army = ['BORIS', 'HTNK', 'HTK', 'SHK', 'E2', 'DOG'];
async function inspect(label) {
    const state = await session.page.evaluate(() => {
        const g = window.__ra2debug.game, c = g.campaign, shroud = g.mapShroudTrait.getPlayerShroud(g.localPlayer);
        const describe = object => ({ id: object.id, name: object.name, owner: object.owner.name, tile: [object.tile.rx, object.tile.ry],
            health: object.healthTrait.health, passengers: object.transportTrait?.units.map(unit => ({ id: unit.id, name: unit.name })),
            movement: object.isUnit() ? { disabled: object.moveTrait.isDisabled(), state: object.moveTrait.moveState,
                result: object.moveTrait.lastMoveResult, waypoint: object.moveTrait.currentWaypoint?.tile
                    && [object.moveTrait.currentWaypoint.tile.rx, object.moveTrait.currentWaypoint.tile.ry] } : undefined,
            visible: g.map.tileOccupation.calculateTilesForGameObject(object.tile, object)
                .some(tile => !shroud.isShrouded(tile, object.tileElevation)) });
        const live = g.world.getAllObjects().filter(object => object.isTechno() && object.isSpawned && !object.isDestroyed);
        const tagged = id => { const tags = c.definition.tagsForTrigger(id).map(tag => tag.id); return live.filter(object => tags.includes(object.tag?.id)).map(describe); };
        const waypoint = n => { const tile = g.map.getTileAtWaypoint(n); return tile && [tile.rx, tile.ry]; };
        return { tick: g.currentTick, failure: c.failure, result: c.result, inputLocked: c.inputLocked,
            own: g.localPlayer.getOwnedObjects().filter(object => object.isTechno() && object.isSpawned && !object.isDestroyed).map(describe),
            defenses: tagged('094A4E1C'), machines: live.filter(object => /^CATIME0/.test(object.name)).map(describe),
            plants: live.filter(object => /^GAPOWR[A-F]$/.test(object.name)).map(describe),
            landmarks: live.filter(object => ['NACNST', 'NAWEAP', 'NAREFN', 'YAPPPT', 'YAGGUN', 'YAPSYT', 'GTGCAN'].includes(object.name)).map(describe),
            enemies: live.filter(object => !object.owner.isNeutral && object.owner !== g.localPlayer
                && !g.alliances.areAllied(g.localPlayer, object.owner) && object.isUnit())
                .map(describe).filter(object => object.visible),
            power: g.localPlayer.powerTrait.debugGetState(), machineApproach: waypoint(62), jurassic: waypoint(68), returnSite: waypoint(71),
            rawView: g.map.mapBounds.getRawLocalSize(),
            fired: [...c.machine.states].filter(([, state]) => state.fired).map(([id, state]) => [id, state.fired]) };
    });
    report.stages.push({ label, ...state });
    await fs.writeFile(path.join(out, 'progress.json'), JSON.stringify(report, null, 2) + '\n');
    assert(!state.failure, state.failure); assert.notEqual(state.result, 'defeat', 'Original mission defeat');
    return state;
}
try {
    const density = Number(process.argv.find(value => value.startsWith('--density='))?.slice(10) ?? 0);
    session = await campaignSession(out, report, { edition: 'yr', density });
    if (process.argv.includes('--observe-media')) stopMedia = await observeMissionMedia(session.page);
    await session.page.evaluate(checkpoint => window.__ra2debug.mainMenuController.screens.get(22)
        .launchDiagnostic(checkpoint, 'sov01umd.map'), checkpoint);
    await session.page.waitForFunction(tick => window.__ra2debug.game?.currentTick === tick
        && window.__ra2debug.gameScreen?.menu?.getCurrentScreen(), checkpoint.tick, { timeout: 180000 });
    await pauseWorld(session.page);
    const restored = await worldState(session.page);
    assert.deepEqual({ worldHash: restored.hash, rng: restored.rng, mission: restored.mission, world: restored.world,
        pendingCallbacks: restored.pendingCallbacks }, checkpoint.expected);
    report.restoredLaunch = await session.page.evaluate(() => window.__ra2debug.game.campaign.launch);
    assert.equal(report.restoredLaunch.difficulty, checkpoint.options.campaign.difficulty);
    assert.equal(report.restoredLaunch.semanticsVersion, checkpoint.options.campaign.semanticsVersion);
    await closeCampaignMenuPaused(session.page);
    await session.page.evaluate(() => window.__ra2debug.gameScreen.gameTurnMgr.setPaused(true));
    commands = new OrdinaryCampaignCommands(session.page, report);
    if (process.argv.includes('--trainer-case')) {
        const accepted = await session.page.evaluate(() => {
            const d = window.__ra2debug, g = d.game;
            d.trainer.setEnabled(true);
            return [d.trainer.send({ type: 'reveal' }), d.trainer.send({ type: 'protect',
                targets: g.localPlayer.getOwnedObjects().filter(u => u.isTechno() && u.isSpawned && !u.isDestroyed) })];
        });
        assert(accepted.every(Boolean));
        report.trainerDiagnostic = 'User-reported reveal and unit protection through the supported trainer. This run is excluded from ordinary mission acceptance.';
    }
    if (process.argv.includes('--observe-missing-cell')) await session.page.evaluate(() => {
        const g = window.__ra2debug.game, first = g.world.getAllObjects().find(o => o.position);
        const proto = Object.getPrototypeOf(first.position), move = proto.moveToTileCoords;
        proto.moveToTileCoords = function (x, y, allowPlaceholder) {
            if (!allowPlaceholder && !g.map.tiles.getByMapCoords(Math.floor(x), Math.floor(y))) {
                const actor = g.world.getAllObjects().find(o => o.position === this);
                window.__sovietMissingCell = { tick: g.currentTick, x, y, tile: [Math.floor(x), Math.floor(y)],
                    actor: actor && { id: actor.id, name: actor.name, tile: [actor.tile.rx, actor.tile.ry],
                        owner: actor.owner?.name, zone: actor.zone, from: actor.fromObject?.name },
                    stack: new Error('Missing-cell movement observation').stack, trace: g.campaign.trace.slice(-25) };
            }
            return move.call(this, x, y, allowPlaceholder);
        };
    });
    let state = await inspect('restored-original-landing');
    if (!state.fired.some(([id]) => id === '0952ED0C')) {
    await commands.order(army, 4, undefined, state.machineApproach);
    for (let attempt = 0; attempt < 100 && state.defenses.length; attempt++) {
        if (!state.inputLocked) {
            const targets = state.defenses.filter(object => object.visible);
            if (targets[0]) await commands.order(army, 2, targets[0].id);
            else await commands.order(army, 4, undefined, state.machineApproach);
        }
        await commands.step(180, { defend: false }); state = await inspect('original-time-machine-defenses-' + attempt);
        assert(state.own.some(object => object.name === 'BORIS'), 'Original Boris was lost');
    }
    assert.equal(state.defenses.length, 0, 'Original time-machine defenses remain');
    await commands.step(150, { defend: false }); state = await inspect('original-time-machine-given-to-russians');
    assert(state.machines.some(object => object.name === 'CATIME01' && object.owner === 'Russians'));
    await session.page.screenshot({ path: path.join(out, 'native-time-machine-capture.png') });
    const assignments = new Map(), guards = new Map();
    for (let attempt = 0; attempt < 240 && !state.fired.some(([id]) => id === '0952ED0C'); attempt++) {
        if (!state.inputLocked) {
            const engineers = state.own.filter(object => object.name === 'SENGINEER');
            const plants = state.plants.filter(object => object.owner !== 'Russians' && object.visible);
            for (const [id, target] of assignments) {
                if (!engineers.some(object => object.id === id) || !plants.some(object => object.id === target)) assignments.delete(id);
            }
            for (const engineer of engineers) {
                const target = assignments.get(engineer.id) ?? plants.filter(object => ![...assignments.values()].includes(object.id))
                    .sort((a, b) => Math.hypot(a.tile[0] - engineer.tile[0], a.tile[1] - engineer.tile[1])
                        - Math.hypot(b.tile[0] - engineer.tile[0], b.tile[1] - engineer.tile[1]))[0]?.id;
                if (target !== undefined && (!assignments.has(engineer.id) || attempt % 10 === 0)) {
                    assignments.set(engineer.id, target); await commands.order([engineer.id], 7, target);
                }
            }
            for (const unit of state.own.filter(object => ['BORIS', 'HTNK', 'SHK', 'E2'].includes(object.name))) {
                const plant = state.plants.find(object => object.id === guards.get(unit.id))
                    ?? state.plants.filter(object => object.owner === 'Russians' || [...assignments.values()].includes(object.id))
                        .sort((a, b) => [...guards.values()].filter(id => id === a.id).length
                            - [...guards.values()].filter(id => id === b.id).length
                            || Math.hypot(a.tile[0] - unit.tile[0], a.tile[1] - unit.tile[1])
                                - Math.hypot(b.tile[0] - unit.tile[0], b.tile[1] - unit.tile[1]))[0];
                if (!plant) continue;
                const threat = state.enemies.filter(object => Math.hypot(object.tile[0] - plant.tile[0], object.tile[1] - plant.tile[1]) < 12)
                    .sort((a, b) => Number(/ENGINEER/.test(b.name)) - Number(/ENGINEER/.test(a.name))
                        || Math.hypot(a.tile[0] - unit.tile[0], a.tile[1] - unit.tile[1])
                            - Math.hypot(b.tile[0] - unit.tile[0], b.tile[1] - unit.tile[1]))[0];
                if (threat) await commands.order([unit.id], 2, threat.id);
                else if (!guards.has(unit.id) || attempt % 10 === 0) await commands.order([unit.id], 4, undefined,
                    [plant.tile[0] - 2, plant.tile[1] - 2]);
                guards.set(unit.id, plant.id);
            }
            if (!plants.length) for (const plant of state.plants.filter(object => object.owner !== 'Russians')) {
                await commands.order(['BORIS', 'HTNK', 'HTK', 'SHK', 'E2'], 4, undefined, [plant.tile[0] - 2, plant.tile[1] - 2]); break;
            }
        }
        await commands.step(60, { defend: false }); state = await inspect('original-power-objective-' + attempt);
    }
    assert(state.fired.some(([id]) => id === '0952ED0C'), 'Source power and Jurassic transition did not execute');
    }
    if (!state.fired.some(([id]) => id === '0BDCD47C')) {
        report.jurassicEntry = state;
        const jurassicCheckpoint = await session.page.evaluate(() => {
            const g = window.__ra2debug.game; return g.campaign.journal.capture(g);
        });
        await fs.writeFile(path.join(out, 'jurassic-checkpoint.json'), JSON.stringify(jurassicCheckpoint) + '\n');
        await session.page.screenshot({ path: path.join(out, 'native-original-jurassic-entry.png') });
    }
    const jurassic = await session.page.evaluate(() => {
        const tile = window.__ra2debug.game.map.getTileAtWaypoint(68); return [tile.rx, tile.ry];
    });
    let formed = false;
    for (let attempt = 0; attempt < 260 && !state.fired.some(([id]) => id === '0BDCD47C'); attempt++) {
        if (!state.inputLocked && !formed) {
            await commands.order(['BORIS', 'SHK', 'E2', 'SENGINEER'], 0, jurassic);
            await commands.order(['HTNK', 'HTK'], 0, [jurassic[0] - 3, jurassic[1] - 1]);
            formed = true;
        }
        if (!state.inputLocked) {
            const threats = await session.page.evaluate(center => {
                const g = window.__ra2debug.game, shroud = g.mapShroudTrait.getPlayerShroud(g.localPlayer);
                return g.world.getAllObjects().filter(object => /^DNO/.test(object.name)
                    && object.isSpawned && !object.isDestroyed && !shroud.isShrouded(object.tile, object.tileElevation))
                    .map(object => ({ id: object.id, tile: [object.tile.rx, object.tile.ry], distance: Math.hypot(object.tile.rx - center[0], object.tile.ry - center[1]) }))
                    .sort((a, b) => a.distance - b.distance);
            }, jurassic);
            for (const unit of state.own.filter(object => army.includes(object.name))) {
                const target = threats.find(target => Math.hypot(unit.tile[0] - target.tile[0], unit.tile[1] - target.tile[1]) < 7);
                if (target) await commands.order([unit.id], 2, target.id);
            }
        }
        await commands.step(45, { defend: false }); state = await inspect('original-jurassic-survival-' + attempt);
        assert(state.own.some(object => object.name === 'BORIS'), 'Original Boris was lost in Jurassic survival');
    }
    assert(state.fired.some(([id]) => id === '0BDCD47C'), 'Source return to San Francisco did not execute');
    report.returnToSanFrancisco = state;
    await fs.writeFile(path.join(out, 'return-checkpoint.json'), JSON.stringify(await session.page.evaluate(() => {
        const g = window.__ra2debug.game; return g.campaign.journal.capture(g);
    })) + '\n');
    await session.page.screenshot({ path: path.join(out, 'native-original-time-return.png') });
    report.status = 'PASS_NATIVE_SOURCE_TIME_MACHINE_POWER_JURASSIC_AND_RETURN_STAGES';
    if (process.argv.includes('--finish')) {
        for (let attempt = 0; attempt < 40 && state.inputLocked; attempt++) {
            await commands.step(60, { defend: false }); state = await inspect('original-return-briefing-' + attempt);
        }
        assert(!state.inputLocked, 'Source return briefing did not unlock player input');
        if (!state.fired.some(([id]) => id === '0962D87C')) {
            const yard = state.landmarks.find(object => object.name === 'NACNST' && ['Soviet2House', 'Russians'].includes(object.owner));
            assert(yard, 'Original restored Soviet base is absent');
            await commands.order(army, 4, undefined, [yard.tile[0] + 4, yard.tile[1] + 4]);
        }
        for (let attempt = 0; attempt < 70 && !state.fired.some(([id]) => id === '0962D87C'); attempt++) {
            await commands.step(120, { defend: false }); state = await inspect('original-soviet-base-contact-' + attempt);
        }
        assert(state.fired.some(([id]) => id === '0962D87C'), 'Original Soviet-base contact did not occur');
        await commands.step(60); state = await inspect('original-soviet-base-controlled');
        if (process.argv.includes('--base-only')) {
            for (let i = 0; i < 30; i++) await commands.step(120, { defend: false });
            report.baseContact = await commands.inspect('original-soviet-base-stable-3600-ticks');
            report.status = 'PASS_NATIVE_SOVIET01_BOTH_ORIGINAL_TIME_TRAVELS_BASE_CONTACT_AND_3600_STABLE_TICKS';
        } else {
        const money = await commands.inspect('original-final-goal-economy'); report.baseContact = money;
        if (!process.argv.includes('--transport-only')) {
            if (state.own.some(object => object.name === 'NAWEAP')) await commands.queue('HTK', 2);
            if (state.own.some(object => object.name === 'NAHAND')) await commands.queue('E2', 6);
        }
        if (!process.argv.includes('--transport-only')) {
        await commands.order(army, 4, undefined, [76, 99]);
        for (let attempt = 0; attempt < 50; attempt++) {
            await commands.step(90, { defend: false }); state = await inspect('ordinary-shore-reconnaissance-' + attempt);
            const threats = state.landmarks.filter(object => object.visible && (object.name === 'GTGCAN'
                || object.name === 'YAGGUN' && Math.hypot(object.tile[0] - 70, object.tile[1] - 100) < 12));
            if (threats[0]) await commands.order(army, 2, threats[0].id);
            else if (state.own.some(object => ['BORIS', 'HTNK'].includes(object.name)
                && Math.hypot(object.tile[0] - 76, object.tile[1] - 99) < 5)) break;
            else if (attempt % 6 === 0) await commands.order(army, 4, undefined, [76, 99]);
        }
        for (let attempt = 0; attempt < 120; attempt++) {
            const threats = state.landmarks.filter(object => object.visible && (object.name === 'GTGCAN'
                || object.name === 'YAGGUN' && Math.hypot(object.tile[0] - 70, object.tile[1] - 100) < 12));
            if (!threats.length) break;
            await commands.order(['BORIS', 'HTNK', 'SHK', 'E2'], 2, threats[0].id);
            await commands.step(120, { defend: false }); state = await inspect('ordinary-shore-defense-clearance-' + attempt);
        }
        }
        let boat = state.own.find(object => object.name === 'SAPC');
        if (!boat) {
            await commands.queue('SAPC', 1);
            for (let attempt = 0; attempt < 60 && !boat; attempt++) {
                await commands.step(90); state = await inspect('ordinary-replacement-transport-' + attempt);
                boat = state.own.find(object => object.name === 'SAPC');
            }
        }
        assert(boat, 'Ordinary naval production did not provide a transport');
        let cargo = boat.passengers?.length ? boat.passengers.map(object => object.id)
            : [state.own.find(object => object.name === 'BORIS'), ...state.own.filter(object => object.name === 'HTNK')
                .sort((a, b) => b.health - a.health).slice(0, 2)]
                .filter(Boolean).slice(0, 2).map(object => object.id);
        if (!boat.passengers?.length) cargo = await session.page.evaluate(({ id, preferred }) => {
            const g = window.__ra2debug.game, boat = g.getObjectById(id);
            let capacity = boat.transportTrait.getAvailableCapacity(); const result = [];
            const units = g.localPlayer.getOwnedObjects().filter(object => object.isUnit() && object.isSpawned && !object.isDestroyed
                && [...preferred, 'HTK', 'SHK', 'E2'].some(value => value === object.id || value === object.name))
                .sort((a, b) => Number(preferred.includes(b.id)) - Number(preferred.includes(a.id))
                    || ['HTK', 'SHK', 'E2'].indexOf(a.name) - ['HTK', 'SHK', 'E2'].indexOf(b.name)
                    || b.healthTrait.health - a.healthTrait.health);
            for (const unit of units) {
                if (result.some(id => g.getObjectById(id).name === 'HTK') && unit.name === 'HTK') continue;
                if (unit.rules.size > capacity) continue;
                capacity -= unit.rules.size; result.push(unit.id);
            }
            return result;
        }, { id: boat.id, preferred: cargo });
        assert(cargo.length, 'An ordinary surviving island squad is required');
        if (!boat.passengers?.length) {
        const beach = await session.page.evaluate(({ id, passengerId }) => {
            const g = window.__ra2debug.game, boat = g.getObjectById(id), passenger = g.getObjectById(passengerId);
            const candidates = g.map.tiles.getAll().filter(tile => g.map.mapBounds.isWithinPlayerBounds(tile)
                && g.map.terrain.getPassableSpeed(tile, boat.rules.speedType, false, false) > 0
                && g.map.terrain.getPassableSpeed(tile, passenger.rules.speedType, passenger.isInfantry(), false) > 0
                && !g.map.terrain.findObstacles({ tile, onBridge: false }, boat).length)
                .sort((a, b) => Math.hypot(a.rx - boat.tile.rx, a.ry - boat.tile.ry) - Math.hypot(b.rx - boat.tile.rx, b.ry - boat.tile.ry));
            const reachable = (unit, tile) => g.map.terrain.computePath(unit.rules.speedType, unit.isInfantry(),
                unit.tile, unit.onBridge, tile, false, { bestEffort: false }).some(node => node.tile === tile);
            const target = candidates.find(tile => reachable(boat, tile) && reachable(passenger, tile));
            if (!target) throw Error('Original shore has no shared ordinary boarding route');
            return [target.rx, target.ry];
        }, { id: boat.id, passengerId: cargo[0] });
        report.boardingBeach = beach;
        await commands.order([boat.id], 0, undefined, beach);
        for (const id of cargo) await commands.order([id], 0, undefined, beach);
        await commands.step(600, { defend: false }); state = await inspect('ordinary-boarding-beach');
        for (const id of cargo) await commands.order([id], 17, boat.id);
        for (let attempt = 0; attempt < 100; attempt++) {
            if (attempt > 0 && attempt % 10 === 0) for (const id of cargo) await commands.order([id], 17, boat.id);
            await commands.step(60, { defend: false }); state = await inspect('ordinary-island-transport-boarding-' + attempt);
            assert(state.own.some(object => object.id === boat.id), 'Ordinary transport was lost during boarding');
            const current = state.own.find(object => object.id === boat.id);
            cargo = cargo.filter(id => current.passengers?.some(object => object.id === id)
                || state.own.some(object => object.id === id));
            if (current.passengers?.length === cargo.length) break;
        }
        assert(cargo.length, 'The island squad was lost before boarding');
        assert.equal(state.own.find(object => object.id === boat.id)?.passengers?.length, cargo.length, 'Ordinary island transport did not load its squad');
        }
        await commands.order([boat.id], 0, undefined, [45, 72]);
        for (let attempt = 0; attempt < 140; attempt++) {
            await commands.step(60, { defend: false }); state = await inspect('ordinary-island-crossing-' + attempt);
            const current = state.own.find(object => object.id === boat.id); assert(current, 'Original transport was lost on the crossing');
            if (Math.hypot(current.tile[0] - 45, current.tile[1] - 72) <= 2) break;
        }
        await commands.order([boat.id], 10);
        for (let attempt = 0; attempt < 60 && state.own.find(object => object.id === boat.id)?.passengers?.length; attempt++) {
            await commands.step(60, { defend: false }); state = await inspect('ordinary-island-unloading-' + attempt);
        }
        assert.equal(state.own.find(object => object.id === boat.id)?.passengers?.length, 0, 'Ordinary island squad did not unload');
        for (let attempt = 0; attempt < 220 && state.result !== 'victory'; attempt++) {
            if (!state.inputLocked) {
                const dominator = state.landmarks.find(object => object.name === 'YAPPPT');
                const defenders = state.enemies.filter(object => Math.hypot(object.tile[0] - 43, object.tile[1] - 69) < 10)
                    .sort((a, b) => a.health - b.health);
                if (defenders[0]) await commands.order(cargo, 2, defenders[0].id);
                else if (dominator?.visible) await commands.order(cargo, 2, dominator.id);
                else {
                    const target = await commands.attackVisible(['HTNK', 'SHK', 'E2', 'HTK'], 'YuriCountry');
                    if (!target || attempt % 6 === 0) await commands.order(['BORIS', 'HTNK', 'SHK', 'E2', 'HTK'], 4, undefined, [43, 72]);
                }
            }
            if (stopMedia) await fs.writeFile(path.join(out, 'before-final-goal-checkpoint.json'),
                JSON.stringify(await session.page.evaluate(() => {
                    const g = window.__ra2debug.game; return g.campaign.journal.capture(g);
                }))+'\n');
            await commands.step(120, { defend: false }); state = await inspect('original-final-dominator-assault-' + attempt);
        }
        assert.equal(state.result, 'victory', 'Original Psychic Dominator objective remains');
        report.victory = await commands.inspect('original-source-victory');
        if (stopMedia) {
            report.resultDispatch = await session.page.evaluate(() => {
                const d = window.__ra2debug, manager = d.gameScreen.gameTurnMgr;
                const before = { tick: d.game.currentTick, result: d.game.campaign.result };
                manager.setPaused(false); manager.setCampaignPaused(false); manager.doGameTurn(performance.now());
                return { before, after: { tick: d.game.currentTick, result: d.game.campaign.result } };
            });
            assert.equal(report.resultDispatch.after.result, 'victory');
            await session.page.waitForSelector('[data-campaign-result="victory"][data-score-phase="complete"]',
                { timeout: 300000 });
            await session.page.screenshot({ path: path.join(out, 'native-source-victory-score.png') });
            report.naturalResultMediaAndScoreReached = true;
        }
        report.status = 'PASS_NATIVE_SOVIET01_ALL_ORIGINAL_OBJECTIVES_AND_VICTORY';
        }
    }
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []);
    assert.deepEqual(report.consoleErrors ?? [], []);
} catch (error) { report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1; }
finally {
    if (session?.page) report.missingCell = await session.page.evaluate(() => window.__sovietMissingCell).catch(() => undefined);
    if (stopMedia) await stopMedia().then(value => { report.missionMedia = value; }).catch(error => {
        report.status = 'FAIL'; report.mediaObserverError = error.stack; process.exitCode = 1;
    });
    if (commands) report.finalWorld = await commands.inspect('final-native-observation').catch(() => undefined);
    if (session?.page) await session.page.evaluate(() => {
        const g = window.__ra2debug?.game;
        return g?.campaign && { identity: { gameId: g.id, timestamp: g.startTimestamp, launch: g.campaign.launch },
            commands: g.campaign.journal.commands };
    }).then(value => value && fs.writeFile(path.join(out, 'applied-source-journal.json'), JSON.stringify(value) + '\n')).catch(() => {});
    if (session?.page) await session.page.evaluate(async () => {
        const g = window.__ra2debug?.game;
        return g?.campaign?.journal.trusted && !g.campaign.result && !g.campaign.failure ? g.campaign.journal.capture(g) : undefined;
    }).then(value => value && fs.writeFile(path.join(out, 'last-trusted-checkpoint.json'), JSON.stringify(value) + '\n')).catch(() => {});
    if (session?.page) await session.page.screenshot({ path: path.join(out, 'native-final.png') }).catch(() => {});
    await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    await session?.app.close();
}
console.log(JSON.stringify({ status: report.status, error: report.error, out }));
