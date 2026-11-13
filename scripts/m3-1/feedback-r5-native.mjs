import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { _electron as electron } from '@playwright/test';

const root = path.resolve(import.meta.dirname, '../..'), receipt = JSON.parse(await fs.readFile(path.resolve(process.argv[2])));
const out = path.resolve(process.argv[3]); await fs.mkdir(out, { recursive: false });
await fs.copyFile(import.meta.filename, path.join(out, 'harness.mjs'));
const legacy = JSON.parse(await fs.readFile(path.join(root, 'scripts/m3-1/fixtures/mid-mission-checkpoint.json')));
const report = { status: 'RUNNING', app: receipt.app, cases: [], errors: [], failedResources: [], screenshots: [],
    harnessSha256: createHash('sha256').update(await fs.readFile(import.meta.filename)).digest('hex'),
    scope: 'Actual difficulty slider and Soviet entry, real save/load UI and application restart. Gameplay uses ordinary serialized legal player actions with accelerated turns. No result, health, damage, ownership, money, trigger or shroud injection. This is assisted mission validation, not physical-input full completion.' };
const resumeDirectory = process.argv.find(arg => arg.startsWith('--resume-from='))?.slice('--resume-from='.length);
const prior = resumeDirectory ? JSON.parse(await fs.readFile(path.join(resumeDirectory, 'report.json'))) : undefined;
if (prior) {
    assert.equal(prior.app, receipt.app);
    assert.deepEqual(prior.cases.filter(row => row.victory).map(row => row.difficulty), ['easy', 'normal']);
    const harness = await fs.readFile(path.join(resumeDirectory, 'harness.mjs'));
    assert.equal(createHash('sha256').update(harness).digest('hex'), prior.harnessSha256);
    execFileSync('/bin/cp', ['-cR', path.join(resumeDirectory, 'profile'), path.join(out, 'profile')]);
    for (const filename of prior.screenshots.filter(name => name !== 'failure.png')) {
        await fs.copyFile(path.join(resumeDirectory, filename), path.join(out, filename)); report.screenshots.push(filename);
    }
    report.cases = prior.cases;
    report.inheritedProof = { directory: path.resolve(resumeDirectory),
        reportSha256: createHash('sha256').update(await fs.readFile(path.join(resumeDirectory, 'report.json'))).digest('hex'),
        harnessSha256: prior.harnessSha256, scope: 'Reuse matching-runtime Easy/Normal victories and all three fresh-start/save checks. Clone the isolated profile and restore its authentic named Hard save through actual UI; no checkpoint edits or resigned data.' };
}
const save = () => fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
let app, page, labels;
async function shot(name) { await page.screenshot({ path: path.join(out, name + '.png') }); report.screenshots.push(name + '.png'); await save(); }
async function launch() {
    app = await electron.launch({ executablePath: path.join(receipt.app, 'Contents/MacOS', receipt.executable), cwd: '/private/tmp',
        env: { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('RA2_'))), RA2_DESKTOP_USER_DATA: path.join(out, 'profile') } });
    page = await app.firstWindow(); page.on('pageerror', error => report.errors.push(error.stack));
    page.on('response', response => { if (response.status() >= 400) report.failedResources.push({ url: response.url(), status: response.status() }); });
    app.process().stderr?.on('data', bytes => { void fs.appendFile(path.join(out, 'electron.log'), bytes); });
    await page.waitForSelector('[data-campaign-ready=true]', { timeout: 90000 });
    const language = await page.evaluate(() => document.documentElement.lang);
    labels = { ...JSON.parse(await fs.readFile(path.join(root, `public/res/locale/retail-ra2-${language}.json`))).labels,
        ...JSON.parse(await fs.readFile(path.join(root, `public/res/locale/${language}.json`))) };
}
async function state() {
    return page.evaluate(() => {
        const d = window.__ra2debug, g = d.game;
        return JSON.parse(JSON.stringify({ tick: g.currentTick, hash: g.getHash(), rng: g.prng.snapshot(), mission: g.campaign.checkpointState(),
            difficulty: g.campaign.launch.difficulty, trusted: g.campaign.journal.trusted,
            modified: !!g.campaign.inspectionModified, diagnostic: g.campaign.launch.diagnostic, result: g.campaign.result ?? null,
            failure: g.campaign.failure ?? null, credits: d.localPlayer.credits }));
    });
}
async function step(ticks) {
    for (let left = ticks; left > 0; left -= 120) {
        const current = await page.evaluate(count => {
            const d = window.__ra2debug, g = d.game, m = d.gameScreen.gameTurnMgr; m.setCampaignPaused(false);
            try { for (let i = 0; i < count && !g.campaign.result && !g.campaign.failure; i++) m.doGameTurn(performance.now()); }
            finally { m.setCampaignPaused(true); }
            return { tick: g.currentTick, failure: g.campaign.failure, result: g.campaign.result };
        }, Math.min(left, 120));
        if (current.failure) throw Error(current.failure); if (current.result) return current.result;
    }
}
async function openMenu() {
    await page.evaluate(() => { const d = window.__ra2debug; d.gameScreen.gameTurnMgr.setCampaignPaused(true);
        d.gameScreen.pointer.unlock(true); if (!d.gameScreen.menu.getCurrentScreen()) d.gameScreen.menu.open(); });
}
async function abort() {
    await openMenu(); await page.getByRole('button', { name: labels['gui:abortmission'], exact: true }).click();
    await page.getByRole('button', { name: labels['gui:quit'], exact: true }).click();
    await page.waitForSelector('[data-campaign-ready=true]', { timeout: 90000 });
}
async function files(mode) {
    await page.getByRole('button', { name: labels[mode === 'save' ? 'gui:save' : 'gui:load'], exact: true }).click();
    await page.waitForSelector('[data-save-scope=campaign][data-mode=' + mode + ']');
    await page.waitForFunction(() => document.querySelector('.save-native-list').getAttribute('aria-disabled') === 'false');
}
async function saveNamed(name) {
    await page.waitForFunction(() => !window.__ra2debug.game.campaign.pendingMedia.length, undefined, { timeout: 180000 });
    await openMenu(); await files('save'); await page.locator('.save-native-name').fill(name);
    await page.locator('[data-action=SaveGame]').click(); await page.locator('[data-action=AcknowledgeSave]').waitFor();
    await page.locator('[data-action=AcknowledgeSave]').click();
    const record = await page.evaluate(async name => {
        const db = await new Promise(resolve => { const q = indexedDB.open('ra2-hd-campaign-library', 1); q.onsuccess = () => resolve(q.result); });
        const rows = await new Promise(resolve => { const q = db.transaction('saves').objectStore('saves').getAll(); q.onsuccess = () => resolve(q.result); }); db.close(); return rows.find(row => row.name === name);
    }, name);
    await page.locator('[data-action=CloseSaves]').click();
    await page.evaluate(() => { const d = window.__ra2debug; d.gameScreen.menu.close(); d.gameScreen.gameTurnMgr.setCampaignPaused(true); });
    return record;
}
async function restore(id, checkpoint, inGame = false) {
    if (inGame) await openMenu(); await files('load');
    await page.locator('[role=option][data-id="' + id + '"]').click();
    await page.locator('[data-action=LoadGame]').click();
    if (inGame) { await page.locator('[data-action=ConfirmSaveAction]').waitFor(); await page.locator('[data-action=ConfirmSaveAction]').click(); }
    await page.waitForFunction(({ tick, difficulty }) => window.__ra2debug.game?.currentTick === tick
        && window.__ra2debug.game.campaign.launch.difficulty === difficulty && window.__ra2debug.gameScreen?.menu.getCurrentScreen(),
    { tick: checkpoint.tick, difficulty: checkpoint.options.campaign.difficulty }, { timeout: 180000 });
    const current = await state(); assert.equal(current.hash, checkpoint.expected.worldHash);
    assert.deepEqual(current.rng, checkpoint.expected.rng);
    assert.deepEqual(current.mission, JSON.parse(JSON.stringify(checkpoint.expected.mission)));
    assert(!current.modified && !current.diagnostic && current.trusted); return current;
}
async function queue(name, quantity = 1) {
    await page.evaluate(({ name, quantity }) => {
        const d = window.__ra2debug, r = name.startsWith('NA') ? d.game.rules.getBuilding(name) : d.game.rules.getObject(name, 3);
        if (!d.localPlayer.production.isAvailableForProduction(r)) throw Error('Production unavailable: ' + name);
        const q = d.localPlayer.production.getQueueForObject(r); d.actionsApi.queueForProduction(q.type, r.type, name, quantity);
    }, { name, quantity });
}
async function trainInfantry(minimum) {
    for (let batch = 0; batch < 100; batch++) {
        const current = await page.evaluate(() => {
            const d = window.__ra2debug, q = d.localPlayer.production.getQueueForObject(d.game.rules.getObject('E2', 3));
            return { units: d.localPlayer.getOwnedObjects().filter(o => o.name === 'E2' && o.isSpawned).length,
                queued: q.currentSize, capacity: q.maxSize - q.currentSize };
        });
        if (current.units >= minimum) {
            report.cases.at(-1).phases.push({ name: 'legally-trained-field-infantry', ...current, tick: (await state()).tick }); await save(); return;
        }
        const quantity = Math.min(current.capacity, minimum - current.units - current.queued);
        if (quantity > 0) await queue('E2', quantity);
        await step(300);
    }
    throw Error('Legal infantry production timed out');
}
async function build(name) {
    await queue(name);
    for (let i = 0; i < 120; i++) {
        await step(60);
        const placed = await page.evaluate(name => {
            const d = window.__ra2debug, g = d.game, r = g.rules.getBuilding(name), p = d.localPlayer;
            if (p.production.getQueueForObject(r).status !== 3) return false;
            const center = [...p.buildings].find(b => b.rules.constructionYard).tile, worker = g.getConstructionWorker(p);
            for (let radius = 2; radius < 14; radius++) for (let y = center.ry - radius; y <= center.ry + radius; y++) for (let x = center.rx - radius; x <= center.rx + radius; x++) {
                if (g.map.tiles.getByMapCoords(x, y) && worker.canPlaceAt(name, g.map.tiles.getByMapCoords(x, y), { normalizedTile: true })) {
                    d.actionsApi.placeBuilding(name, x, y); return [x, y];
                }
            }
            throw Error('No legal placement: ' + name);
        }, name);
        if (placed) { await step(90); return placed; }
    }
    throw Error('Production timed out: ' + name);
}
async function army(x, y) {
    await page.evaluate(({ x, y }) => { const d = window.__ra2debug;
        d.actionsApi.orderUnits(d.localPlayer.getOwnedObjects().filter(o => o.isUnit() && o.isSpawned && o.attackTrait && !o.harvesterTrait && o.zone !== 2).map(o => o.id), 4, x, y);
    }, { x, y });
}
async function occupy(x, y) {
    const id = await page.evaluate(({ x, y }) => {
        const d = window.__ra2debug, g = d.game;
        const target = g.world.getAllObjects().find(o => o.tile?.rx === x && o.tile?.ry === y && o.garrisonTrait && !o.isDestroyed
            && !g.mapShroudTrait.getPlayerShroud(d.localPlayer).isShrouded(o.tile, o.tileElevation));
        if (!target) return;
        const units = d.localPlayer.getOwnedObjects().filter(o => o.name === 'E2' && o.isSpawned)
            .sort((a, b) => Math.hypot(a.tile.rx - x, a.tile.ry - y) - Math.hypot(b.tile.rx - x, b.tile.ry - y)).slice(0, 10);
        d.actionsApi.orderUnits(units.map(o => o.id), 8, target.id); return target.id;
    }, { x, y });
    assert(id !== undefined, 'Visible civilian garrison required');
    await step(1500);
    assert(await page.evaluate(id => window.__ra2debug.game.getObjectById(id).garrisonTrait.getOccupants().length >= 8, id));
    return id;
}
async function capture(name) {
    for (let attempt = 0; attempt < 4; attempt++) {
        if (!await page.evaluate(() => window.__ra2debug.localPlayer.getOwnedObjects().some(o => o.name === 'SENGINEER' && o.isSpawned))) {
            await queue('E2', 16); await queue('SENGINEER', 2); await step(1800);
        }
        const issued = await page.evaluate(name => {
            const d = window.__ra2debug, g = d.game, p = d.localPlayer, engineer = p.getOwnedObjects().find(o => o.name === 'SENGINEER' && o.isSpawned);
            const target = g.world.getAllObjects().filter(o => o.name === name && !o.isDestroyed && o.owner !== p)
                .filter(o => name !== 'CABHUT' || o.cabHutTrait.canRepairBridge())
                .filter(o => !g.mapShroudTrait.getPlayerShroud(p).isShrouded(o.tile, o.tileElevation))
                .sort((a, b) => Math.hypot(a.tile.rx - engineer?.tile.rx, a.tile.ry - engineer?.tile.ry)
                    - Math.hypot(b.tile.rx - engineer?.tile.rx, b.tile.ry - engineer?.tile.ry))[0];
            if (!engineer || !target) return;
            d.actionsApi.orderUnits([engineer.id], name === 'CABHUT' ? 15 : 7, target.id); return target.id;
        }, name);
        assert(issued !== undefined, 'Visible target and engineer required: ' + name); await step(1800);
        const completed = await page.evaluate(({ id, name }) => { const d = window.__ra2debug, o = d.game.getObjectById(id);
            return name === 'CABHUT' ? !o.cabHutTrait.canRepairBridge() : o.owner === d.localPlayer; }, { id: issued, name });
        report.cases.at(-1).phases.push({ name, attempt, target: issued, completed, tick: (await state()).tick }); await save();
        if (completed) return issued;
    }
    throw Error('Engineer operation failed after legal replacements: ' + name);
}
const checkpoints = new Map();
try {
    await launch();
    if (!prior) {
        await page.evaluate(async checkpoint => {
            const db = await new Promise((resolve, reject) => { const q = indexedDB.open('ra2-hd-campaign-saves', 1);
                q.onupgradeneeded = () => q.result.createObjectStore('checkpoints'); q.onsuccess = () => resolve(q.result); q.onerror = () => reject(q.error); });
            await new Promise((resolve, reject) => { const tx = db.transaction('checkpoints', 'readwrite');
                tx.objectStore('checkpoints').put(checkpoint, 'ra2/sov01t.map/normal'); tx.oncomplete = resolve; tx.onerror = reject; }); db.close();
        }, legacy);
        await restore('legacy-ra2-sov01t-normal', legacy); report.cases.push({ name: 'Frozen Normal legacy world restores without migration', ...await state() });
        await abort();
    } else {
        const records = await page.evaluate(async () => {
            const db = await new Promise(resolve => { const q = indexedDB.open('ra2-hd-campaign-library', 1); q.onsuccess = () => resolve(q.result); });
            const rows = await new Promise(resolve => { const q = db.transaction('saves').objectStore('saves').getAll(); q.onsuccess = () => resolve(q.result); }); db.close(); return rows;
        });
        for (const row of records) if (row.name.startsWith('R5 ')) checkpoints.set(row.checkpoint.options.campaign.difficulty, row);
        const airport = records.find(row => row.name === 'R5 Hard airport');
        if (airport) checkpoints.set('hard', airport);
    }
    for (const [index, difficulty] of ['easy', 'normal', 'hard'].entries()) {
        if (prior && difficulty !== 'hard') continue;
        const row = prior ? report.cases.find(row => row.difficulty === 'hard') : { difficulty, phases: [] };
        if (!prior) report.cases.push(row); await save();
        if (!prior) {
            const slider = page.locator('[data-campaign-difficulty]'); await slider.focus(); await page.keyboard.press('Home');
            for (let i = 0; i < index; i++) await page.keyboard.press('ArrowRight');
            assert.equal(await slider.inputValue(), String(index)); await shot('faction-' + difficulty);
            await page.locator('[data-campaign-faction=soviet]').click();
            await page.locator('[data-campaign-media] button').waitFor({ timeout: 90000 }); await page.locator('[data-campaign-media] button').click();
            await page.waitForFunction(() => window.__ra2debug.game?.status === 1, undefined, { timeout: 180000 });
            await page.evaluate(() => { const d = window.__ra2debug; d.gameScreen.gameTurnMgr.setCampaignPaused(true); d.gameScreen.pointer.unlock(true); });
            for (let i = 0; i < 30; i++) { await step(90); if (!await page.evaluate(() => window.__ra2debug.game.campaign.inputLocked)) break; }
            row.opening = await page.evaluate(() => {
                const d = window.__ra2debug, g = d.game;
                return { difficulty: g.campaign.launch.difficulty, locked: g.campaign.inputLocked, diagnostic: g.campaign.launch.diagnostic,
                    botCount: g.botManager.bots.size, trainer: d.trainer.preferences.enabled,
                    bridgeExplosions: g.campaign.trace.filter(a => a.key === '0823BDEC').length,
                    houses: [...g.campaign.houses.values()].map(p => ({ name: p.name, ai: p.isAi, aiDifficulty: p.aiDifficulty, handicap: p.handicap })),
                    actualWeapon: d.localPlayer.getOwnedObjects().filter(o => o.name === 'E2' && o.primaryWeapon)
                        .map(o => ({ rof: o.primaryWeapon.rof, baseRof: o.primaryWeapon.rules.rof })) };
            });
            assert.equal(row.opening.difficulty, difficulty); assert(!row.opening.locked && !row.opening.diagnostic && !row.opening.trainer);
            assert.equal(row.opening.bridgeExplosions, 8); assert.equal(row.opening.botCount, 0);
            const human = row.opening.houses.find(p => !p.ai), enemy = row.opening.houses.find(p => p.name === 'BadGuy1 House');
            assert.equal(human.handicap.armor, [1.2, 1, .8][index]); assert.equal(enemy.handicap.armor, [.8, 1, 1.2][index]);
            assert.equal(enemy.handicap.teamDelay, [500, 750, 1000][index]);
            assert(row.opening.actualWeapon.length); assert(row.opening.actualWeapon.every(w => Math.abs(w.rof / w.baseRof - [.8, 1, 1.2][index]) < .001));
            await page.evaluate(() => { const d = window.__ra2debug; d.actionsApi.orderUnits(d.localPlayer.getOwnedObjects().filter(o => o.name === 'E2').map(o => o.id), 5); });
            row.base = {}; for (const name of ['NAPOWR', 'NAHAND', 'NAREFN']) row.base[name] = await build(name);
            await queue('SENGINEER', 2); await step(900);
            await page.waitForFunction(() => !window.__ra2debug.game.campaign.pendingMedia.length, undefined, { timeout: 180000 });
            await openMenu(); await files('save'); await page.locator('.save-native-name').fill('R5 ' + difficulty);
            await page.locator('[data-action=SaveGame]').click(); await page.locator('[data-action=AcknowledgeSave]').waitFor();
            await page.locator('[data-action=AcknowledgeSave]').click(); await shot('save-' + difficulty);
            const record = await page.evaluate(async name => {
                const db = await new Promise((resolve, reject) => { const q = indexedDB.open('ra2-hd-campaign-library', 1); q.onsuccess = () => resolve(q.result); q.onerror = () => reject(q.error); });
                const rows = await new Promise(resolve => { const q = db.transaction('saves').objectStore('saves').getAll(); q.onsuccess = () => resolve(q.result); }); db.close(); return rows.find(r => r.name === name);
            }, 'R5 ' + difficulty);
            assert.equal(record.checkpoint.options.campaign.difficulty, difficulty); checkpoints.set(difficulty, record);
            await fs.writeFile(path.join(out, 'checkpoint-' + difficulty + '.json'), JSON.stringify(record.checkpoint));
            await page.locator('[data-action=CloseSaves]').click();
            await page.evaluate(() => { const d = window.__ra2debug; d.gameScreen.menu.close(); d.gameScreen.gameTurnMgr.setCampaignPaused(true); });
            await step(180); const reference = await state(); await restore(record.id, record.checkpoint, true);
            await page.evaluate(() => { const d = window.__ra2debug; d.gameScreen.menu.close(); d.gameScreen.gameTurnMgr.setCampaignPaused(true); });
            await step(180); assert.deepEqual(await state(), reference); row.saved = { id: record.id, tick: record.tick, hash: record.checkpoint.expected.worldHash, continuation: 'PASS' };
            await shot('restored-' + difficulty); await save(); console.log(difficulty, 'save/restore passed');
        } else {
            const record = checkpoints.get(difficulty); await restore(record.id, record.checkpoint);
            await page.evaluate(() => { const d = window.__ra2debug; d.gameScreen.menu.close(); d.gameScreen.gameTurnMgr.setCampaignPaused(true); });
            await step(180); await shot('restored-hard-for-continued-validation');
        }
        await page.evaluate(() => { const d = window.__ra2debug, g = d.game; window.__r5EndedGame = g;
            g.onEnd.subscribe(() => { window.__r5EndReceipt = { tick: g.currentTick, result: g.campaign.result, failure: g.campaign.failure,
                difficulty: g.campaign.launch.difficulty, trace: g.campaign.trace, variables: [...g.campaign.machine.variables],
                trusted: g.campaign.journal.trusted, modified: !!g.campaign.inspectionModified, commands: g.campaign.journal.commands }; });
        });
        if (!prior || !row.airportSave) {
            await queue('E2', 48); await step(2700);
            for (const [x, y, ticks] of [[98, 96, 900], [99, 88, 1800]]) { await army(x, y); await step(ticks); }
            row.bridge = await capture('CABHUT'); await shot('bridge-' + difficulty);
            await army(83, 85); await step(900);
            row.garrisons = [await occupy(75, 88), await occupy(75, 79)];
            if (difficulty === 'hard') {
                await queue('E2', 64); await step(5400); await army(75, 85); await step(2400);
            }
            await army(72, 86); await step(1800); await army(64, 78); await step(1800);
            row.airport = await capture('CAAIRP'); await shot('airport-' + difficulty);
            if (difficulty === 'hard') {
                const saved = await saveNamed('R5 Hard airport'); checkpoints.set('hard', saved);
                row.airportSave = { id: saved.id, tick: saved.tick, hash: saved.checkpoint.expected.worldHash };
                await fs.writeFile(path.join(out, 'checkpoint-hard-airport.json'), JSON.stringify(saved.checkpoint)); await save();
            }
        }
        if (difficulty === 'hard') {
            for (let count = 0; count < 3; count++) await build('NAHAND');
            await trainInfantry(150);
            await army(60, 66); await step(2400); await army(60, 55); await step(1800);
            row.forwardGarrisons = [await occupy(63, 57), await occupy(54, 57)];
            await army(60, 40); await step(3600);
        }
        await army(60, 55); await step(1800);
        for (let i = 0; i < 90; i++) {
            const issued = await page.evaluate(() => { const d = window.__ra2debug, g = d.game;
                const target = g.world.getAllObjects().find(o => /^CAWA2[ABCD]$/.test(o.name) && !o.isDestroyed
                    && !g.mapShroudTrait.getPlayerShroud(d.localPlayer).isShrouded(o.tile, o.tileElevation));
                if (!target) return false;
                d.actionsApi.orderUnits(d.localPlayer.getOwnedObjects().filter(o => o.isUnit() && o.attackTrait && !o.harvesterTrait && o.zone !== 2).map(o => o.id), 2, target.id); return true;
            });
            if (!issued) await army(60, 40); if (await step(300)) break;
        }
        assert.equal((await state()).result, 'victory');
        await page.evaluate(() => { const m = window.__ra2debug.gameScreen.gameTurnMgr; m.setCampaignPaused(false);
            try { m.doGameTurn(performance.now()); } finally { m.setCampaignPaused(true); } });
        row.victory = await page.evaluate(() => window.__r5EndReceipt); assert(row.victory.trusted && !row.victory.modified);
        assert(row.victory.trace.some(a => a.key === '0A301C50' && a.opcode === 1));
        await page.waitForSelector('[data-campaign-score=retail]', { timeout: 240000 });
        await page.waitForFunction(() => document.querySelector('[data-score-phase=complete]'), undefined, { timeout: 30000 });
        row.parTime = await page.locator('[data-score-time="GUI:ParTime"]').textContent();
        assert.equal(row.parTime, ['00:25:00', '00:15:00', '00:06:00'][index]); await shot('score-' + difficulty);
        row.progress = await page.evaluate(() => JSON.parse(Object.entries(localStorage).find(([k]) => k.includes('_r_campaignProgress_v1'))[1]));
        assert(row.progress.completed.some(e => e.difficulty === difficulty)); assert.equal(row.progress.nextPlayable, false);
        await page.getByRole('button', { name: labels['gui:continue'], exact: true }).click(); await page.waitForSelector('[data-campaign-ready=true]');
        assert.equal(await page.locator('[data-campaign-difficulty]').inputValue(), String(index)); await save(); console.log(difficulty, 'original victory passed', row.victory.tick);
    }
    assert.deepEqual(report.cases.at(-1).progress.completed.map(e => e.difficulty).sort(), ['easy', 'hard', 'normal']);
    await app.close(); app = undefined; await launch(); await files('load');
    for (const difficulty of ['easy', 'normal', 'hard']) await page.locator('[role=option][data-id="' + checkpoints.get(difficulty).id + '"]').waitFor();
    await page.locator('[data-action=CloseSaves]').click(); await restore(checkpoints.get('easy').id, checkpoints.get('easy').checkpoint);
    await shot('restored-easy-after-app-restart'); report.cases.push({ name: 'All difficulty saves survive app restart; Easy restores from the default Normal selection', ...await state() });
    const retainedLegacy = await page.evaluate(async () => {
        const db = await new Promise(resolve => { const q = indexedDB.open('ra2-hd-campaign-saves', 1); q.onsuccess = () => resolve(q.result); });
        const value = await new Promise(resolve => { const q = db.transaction('checkpoints').objectStore('checkpoints').get('ra2/sov01t.map/normal'); q.onsuccess = () => resolve(q.result); }); db.close(); return value;
    });
    assert.deepEqual(retainedLegacy, legacy); await abort(); assert.equal(await page.locator('[data-campaign-difficulty]').inputValue(), '0');
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []);
    report.status = 'PASS_ALL_THREE_NATIVE_DIFFICULTIES_SAVE_RESTORE_ORIGINAL_OBJECTIVES_VICTORY_PAR_TIMES_AND_PROGRESS';
} catch (error) {
    report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1;
    if (page) {
        report.failureState = await state().catch(() => undefined);
        report.failureUnits = await page.evaluate(() => window.__ra2debug.localPlayer?.getOwnedObjects().map(o => ({
            id: o.id, name: o.name, spawned: o.isSpawned, tile: [o.tile.rx, o.tile.ry], health: o.healthTrait?.health,
        }))).catch(() => undefined);
        await shot('failure').catch(() => {});
    }
}
finally { await save(); await app?.close(); }
console.log(JSON.stringify({ status: report.status, out, error: report.error }));
