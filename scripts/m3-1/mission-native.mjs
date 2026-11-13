import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { _electron as electron } from '@playwright/test';

const root = path.resolve(import.meta.dirname, '../..');
const out = path.resolve(process.argv[2] || path.join(root, '.artifacts/m3-1/mission-' + Date.now()));
await fs.mkdir(out, { recursive: false });
const profile = path.join(out, 'profile'); await fs.mkdir(profile);
await fs.writeFile(path.join(profile, 'resource-registration.json'), JSON.stringify({ schemaVersion: 1, directory: path.resolve(root, '../ra2-hd/.local') }));
const report = { status: 'RUNNING', scope: 'Assisted serialized player-command verification with accelerated native simulation; distinct from physical-input normal play.',
    sourceHead: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    runtime: JSON.parse(await fs.readFile(path.join(root, '.artifacts/m3-1/review-runtime/package.json'), 'utf8')),
    samples: [], errors: [], consoleErrors: [], commands: [], screenshots: [] };
let app, page;
const save = () => fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
async function shot(name) { await page.screenshot({ path: path.join(out, name + '.png') }); report.screenshots.push(name + '.png'); await save(); }
async function inspect() {
    return await page.evaluate(() => {
        const d = window.__ra2debug, g = d.game, c = g.campaign, p = g.localPlayer;
        return { tick: g.currentTick, status: g.status, failure: c.failure, result: c.result, locked: c.inputLocked, credits: p.credits,
            variables: [...c.machine.variables], hash: g.getHash(), rng: g.prng.snapshot(), mission: c.checkpointState(),
            player: p.getOwnedObjects(true).filter(o => !o.isDestroyed).map(o => ({ id: o.id, name: o.name, spawned: o.isSpawned, tile: o.tile && [o.tile.rx, o.tile.ry], health: o.healthTrait.health,
                sleeping: o.campaignSleeping, tasks: o.unitOrderTrait?.getTasks().map(t => t.constructor.name) })),
            queues: p.production.getAllQueues().map(q => ({ type: q.type, status: q.status, items: q.getAll().map(i => ({ name: i.rules.name, progress: i.progress, quantity: i.quantity })) })),
            trace: c.trace.slice(-16), scriptTrace: c.teams.trace.slice(-12), pending: c.pendingMedia };
    });
}
async function step(ticks) {
    for (let remaining = ticks; remaining > 0; remaining -= 100) {
        const state = await page.evaluate(count => {
            const d = window.__ra2debug, g = d.game, manager = d.gameScreen.gameTurnMgr;
            manager.setCampaignPaused(false);
            try { for (let i = 0; i < count && !g.campaign.failure && !g.campaign.result; i++) manager.doGameTurn(performance.now()); }
            finally { manager.setCampaignPaused(true); }
            return { tick: g.currentTick, failure: g.campaign.failure, result: g.campaign.result };
        }, Math.min(remaining, 100));
        if (state.failure) throw new Error(state.failure);
        if (state.result) return;
    }
}
async function sample(label) { const state = await inspect(); report.samples.push({ label, ...state }); await save(); console.log(label, state.tick, state.credits, state.player.length); return state; }
async function build(name) {
    report.commands.push({ action: 'queue-building', name });
    await page.evaluate(name => { const d = window.__ra2debug, r = d.game.rules.getBuilding(name), q = d.localPlayer.production.getQueueForObject(r); d.actionsApi.queueForProduction(q.type, r.type, name, 1); }, name);
    for (let i = 0; i < 120; i++) {
        await step(60);
        const placement = await page.evaluate(name => {
            const d = window.__ra2debug, g = d.game, p = g.localPlayer, r = g.rules.getBuilding(name), q = p.production.getQueueForObject(r);
            if (q.status !== 3) return;
            const conyard = [...p.buildings].find(b => b.rules.constructionYard), center = conyard.tile, worker = g.getConstructionWorker(p);
            for (let radius = 2; radius < 14; radius++) for (let y = center.ry - radius; y <= center.ry + radius; y++) for (let x = center.rx - radius; x <= center.rx + radius; x++) {
                const tile = g.map.tiles.getByMapCoords(x, y);
                if (tile && worker.canPlaceAt(name, tile, { normalizedTile: true })) { d.actionsApi.placeBuilding(name, x, y); return [x, y]; }
            }
            throw new Error('No valid building placement: ' + name);
        }, name);
        if (placement) {
            report.commands.push({ action: 'place-building', name, placement }); await step(90);
            assert((await inspect()).player.some(object => object.name === name), 'Placement must create ' + name); return;
        }
    }
    throw new Error('Building production did not complete: ' + name);
}
try {
    app = await electron.launch({ executablePath: await fs.realpath(path.join(root, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron')),
        args: [path.join(root, '.artifacts/m3-1/review-runtime')], cwd: '/private/tmp', timeout: 60000,
        env: { ...process.env, RA2_DESKTOP_USER_DATA: profile, RA2_DESKTOP_NO_DISCOVERY: '1', RA2_CAMPAIGN_RESOURCE_ROOT: path.join(root, '.local/campaign'), RA2_CAMPAIGN_FROZEN_TERRAIN: '1' } });
    app.process().stdout?.on('data', chunk => { void fs.appendFile(path.join(out, 'electron.log'), chunk); });
    app.process().stderr?.on('data', chunk => { void fs.appendFile(path.join(out, 'electron.log'), chunk); });
    page = await app.firstWindow({ timeout: 30000 });
    page.on('pageerror', error => report.errors.push(error.stack));
    page.on('console', message => { if (message.type() === 'error') report.consoleErrors.push(message.text()); });
    await page.locator('[data-edition=ra2]').click({ timeout: 60000 });
    await page.waitForFunction(() => window.__ra2debug?.mainMenuController && document.querySelector('.hd-menu-scene'), undefined, { timeout: 90000 });
    const language = await page.evaluate(() => document.documentElement.lang);
    const labels = JSON.parse(await fs.readFile(path.join(root, `public/res/locale/${language}.json`), 'utf8'));
    await page.evaluate(() => window.__ra2debug.generalOptions.graphics.hdEnabled.value = false);
    await page.getByRole('button', { name: labels['hd:menucampaign'], exact: true }).click();
    await page.waitForFunction(() => window.__ra2debug.mainMenuController.screens.get(22)?.prepared);
    await page.evaluate(() => window.__ra2debug.mainMenuController.screens.get(22).launchDiagnostic());
    await page.waitForFunction(() => window.__ra2debug?.game?.status === 1 && window.__ra2debug.gameScreen, undefined, { timeout: 90000 });
    await page.evaluate(() => window.__ra2debug.gameScreen.gameTurnMgr.setCampaignPaused(true));
    for (let i = 0; i < 45; i++) { await step(60); const state = await inspect(); if (!state.locked) break; }
    await step(90);
    const opening = await sample('opening'); assert.equal(opening.locked, false); assert(opening.player.some(o => o.name === 'NACNST'));
    await shot('01-opening-unlocked');
    if (process.argv.includes('--transport')) {
        report.scope = 'Bounded diagnostic probe: explicitly request unchanged original reinforcement TeamTypes, then execute their real transport/script pipeline. Not normal-entry, optional-trigger discovery or victory evidence.';
        const created = await page.evaluate(() => { const g = window.__ra2debug.game, c = g.campaign;
            const teams = ['0AA795CC', '09D3357C'].map(id => c.teams.create(id, true));
            window.__m3TransportMembers = teams.flatMap(t => [...t.members]);
            return teams.map(t => ({ id: t.id, type: t.type, owner: t.owner.name,
                members: t.members.map(o => ({ id: o.id, name: o.name, spawned: o.isSpawned, inTransport: !!o.limboData?.inTransport,
                    passengers: o.transportTrait?.units.map(p => p.id) })) }));
        });
        report.transportCreation = created;
        assert.equal(created[0].members.filter(o => o.name === 'HTNK' && o.inTransport && !o.spawned).length, 4);
        assert.equal(created[1].members.filter(o => o.name === 'SENGINEER' && o.inTransport && !o.spawned).length, 4);
        for (let i = 0; i < 40; i++) {
            await step(150);
            const state = await page.evaluate(() => { const g = window.__ra2debug.game, c = g.campaign;
                return { tick: g.currentTick, failure: c.failure, traces: c.teams.trace.filter(t => ['0AA795CC', '09D3357C', '084311CC'].includes(t.team)),
                    originalReturnActions: c.trace.filter(a => a.key === '0C67682C'),
                    members: window.__m3TransportMembers.map(o => ({ id: o.id, name: o.name, owner: o.owner?.name, spawned: o.isSpawned, disposed: o.isDisposed,
                        inTransport: !!o.limboData?.inTransport, tile: o.tile && [o.tile.rx, o.tile.ry] })) };
            });
            report.transport = state; await save();
            if (state.traces.some(t => t.opcode === 37) && state.members.filter(o => o.name === 'HTNK' && o.owner === 'Player House' && o.spawned).length === 4
                && state.members.filter(o => o.name === 'SENGINEER' && o.owner === 'Player House' && o.spawned).length === 4) break;
        }
        const final = report.transport;
        assert.equal(final.members.filter(o => o.name === 'HTNK' && o.owner === 'Player House' && o.spawned).length, 4);
        assert.equal(final.members.filter(o => o.name === 'SENGINEER' && o.owner === 'Player House' && o.spawned).length, 4);
        assert(final.traces.some(t => t.team === '084311CC' && t.opcode === 37), 'Original return team must withdraw the transport');
        assert(final.originalReturnActions.some(a => a.opcode === 4), 'Original arrival/timer trigger must recruit the returning transport');
        await shot('02-original-transport-pipeline');
        report.status = 'PASS_BOUNDED_ORIGINAL_PRELOAD_UNLOAD_TRANSFER_AND_WITHDRAWAL';
    } else if (process.argv.includes('--defeat')) {
        await page.waitForFunction(() => window.__ra2debug.game.campaign.pendingMedia.length === 0, undefined, { timeout: 90000 });
        await page.evaluate(() => { const d = window.__ra2debug, target = [...d.localPlayer.buildings].find(b => b.rules.constructionYard);
            d.actionsApi.orderUnits(d.localPlayer.getOwnedObjects().filter(o => o.isUnit() && o.attackTrait).map(o => o.id), 3, target.id); });
        for (let i = 0; i < 60; i++) { await step(150); if (!(await inspect()).player.some(o => o.name === 'NACNST')) break; }
        const lostBase = await sample('construction-yard-destroyed'); assert(!lostBase.player.some(o => o.name === 'NACNST'));
        await step(1200); await sample('original-emergency-reinforcements');
        for (let i = 0; i < 65; i++) {
            const issued = await page.evaluate(() => { const d = window.__ra2debug, units = d.localPlayer.getOwnedObjects().filter(o => o.isUnit() && o.isSpawned && o.zone !== 2);
                const shooters = units.filter(o => o.attackTrait), engineers = units.filter(o => o.rules.engineer);
                if (shooters.length <= 1 && engineers.length <= 1) return false;
                const target = engineers.length > 1 ? engineers[0] : shooters[0];
                if (!target) return false;
                d.actionsApi.orderUnits(shooters.filter(o => o !== target).map(o => o.id), 3, target.id); return target.id; });
            if (!issued) break;
            report.commands.push({ action: 'force-attack-owned-unit', target: issued }); await step(90);
        }
        await page.evaluate(() => { const d = window.__ra2debug;
            d.actionsApi.orderUnits(d.localPlayer.getOwnedObjects().filter(o => o.isUnit() && o.isSpawned).map(o => o.id), 1, 98, 83); });
        for (let i = 0; i < 50; i++) { await step(150); const state = await inspect(); if (state.result) break; }
        const defeat = await sample('original-failure-result'); assert.equal(defeat.result, 'defeat');
        assert(defeat.trace.some(action => action.key === '0A115A1C' && action.opcode === 2));
        await page.evaluate(() => { const manager = window.__ra2debug.gameScreen.gameTurnMgr;
            manager.setCampaignPaused(false); manager.doGameTurn(performance.now()); manager.setCampaignPaused(true); });
        await page.waitForSelector('[data-game-result-banner=defeat]', { timeout: 10000 }); await shot('02-original-defeat-banner');
        await page.waitForSelector('[data-campaign-result=defeat]', { timeout: 90000 });
        await page.waitForFunction(() => !window.__ra2debug.mainMenu.sidebarCollapsed && window.__ra2debug.mainMenu.sidebarSlots.every(slot => slot.getAnimationRunner().isStopped()));
        await shot('03-campaign-failure-result');
        report.status = 'PASS_ORIGINAL_FAILURE_FROM_ORDINARY_COMMANDS';
    } else {
    await page.evaluate(() => { const d = window.__ra2debug; d.actionsApi.orderUnits(d.localPlayer.getOwnedObjects().filter(o => o.name === 'E2').map(o => o.id), 5); });
    await build('NAPOWR'); await build('NAHAND'); await build('NAREFN');
    await sample('base-produced'); await shot('02-base-produced');
    await page.evaluate(() => {
        const d = window.__ra2debug, p = d.localPlayer.production, r = d.game.rules.getObject('SENGINEER', 3);
        d.actionsApi.queueForProduction(p.getQueueForObject(r).type, r.type, r.name, 2);
    });
    await step(900);
    await sample('engineers-produced');
    // Store through the actual pause-menu save operation, then exit and load
    // through the original campaign menu. No trigger or objective is altered.
    await page.waitForFunction(() => window.__ra2debug.game.campaign.pendingMedia.length === 0, undefined, { timeout: 90000 });
    await page.evaluate(async () => { const d = window.__ra2debug; window.__m3OldWorld = d.game; await d.gameScreen.menu.campaignOperations.save(); });
    const before = await sample('saved');
    await step(300); const referenceContinuation = await sample('reference-continuation');
    await page.getByRole('button', { name: labels['hd:campaignreturn'], exact: true }).click();
    await page.waitForFunction(() => window.__ra2debug.mainMenuController.screens.get(22)?.saved, undefined, { timeout: 30000 });
    const checkpoint = await page.evaluate(() => window.__ra2debug.mainMenuController.screens.get(22).saved);
    await fs.writeFile(path.join(out, 'mid-mission-checkpoint.json'), JSON.stringify(checkpoint));
    const retail = JSON.parse(await fs.readFile(path.join(root, `public/res/locale/retail-ra2-${language}.json`), 'utf8')).labels;
    await page.getByRole('button', { name: retail['gui:load'], exact: true }).click();
    await page.waitForFunction(() => window.__ra2debug?.game?.status === 1 && window.__ra2debug.gameScreen
        && window.__ra2debug.game !== window.__m3OldWorld, undefined, { timeout: 90000 });
    await page.evaluate(() => window.__ra2debug.gameScreen.gameTurnMgr.setCampaignPaused(true));
    const restored = await sample('restored');
    assert.equal(await page.evaluate(() => window.__ra2debug.game !== window.__m3OldWorld), true);
    assert.equal(restored.hash, before.hash); assert.deepEqual(restored.mission, before.mission); assert.deepEqual(restored.rng, before.rng);
    await shot('03-mid-mission-restored');
    await page.evaluate(() => { const d = window.__ra2debug; d.gameScreen.menu.close(); d.gameScreen.gameTurnMgr.setCampaignPaused(true); });
    await step(300); const continuation = await sample('continued-after-restore');
    assert.equal(continuation.hash, referenceContinuation.hash); assert.deepEqual(continuation.mission, referenceContinuation.mission);
    assert.deepEqual(continuation.rng, referenceContinuation.rng);
    report.status = 'PASS_BASE_AND_MID_MISSION_RECONSTRUCTION';
    if (process.argv.includes('--combat')) {
        await page.evaluate(() => { const d = window.__ra2debug, r = d.game.rules.getObject('E2', 3), q = d.localPlayer.production.getQueueForObject(r);
            d.actionsApi.queueForProduction(q.type, r.type, r.name, 24); });
        await step(1800); await sample('army-produced');
        const army = async (x, y) => {
            report.commands.push({ action: 'attack-move-army', x, y });
            await page.evaluate(({ x, y }) => { const d = window.__ra2debug;
                d.actionsApi.orderUnits(d.localPlayer.getOwnedObjects().filter(o => o.isUnit() && o.attackTrait && !o.harvesterTrait && o.zone !== 2).map(o => o.id), 4, x, y);
                const tile = d.game.map.tiles.getByMapCoords(x, y); d.worldInteraction.minimapHandler.panToTile(tile);
            }, { x, y });
        };
        await army(98, 96); await step(900); await sample('advance-first-base'); await shot('04-first-base-advance');
        await army(99, 88); await step(1800); await sample('first-base'); await shot('05-first-base');
        const capture = async name => {
            const issued = await page.evaluate(name => { const d = window.__ra2debug, g = d.game, p = g.localPlayer;
                const engineer = p.getOwnedObjects().find(o => o.name === 'SENGINEER' && o.isSpawned);
                const target = g.world.getAllObjects().filter(o => o.name === name && !o.isDestroyed && o.owner !== p)
                    .filter(o => name !== 'CABHUT' || o.cabHutTrait.canRepairBridge())
                    .filter(o => !g.mapShroudTrait.getPlayerShroud(p).isShrouded(o.tile, o.tileElevation)).sort((a, b) =>
                        Math.hypot(a.tile.rx - engineer?.tile.rx, a.tile.ry - engineer?.tile.ry) - Math.hypot(b.tile.rx - engineer?.tile.rx, b.tile.ry - engineer?.tile.ry))[0];
                if (!engineer || !target) return false;
                d.actionsApi.orderUnits([engineer.id], target.cabHutTrait ? 15 : 7, target.id);
                return { unit: engineer.id, target: target.id, tile: [target.tile.rx, target.tile.ry], repairableBridge: target.cabHutTrait?.canRepairBridge() };
            }, name);
            report.commands.push({ action: 'capture', name, issued }); await step(1800);
            if (issued) {
                const completed = await page.evaluate(({ target, name }) => { const d = window.__ra2debug, object = d.game.getObjectById(target);
                    return name === 'CABHUT' ? !object.cabHutTrait.canRepairBridge() : object.owner === d.localPlayer;
                }, { target: issued.target, name });
                assert(completed, 'Engineer operation must actually complete: ' + name);
            }
            return issued;
        };
        assert(await capture('CABHUT'), 'The bridge hut must be discovered before capture');
        await sample('bridge-repair'); await shot('06-bridge-repair');
        await army(75, 85); await step(1800); await sample('urban-combat'); await shot('07-urban-combat');
        await army(64, 78); await step(1800); await sample('airport-advance');
        await capture('CAAIRP'); await sample('airport-capture'); await shot('08-airport');
        await army(60, 55); await step(1800); await sample('pentagon-approach'); await shot('09-pentagon-approach');
        for (let i = 0; i < 70; i++) {
            const target = await page.evaluate(() => { const d = window.__ra2debug, g = d.game;
                const target = g.world.getAllObjects().find(o => /^CAWA2[ABCD]$/.test(o.name) && !o.isDestroyed
                    && !g.mapShroudTrait.getPlayerShroud(d.localPlayer).isShrouded(o.tile, o.tileElevation));
                if (!target) return;
                d.actionsApi.orderUnits(d.localPlayer.getOwnedObjects().filter(o => o.isUnit() && o.attackTrait && !o.harvesterTrait && o.zone !== 2).map(o => o.id), 2, target.id);
                d.worldInteraction.minimapHandler.panToTile(target.tile); return { id: target.id, name: target.name, health: target.healthTrait.health };
            });
            if (!target) await army(60, 40);
            report.commands.push({ action: 'attack-visible-pentagon', target });
            await step(300); const current = await sample('pentagon-' + i);
            if (i % 5 === 0) await shot('10-pentagon-' + i);
            if (current.result) break;
        }
        const final = await sample('mission-result'); assert.equal(final.result, 'victory');
        assert.equal(final.variables.filter(([id, value]) => ['1', '2', '3', '4'].includes(id) && value).length, 4);
        report.status = 'PASS_ASSISTED_ORIGINAL_VICTORY_AND_RESTORE';
    }
    }
    assert.equal(report.errors.length, 0); assert.equal(report.consoleErrors.length, 0);
} catch (error) { report.status = 'FAIL'; report.failure = error.stack; await sample('failure-state').catch(() => {}); await shot('failure').catch(() => {}); }
finally { await save(); await app?.close(); console.log(out); }
