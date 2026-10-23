// Ordinary copied-app matches; reveal and stopped AI occur only after native startup.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { startSession } from '../m1/allied-units/desktop-session.mjs';

const [receipt, output] = process.argv.slice(2);
const edition = process.argv.includes('--edition=ra2') ? 'ra2' : 'yr';
const density = process.argv.includes('--density=2') ? 2 : 4;
const enabled = !process.argv.includes('--original');
const planFile = process.argv.find(arg => arg.startsWith('--plan='))?.slice(7);
const names = planFile ? JSON.parse(await fs.readFile(planFile, 'utf8')).maps.map(row => row.runtimeName)
    : process.argv.find(arg => arg.startsWith('--maps='))?.slice(7).split(',') ?? [];
assert(names.length && names.every(name => /^[a-z0-9_-]+\.map$/i.test(name)));
process.argv.push(`--map=${names[0]}`, '--bot-slot=1');
const session = await startSession(receipt, output, edition, false, async ({ page, report }) => {
    report.consoleErrors = [];
    page.on('console', message => { if (message.type() === 'error') report.consoleErrors.push(message.text()); });
    await page.evaluate(({ density, enabled }) => {
        const options = window.__ra2debug.generalOptions.graphics;
        options.hdEnabled.value = enabled; options.hdDensity.value = density;
    }, { density, enabled });
}, async ({ page, report }) => {
    report.initialLobby = await page.evaluate(() => {
        const lobby = window.__ra2debug.skirmishLobby;
        return { options: lobby.gameOpts, mapCount: lobby.mapList?.maps?.length };
    });
});
let failure;
try {
    const { page, report } = session;
    report.disclosure = 'Unmodified official source maps loaded through the copied app and standard lobby. After startup only map reveal and stopped AI support inspection. Native simulation, rules, options, placements and renderer remain active.';
    report.density = density; report.enabled = enabled; report.planFile = planFile; report.maps = [];
    for (const [index, member] of names.entries()) {
        if (index) {
            await page.evaluate(({ edition, member }) => {
                const d = window.__ra2debug;
                clearInterval(window.__allied.timer);
                window.__m24Previous = { game: d.game, environment: d.environmentHd, terrain: d.terrainHd };
                const bots = Array(8).fill(null); bots[1] = { d: 4, c: 5, co: 2, s: 1, t: 1 };
                localStorage.setItem(`_edition:${edition}:_r_lastMap`, member);
                localStorage.setItem(`_edition:${edition}:_r_lastBots`, JSON.stringify(bots));
                d.gameScreen.controller.goToScreen(0, { route: { screenType: 1, params: undefined } });
            }, { edition, member });
            await page.waitForFunction(() => window.__ra2debug?.skirmishLobby, undefined, { timeout: 60000 });
            assert.equal(await page.evaluate(() => window.__ra2debug.skirmishLobby.gameOpts.mapName.toLowerCase()), member.toLowerCase());
            await page.evaluate(index => window.__ra2debug.skirmishLobby.startGame(1700000000000 + index), index);
            await page.waitForFunction(() => window.__ra2debug?.game?.status === 1
                && window.__ra2debug.game !== window.__m24Previous.game, undefined, { timeout: 90000 });
            await page.evaluate(() => window.__installAlliedFixtures());
        }
        const sample = () => page.evaluate(() => {
            const d = window.__ra2debug, g = d.game;
            d.renderer.render();
            const rules = map => Object.fromEntries([...map].filter(([name]) =>
                ['GAREFN', 'NAREFN', 'GAYARD', 'NAYARD', 'AMCV', 'SMCV', 'HARV', 'CMIN', 'HTNK', 'E1'].includes(name))
                .map(([name, rule]) => [name, { techLevel: rule.techLevel, cost: rule.cost,
                    allowedToStartInMultiplayer: rule.allowedToStartInMultiplayer }]));
            const summary = value => ({ density: value.density, budget: value.budget,
                gpuBytes: value.gpuBytes, worldChargeBytes: value.worldChargeBytes, disposed: value.disposed });
            return { tick: g.currentTick, status: g.status, modeType: g.gameModeType, options: g.gameOpts,
                dialog: g.rules.mpDialogSettings, buildingRules: rules(g.rules.buildingRules),
                vehicleRules: rules(g.rules.vehicleRules), infantryRules: rules(g.rules.infantryRules),
                players: g.playerList.getNonNeutral().map(player => ({ name: player.name, isAi: player.isAi,
                    credits: player.credits, country: player.country?.name,
                    objects: player.getOwnedObjects().map(object => object.name) })),
                alliances: g.alliances.debugGetState().map(value => ({ first: value.first.name,
                    second: value.second.name, status: value.status })),
                theater: d.theater?.type ?? d.world?.theater?.type,
                terrain: { ...summary(d.terrainHd), bindings: d.terrainHd.placedBindings.length,
                    groups: d.terrainHd.groups.map(group => ({ id: group.id, status: group.status, reason: group.reason })) },
                environment: { ...summary(d.environmentHd), families: d.environmentHd.families },
                renderCalls: d.renderer.renderer.info.render.calls,
                glError: d.renderer.renderer.getContext().getError() };
        });
        const first = await sample(); await page.waitForTimeout(650); const second = await sample();
        assert.equal(second.status, 1); assert(second.tick > first.tick);
        assert.equal(second.modeType, 0); assert.equal(second.options.gameMode, 1);
        assert.equal(second.glError, 0); assert(second.renderCalls > 0);
        assert.equal(second.options.credits, 10000); assert.equal(second.dialog.techLevel, 10);
        assert.equal(second.dialog.alliesAllowed, true);
        assert(second.players.length <= second.options.maxSlots);
        assert(second.buildingRules.GAREFN.techLevel >= 0 && second.buildingRules.NAREFN.techLevel >= 0);
        const release = index ? await page.evaluate(() => Object.fromEntries(['environment', 'terrain']
            .map(key => [key, { disposed: window.__m24Previous[key].disposed,
                worldChargeBytes: window.__m24Previous[key].worldChargeBytes }]))) : undefined;
        if (release) for (const value of Object.values(release)) {
            assert(value.disposed); assert.equal(value.worldChargeBytes, 0);
        }
        report.maps.push({ member, status: 'PASS_NATIVE_STANDARD_SKIRMISH', samples: [first, second], release });
        await page.screenshot({ path: path.join(output, `${index}-${member}.png`) });
        await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
        console.log(JSON.stringify({ member, completed: report.maps.length, planned: names.length }));
    }
    assert.equal(report.errors.length, 0); assert.equal(report.consoleErrors.length, 0);
} catch (error) {
    failure = error; session.report.failure = error.stack;
    session.report.diagnostics = await session.page.evaluate(() => ({ text: document.body.innerText.slice(-3000),
        lobby: window.__ra2debug?.skirmishLobby?.gameOpts, status: window.__ra2debug?.game?.status })).catch(() => undefined);
    await session.page.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {});
}
await session.close(failure);
if (failure) throw failure;
