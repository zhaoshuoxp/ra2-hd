// Observe approved standard rule restoration and actual native starting armies.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { startSession } from '../m1/allied-units/desktop-session.mjs';

const [receipt, output, auditFile] = process.argv.slice(2);
const edition = process.argv.includes('--edition=ra2') ? 'ra2' : 'yr';
const audit = JSON.parse(await fs.readFile(auditFile, 'utf8'));
const source = audit.rows.find(row => row.edition === edition);
assert(audit.status === 'PASS' && source);
const locale = JSON.parse(await fs.readFile('public/res/locale/zh-CN.json', 'utf8'));
process.argv.push(`--map=${source.runtimeName}`, '--bot-slot=1');
const session = await startSession(receipt, output, edition, true, async ({ page }) => {
    await page.evaluate(() => { window.__ra2debug.generalOptions.graphics.hdEnabled.value = false; });
}, async ({ page, report }) => {
    const buttons = page.locator('button.menu-button:visible');
    await buttons.last().waitFor({ state: 'visible' });
    assert.equal(await buttons.count(), 4);
    await buttons.last().click();
    const enter = page.getByRole('button', { name: new RegExp(`${locale['hd:menuskirmish']}|Skirmish`, 'i') });
    await enter.waitFor();
    await page.evaluate(edition => localStorage.setItem(`_edition:${edition}:_r_hostOpts`,
        '2;7500;6;0;0;1;1;0;;0;1;0;0'), edition);
    await enter.click();
    await page.waitForFunction(() => window.__ra2debug.skirmishLobby?.gameOpts?.unitCount === 6
        && window.__ra2debug.skirmishLobby.gameOpts.credits === 7500);
    report.lobbyOptions = await page.evaluate(() => window.__ra2debug.skirmishLobby.gameOpts);
});
let failure;
try {
    const { page, report } = session;
    report.disclosure = 'Original source-pinned official map and existing standard lobby settings. No unit, rule, map or starting location is created or assigned after startup. Shared harness reveal/stopped AI follows native startup. Prior economy, alliance and victory evidence is reused for unchanged paths.';
    report.sourceAudit = { file: path.resolve(auditFile), map: source };
    const sample = () => page.evaluate(names => {
        const d = window.__ra2debug, g = d.game;
        return { tick: g.currentTick, status: g.status, modeType: g.gameModeType, options: g.gameOpts,
            dialog: g.rules.mpDialogSettings,
            unitRules: names.map(name => {
                const rule = g.rules.vehicleRules.get(name) ?? g.rules.infantryRules.get(name);
                return { name, registered: !!rule,
                    raw: g.rules.getIni().getSection(name)?.get('AllowedToStartInMultiplayer') ?? null,
                    allowed: rule?.allowedToStartInMultiplayer };
            }),
            players: g.playerList.getNonNeutral().map(player => ({ country: player.country?.name,
                startLocation: player.startLocation, credits: player.credits,
                objects: player.getOwnedObjects().map(object => ({ name: object.name, type: object.type,
                    id: object.id, spawned: object.isSpawned })) })),
            glError: d.renderer.renderer.getContext().getError() };
    }, source.values.map(row => row.name));
    const initial = await sample();
    report.initial = initial;
    assert.equal(initial.modeType, 0); assert.equal(initial.options.gameMode, 1);
    assert.equal(initial.options.unitCount, 6); assert.equal(initial.options.credits, 7500);
    assert.equal(initial.options.shortGame, false); assert.equal(initial.options.superWeapons, false);
    assert.equal(initial.options.buildOffAlly, true); assert.equal(initial.dialog.techLevel, 10);
    assert.equal(initial.players.length, 2); assert(initial.players.length <= initial.options.maxSlots);
    assert.equal(new Set(initial.players.map(player => player.startLocation)).size, initial.players.length);
    for (const expected of source.values) {
        const actual = initial.unitRules.find(row => row.name === expected.name);
        assert.equal(actual.raw, expected.standardRaw, expected.name + ' original standard INI value');
        if (actual.registered) assert.equal(actual.allowed, expected.standardAllowed, expected.name + ' native rule');
    }
    assert(initial.players.every(player => player.objects.some(object => /MCV$/.test(object.name))));
    assert(initial.players.every(player => player.objects.some(object =>
        source.values.some(row => row.name === object.name && row.standardAllowed))));
    assert(initial.players.every(player => player.credits === 7500));
    await page.waitForTimeout(650);
    const second = await sample();
    assert.equal(second.status, 1); assert(second.tick > initial.tick);
    assert.equal(initial.glError, 0); assert.equal(second.glError, 0);
    assert.equal(report.errors.length, 0);
    report.initial = initial; report.advanced = second;
    report.ruleStatus = 'PASS_SOURCE_PINNED_STANDARD_INI_NATIVE_RULES_AND_GENERATED_STARTING_ARMIES';
    await page.screenshot({ path: path.join(output, 'native-standard-starting-armies.png') });
} catch (error) {
    failure = error; session.report.failure = error.stack;
    await session.page.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {});
}
await session.close(failure);
if (failure) throw failure;
