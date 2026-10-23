// Verify the independently copied final app across the five existing theater paths.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { startSession } from '../m1/allied-units/desktop-session.mjs';

const [stage, output, edition] = process.argv.slice(2);
assert(['ra2', 'yr'].includes(edition));
const maps = edition === 'ra2'
    ? [['mp33u4.map', 'URBAN'], ['mp26s6.map', 'SNOW'], ['mp01t4.map', 'TEMPERATE']]
    : [['dunepatr.map', 'DESERT'], ['rushhr.map', 'NEWURBAN']];
const cases = maps.flatMap(([map, theater]) => [2, 4].map(density => ({ map, theater, density })));
if (edition === 'yr') cases.push({ map: 'saharamimw.map', theater: 'DESERT', density: 4, originalMode: 'megawealth' });
cases.push({ ...cases[0], density: 1 }, { ...cases[0], density: 2 });
process.argv.push(`--map=${cases[0].map}`, '--bot-slot=1');
const session = await startSession(stage, output, edition, false, async ({ page }) => {
    await page.evaluate(() => {
        const g = window.__ra2debug.generalOptions.graphics;
        g.hdEnabled.value = true;
        g.hdDensity.value = 2;
    });
});
const { page, report } = session;
report.runtimeSourceCommit = JSON.parse(await fs.readFile(stage)).runtimeSourceHead;
report.cases = [];
report.disclosure = 'Final independently copied app and resources. Ten representative density/theater loads reuse accepted art/state evidence. Additional Original/re-entry and legacy Megawealth map exercise the same unified runtime without map/rule changes. Shared harness reveals terrain and stops AI after native startup.';

async function switchMap(next) {
    await page.evaluate(({ next, edition }) => {
        const d = window.__ra2debug;
        clearInterval(window.__allied.timer);
        window.__m24FinalOld = { game: d.game, terrain: d.terrainHd, environment: d.environmentHd,
            demand: d.worldView.sovietUnitsHd };
        d.generalOptions.graphics.hdEnabled.value = next.density !== 1;
        d.generalOptions.graphics.hdDensity.value = next.density === 1 ? 2 : next.density;
        localStorage.setItem(`_edition:${edition}:_r_lastMap`, next.map);
        d.gameScreen.controller.goToScreen(0, { route: { screenType: 1, params: undefined } });
    }, { next, edition });
    await page.waitForFunction(() => window.__ra2debug?.skirmishLobby, undefined, { timeout: 60000 });
    await page.evaluate(() => window.__ra2debug.skirmishLobby.startGame(1700000000000));
    await page.waitForFunction(() => window.__ra2debug?.game?.status === 1
        && window.__ra2debug.game !== window.__m24FinalOld.game, undefined, { timeout: 90000 });
    const released = await page.evaluate(() => ({ terrain: window.__m24FinalOld.terrain,
        environment: window.__m24FinalOld.environment, demand: window.__m24FinalOld.demand.report.gpuBytes }));
    assert(released.terrain.disposed && released.terrain.worldChargeBytes === 0);
    assert(released.environment.disposed && released.environment.worldChargeBytes === 0 && released.demand === 0);
    await page.evaluate(() => window.__installAlliedFixtures());
    return released;
}

async function inspect(item, release) {
    const initial = await page.evaluate(() => {
        const d = window.__ra2debug, w = d.worldView;
        const baseline = (w.conscriptHd?.report.gpuBytes ?? 0) + (w.powerPlantHd?.report.gpuBytes ?? 0)
            + (w.napowrHd?.report.gpuBytes ?? 0) + [...(w.rhinoHd?.parts.values() ?? [])].reduce((n, p) =>
                n + p.bitmap.width * p.bitmap.height * 5 + p.palette.image.data.byteLength, 0);
        const eager = Object.entries(w.sovietBuildingsHd ?? {}).filter(([name]) => !d.sovietUnitsHd.families[name])
            .reduce((n, [, family]) => n + family.report.gpuBytes, 0);
        const g = d.game;
        return { map: g.gameOpts.mapName, mode: g.gameModeType, options: g.gameOpts, tick: g.currentTick,
            theaterType: g.map.mapFile.theaterType, dialog: g.rules.mpDialogSettings,
            refineryTechLevels: [g.rules.getObject('GAREFN', 2).techLevel, g.rules.getObject('NAREFN', 2).techLevel],
            terrain: d.terrainHd, environment: d.environmentHd, prepared: { ...d.preparedHdCache },
            total: baseline + eager + d.sovietUnitsHd.gpuBytes + d.terrainHd.worldChargeBytes
                + d.environmentHd.worldChargeBytes, limit: d.terrainHd.budget,
            players: g.getCombatants().map(p => ({ name: p.name, credits: p.credits, start: p.startLocation })),
            renderer: d.renderer.renderer.getContext().getParameter(d.renderer.renderer.getContext().RENDERER) };
    });
    const row = { ...item, release, initial };
    report.cases.push(row);
    assert.equal(initial.map.toLowerCase(), item.map);
    assert.equal(initial.mode, 0);
    assert.equal(initial.options.gameMode, 1);
    assert.equal(initial.options.credits, 10000);
    assert(initial.total <= initial.limit);
    assert.equal(initial.dialog.techLevel, 10);
    assert.equal(initial.dialog.alliesAllowed, true);
    assert(initial.refineryTechLevels.every(level => level >= 0));
    assert(initial.players.length <= initial.options.maxSlots);
    if (item.density === 1) {
        assert.equal(initial.terrain.worldChargeBytes, 0);
        assert.equal(initial.environment.worldChargeBytes, 0);
    } else {
        assert.equal(initial.theaterType, { TEMPERATE: 1, URBAN: 2, SNOW: 4, DESERT: 16, NEWURBAN: 32 }[item.theater]);
        assert(Object.values(initial.environment.families).length > 0);
        assert(Object.values(initial.environment.families).every(f => f.density === item.density));
        assert(initial.terrain.groups.length > 0);
        assert(initial.terrain.groups.every(g => g.status === 'PUBLISHED' && g.density === item.density));
    }
    await page.waitForFunction(before => window.__ra2debug.game.currentTick >= before + 16,
        initial.tick, { timeout: 15000 });
    row.final = await page.evaluate(() => {
        const d = window.__ra2debug, gl = d.renderer.renderer.getContext();
        return { tick: d.game.currentTick, status: d.game.status, glError: gl.getError(),
            nativeObjects: d.game.getWorld().getAllObjects().filter(o => o.isSpawned).length };
    });
    assert.equal(row.final.status, 1);
    assert.equal(row.final.glError, 0);
    const image = path.join(output, `${edition}-${item.theater.toLowerCase()}-${item.density}x-${report.cases.length}.png`);
    await page.screenshot({ path: image });
    row.image = image;
}

let failure;
try {
    for (let i = 0; i < cases.length; i++) await inspect(cases[i], i ? await switchMap(cases[i]) : null);
    report.technicalStatus = 'PASS_FINAL_INDEPENDENT_MAC_EDITION_THEATERS_BOTH_DENSITIES_ORIGINAL_RELEASE_AND_REENTRY';
} catch (error) { failure = error; }
await session.close(failure);
if (failure) throw failure;
console.log(JSON.stringify({ status: report.status, edition, cases: report.cases.length,
    technical: report.technicalStatus, runtime: report.runtimeSourceCommit }));
