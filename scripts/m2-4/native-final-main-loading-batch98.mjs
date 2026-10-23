// Incremental checks for the newly merged canonical terrain and preparation paths.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { startSession } from '../m1/allied-units/desktop-session.mjs';
import { installNativeObjectBindings } from '../m2/official-maps/native-object-bindings.mjs';

const [stage, output] = process.argv.slice(2);
const root = '.artifacts/m2-4/newurban-final-actors-batch98-20261021';
const reusePrefix = '--reuse-loading=';
const reuseLoading = process.argv.find(arg => arg.startsWith(reusePrefix))?.slice(reusePrefix.length);
process.argv.push('--map=rushhr.map', '--bot-slot=1');
const session = await startSession(stage, output, 'yr', false, async ({ page }) => {
    await page.evaluate(reuseLoading => {
        const g = window.__ra2debug.generalOptions.graphics;
        g.hdEnabled.value = !reuseLoading;
        g.hdDensity.value = 4;
    }, reuseLoading);
});
const { page, report } = session;
report.runtimeSourceCommit = JSON.parse(await fs.readFile(stage)).runtimeSourceHead;
report.cases = [];

async function switchMap(map, density) {
    await page.evaluate(({ map, density }) => {
        const d = window.__ra2debug;
        clearInterval(window.__allied.timer);
        window.__final98Old = { game: d.game, terrain: d.terrainHd, environment: d.environmentHd,
            demand: d.worldView.sovietUnitsHd };
        d.generalOptions.graphics.hdEnabled.value = density !== 1;
        d.generalOptions.graphics.hdDensity.value = density === 1 ? 2 : density;
        localStorage.setItem('_edition:yr:_r_lastMap', map);
        d.gameScreen.controller.goToScreen(0, { route: { screenType: 1, params: undefined } });
    }, { map, density });
    await page.waitForFunction(() => window.__ra2debug?.skirmishLobby, undefined, { timeout: 60000 });
    await page.evaluate(() => window.__ra2debug.skirmishLobby.startGame(1700000000000));
    await page.waitForFunction(() => window.__ra2debug?.game?.status === 1
        && window.__ra2debug.game !== window.__final98Old.game, undefined, { timeout: 90000 });
    const released = await page.evaluate(() => ({ terrain: window.__final98Old.terrain,
        environment: window.__final98Old.environment, demand: window.__final98Old.demand.report.gpuBytes }));
    assert(released.terrain.disposed && released.terrain.worldChargeBytes === 0);
    assert(released.environment.disposed && released.environment.worldChargeBytes === 0 && released.demand === 0);
    await page.evaluate(() => window.__installAlliedFixtures());
    return released;
}

async function inspect(map, density, walk = false) {
    await installNativeObjectBindings(page);
    const row = { map, density };
    report.cases.push(row);
    row.before = await page.evaluate(() => {
        const d = window.__ra2debug, w = d.worldView;
        const baseline = (w.conscriptHd?.report.gpuBytes ?? 0) + (w.powerPlantHd?.report.gpuBytes ?? 0)
            + (w.napowrHd?.report.gpuBytes ?? 0) + [...(w.rhinoHd?.parts.values() ?? [])].reduce((n, p) =>
                n + p.bitmap.width * p.bitmap.height * 5 + p.palette.image.data.byteLength, 0);
        const eager = Object.entries(w.sovietBuildingsHd ?? {}).filter(([name]) => !d.sovietUnitsHd.families[name])
            .reduce((n, [, family]) => n + family.report.gpuBytes, 0);
        return { total: baseline + eager + d.sovietUnitsHd.gpuBytes + d.terrainHd.worldChargeBytes
                + d.environmentHd.worldChargeBytes, limit: d.terrainHd.budget, tick: d.game.currentTick,
            environment: d.environmentHd, terrain: d.terrainHd, prepared: { ...d.preparedHdCache },
            mode: d.game.gameModeType, options: d.game.gameOpts };
    });
    assert(row.before.total <= row.before.limit);
    assert.equal(row.before.mode, 0);
    assert.equal(row.before.options.gameMode, 1);
    assert(Object.values(row.before.environment.families).every(f => f.density === density));
    assert(row.before.terrain.groups.every(g => g.status === 'PUBLISHED' && g.density === density));
    if (walk) {
        row.actor = await page.evaluate(() => {
            const d = window.__ra2debug, f = window.__allied;
            const actor = f.spawn('DNOA', 3);
            const tile = d.game.map.tiles.getAll().find(t => d.game.map.isWithinBounds(t) && !t.rampType
                && Math.hypot(t.rx - actor.tile.rx, t.ry - actor.tile.ry) >= 4
                && Math.hypot(t.rx - actor.tile.rx, t.ry - actor.tile.ry) <= 6
                && d.game.map.terrain.getPassableSpeed(t, actor.rules.speedType, true, false) > 0
                && d.game.map.getTileZone(t) === 0 && !d.game.map.getGroundObjectsOnTile(t).length);
            if (!tile) throw Error('No legal unchanged terrain destination');
            window.__final98Actor = actor;
            window.__final98Destination = tile;
            d.actionsApi.orderUnits([actor.id], 0, tile.rx, tile.ry);
            return { id: actor.id, destination: [tile.rx, tile.ry] };
        });
        await page.waitForFunction(() => window.__final98Actor.isMoving, undefined, { timeout: 15000 });
        row.actor.walking = await page.evaluate(() => window.__m23Binding(window.__final98Actor));
        assert(row.actor.walking.hd?.endsWith(`/NEWURBAN/tiles/${density}`));
        await page.waitForFunction(() => !window.__final98Actor.isMoving
            && window.__final98Actor.tile === window.__final98Destination, undefined, { timeout: 60000 });
    }
    await page.waitForFunction(tick => window.__ra2debug.game.currentTick >= tick + 16, row.before.tick);
    row.after = await page.evaluate(() => ({ tick: window.__ra2debug.game.currentTick,
        glError: window.__ra2debug.renderer.renderer.getContext().getError() }));
    assert.equal(row.after.glError, 0);
    return row;
}

let failure;
try {
    report.disclosure = 'Only canonical-main terrain-island/preparation changes are rechecked. Full actor state, source-lighting and accepted artwork evidence is reused. No Windows runtime or repeated full faction matrix is claimed.';
    if (reuseLoading) {
        const bytes = await fs.readFile(reuseLoading), prior = JSON.parse(bytes);
        assert(prior.failure?.includes('native-review-media-decode'));
        assert.equal(prior.runtimeSourceCommit, report.runtimeSourceCommit);
        assert.deepEqual(prior.cases.map(c => [c.map, c.density]),
            [['rushhr.map', 4], ['xmp26s6.map', 2], ['rushhr.map', 2], ['rushhr.map', 1]]);
        for (const row of prior.cases) {
            assert.equal(row.after.glError, 0);
            assert(row.before.total <= row.before.limit);
            assert(Object.values(row.before.environment.families).every(f => f.density === row.density));
        }
        report.cases = prior.cases;
        for (const key of ['snowRelease', 'twoXRelease', 'originalRelease']) report[key] = prior[key];
        report.reusedCompletedLoading = { file: reuseLoading,
            sha256: createHash('sha256').update(bytes).digest('hex'),
            scope: 'Four completed loading/movement/Original subcases only. The blocked data-URL media probe is not passing evidence.' };
        report.freshOriginal = await inspect('rushhr.map', 1);
    } else {
        await inspect('rushhr.map', 4, true);
        report.snowRelease = await switchMap('xmp26s6.map', 2);
        await inspect('xmp26s6.map', 2);
        report.twoXRelease = await switchMap('rushhr.map', 2);
        await inspect('rushhr.map', 2, true);
        report.originalRelease = await switchMap('rushhr.map', 1);
        await inspect('rushhr.map', 1);
    }
    report.originalDinosaur = await page.evaluate(() => window.__m23Binding(window.__ra2debug.game.getWorld()
        .getAllObjects().find(o => o.name === 'DNOA' && o.isSpawned)));
    assert(!report.originalDinosaur.hd);
    report.media = [];
    for (const [run, caseName] of [['native-2x-v1', 'manhattan'], ['native-2x-v1', 'dinosaur'],
        ['native-4x-v5', 'manhattan'], ['native-4x-v5', 'dinosaur']]) {
        const source = JSON.parse(await fs.readFile(`${root}/${run}/report.json`));
        const clip = source[caseName].nativeStates.actors[0].clip;
        const encoded = (await fs.readFile(clip)).toString('base64');
        const decoded = await page.evaluate(async encoded => {
            const video = document.createElement('video');
            video.muted = true;
            const bytes = Uint8Array.from(atob(encoded), character => character.charCodeAt(0));
            const url = URL.createObjectURL(new Blob([bytes], { type: 'video/webm' }));
            const loaded = new Promise((resolve, reject) => {
                video.onloadeddata = resolve;
                video.onerror = () => reject(Error('native-review-media-decode:' + video.error?.code));
                setTimeout(() => reject(Error('native-review-media-timeout')), 15000);
            });
            video.src = url;
            await loaded;
            // MediaRecorder's first capture can precede the first rendered game
            // frame. Decode an actual in-stream frame before checking its pixels.
            await new Promise((resolve, reject) => {
                const timer = setTimeout(() => reject(Error('native-review-media-seek-timeout')), 15000);
                video.onseeked = () => { clearTimeout(timer); resolve(); };
                video.currentTime = Number.isFinite(video.duration) ? Math.min(1, video.duration / 2) : 1;
            });
            const canvas = document.createElement('canvas');
            canvas.width = canvas.height = 8;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(video, 0, 0, 8, 8);
            const pixels = ctx.getImageData(0, 0, 8, 8).data;
            const result = { width: video.videoWidth, height: video.videoHeight, readyState: video.readyState, time: video.currentTime,
                decodedNonzeroChannels: [...pixels].filter((v, i) => i % 4 !== 3 && v > 0).length };
            video.removeAttribute('src');
            video.load();
            URL.revokeObjectURL(url);
            return result;
        }, encoded);
        report.media.push({ clip, decoded });
        assert(decoded.width > 0 && decoded.height > 0 && decoded.readyState >= 2 && decoded.decodedNonzeroChannels > 0);
    }
    report.reentryRelease = await switchMap('rushhr.map', 4);
    await inspect('rushhr.map', 4);
    report.technicalStatus = 'PASS_CURRENT_MAIN_BOTH_DENSITIES_NATIVE_WALK_RELEASE_ORIGINAL_REENTRY_AND_FOUR_CLIP_DECODES';
} catch (error) { failure = error; }
await session.close(failure);
if (failure) throw failure;
console.log(JSON.stringify({ status: report.status, technical: report.technicalStatus, runtimeSourceCommit: report.runtimeSourceCommit }));
