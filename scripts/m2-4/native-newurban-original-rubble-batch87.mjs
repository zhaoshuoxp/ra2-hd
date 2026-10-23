// Observe map-authored destroyed buildings without fabricating intact source placements.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { startSession } from '../m1/allied-units/desktop-session.mjs';
import { installNativeObjectBindings } from '../m2/official-maps/native-object-bindings.mjs';

const [receipt, output] = process.argv.slice(2);
const density = process.argv.includes('--density=2') ? 2 : 4;
process.argv.push('--map=manhatta.map', '--bot-slot=1');
const contract = JSON.parse(await fs.readFile('desktop/environment-newurban-hd-contract.json', 'utf8'));
const root = path.join('.local/environment-packs', contract.selectedPack.revision);
const pack = JSON.parse(await fs.readFile(path.join(root, 'manifest.json'), 'utf8'));
const names = ['CANEWY10', 'CANEWY11'];
const session = await startSession(receipt, output, 'yr', false, async ({ page }) => {
    await page.evaluate(density => {
        const graphics = window.__ra2debug.generalOptions.graphics;
        graphics.hdEnabled.value = true;
        graphics.hdDensity.value = density;
    }, density);
});
let failure;
try {
    const { page, report } = session;
    await installNativeObjectBindings(page);
    report.theater = 'NEWURBAN';
    report.requestedDensity = density;
    report.selectedEnvironmentRevision = contract.selectedPack.revision;
    report.disclosure = 'Original manhatta.map placements start destroyed. Read-only observation of actual native rubble, camera pans and ordinary simulation ticks; inherited reveal/stopped-AI review fixture. No source, rule, health, spawn, owner or frame changes.';
    report.environment = await page.evaluate(() => window.__ra2debug.environmentHd);
    report.terrain = await page.evaluate(() => window.__ra2debug.terrainHd);
    assert.equal(report.environment.density, density);
    report.originalRubble = [];
    for (const name of names) {
        const family = contract.identities.yr[name];
        const [entry] = pack.families[family].members;
        const metadata = JSON.parse(await fs.readFile(path.join(root, entry.path), 'utf8'));
        const identity = `environment-aggregate/${entry.sha256}/${metadata.source.sha256}/NEWURBAN/tiles/${density}`;
        const observations = await page.evaluate(name => window.__ra2debug.game.getWorld().getAllObjects()
            .filter(object => object.name === name).map(window.__m23Binding), name);
        assert(observations.length > 0);
        assert(observations.every(row => row.destroyed && !row.spawned && row.health === 0
            && row.rubble?.visible && row.rubble.frame === 3 && row.rubble.hd === identity));
        const observed = observations[0];
        await page.evaluate(tile => {
            const d = window.__ra2debug;
            d.worldInteraction.minimapHandler.panToTile(d.game.map.tiles.getByMapCoords(tile[0], tile[1]));
        }, observed.tile);
        await page.waitForTimeout(160);
        const before = await page.evaluate(() => window.__ra2debug.game.currentTick);
        await page.waitForFunction(tick => window.__ra2debug.game.currentTick > tick + 8, before);
        const capture = await page.evaluate(id => {
            const d = window.__ra2debug;
            const object = d.game.getWorld().getAllObjects().find(object => object.id === id);
            const r = d.renderableManager.getRenderableByGameObject(object);
            d.renderer.render();
            const canvas = d.renderer.renderer.domElement, v = d.worldScene.viewport;
            const p = r.getPosition().clone().project(d.worldScene.camera), ratio = canvas.width / d.renderer.width;
            const cx = (v.x + (p.x + 1) * v.width / 2) * ratio;
            const cy = (v.y + (1 - p.y) * v.height / 2) * ratio;
            const width = 720, height = 540;
            const left = Math.max(0, Math.min(canvas.width - width, Math.round(cx - width / 2)));
            const top = Math.max(0, Math.min(canvas.height - height, Math.round(cy - height / 2)));
            const detail = document.createElement('canvas');
            detail.width = width; detail.height = height;
            detail.getContext('2d').drawImage(canvas, left, top, width, height, 0, 0, width, height);
            return { png: detail.toDataURL('image/png').split(',')[1], source: [left, top, width, height],
                buffer: [canvas.width, canvas.height], tick: d.game.currentTick, glError: d.renderer.renderer.getContext().getError(),
                binding: window.__m23Binding(object) };
        }, observed.id);
        assert.equal(capture.glError, 0);
        assert(capture.tick > before && capture.binding.rubble.hd === identity && capture.binding.rubble.visible);
        const file = `${name}-original-map-rubble-native-detail.png`;
        await fs.writeFile(path.join(session.out, file), Buffer.from(capture.png, 'base64'));
        delete capture.png;
        report.originalRubble.push({ name, family, originalPlacements: observations, capture: { ...capture, file, rescaled: false } });
    }
    report.bindingStatus = 'PASS_ORIGINAL_DESTROYED_PLACEMENTS_NATIVE_RUBBLE_SOURCE_AND_TICKS';
    report.graphics = await page.evaluate(() => ({ prepared: { ...window.__ra2debug.preparedHdCache },
        glError: window.__ra2debug.renderer.renderer.getContext().getError() }));
    assert.equal(report.graphics.glError, 0);
} catch (error) { failure = error; }
await session.close(failure);
if (failure) throw failure;
console.log(JSON.stringify({ output, density, originalDestroyedGroups: 2, status: 'PASS_ORIGINAL_MAP_RUBBLE' }));
