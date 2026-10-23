import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { startSession } from '../m1/allied-units/desktop-session.mjs';

const [receipt, output] = process.argv.slice(2);
const density = process.argv.includes('--density=2') ? 2 : 4;
const original = process.argv.includes('--original');
const terrainOriginal = process.argv.includes('--terrain-original');
const corruptGround = process.argv.includes('--corrupt-ground');
const expectTerrain = process.argv.includes('--expect-terrain');
const cliffOnly = process.argv.includes('--cliff-only');
const flatGround = process.argv.includes('--flat-ground');
const fullProduction = process.argv.includes('--full-production');
const structuralCliffs = cliffOnly || flatGround || fullProduction;
const expectNative = process.argv.includes('--expect-native');
const expectPartial = process.argv.includes('--expect-partial');
const smoke = process.argv.includes('--smoke');
const edition = process.argv.includes('--edition=ra2') ? 'ra2' : 'yr';
const before = Date.now();
const session = await startSession(receipt, output, edition, false, async ({ page }) => {
    await page.evaluate(({ density, original }) => {
        const graphics = window.__ra2debug.generalOptions.graphics;
        graphics.hdEnabled.value = !original;
        graphics.hdDensity.value = density;
    }, { density, original });
    if (terrainOriginal || corruptGround) await page.evaluate(({ terrainOriginal, corruptGround }) => {
        const fetch = window.fetch;
        window.fetch = async (...args) => {
            const url = String(args[0]);
            if (terrainOriginal && url === '/local-terrain/selection.json') return new Response(null, { status: 404 });
            const response = await fetch.apply(window, args);
            if (corruptGround && /\/ground-[24]x\.rgba$/.test(url) && response.ok) {
                const bytes = new Uint8Array(await response.arrayBuffer());
                bytes[100] ^= 1;
                return new Response(bytes, { status: 200, headers: response.headers });
            }
            return response;
        };
    }, { terrainOriginal, corruptGround });
}, async ({ report }) => { report.mapLoadStarted = Date.now(); });
const { page, app, report, stage, startClip, stopClip, close } = session;
if (process.argv.includes('--matched-output')) await page.evaluate(() => {
    // Desktop startup can restore native output after the menu preference was set.
    // Set the same ordinary resolution after entry; camera/display scale is unchanged.
    const d = window.__ra2debug;
    d.generalOptions.graphics.renderResolution.value = '1080p';
    d.renderer.setRenderResolution('1080p');
});
const memorySnapshot = async label => {
    const processes = await app.evaluate(({ app }) => app.getAppMetrics().map(process => ({
        type: process.type, pid: process.pid, memory: process.memory,
    })));
    (report.processMemory ??= []).push({ label, processes });
};
const capture = async name => {
    await stage(name);
    const png = await page.evaluate(() => {
        const d = window.__ra2debug;
        d.renderer.render();
        return d.renderer.renderer.domElement.toDataURL('image/png').split(',')[1];
    });
    await fs.writeFile(path.join(output, name + '-framebuffer.png'), Buffer.from(png, 'base64'));
};
report.loadToFixtureMs = Date.now() - before;
report.mapEntryToFixtureMs = Date.now() - report.mapLoadStarted;
report.machine = { platform: os.platform(), arch: os.arch(), release: os.release(),
    cpu: os.cpus()[0].model, memory: os.totalmem() };
report.scene = { density: original ? 1 : density, sequence: 'fixed-seed-start, mixed, first-pan, sustained-pan, exit-reentry',
    terrainMode: terrainOriginal ? 'ORIGINAL_TERRAIN_WITH_EXISTING_M1_HD' : corruptGround ? 'CORRUPT_GROUND_AT_FETCH_BOUNDARY' : 'SELECTED',
    boundary: 'Same retail map, legal controlled roster, unchanged native camera and simulation. Bot thinking disabled in both observations.' };
let failure;
try {
    report.graphics = await page.evaluate(() => {
        const d = window.__ra2debug, r = d.renderer.renderer, gl = r.getContext();
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        return { backend: gl.getParameter(gl.VERSION), vendor: ext && gl.getParameter(ext.UNMASKED_VENDOR_WEBGL),
            renderer: ext && gl.getParameter(ext.UNMASKED_RENDERER_WEBGL), framebuffer: [r.domElement.width, r.domElement.height],
            viewport: [d.renderer.width, d.renderer.height], speed: d.game.gameOpts.gameSpeed };
    });
    await page.evaluate(edition => {
        const d = window.__ra2debug, f = window.__allied;
        for (const [i, name] of ['GACNST', 'GAPOWR', 'GAREFN', 'GAWEAP'].entries())
            f.building(name, { rx: f.center.rx + (i % 2) * 7, ry: f.center.ry + Math.floor(i / 2) * 7 });
        const roster = ['MTNK', 'E1', 'E2', 'HTNK', ...(edition === 'yr' ? ['YTNK', 'INIT'] : [])];
        for (const [i, name] of roster.entries()) {
            const unit = f.spawn(name, /^(E1|E2|INIT)$/.test(name) ? 3 : 7,
                { rx: f.center.rx + 8 + i, ry: f.center.ry + 5 });
            unit.attackTrait?.setDisabled(true);
        }
        d.worldInteraction.minimapHandler.panToTile(f.center);
    }, edition);
    await page.waitForTimeout(6000);
    await memorySnapshot('loaded-mixed-scene');
    await capture('mixed-actual-size');
    report.ui = await page.evaluate(() => window.__ra2debug.uiArt.metrics());
    assert(report.ui.reservedBytes <= report.ui.budget);
    if (!original) assert.equal(report.ui.revision, 'yuri-emblem-ui-v1');
    report.terrain = await page.evaluate(() => window.__ra2debug?.terrainHd);
    if (process.argv.includes('--integration')) {
        report.sceneMatrices = await page.evaluate(() => {
            const d = window.__ra2debug, terrain = [], cached = [];
            d.worldScene.scene.traverse(object => {
                if (object.name === 'map_tiles_hd' || object.name === 'map_tiles_original') {
                    const expected = object.parent.matrixWorld.clone().multiply(object.matrix);
                    terrain.push({ name: object.name, manualLocal: !object.matrixAutoUpdate,
                        currentWorld: expected.elements.every((value, index) =>
                            Math.abs(value - object.matrixWorld.elements[index]) < 1e-9) });
                }
                if (object.name.startsWith('unit-vxl-hd-')) cached.push({ name: object.name, visible: object.visible });
            });
            return { automaticRoots: d.renderer.getScenes().map(s => s.scene.matrixWorldAutoUpdate), terrain, cached };
        });
        assert(report.sceneMatrices.automaticRoots.every(value => value === false));
        assert(report.sceneMatrices.terrain.length > 0);
        assert(report.sceneMatrices.terrain.every(mesh => mesh.manualLocal && mesh.currentWorld));
        assert(report.sceneMatrices.cached.every(mesh => mesh.visible));
    }
    if (expectTerrain) {
        assert.equal(report.terrain.density, density);
        assert.equal(report.terrain.groups.filter(group => group.status === 'PUBLISHED').length, cliffOnly ? 2 : 3);
        assert(report.terrain.placedBindings.length > 0);
        if (fullProduction) {
            for (const [id, members, images] of [['ground', 88, 88], ['road-representative', 49, 313],
                ['elevation-representative', 168, 341]]) {
                const group = report.terrain.groups.find(g => g.id === id);
                assert.equal(group.entries.length, images);
                assert.equal(new Set(group.entries.map(e => e.member)).size, members);
            }
            const declared = report.terrain.groups.flatMap(g => g.entries);
            assert.equal(declared.length, 742);
            for (const binding of report.terrain.placedBindings) {
                assert(declared.some(e => e.member === binding.member && e.subTile === binding.subTile));
            }
        }
        if (structuralCliffs) {
            const entries = report.terrain.groups.find(group => group.id === 'elevation-representative').entries;
            assert.equal(entries.length, fullProduction ? 341 : 64);
            assert.equal(new Set(entries.map(entry => entry.member)).size, fullProduction ? 168 : 13);
            if (cliffOnly) assert(!report.terrain.placedBindings.some(binding => binding.group === 'ground'));
            for (const member of process.argv.includes('--map=XMP19T4.map') ? [] : ['ramp01.tem', 'ramp02.tem']) {
                assert(report.terrain.placedBindings.some(binding => binding.member === member));
            }
        }
    }
    if (original) assert.equal(report.terrain?.gpuBytes ?? 0, 0);
    if (expectNative) assert.equal(report.terrain?.gpuBytes ?? 0, 0);
    if (expectPartial) {
        assert.equal(report.terrain.groups.find(group => group.id === 'ground')?.status, 'ORIGINAL');
        assert.equal(report.terrain.groups.filter(group => group.status === 'PUBLISHED').length, 2);
        assert(!report.terrain.placedBindings.some(binding => binding.group === 'ground'));
    }
    const measure = async (label, pan) => {
        const result = await page.evaluate(async ({ pan }) => {
            const d = window.__ra2debug, f = window.__allied, tiles = d.game.map.tiles.getAll();
            const targets = [f.center, ...[20, 10, 9, 42, 21].map(set => tiles.filter(t =>
                d.game.map.isWithinBounds(t) && d.theater.tileSets.getSetNum(t.tileNum) === set)
                .sort((a, b) => Math.hypot(a.rx - f.center.rx, a.ry - f.center.ry)
                    - Math.hypot(b.rx - f.center.rx, b.ry - f.center.ry))[0]).filter(Boolean)];
            const times = [], start = performance.now(); let previous, index = 0;
            await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => reject(Error('Native frame measurement timed out')), 20000);
                const frame = now => {
                    try {
                        if (previous !== undefined) times.push(now - previous);
                        previous = now;
                        // The first RAF timestamp can precede performance.now()
                        // in the current frame. It must not select target -1.
                        const elapsed = Math.max(0, now - start);
                        if (pan && Math.floor(elapsed / 800) !== index) {
                            index = Math.floor(elapsed / 800);
                            d.worldInteraction.minimapHandler.panToTile(targets[index % targets.length]);
                        }
                        if (elapsed < 8000) requestAnimationFrame(frame);
                        else { clearTimeout(timeout); resolve(); }
                    } catch (error) {
                        clearTimeout(timeout); reject(error);
                    }
                };
                requestAnimationFrame(frame);
            });
            const sorted = [...times].sort((a, b) => a - b);
            return { samples: times.length, mean: times.reduce((a, b) => a + b, 0) / times.length,
                p50: sorted[Math.floor(sorted.length * .5)], p95: sorted[Math.floor(sorted.length * .95)],
                p99: sorted[Math.floor(sorted.length * .99)], max: sorted.at(-1), stalls50: times.filter(t => t > 50).length,
                targets: targets.map(t => [t.rx, t.ry, t.z]), render: { ...d.renderer.renderer.info.memory }, times };
        }, { pan });
        report[label] = result;
        await memorySnapshot(label);
    };
    if (!smoke) {
        await measure('mixedFrames', false);
        await measure('firstEncounterFrames', true);
        await startClip();
        await measure('sustainedPanFrames', true);
        await stopClip('terrain-pan');
    }
    for (const [name, set] of [['road', 20], ['cliff', 10], ['ramp', 9], ['transition', 42], ['water-control', 21]]) {
        report[name + 'View'] = await page.evaluate(set => {
            const d = window.__ra2debug, f = window.__allied;
            const tile = d.game.map.tiles.getAll().filter(t => d.game.map.isWithinBounds(t)
                && d.theater.tileSets.getSetNum(t.tileNum) === set)
                .sort((a, b) => Math.hypot(a.rx - f.center.rx, a.ry - f.center.ry)
                    - Math.hypot(b.rx - f.center.rx, b.ry - f.center.ry))[0];
            if (tile) d.worldInteraction.minimapHandler.panToTile(tile);
            return tile && [tile.rx, tile.ry, tile.z, tile.tileNum, tile.subTile];
        }, set);
        const viewTile = report[name + 'View'];
        report[name + 'ViewBinding'] = report.terrain?.placedBindings.find(binding =>
            binding.tile[0] === viewTile?.[0] && binding.tile[1] === viewTile?.[1]);
        if (viewTile) report[name + 'ViewScreenPoint'] = await page.evaluate(coords => {
            const d = window.__ra2debug, tile = d.game.map.tiles.getByMapCoords(coords[0], coords[1]);
            return d.worldInteraction.mapHoverHandler.mapTileIntersectHelper.getTileCenterScreenPoint(tile);
        }, viewTile);
        await page.waitForTimeout(160); await capture(name + '-actual-size');
    }
    if (process.argv.includes('--source-views')) {
        report.sourceViews = [];
        for (const [name, pattern, slots] of [['cliff-selected', '^cliff02\\.tem$', [0, 1]],
            ['ramp-selected', '^slope02[a-c]?\\.tem$', [0]], ['rough-ground', '^sandy01[a-g]?\\.tem$', [0]]]) {
            const row = await page.evaluate(({ pattern, slots }) => {
                const d = window.__ra2debug, f = window.__allied, matcher = new RegExp(pattern);
                const identity = tile => {
                    const entry = d.theater.tileSets.getTile(tile.tileNum);
                    return entry && entry.owner.fileName.toLowerCase()
                        + String(entry.index + 1).padStart(2, '0') + '.tem';
                };
                const tile = d.game.map.tiles.getAll().filter(t =>
                    slots.includes(t.subTile) && matcher.test(identity(t)))
                    .sort((a, b) => Number(d.game.map.isWithinBounds(b)) - Number(d.game.map.isWithinBounds(a))
                        || Math.hypot(a.rx - f.center.rx, a.ry - f.center.ry)
                            - Math.hypot(b.rx - f.center.rx, b.ry - f.center.ry))[0];
                if (!tile) throw Error('No placed native source matching ' + pattern);
                d.worldInteraction.minimapHandler.panToTile(tile);
                const binding = d.terrainHd?.placedBindings.find(b => b.tile[0] === tile.rx && b.tile[1] === tile.ry);
                return { tile: [tile.rx, tile.ry, tile.z, tile.tileNum, tile.subTile], binding,
                    screenPoint: d.worldInteraction.mapHoverHandler.mapTileIntersectHelper.getTileCenterScreenPoint(tile),
                    nativeEntry: identity(tile),
                    withinPlayableBounds: d.game.map.isWithinBounds(tile),
                    identityMethod: 'Native theater entry prefix and index; baseline has no TMP filename field' };
            }, { pattern, slots });
            const declared = report.terrain?.groups.flatMap(group => group.entries ?? [])
                .some(entry => new RegExp(pattern).test(entry.member));
            if (expectTerrain && declared) assert(row.binding && new RegExp(pattern).test(row.binding.member));
            report.sourceViews.push({ name, ...row });
            await page.waitForTimeout(160); await capture(name + '-actual-size');
        }
    }
    if (process.argv.includes('--cliff-region')) {
        report.cliffRegionViews = [];
        for (const [name, coords] of [['cliff-center', [37, 71]], ['cliff-left', [29, 66]], ['cliff-right', [45, 75]]]) {
            // Captures use native camera clamping and the same coordinates in Original and HD.
            const row = await page.evaluate(({ name, coords }) => {
                const d = window.__ra2debug, tiles = d.game.map.tiles.getAll();
                const center = d.game.map.tiles.getByMapCoords(coords[0], coords[1]);
                d.worldInteraction.minimapHandler.panToTile(center);
                const cells = tiles.filter(t => [9, 10].includes(d.theater.tileSets.getSetNum(t.tileNum)))
                    .map(t => {
                        const entry = d.theater.tileSets.getTile(t.tileNum);
                        const member = entry.owner.fileName.toLowerCase() + String(entry.index + 1).padStart(2, '0') + '.tem';
                        const point = d.worldInteraction.mapHoverHandler.mapTileIntersectHelper.getTileCenterScreenPoint(t);
                        const binding = d.terrainHd?.placedBindings.find(b => b.tile[0] === t.rx && b.tile[1] === t.ry);
                        return { tile: [t.rx, t.ry, t.z, t.tileNum, t.subTile], member,
                            nativeCandidates: entry.files.map(file => file.filename), point, binding };
                    }).filter(t => t.point.x > 0 && t.point.x < d.renderer.width - 170
                        && t.point.y > 0 && t.point.y < d.renderer.height - 35);
                return { name, center: coords, cells };
            }, { name, coords });
            if (expectTerrain && (cliffOnly || fullProduction)) {
                const declared = new Set(report.terrain.groups.find(g => g.id === 'elevation-representative')
                    .entries.map(entry => entry.member));
                for (const cell of row.cells.filter(cell => declared.has(cell.member))) {
                    assert(cell.nativeCandidates.includes(cell.binding?.member));
                    assert.equal(cell.binding?.subTile, cell.tile[4]);
                }
            }
            report.cliffRegionViews.push(row);
            await page.waitForTimeout(160); await capture(name + '-actual-size');
        }
    }
    if (process.argv.includes('--ground-region')) {
        report.groundRegionViews = [];
        for (const [name, setIndex] of [['grass-flat', 0], ['dirt-flat', 41],
            ['grass-dirt-transition', 42], ['ground-water-contact', 21]]) {
            const row = await page.evaluate(({ name, setIndex }) => {
                const d = window.__ra2debug, f = window.__allied, tiles = d.game.map.tiles.getAll();
                const center = tiles.filter(t => d.game.map.isWithinBounds(t)
                    && !t.rampType && d.theater.tileSets.getSetNum(t.tileNum) === setIndex)
                    .sort((a, b) => Math.hypot(a.rx - f.center.rx, a.ry - f.center.ry)
                        - Math.hypot(b.rx - f.center.rx, b.ry - f.center.ry))[0];
                if (!center) throw Error('No native ground review center for ' + name);
                d.worldInteraction.minimapHandler.panToTile(center);
                const cells = tiles.map(t => {
                    const entry = d.theater.tileSets.getTile(t.tileNum);
                    const point = d.worldInteraction.mapHoverHandler.mapTileIntersectHelper.getTileCenterScreenPoint(t);
                    const binding = d.terrainHd?.placedBindings.find(b => b.tile[0] === t.rx && b.tile[1] === t.ry);
                    return { tile: [t.rx, t.ry, t.z, t.tileNum, t.subTile],
                        member: entry.owner.fileName.toLowerCase() + String(entry.index + 1).padStart(2, '0') + '.tem',
                        setIndex: d.theater.tileSets.getSetNum(t.tileNum), point, binding };
                }).filter(c => c.point.x > 0 && c.point.x < d.renderer.width - 170
                    && c.point.y > 0 && c.point.y < d.renderer.height - 35);
                return { name, center: [center.rx, center.ry, center.z], cells };
            }, { name, setIndex });
            if ((flatGround || fullProduction) && expectTerrain) {
                for (const cell of row.cells.filter(c => [0, 41, 42, ...(fullProduction ? [33, 34] : [])].includes(c.setIndex))) {
                    assert.equal(cell.binding?.group, 'ground');
                    assert.equal(cell.binding?.subTile, cell.tile[4]);
                }
            }
            report.groundRegionViews.push(row);
            await page.waitForTimeout(160); await capture(name + '-actual-size');
        }
    }
    if (process.argv.includes('--production-views')) {
        report.productionViews = [];
        const views = [['rough-ground-full', [33, 34]], ['grass-slope-full', [9]],
            ['cliff-closure-full', [10]], ['connector-full', [25, 43]], ['road-main-full', [20]],
            ['road-end-full', [36]], ['road-connection-full', [40]], ['road-slope-full', [47]]];
        const focused = process.argv.includes('--seam-views');
        for (const [name, sets] of views.filter(([name]) => !focused ||
            ['grass-slope-full', 'road-main-full', 'road-slope-full'].includes(name))) {
            const row = await page.evaluate(({ name, sets }) => {
                const d = window.__ra2debug, f = window.__allied;
                const all = d.game.map.tiles.getAll();
                const candidates = all.filter(t => d.game.map.isWithinBounds(t)
                    && sets.includes(d.theater.tileSets.getSetNum(t.tileNum)))
                    .sort((a, b) => Math.hypot(a.rx - f.center.rx, a.ry - f.center.ry)
                        - Math.hypot(b.rx - f.center.rx, b.ry - f.center.ry));
                const tile = candidates[0];
                if (!tile) return { name, sets, status: 'ABSENT_ON_THIS_UNCHANGED_RETAIL_MAP' };
                d.worldInteraction.minimapHandler.panToTile(tile);
                const cells = all.map(t => {
                    const setIndex = d.theater.tileSets.getSetNum(t.tileNum);
                    const point = d.worldInteraction.mapHoverHandler.mapTileIntersectHelper.getTileCenterScreenPoint(t);
                    const binding = d.terrainHd?.placedBindings.find(b => b.tile[0] === t.rx && b.tile[1] === t.ry);
                    return { tile: [t.rx, t.ry, t.z, t.tileNum, t.subTile], setIndex, point, binding };
                }).filter(c => c.point.x > 0 && c.point.x < d.renderer.width - 170
                    && c.point.y > 0 && c.point.y < d.renderer.height - 35);
                return { name, sets, status: 'CAPTURED', center: [tile.rx, tile.ry, tile.z], cells };
            }, { name, sets });
            if (fullProduction && expectTerrain && row.cells) {
                const selected = [0, 41, 42, 33, 34, 20, 36, 40, 47, 9, 10, 25, 43];
                for (const cell of row.cells.filter(c => selected.includes(c.setIndex))) {
                    assert(cell.binding, JSON.stringify(cell));
                    assert.equal(cell.binding.subTile, cell.tile[4]);
                }
            }
            report.productionViews.push(row);
            if (row.cells) { await page.waitForTimeout(160); await capture(name + '-actual-size'); }
        }
    }
    report.terrainWorldAllocation = await page.evaluate(() => {
        const d = window.__ra2debug, w = d.worldView, demand = d.sovietUnitsHd, t = d.terrainHd;
        const baseline = (w.conscriptHd?.report.gpuBytes ?? 0) + (w.powerPlantHd?.report.gpuBytes ?? 0)
            + (w.napowrHd?.report.gpuBytes ?? 0)
            + [...(w.rhinoHd?.parts.values() ?? [])].reduce((n, p) => n + p.bitmap.width * p.bitmap.height * 5
                + p.palette.image.data.byteLength, 0);
        const eager = Object.entries(w.sovietBuildingsHd ?? {}).filter(([name]) => !demand.families[name])
            .reduce((n, [, family]) => n + family.report.gpuBytes, 0);
        const charge = t?.worldChargeBytes ?? 0;
        const environmentCharge = d.environmentHd?.worldChargeBytes ?? 0;
        return { baseline, eager, demand: demand.gpuBytes, terrainGpu: t?.gpuBytes ?? 0,
            terrainCpu: t?.retainedCpuBytes ?? 0, terrainCharge: charge,
            environmentCharge,
            totalCharged: baseline + eager + demand.gpuBytes + charge + environmentCharge,
            limit: baseline + eager + demand.budget + charge + environmentCharge };
    });
    assert(report.terrainWorldAllocation.totalCharged <= report.terrainWorldAllocation.limit);
    assert(report.terrainWorldAllocation.totalCharged <= (density === 2 ? 256 : 1280) * 1024 * 1024);
    if (process.argv.includes('--placement')) {
        report.placement = await page.evaluate(() => {
            const d = window.__ra2debug, g = d.game, f = window.__allied, name = 'GAPOWR';
            const worker = g.getConstructionWorker(d.localPlayer);
            const binding = d.terrainHd.placedBindings.filter(b => b.group === 'ground')
                .sort((a, b) => Math.hypot(a.tile[0] - f.center.rx, a.tile[1] - f.center.ry)
                    - Math.hypot(b.tile[0] - f.center.rx, b.tile[1] - f.center.ry))
                .find(b => worker.canPlaceAt(name, g.map.tiles.getByMapCoords(...b.tile)));
            if (!binding) throw Error('No native legal adjacent foundation on selected HD ground');
            const tile = g.map.tiles.getByMapCoords(...binding.tile);
            const preview = worker.getPlacementPreview(name, tile);
            const mode = d.gameScreen.playerUi.placementMode;
            d.worldInteraction.minimapHandler.panToTile(tile);
            mode.setBuilding(g.rules.getObject(name, 2)); d.worldInteraction.setMode(mode);
            mode.hover({ tile }, false); mode.updateGridModel(name);
            const helper = d.worldInteraction.mapHoverHandler.mapTileIntersectHelper;
            const point = helper.getTileCenterScreenPoint(tile), picked = helper.getTileAtScreenPoint(point);
            window.__terrainPlacement = { worker, tile, name };
            return { name, member: binding.member, target: [tile.rx, tile.ry], point,
                picked: [picked.rx, picked.ry], preview, grid: mode.placementGridModel.tiles,
                visible: mode.placementGridModel.visible };
        });
        assert(report.placement.visible && report.placement.preview.every(cell => cell.buildable));
        assert.deepEqual(report.placement.grid, report.placement.preview);
        assert.deepEqual(report.placement.picked, report.placement.target);
        await capture('native-placement-grid');
        report.placement.after = await page.evaluate(() => {
            const d = window.__ra2debug, f = window.__terrainPlacement;
            d.worldInteraction.setMode(undefined);
            const building = f.worker.placeAt(f.name, f.tile)[0];
            const occupied = d.game.map.tileOccupation.calculateTilesForGameObject(building.tile, building);
            return { tile: [building.tile.rx, building.tile.ry],
                occupied: occupied.map(t => [t.rx, t.ry]),
                canPlaceAgain: f.worker.canPlaceAt(f.name, f.tile) };
        });
        assert.equal(report.placement.after.canPlaceAgain, false);
        assert.deepEqual(report.placement.after.occupied.sort(),
            report.placement.preview.map(cell => [cell.rx, cell.ry]).sort());
        await page.waitForTimeout(150); await capture('native-placed-building');
    }
    if (process.argv.includes('--interaction')) {
        report.picking = await page.evaluate(() => {
            const d = window.__ra2debug, f = window.__allied;
            const helper = d.worldInteraction.mapHoverHandler.mapTileIntersectHelper;
            const chosen = d.terrainHd.placedBindings.filter(b => {
                const tile = d.game.map.tiles.getByMapCoords(...b.tile);
                return d.game.map.isWithinBounds(tile) && !tile.rampType
                    && ['ground', 'road-representative'].includes(b.group);
            }).sort((a, b) => Math.hypot(a.tile[0] - f.center.rx, a.tile[1] - f.center.ry)
                - Math.hypot(b.tile[0] - f.center.rx, b.tile[1] - f.center.ry));
            const cases = ['ground', 'road-representative'].flatMap(group => chosen.filter(b => b.group === group).slice(0, 4));
            return cases.map(binding => {
                const tile = d.game.map.tiles.getByMapCoords(...binding.tile);
                d.worldInteraction.minimapHandler.panToTile(tile);
                const point = helper.getTileCenterScreenPoint(tile), picked = helper.getTileAtScreenPoint(point);
                return { source: binding.member, expected: [tile.rx, tile.ry], point,
                    actual: picked && [picked.rx, picked.ry] };
            });
        });
        report.picking.forEach(row => assert.deepEqual(row.actual, row.expected));
        report.rampPassage = await page.evaluate(cliffOnly => {
            const d = window.__ra2debug, f = window.__allied, g = d.game;
            const bindings = d.terrainHd.placedBindings.filter(b =>
                (cliffOnly ? /^ramp0[12]/ : /^slope0[1-4]/).test(b.member));
            const rule = g.rules.getObject('MTNK', 7), all = g.map.tiles.getAll();
            const legal = tile => g.map.isWithinBounds(tile)
                && g.map.terrain.getPassableSpeed(tile, rule.speedType, false, false) > 0
                && !g.map.getGroundObjectsOnTile(tile).some(o => o.isTechno() || o.isTerrain());
            for (const binding of bindings) {
                const ramp = g.map.tiles.getByMapCoords(...binding.tile);
                if (!ramp.rampType || !legal(ramp)) continue;
                const nearby = all.filter(t => !t.rampType && legal(t)
                    && Math.hypot(t.rx - ramp.rx, t.ry - ramp.ry) <= (cliffOnly ? 8 : 4))
                    .sort((a, b) => Math.hypot(a.rx - ramp.rx, a.ry - ramp.ry)
                        - Math.hypot(b.rx - ramp.rx, b.ry - ramp.ry));
                const low = nearby.find(t => cliffOnly ? t.z < ramp.z : t.z === ramp.z);
                const high = nearby.find(t => cliffOnly ? t.z > ramp.z : t.z === ramp.z + 1);
                if (!low || !high) continue;
                const unit = f.spawn('MTNK', 7, low);
                unit.attackTrait?.setDisabled(true);
                window.__terrainPassage = { unit, ramp, high };
                d.worldInteraction.unitSelectionHandler.selectSingleUnit(unit);
                d.worldInteraction.minimapHandler.panToTile(ramp);
                d.actionsApi.orderUnits([unit.id], 0, ramp.rx, ramp.ry);
                return { id: unit.id, member: binding.member, start: [unit.tile.rx, unit.tile.ry, unit.tile.z],
                    ramp: [ramp.rx, ramp.ry, ramp.z, ramp.rampType], target: [high.rx, high.ry, high.z] };
            }
            throw Error('No legal selected HD ramp with both elevation neighbors');
        }, structuralCliffs && !process.argv.includes('--grass-ramp'));
        await page.waitForFunction(() => {
            const f = window.__terrainPassage;
            return f.unit.tile === f.ramp && !f.unit.isMoving;
        }, undefined, { timeout: 30000 });
        report.rampPassage.onRamp = await page.evaluate(() => window.__allied.sample(window.__terrainPassage.unit));
        await capture('selected-hd-ramp-unit');
        await page.evaluate(() => {
            const d = window.__ra2debug, f = window.__terrainPassage;
            d.actionsApi.orderUnits([f.unit.id], 0, f.high.rx, f.high.ry);
        });
        await page.waitForFunction(() => {
            const f = window.__terrainPassage;
            return f.unit.tile === f.high && !f.unit.isMoving;
        }, undefined, { timeout: 30000 });
        report.rampPassage.after = await page.evaluate(() => ({ ...window.__allied.sample(window.__terrainPassage.unit),
            nativeTileHeight: window.__terrainPassage.unit.tile.z }));
        assert.notEqual(report.rampPassage.start[2], report.rampPassage.after.nativeTileHeight);
        await capture('selected-hd-ramp-exit');
    }
    if (process.argv.includes('--lifecycle')) {
        report.reentry = [];
        for (const enabled of [false, true]) {
            await page.evaluate(enabled => {
                const d = window.__ra2debug;
                clearInterval(window.__allied.timer);
                window.__terrainOldGame = d.game;
                window.__terrainOldReport = d.terrainHd;
                d.generalOptions.graphics.hdEnabled.value = enabled;
            }, enabled);
            const before = Date.now();
            await page.evaluate(async () => { await window.r.reset; });
            await page.waitForFunction(() => window.__ra2debug?.game?.status === 1
                && window.__ra2debug.game !== window.__terrainOldGame, undefined, { timeout: 90000 });
            const state = await page.evaluate(() => ({ old: window.__terrainOldReport,
                current: window.__ra2debug.terrainHd }));
            assert.equal(state.old.disposed, true);
            assert.equal(state.old.worldChargeBytes, 0);
            assert.equal(state.current.density, enabled ? density : 1);
            report.reentry.push({ enabled, loadMs: Date.now() - before, oldDisposed: state.old.disposed,
                charge: state.current.worldChargeBytes, bindings: state.current.placedBindings.length });
            // Capture normal exploration boundaries before the fixture reveals
            // the map. These captures make no natural-match performance claim.
            await page.waitForTimeout(120);
            const shroudName = 'native-shroud-' + (enabled ? 'hd' : 'original');
            const shroud = await page.evaluate(() => {
                const d = window.__ra2debug; d.renderer.render();
                return d.renderer.renderer.domElement.toDataURL('image/png').split(',')[1];
            });
            await fs.writeFile(path.join(output, shroudName + '-framebuffer.png'), Buffer.from(shroud, 'base64'));
            await page.screenshot({ path: path.join(output, shroudName + '.png') });
            await page.evaluate(() => window.__installAlliedFixtures());
            await capture('reentry-' + (enabled ? 'hd' : 'original'));
        }
    }
    assert.equal(report.errors.length, 0);
    await memorySnapshot('before-disposal');
} catch (error) { failure = error; }
await close(failure);
if (failure) throw failure;
console.log(path.resolve(output, 'report.json'));
