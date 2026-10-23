// Focused complete-family binding and native removal checks, in an isolated runtime.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { startSession } from '../m1/allied-units/desktop-session.mjs';

const [receipt, output] = process.argv.slice(2);
const density = process.argv.includes('--density=2') ? 2 : 4;
const edition = process.argv.includes('--edition=ra2') ? 'ra2' : 'yr';
const control = process.argv.includes('--control');
const expectedMap = control ? 'XMP19T4.map' : edition === 'yr' ? 'XMP03T4.map' : 'MP03T4.map';
const requestedMap = process.argv.find(arg => arg.startsWith('--map='))?.slice(6);
if (requestedMap) assert.equal(requestedMap.toLowerCase(), expectedMap.toLowerCase());
else process.argv.push('--map=' + expectedMap);
const completeTerrain = process.argv.includes('--complete-terrain');
const expectedFamilies = Number(process.argv.find(arg => arg.startsWith('--expected-families='))?.split('=')[1] ?? 6);
const { page, app, report, stage, close } = await startSession(receipt, output, edition, false,
    async ({ page }) => page.evaluate(density => {
        const graphics = window.__ra2debug.generalOptions.graphics;
        graphics.hdEnabled.value = true;
        graphics.hdDensity.value = density;
    }, density));
let failure;
const capture = async name => {
    await stage(name);
    const png = await page.evaluate(() => {
        const d = window.__ra2debug;
        d.renderer.render();
        return d.renderer.renderer.domElement.toDataURL('image/png').split(',')[1];
    });
    await fs.writeFile(path.join(output, name + '-framebuffer.png'), Buffer.from(png, 'base64'));
};
try {
    report.disclosure = 'Incremental M2.2 batch: actual placed resource bindings, native tree removal, and resource lifecycle. Remaining map resources are incomplete. Controlled reveal and bot suspension are inherited from the fixture; no natural-match or final visual acceptance claim.';
    await page.evaluate(() => {
        const d = window.__ra2debug;
        d.generalOptions.graphics.renderResolution.value = '1080p';
        d.renderer.setRenderResolution('1080p');
    });
    await page.waitForTimeout(1200);
    report.terrain = await page.evaluate(() => window.__ra2debug.terrainHd);
    report.environment = await page.evaluate(() => window.__ra2debug.environmentHd);
    assert.equal(report.terrain.density, density);
    const grass = report.terrain.groups.find(group => group.id === 'm2-2-thickgrass');
    assert(grass, 'Selected grass group must be registered');
    assert.equal(grass.status, 'PUBLISHED');
    assert.equal(grass.entries.length, 38);
    if (completeTerrain) {
        const expected = { thickgrass: 38, pavecrop: 54, dirtroads: 28, shore: 39, watercontacts: 18 };
        report.newTerrainGroups = {};
        for (const [name, members] of Object.entries(expected)) {
            const group = report.terrain.groups.find(group => group.id === 'm2-2-' + name);
            assert(group, `Missing selected terrain group ${name}`);
            assert.equal(group.status, 'PUBLISHED');
            assert.equal(new Set(group.entries.map(entry => entry.member)).size, members);
            const placements = report.terrain.placedBindings.filter(binding => binding.group === group.id);
            report.newTerrainGroups[name] = { members, placements: placements.length };
            if (!control) assert(placements.length > 0, `No native placement uses ${name}`);
        }
    }
    assert.equal(report.environment.density, density);
    const families = Object.values(report.environment.families).filter(family => family.reason !== 'not-selected');
    assert(families.length > 0, 'Map must encounter at least one selected tree family');
    assert(families.every(family => family.status === 'PUBLISHED_COMPLETE_FAMILY'),
        'Every encountered selected family must publish completely');
    report.bindings = await page.evaluate(() => {
        const d = window.__ra2debug;
        const rows = d.game.getWorld().getAllObjects().filter(object => object.isTerrain()).map(object => {
            const renderable = d.renderableManager.getRenderableByGameObject(object);
            const builder = renderable?.mainObj?.builder;
            return { id: object.id, name: object.name, tile: [object.tile.rx, object.tile.ry, object.tile.z],
                member: builder?.image?.filename, hdIdentity: builder?.hdOverride?.identity,
                nativeHasShadow: object.art.hasShadow, frame: builder?.getFrame() };
        });
        return { trees: rows.filter(row => row.hdIdentity), originalTrees: rows.filter(row => !row.hdIdentity),
            grass: d.terrainHd.placedBindings.filter(binding => binding.group === 'm2-2-thickgrass') };
    });
    assert(report.bindings.trees.length > 0, 'Actual tree builder must bind selected HD');
    if (!control) assert.equal(families.length, expectedFamilies);
    // The terrain receipt names the resolved group; check actual renderer placements.
    if (!report.bindings.grass.length) report.bindings.grass = report.terrain.placedBindings.filter(binding =>
        grass.entries.some(entry => entry.member === binding.member));
    assert(report.bindings.grass.length > 0, 'Actual map cells must bind the selected grass group');
    for (const [name, coords] of [['grass', report.bindings.grass[0].tile],
        ['trees', report.bindings.trees[0].tile]]) {
        await page.evaluate(coords => {
            const d = window.__ra2debug;
            d.worldInteraction.minimapHandler.panToTile(d.game.map.tiles.getByMapCoords(coords[0], coords[1]));
        }, coords);
        await page.waitForTimeout(200);
        await capture(name + '-actual-size');
    }
    if (!control) {
        const victim = report.bindings.trees[0];
        report.removal = await page.evaluate(id => {
            const d = window.__ra2debug;
            const object = d.game.getWorld().getAllObjects().find(object => object.id === id);
            window.__removedEnvironmentObject = object;
            const before = { spawned: object.isSpawned, destroyed: object.isDestroyed,
                renderable: !!d.renderableManager.getRenderableByGameObject(object) };
            d.game.destroyObject(object, undefined, true);
            return { name: object.name, id, before };
        }, victim.id);
        await page.waitForTimeout(250);
        report.removal.after = await page.evaluate(() => {
            const d = window.__ra2debug, object = window.__removedEnvironmentObject;
            return { spawned: object.isSpawned, destroyed: object.isDestroyed,
                renderable: !!d.renderableManager.getRenderableByGameObject(object),
                tileRetainsObject: d.game.map.getGroundObjectsOnTile(object.tile).includes(object) };
        });
        assert.equal(report.removal.after.spawned, false);
        assert.equal(report.removal.after.renderable, false);
        assert.equal(report.removal.after.tileRetainsObject, false);
        await capture('tree-native-removal');
    }
    report.graphics = await page.evaluate(() => {
        const d = window.__ra2debug, renderer = d.renderer.renderer;
        return { framebuffer: [renderer.domElement.width, renderer.domElement.height],
            viewport: [d.renderer.width, d.renderer.height], glError: renderer.getContext().getError(),
            textures: renderer.info.memory.textures };
    });
    assert.equal(report.graphics.glError, 0);
    report.processMemory = await app.evaluate(({ app }) => app.getAppMetrics().map(process =>
        ({ type: process.type, memory: process.memory })));
    if (process.argv.includes('--lifecycle')) {
        report.reentry = [];
        for (const enabled of [false, true]) {
            await page.evaluate(enabled => {
                const d = window.__ra2debug;
                clearInterval(window.__allied.timer);
                window.__environmentOldGame = d.game;
                window.__environmentOldReport = d.environmentHd;
                d.generalOptions.graphics.hdEnabled.value = enabled;
            }, enabled);
            await page.evaluate(async () => { await window.r.reset; });
            await page.waitForFunction(() => window.__ra2debug?.game?.status === 1
                && window.__ra2debug.game !== window.__environmentOldGame, undefined, { timeout: 90000 });
            const state = await page.evaluate(() => ({ old: window.__environmentOldReport,
                current: window.__ra2debug.environmentHd }));
            assert.equal(state.old.disposed, true);
            assert.equal(state.old.worldChargeBytes, 0);
            if (enabled) assert.equal(state.current.density, density);
            else { assert.equal(state.current.density, 1); assert.equal(state.current.worldChargeBytes, 0); }
            report.reentry.push({ enabled, oldDisposed: true, current: state.current });
            await page.evaluate(() => window.__installAlliedFixtures());
            await capture('reentry-' + (enabled ? 'hd' : 'original'));
        }
    }
    assert.equal(report.errors.length, 0);
} catch (error) { failure = error; }
await close(failure);
if (failure) throw failure;
console.log(path.resolve(output, 'report.json'));
