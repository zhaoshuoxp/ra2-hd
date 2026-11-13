import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { _electron as electron } from '@playwright/test';

const root = path.resolve(import.meta.dirname, '../..'), out = path.resolve(process.argv[2] ?? '.artifacts/m3-2/native-opening');
await fs.mkdir(out, { recursive: true });
const profile = path.join(out, 'profile'); await fs.mkdir(profile, { recursive: true });
await fs.writeFile(path.join(profile, 'resource-registration.json'), JSON.stringify({ schemaVersion: 1, directory: path.join(root, '.local') }));
const report = { status: 'RUNNING', scope: 'Original Soviet 02, assisted ordinary serialized attack commands against original beach defenses and accelerated native simulation; no trigger/rule/goal changes.', errors: [], resources: [], samples: [], commands: [] };
let app, page;
try {
    app = await electron.launch({ executablePath: await fs.realpath(path.join(root, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron')),
        args: [path.join(root, 'desktop/main.mjs')], cwd: '/private/tmp',
        env: { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('RA2_'))),
            RA2_DESKTOP_USER_DATA: profile, RA2_DESKTOP_NO_DISCOVERY: '1' } });
    app.process().stderr.on('data', bytes => { void fs.appendFile(path.join(out, 'electron.log'), bytes); });
    page = await app.firstWindow(); page.on('pageerror', error => report.errors.push(error.stack));
    page.on('response', response => { if (response.status() >= 400) report.resources.push([response.url(), response.status()]); });
    await page.locator('[data-edition=ra2]').click({ timeout: 90000 });
    await page.waitForFunction(() => window.__ra2debug?.mainMenuController, undefined, { timeout: 90000 });
    const language = await page.evaluate(() => document.documentElement.lang);
    const labels = JSON.parse(await fs.readFile(path.join(root, 'public/res/locale', language + '.json')));
    await page.getByRole('button', { name: labels['hd:menucampaign'], exact: true }).click();
    await page.waitForSelector('[data-campaign-ready=true]', { timeout: 90000 });
    await page.screenshot({ path: path.join(out, 'selection.png') });
    await page.evaluate(async () => {
        const d = window.__ra2debug;
        d.generalOptions.graphics.hdEnabled.value = false;
        await d.mainMenuController.screens.get(22).launchDiagnostic(undefined, 'sov02t.map');
    });
    await page.waitForFunction(() => window.__ra2debug.game?.campaign?.launch.mission === 'sov02t.map'
        && window.__ra2debug.gameScreen?.playerUi || document.body.innerText.includes('Error:'), undefined, { timeout: 90000 });
    assert(await page.evaluate(() => !!window.__ra2debug.gameScreen?.playerUi), await page.locator('body').innerText());
    await page.evaluate(() => { const d = window.__ra2debug; d.gameScreen.gameTurnMgr.setCampaignPaused(true); d.gameScreen.pointer.unlock(true); });
    for (const tick of [30, 300, 900, 1800, 3600, 4200, 4500, 4800, 5400, 7200]) {
        if (tick > 900) {
            const command = await page.evaluate(() => {
                const d = window.__ra2debug, g = d.game;
                const target = g.world.getAllObjects().filter(o => o.name === 'GAPILL' && !o.isDestroyed && o.tile.rx < 90 && o.tile.ry < 75)
                    .sort((a, b) => a.id - b.id)[0];
                if (!target) return null;
                const ids = g.localPlayer.getOwnedObjects().filter(o => ['HTNK', 'E2'].includes(o.name) && o.isSpawned).map(o => o.id);
                d.actionsApi.orderUnits(ids, 2, target.id);
                return { tick: g.currentTick, order: 'attack', target: target.id, tile: [target.tile.rx, target.tile.ry], units: ids };
            });
            if (command) report.commands.push(command);
        }
        await page.evaluate(target => {
            const d = window.__ra2debug, g = d.game, mgr = d.gameScreen.gameTurnMgr;
            mgr.setCampaignPaused(false);
            try { while (g.currentTick < target && !g.campaign.failure && !g.campaign.result) mgr.doGameTurn(performance.now()); }
            finally { mgr.setCampaignPaused(true); }
        }, tick);
        const sample = await page.evaluate(() => {
            const d = window.__ra2debug, g = d.game, c = g.campaign;
            return { tick: g.currentTick, failure: c.failure ?? null, result: c.result ?? null, locked: c.inputLocked, variables: [...c.machine.variables],
                hash: g.getHash(), rng: g.prng.snapshot(), teams: c.teams.snapshot(), trace: c.trace.slice(-15),
                scripts: c.teams.trace.filter(t => ['0A550DCC', '0A1DB35C', '0A30E1FC'].includes(t.team)),
                arrivals: [...c.houses.values()].flatMap(owner => owner.getOwnedObjects(true)).filter(o => ['SMCV', 'SAPC'].includes(o.name)).map(o => ({
                    id: o.id, name: o.name, owner: o.owner.name, tile: [o.tile.rx, o.tile.ry], destroyed: o.isDestroyed,
                    spawned: o.isSpawned, limbo: o.limboData, health: o.healthTrait.health, passengers: o.transportTrait?.units.map(p => [p.id, p.name]) })),
                player: g.localPlayer.getOwnedObjects(true).filter(o => !o.isDestroyed).map(o => ({ name: o.name, id: o.id, tile: [o.tile.rx, o.tile.ry],
                    spawned: o.isSpawned, health: o.healthTrait.health, passengers: o.transportTrait?.units.map(p => p.name), tasks: o.unitOrderTrait?.getTasks().map(t => t.constructor.name) })) };
        });
        report.samples.push(sample);
        await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
        console.log(JSON.stringify({ tick: sample.tick, failure: sample.failure, player: sample.player.length, variables: sample.variables }));
        await page.screenshot({ path: path.join(out, `tick-${tick}.png`) });
        assert.equal(sample.failure, null);
    }
    assert.equal(report.samples.at(-1).result, null);
    assert.equal(report.samples.at(-1).locked, false, 'Original transport script must unlock player input');
    assert(report.samples.at(-1).player.some(unit => unit.name === 'SMCV' && unit.spawned), 'The original MCV reinforcement must reach the player');
    assert.deepEqual(report.errors, []); assert.deepEqual(report.resources, []);
    report.status = 'PASS_ORIGINAL_OPENING_TRANSPORT_MCV_HANDOFF';
} catch (error) {
    report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1;
    if (page) { await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {}); report.body = await page.locator('body').innerText().catch(() => ''); }
} finally { await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n'); await app?.close(); }
console.log(JSON.stringify({ status: report.status, error: report.error, out }));
