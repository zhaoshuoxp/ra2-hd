// Exercise ordinary map loading in an isolated copied app, including non-HD theaters.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { startSession } from '../../m1/allied-units/desktop-session.mjs';

const [receipt, output] = process.argv.slice(2);
const edition = process.argv.includes('--edition=ra2') ? 'ra2' : 'yr';
const density = process.argv.includes('--density=2') ? 2 : 4;
const enabled = !process.argv.includes('--original');
const matrixFile = process.argv.find(arg => arg.startsWith('--matrix='))?.slice(9);
const matrix = matrixFile ? JSON.parse(await fs.readFile(matrixFile)).maps
    .filter(row => row.mapId.startsWith(edition+':')).map(row => row.mapId.split(':')[1]) : [];
const session = await startSession(receipt, output, edition, false, async ({ page, report }) => {
    report.consoleErrors = [];
    page.on('console', message => {
        if (message.type() === 'error') report.consoleErrors.push(message.text());
    });
    await page.evaluate(({ density, enabled }) => {
        const graphics = window.__ra2debug.generalOptions.graphics;
        graphics.hdEnabled.value = enabled;
        graphics.hdDensity.value = density;
    }, { density, enabled });
});
let failure;
try {
    const { page, report } = session;
    report.disclosure = 'Native selected map, rules, loading and renderer. Map reveal and stopped AI are applied only after a running match. No environment artwork is produced for other theaters.';
    report.enabled = enabled;
    report.density = density;
    report.maps = [];
    report.samples = [];
    const selected = report.selectedMap.toLowerCase();
    const planned = [selected, ...matrix.filter(member => member !== selected)];
    for (const [index, member] of planned.entries()) {
        if (index) {
            await page.evaluate(({ edition, member }) => {
                const d = window.__ra2debug;
                clearInterval(window.__allied.timer);
                window.__mapLoadPreviousGame = d.game;
                window.__mapLoadPreviousEnvironment = d.environmentHd;
                window.__mapLoadPreviousTerrain = d.terrainHd;
                const bots = Array(8).fill(null); bots[1] = { d: 4, c: 5, co: 2, s: 1, t: 1 };
                localStorage.setItem(`_edition:${edition}:_r_lastMap`, member);
                localStorage.setItem(`_edition:${edition}:_r_lastBots`, JSON.stringify(bots));
                d.gameScreen.controller.goToScreen(0, { route: { screenType: 1, params: undefined } });
            }, { edition, member });
            await page.waitForFunction(() => window.__ra2debug?.skirmishLobby, undefined, { timeout: 60000 });
            assert.equal(await page.evaluate(() => window.__ra2debug.skirmishLobby.gameOpts.mapName.toLowerCase()), member);
            await page.evaluate(index => window.__ra2debug.skirmishLobby.startGame(1700000000000+index), index);
            await page.waitForFunction(() => window.__ra2debug?.game?.status === 1
                && window.__ra2debug.game !== window.__mapLoadPreviousGame, undefined, { timeout: 90000 });
            await page.evaluate(() => window.__installAlliedFixtures());
        }
        const samples = [];
        for (let i = 0; i < 2; i++) {
            await page.waitForTimeout(matrixFile ? 300 : 1000);
            const sample = await page.evaluate(() => {
                const d = window.__ra2debug;
                d.renderer.render();
                const summarize = report => ({ density: report.density, budget: report.budget,
                    gpuBytes: report.gpuBytes, worldChargeBytes: report.worldChargeBytes,
                    disposed: report.disposed });
                return { tick: d.game.currentTick, status: d.game.status,
                    glError: d.renderer.renderer.getContext().getError(),
                    environment: { ...summarize(d.environmentHd), families: Object.fromEntries(
                        Object.entries(d.environmentHd.families).filter(([, row]) => row.reason !== 'not-selected')) },
                    terrain: { ...summarize(d.terrainHd), groups: d.terrainHd.groups.map(row =>
                        ({ id: row.id, status: row.status, reason: row.reason })), bindings: d.terrainHd.placedBindings.length },
                    correctedBuildings: d.game.getWorld().getAllObjects().filter(o => ['CALA14', 'CALA15'].includes(o.name))
                        .map(o => ({ id: o.id, name: o.name, foundation: o.art.foundation,
                            rendered: !!d.renderableManager.getRenderableByGameObject(o)?.get3DObject() })),
                    rendering: d.renderer.renderer.info.render,
                    output: [d.renderer.renderer.domElement.width, d.renderer.renderer.domElement.height] };
            });
            assert.equal(sample.status, 1);
            assert.equal(sample.glError, 0);
            assert(sample.rendering.calls > 0);
            for (const building of sample.correctedBuildings) {
                assert.deepEqual(building.foundation, { width: 3, height: 3 });
                assert(building.rendered);
            }
            samples.push(sample);
        }
        assert(samples.at(-1).tick > samples[0].tick);
        const release = index ? await page.evaluate(() => Object.fromEntries([
            ['environment', window.__mapLoadPreviousEnvironment], ['terrain', window.__mapLoadPreviousTerrain]
        ].map(([key, value]) => [key, { disposed: value.disposed, worldChargeBytes: value.worldChargeBytes }]))) : undefined;
        if (release) {
            assert(release.environment.disposed && release.environment.worldChargeBytes === 0);
            assert(release.terrain.disposed && release.terrain.worldChargeBytes === 0);
        }
        report.maps.push({ member, status: 'PASS_RUNNING_NATIVE_MAP', samples, release });
        assert.equal(report.errors.length, 0);
        assert.equal(report.consoleErrors.length, 0);
        await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2)+'\n');
        console.log(JSON.stringify({ member, completed: report.maps.length, planned: planned.length }));
    }
    assert.equal(report.errors.length, 0);
    assert.equal(report.consoleErrors.length, 0);
    await page.screenshot({ path: path.join(output, 'running-map.png') });
} catch (error) {
    failure = error;
    session.report.status = 'FAIL';
    session.report.failure = error.stack;
    session.report.setupDiagnostics = await session.page.evaluate(() => ({ text: document.body.innerText.slice(-4000),
        lobby: window.__ra2debug?.skirmishLobby?.gameOpts, gameStatus: window.__ra2debug?.game?.status })).catch(() => undefined);
    await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(session.report, null, 2)+'\n');
    await session.page.screenshot({ path: path.join(output, 'map-failure.png') }).catch(() => {});
}
await session.close(failure);
if (failure) throw failure;
console.log(JSON.stringify({ status: session.report.status, map: session.report.selectedMap, density, enabled }));
