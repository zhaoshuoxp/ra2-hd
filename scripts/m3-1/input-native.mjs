import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { _electron as electron } from '@playwright/test';

const root = path.resolve(import.meta.dirname, '../..');
const out = path.resolve(process.argv[2] || path.join(root, '.artifacts/m3-1/input-' + Date.now()));
await fs.mkdir(out, { recursive: false });
const profile = path.join(out, 'profile'); await fs.mkdir(profile);
await fs.writeFile(path.join(profile, 'resource-registration.json'), JSON.stringify({ schemaVersion: 1, directory: path.resolve(root, '../ra2-hd/.local') }));
const report = { status: 'RUNNING', platform: process.platform + '-' + process.arch,
    sourceHead: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    scope: 'Native mouse and keyboard commands with automatic simulation. Camera positioning and state inspection are assisted; no injected actions, simulation ticks, objective variables or debug commands.',
    errors: [], consoleErrors: [], screenshots: [], stages: [], inputs: [] };
let app, page, labels;
const save = () => fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
async function shot(name) { await page.screenshot({ path: path.join(out, name + '.png') }); report.screenshots.push(name + '.png'); await save(); }
async function stage(name) {
    const state = await page.evaluate(() => {
        const d = window.__ra2debug, g = d.game, c = g?.campaign;
        return c ? { tick: g.currentTick, hash: g.getHash(), result: c.result, failure: c.failure, diagnostic: c.launch.diagnostic,
            inspectionModified: c.inspectionModified, variables: [...c.machine.variables], trace: c.trace.slice(-24),
            player: g.localPlayer.getOwnedObjects(true).filter(o => !o.isDestroyed).map(o => ({ id: o.id, name: o.name, health: o.healthTrait.health,
                spawned: o.isSpawned, tile: o.tile && [o.tile.rx, o.tile.ry] })), credits: g.localPlayer.credits,
            commands: c.journal.commands.length, trusted: c.journal.trusted, media: [...c.pendingMedia],
            huts: g.world.getAllObjects().filter(o => o.cabHutTrait).map(o => ({ id: o.id, tile: [o.tile.rx, o.tile.ry],
                repairable: o.cabHutTrait.canRepairBridge() })),
            botCount: g.botManager.bots.size } : {};
    });
    report.stages.push({ name, ...state }); await save(); console.log(name, state.tick, state.result ?? '', state.player?.length ?? ''); return state;
}
async function unlock() { await page.evaluate(() => window.__ra2debug.gameScreen.pointer.unlock(true)); }
async function key(command) {
    const binding = await page.evaluate(command => window.__ra2debug.gameScreen.keyBinds.getHotKey(command), command);
    assert(binding, 'Missing hotkey ' + command);
    const names = { 27: 'Escape', 32: 'Space', 13: 'Enter', 9: 'Tab' };
    const chord = [binding.metaKey && 'Meta', binding.altKey && 'Alt', binding.ctrlKey && 'Control', binding.shiftKey && 'Shift',
        names[binding.keyCode] || String.fromCharCode(binding.keyCode)].filter(Boolean).join('+');
    await page.keyboard.press(chord); report.inputs.push({ key: command, chord });
}
async function point({ id, x, y, body = false }) {
    return await page.evaluate(async ({ id, x, y, body }) => {
        const d = window.__ra2debug, g = d.game;
        const object = id === undefined ? undefined : g.getObjectById(id);
        const tile = (object?.isBuilding() ? object.centerTile : object?.tile) ?? g.map.tiles.getByMapCoords(x, y);
        if (!tile) throw new Error('Missing input target tile');
        d.worldInteraction.minimapHandler.panToTile(tile);
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const position = object && !object.isBuilding() ? d.renderableManager.getRenderableByGameObject(object).getPosition().clone()
            : new window.THREE.Vector3((tile.rx + .5) * 256, tile.z * 128 * (Math.cos(Math.PI / 4) / Math.cos(Math.PI / 6)), (tile.ry + .5) * 256);
        const scene = d.worldScene, vector = position.project(scene.camera), viewport = scene.viewport;
        const canvas = d.renderer.getCanvas(), rect = canvas.getBoundingClientRect();
        const logicalWidth = Number(canvas.dataset.logicalWidth) || canvas.width, logicalHeight = Number(canvas.dataset.logicalHeight) || canvas.height;
        return { x: rect.left + (viewport.x + (vector.x + 1) * viewport.width / 2) * rect.width / logicalWidth,
            y: rect.top + (viewport.y + (1 - vector.y) * viewport.height / 2) * rect.height / logicalHeight - (body ? 8 : 0) };
    }, { id, x, y, body });
}
async function clickTarget(target, button = 'left') {
    await unlock(); const p = await point(target); await page.mouse.move(p.x, p.y); await page.waitForTimeout(80);
    await page.mouse.click(p.x, p.y, { button, delay: 35 }); report.inputs.push({ click: target, button, point: p });
}
async function sidebarPoint(name) {
    return await page.evaluate(name => {
        const d = window.__ra2debug, screen = d.gameScreen, model = screen.sidebarModel, card = screen.hud.sidebarCard;
        const index = model.activeTab.items.findIndex(item => item.target.rules?.name === name);
        if (index < 0) throw new Error('Cameo not in current tab: ' + name);
        const slot = index - card.pagingOffset, container = card.slotContainers[slot], size = card.getSlotSize();
        if (!container) throw new Error('Cameo not on current page: ' + name);
        const vector = new window.THREE.Vector3(size.width / 2, size.height / 2, 0);
        container.get3DObject().localToWorld(vector); vector.project(d.uiScene.getCamera());
        const viewport = d.uiScene.viewport, canvas = d.renderer.getCanvas(), rect = canvas.getBoundingClientRect();
        return { x: rect.left + (viewport.x + (vector.x + 1) * viewport.width / 2) * rect.width / (Number(canvas.dataset.logicalWidth) || canvas.width),
            y: rect.top + (viewport.y + (1 - vector.y) * viewport.height / 2) * rect.height / (Number(canvas.dataset.logicalHeight) || canvas.height) };
    }, name);
}
async function cameo(name, quantity = 1) {
    await key(name === 'E2' || name === 'SENGINEER' ? 'InfantryTab' : 'StructureTab'); await page.waitForTimeout(100); await unlock();
    const p = await sidebarPoint(name);
    for (let i = 0; i < quantity; i++) await page.mouse.click(p.x, p.y, { delay: 40 });
    report.inputs.push({ cameo: name, quantity, point: p });
}
async function waitTicks(count) {
    const target = await page.evaluate(count => window.__ra2debug.game.currentTick + count, count);
    await page.waitForFunction(target => { const g = window.__ra2debug?.game; return g?.campaign?.failure || g?.campaign?.result || g?.currentTick >= target; }, target, { timeout: 150000 });
    const failure = await page.evaluate(() => window.__ra2debug.game.campaign.failure); if (failure) throw new Error(failure);
}
async function build(name) {
    await cameo(name);
    await page.waitForFunction(name => { const d = window.__ra2debug; return d.localPlayer.production.getQueueForObject(d.game.rules.getBuilding(name)).status === 3; }, name, { timeout: 90000 });
    await cameo(name);
    const tile = await page.evaluate(name => {
        const d = window.__ra2debug, g = d.game, p = d.localPlayer, center = [...p.buildings].find(b => b.rules.constructionYard).tile;
        const worker = g.getConstructionWorker(p);
        for (let radius = 2; radius < 14; radius++) for (let y = center.ry - radius; y <= center.ry + radius; y++) for (let x = center.rx - radius; x <= center.rx + radius; x++) {
            const tile = g.map.tiles.getByMapCoords(x, y);
            if (tile && worker.canPlaceAt(name, tile)) return { x, y };
        }
        throw new Error('No legal building placement');
    }, name);
    await clickTarget(tile);
    await page.waitForFunction(name => [...window.__ra2debug.localPlayer.buildings].some(b => b.name === name && b.isSpawned), name, { timeout: 15000 });
    await stage('built-' + name);
}
async function army(x, y) {
    await unlock(); await key('CombatantSelect'); await key('CombatantSelect');
    assert(await page.evaluate(() => window.__ra2debug.game.getUnitSelection().getSelectedUnits().length > 0));
    await key('AttackMove'); await clickTarget({ x, y });
}
async function occupy(x, y) {
    const id = await page.evaluate(({ x, y }) => {
        const d = window.__ra2debug, g = d.game;
        return g.world.getAllObjects().find(o => o.tile?.rx === x && o.tile?.ry === y && o.garrisonTrait && !o.isDestroyed
            && !g.mapShroudTrait.getPlayerShroud(d.localPlayer).isShrouded(o.tile, o.tileElevation))?.id;
    }, { x, y });
    assert(id !== undefined, 'The civilian garrison must be visible');
    await unlock(); await key('CombatantSelect'); await key('CombatantSelect'); await clickTarget({ id, body: true });
    await page.waitForFunction(id => window.__ra2debug.game.getObjectById(id).garrisonTrait.getOccupants().length >= 8,
        id, { timeout: 90000 });
    report.inputs.push({ operation: 'garrison', id, x, y });
    await stage('garrison-' + id);
}
async function repairOrCapture(name) {
    const ids = await page.evaluate(name => {
        const d = window.__ra2debug, g = d.game, engineer = d.localPlayer.getOwnedObjects().find(o => o.name === 'SENGINEER' && o.isSpawned);
        const target = g.world.getAllObjects().filter(o => o.name === name && !o.isDestroyed && o.owner !== d.localPlayer)
            .filter(o => name !== 'CABHUT' || o.cabHutTrait.canRepairBridge())
            .filter(o => !g.mapShroudTrait.getPlayerShroud(d.localPlayer).isShrouded(o.tile, o.tileElevation))
            .sort((a, b) => Math.hypot(a.tile.rx - engineer?.tile.rx, a.tile.ry - engineer?.tile.ry) - Math.hypot(b.tile.rx - engineer?.tile.rx, b.tile.ry - engineer?.tile.ry))[0];
        if (!engineer || !target) throw new Error('Capture target or engineer unavailable: ' + name);
        return { engineer: engineer.id, target: target.id, repairable: target.cabHutTrait?.canRepairBridge() };
    }, name);
    await clickTarget({ id: ids.engineer, body: true });
    const selected = await page.evaluate(() => window.__ra2debug.game.getUnitSelection().getSelectedUnits().map(o => o.id));
    assert.deepEqual(selected, [ids.engineer], 'The mouse must select the engineer');
    await clickTarget({ id: ids.target, body: true });
    report.inputs.push({ operation: name === 'CABHUT' ? 'repair-bridge' : 'capture-airport', ...ids });
    await page.waitForFunction(({ target, name }) => { const d = window.__ra2debug, o = d.game.getObjectById(target);
        return name === 'CABHUT' ? !o.cabHutTrait.canRepairBridge() : o.owner === d.localPlayer;
    }, { target: ids.target, name }, { timeout: 90000 });
    await stage(name === 'CABHUT' ? 'bridge-repaired' : 'airport-captured');
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
    const retail = JSON.parse(await fs.readFile(path.join(root, `public/res/locale/retail-ra2-${language}.json`), 'utf8')).labels;
    labels = { ...retail, ...JSON.parse(await fs.readFile(path.join(root, `public/res/locale/${language}.json`), 'utf8')) };
    await page.evaluate(() => window.__ra2debug.generalOptions.graphics.hdEnabled.value = false);
    await page.getByRole('button', { name: labels['hd:menucampaign'], exact: true }).click();
    await page.waitForFunction(() => window.__ra2debug.mainMenuController.screens.get(22)?.presentation);
    await shot('01-original-faction-menu');
    await page.evaluate(() => window.__m3IntroPlayer = window.__ra2debug.mainMenuController.screens.get(22).media);
    await page.locator('[data-campaign-faction=soviet]').click();
    await page.waitForFunction(() => document.querySelector('[data-campaign-media] video')?.currentTime > .4);
    await shot('02-original-intro');
    report.intro = await page.evaluate(() => { const v = document.querySelector('[data-campaign-media] video'); return { width: v.videoWidth, height: v.videoHeight,
        duration: v.duration, muted: v.muted, audioDecodedBytes: v.webkitAudioDecodedByteCount }; });
    if (process.argv.includes('--skip-intro')) await page.locator('[data-campaign-media] button').click();
    await page.waitForFunction(() => window.__ra2debug?.game?.status === 1 && window.__ra2debug.gameScreen, undefined, { timeout: 160000 });
    report.introOutcomes = await page.evaluate(() => window.__m3IntroPlayer.outcomes);
    await page.waitForFunction(() => !window.__ra2debug.game.campaign.inputLocked, undefined, { timeout: 90000 });
    await unlock(); await stage('normal-entry-unlocked'); await shot('03-original-opening');
    await key('CombatantSelect'); await key('CombatantSelect'); await key('GuardObject');
    await build('NAPOWR'); await build('NAHAND'); await build('NAREFN');
    await cameo('SENGINEER', 2);
    await page.waitForFunction(() => window.__ra2debug.localPlayer.getOwnedObjects().filter(o => o.name === 'SENGINEER').length >= 2, undefined, { timeout: 90000 });
    await stage('base-and-engineers'); await shot('04-base-and-engineers');
    await page.waitForFunction(() => window.__ra2debug.game.campaign.pendingMedia.length === 0, undefined, { timeout: 90000 });
    await key('Options'); await page.getByRole('button', { name: labels['gui:save'], exact: true }).click();
    await page.waitForTimeout(300);
    const checkpoint = await page.evaluate(async () => await new Promise((resolve, reject) => {
        const request = indexedDB.open('ra2-hd-campaign-saves', 1); request.onerror = () => reject(request.error);
        request.onsuccess = () => { const db = request.result, get = db.transaction('checkpoints').objectStore('checkpoints').get('ra2/sov01t.map/normal');
            get.onsuccess = () => { resolve(get.result); db.close(); }; get.onerror = () => reject(get.error); };
    }));
    assert(checkpoint?.tick > 1500); assert.equal(checkpoint.options.campaign.diagnostic, false);
    await fs.writeFile(path.join(out, 'mid-mission-checkpoint.json'), JSON.stringify(checkpoint));
    report.checkpoint = { tick: checkpoint.tick, worldHash: checkpoint.expected.worldHash, checksum: checkpoint.checksum,
        commandCount: checkpoint.commands.length, bytes: Buffer.byteLength(JSON.stringify(checkpoint)) };
    report.openingSpeech = await page.evaluate(() => window.__ra2debug.game.campaign.speechOutcomes);
    await shot('05-mid-mission-saved');
    await page.getByRole('button', { name: labels['gui:abortmission'], exact: true }).click();
    await page.getByRole('button', { name: labels['gui:quit'], exact: true }).click();
    await page.waitForFunction(() => window.__ra2debug.mainMenuController.screens.get(22)?.saved);
    await page.getByRole('button', { name: labels['gui:load'], exact: true }).click();
    await page.waitForFunction(tick => window.__ra2debug.gameScreen?.menu?.getCurrentScreen() && window.__ra2debug.game.currentTick === tick, checkpoint.tick, { timeout: 90000 });
    assert.equal(await page.evaluate(() => window.__ra2debug.game.getHash()), checkpoint.expected.worldHash);
    await shot('06-mid-mission-restored');
    await page.getByRole('button', { name: labels['gui:resumemission'], exact: true }).click(); await unlock();
    await page.evaluate(() => { const g = window.__ra2debug.game;
        window.__m3ObservedEvents = []; window.__m3AllSpeech = g.campaign.speechOutcomes;
        g.events.subscribe(event => { if ([14, 20, 48, 49].includes(event.type)) window.__m3ObservedEvents.push({ tick: g.currentTick,
            type: event.type, target: event.target?.id, name: event.target?.name }); });
        g.onEnd.subscribe(() => { const c = g.campaign; window.__m3EndReceipt = JSON.parse(JSON.stringify({ tick: g.currentTick,
            result: c.result, failure: c.failure, diagnostic: c.launch.diagnostic, inspectionModified: c.inspectionModified,
            variables: [...c.machine.variables], trace: c.trace, teams: c.teams.snapshot(), teamTrace: c.teams.trace,
            commands: c.journal.commands, trusted: c.journal.trusted, botCount: g.botManager.bots.size,
            observedEvents: window.__m3ObservedEvents, speech: c.speechOutcomes })); });
    });
    await cameo('E2', 48); await waitTicks(2400); await stage('army-produced');
    await army(98, 96); await waitTicks(900); await army(99, 88); await waitTicks(1800); await stage('first-base'); await shot('07-first-base');
    await repairOrCapture('CABHUT'); await shot('08-bridge-repair');
    await army(83, 85); await waitTicks(700);
    await occupy(75, 88); await occupy(75, 79); await waitTicks(900);
    await army(72, 86); await waitTicks(900); await stage('urban-combat'); await shot('09-urban-combat');
    await army(64, 78); await waitTicks(900); await repairOrCapture('CAAIRP'); await shot('10-airport');
    await army(60, 55); await waitTicks(1800); await stage('pentagon-approach'); await shot('11-pentagon-approach');
    for (let i = 0; i < 65; i++) {
        const target = await page.evaluate(() => { const d = window.__ra2debug; return d.game.world.getAllObjects().find(o => /^CAWA2[ABCD]$/.test(o.name) && !o.isDestroyed)?.id; });
        if (target === undefined) { await waitTicks(180); break; }
        await unlock(); await key('CombatantSelect'); await key('CombatantSelect'); await clickTarget({ id: target, body: true });
        await waitTicks(300); const state = await stage('pentagon-' + i);
        if (i % 4 === 0) await shot('12-pentagon-' + i);
        if (state.result) break;
    }
    await page.waitForSelector('[data-game-result-banner=victory]', { timeout: 20000 }); await shot('13-original-victory-banner');
    await page.waitForSelector('[data-campaign-result=victory]', { timeout: 45000 });
    await page.waitForFunction(() => !window.__ra2debug.mainMenu.sidebarCollapsed && window.__ra2debug.mainMenu.sidebarSlots.every(slot => slot.getAnimationRunner().isStopped()));
    await shot('14-campaign-victory-result');
    report.final = await page.evaluate(() => window.__m3EndReceipt);
    report.speechAtResult = await page.evaluate(() => window.__m3AllSpeech);
    assert.equal(report.final.result, 'victory'); assert.equal(report.final.diagnostic, false); assert.equal(report.final.trusted, true);
    assert(report.final.trace.some(action => action.key === '0A301C50' && action.opcode === 1));
    assert(report.speechAtResult.some(item => item.id === 'Mis_S1_SofiaVictorySpeech' && item.reason === 'ended'));
    assert(report.speechAtResult.some(item => item.id === 'EVA_YouAreVictorious' && item.reason === 'ended'));
    report.progress = await page.evaluate(() => window.__ra2debug.gameScreen?.localPrefs?.getItem('_r_campaignProgress_v1')
        ?? Object.entries(localStorage).find(([key]) => key.includes('_r_campaignProgress_v1'))?.[1]);
    assert(JSON.parse(report.progress).completed.some(entry => entry.mission === 'sov01t.map' && entry.difficulty === 'normal'));
    assert.equal(report.errors.length, 0); assert.equal(report.consoleErrors.length, 0);
    report.status = 'PASS_NATIVE_INPUT_ORIGINAL_VICTORY_AND_RESTORE';
} catch (error) { report.status = 'FAIL'; report.failure = error.stack; await stage('failure-state').catch(() => {}); await shot('failure').catch(() => {}); }
finally { await save(); await app?.close(); console.log(out); }
