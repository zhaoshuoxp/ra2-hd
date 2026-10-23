// Verify retained user preferences, team alliances and native standard victory on a former teamgame map.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { startSession } from '../m1/allied-units/desktop-session.mjs';

const [receipt, output] = process.argv.slice(2);
const locale = JSON.parse(await fs.readFile('public/res/locale/zh-CN.json', 'utf8'));
process.argv.push('--map=tourofegypt.map', '--bot-slot=1');
const session = await startSession(receipt, output, 'yr', false, async ({ page }) => {
    await page.evaluate(() => { window.__ra2debug.generalOptions.graphics.hdEnabled.value = false; });
}, async ({ page, report }) => {
    const buttons = page.locator('button.menu-button:visible');
    await buttons.last().waitFor({ state: 'visible' });
    assert.equal(await buttons.count(), 4);
    await buttons.last().click();
    const enter = page.getByRole('button', { name: new RegExp(`${locale['hd:menuskirmish']}|Skirmish`, 'i') });
    await enter.waitFor();
    await page.evaluate(() => {
        const bots = Array(8).fill(null);
        bots[1] = { d: 4, c: 5, co: 2, s: 1, t: 0 };
        bots[2] = { d: 4, c: 1, co: 3, s: 2, t: 1 };
        localStorage.setItem('_edition:yr:_r_hostOpts', '2;7500;2;0;0;1;0;0;;0;0;0;0');
        localStorage.setItem('_edition:yr:_r_lastBots', JSON.stringify(bots));
        localStorage.setItem('_edition:yr:_r_lastTeam', '0');
    });
    await enter.click();
    await page.waitForFunction(() => window.__ra2debug?.skirmishLobby?.gameOpts?.credits === 7500);
    report.preparedLobby = await page.evaluate(() => window.__ra2debug.skirmishLobby.gameOpts);
});
let failure;
try {
    const { page, report } = session;
    report.disclosure = 'Original official tourofegypt.map through the copied app and standard lobby. Preferences load through existing storage/UI. Controlled asset removal tests native victory; no rules or victory implementation are replaced.';
    const initial = await page.evaluate(() => {
        const d = window.__ra2debug, g = d.game, players = g.playerList.getNonNeutral();
        return { tick: g.currentTick, status: g.status, modeType: g.gameModeType, options: g.gameOpts,
            dialog: g.rules.mpDialogSettings, refineryTech: g.rules.buildingRules.get('NAREFN').techLevel,
            players: players.map(p => ({ name: p.name, credits: p.credits, country: p.country?.name,
                assets: p.getOwnedObjects().map(o => o.name), allies: g.alliances.getAllies(p).map(a => a.name) })),
            glError: d.renderer.renderer.getContext().getError() };
    });
    assert.equal(initial.modeType, 0); assert.equal(initial.options.gameMode, 1);
    for (const [key, value] of Object.entries({ credits: 7500, unitCount: 2, shortGame: false,
        superWeapons: false, buildOffAlly: true, mcvRepacks: false, destroyableBridges: false }))
        assert.equal(initial.options[key], value, key);
    assert.equal(initial.players.length, 3); assert(initial.players.every(p => p.credits === 7500));
    assert(initial.players[0].allies.includes(initial.players[1].name));
    assert(!initial.players[0].allies.includes(initial.players[2].name));
    assert.equal(initial.dialog.techLevel, 10); assert.equal(initial.dialog.alliesAllowed, true);
    assert(initial.refineryTech >= 0); assert.equal(initial.glError, 0);
    report.initial = initial;
    await page.evaluate(() => {
        const d = window.__ra2debug, g = d.game;
        const enemy = g.playerList.getNonNeutral().find(p => p !== d.localPlayer
            && !g.alliances.areAllied(p, d.localPlayer));
        window.__m24OptionsEnemy = enemy;
        for (const object of [...enemy.getOwnedObjects()])
            if (g.rules.general.baseUnit.includes(object.name)) g.destroyObject(object, undefined, true);
    });
    await page.waitForTimeout(700);
    report.armyRetained = await page.evaluate(() => {
        const g = window.__ra2debug.game, p = window.__m24OptionsEnemy;
        return { tick: g.currentTick, status: g.status, defeated: p.defeated,
            assets: p.getOwnedObjects().map(o => o.name) };
    });
    assert(report.armyRetained.tick > initial.tick); assert.equal(report.armyRetained.status, 1);
    assert(!report.armyRetained.defeated && report.armyRetained.assets.length);
    await page.evaluate(() => {
        const g = window.__ra2debug.game;
        for (const object of [...window.__m24OptionsEnemy.getOwnedObjects()])
            g.destroyObject(object, undefined, true);
    });
    await page.waitForFunction(() => window.__ra2debug.game.status === 2, undefined, { timeout: 10000 });
    report.victory = await page.evaluate(() => ({ status: window.__ra2debug.game.status,
        enemyDefeated: window.__m24OptionsEnemy.defeated,
        localDefeated: window.__ra2debug.localPlayer.defeated }));
    assert(report.victory.enemyDefeated && !report.victory.localDefeated);
    assert.equal(report.errors.length, 0);
} catch (error) { failure = error; session.report.failure = error.stack; }
await session.close(failure);
if (failure) throw failure;
