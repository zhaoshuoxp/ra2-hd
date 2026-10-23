// Focused copied-runtime feedback checks; previously accepted cases remain closed.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { startSession } from '../m1/allied-units/desktop-session.mjs';

const [receipt, output] = process.argv.slice(2);
const density = process.argv.includes('--density=2') ? 2 : 4;
const original = process.argv.includes('--original');
const diagnostic = process.argv.includes('--diagnostic');
const comparison = original || process.argv.includes('--baseline-r4') || diagnostic;
process.argv.push('--map=XMP03T4.map');
const session = await startSession(receipt, output, 'yr', false, async ({ page }) => {
    await page.evaluate(({ density, original }) => {
        const options = window.__ra2debug.generalOptions.graphics;
        options.hdEnabled.value = !original;
        options.hdDensity.value = density;
    }, { density, original });
});
const { page, app, report, stage, startClip, stopClip, close } = session;
const pan = async tile => {
    await page.evaluate(tile => {
        const d = window.__ra2debug;
        d.worldInteraction.minimapHandler.panToTile(d.game.map.tiles.getByMapCoords(tile[0], tile[1]));
    }, tile);
    await page.waitForTimeout(160);
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
let failure;
try {
    report.disclosure = 'Copied isolated app; unchanged retail map/rules/camera/ticks. Revealed map, suspended bot AI and legal spawned actors are explicit. Enemy commands use native ActionsApi action creation and process selection/orders directly because the local client queue authenticates its own player. Garrison entry/ownership changes still run through native simulation tasks; no direct building-owner changes.';
    await page.evaluate(() => {
        window.__feedbackBinding = object => {
            const d = window.__ra2debug, r = d.renderableManager.getRenderableByGameObject(object);
            const builder = (r?.mainObj ?? r?.mainRenderable ?? r?.shpRenderable)?.builder;
            const map = d.mapRenderable;
            const batch = [map.terrainLayer, map.overlayLayer, map.smudgeLayer]
                .map(layer => layer?.getObjectHdBinding?.(object)).find(Boolean);
            return { id: object.id, name: object.name, type: object.type, tile: [object.tile.rx, object.tile.ry],
                hd: batch?.identity ?? builder?.hdOverride?.identity, frame: batch?.frame ?? builder?.getFrame(),
                vxlHd: !!r?.unitVxlHd?.active,
                nativeException: object.isBridgePlaceholder?.() && r?.isInvisible
                    ? 'INVISIBLE_NATIVE_BRIDGE_PLACEHOLDER' : undefined,
                value: object.value, owner: object.owner?.name, ownerColor: object.owner?.color,
                palette: r?.palette?.colors.slice(16, 32), occupants: object.garrisonTrait?.units.length,
                lastOwnerColor: r?.lastOwnerColor, health: object.healthTrait?.health };
        };
    });
    report.terrain = await page.evaluate(() => window.__ra2debug.terrainHd);
    report.environment = await page.evaluate(() => window.__ra2debug.environmentHd);
    report.placed = await page.evaluate(() => window.__ra2debug.game.getWorld().getAllObjects()
        .filter(o => o.isBuilding() || o.isUnit() || o.isOverlay() || o.isTerrain()).map(window.__feedbackBinding));
    if (!original) {
        assert.equal(report.terrain.density, density);
        assert.equal(report.environment.density, density);
        assert(Object.values(report.environment.families).every(f => f.status === 'PUBLISHED_COMPLETE_FAMILY'));
    }
    report.targets = await page.evaluate(() => {
        const d = window.__ra2debug, objects = d.game.getWorld().getAllObjects();
        const ore = objects.find(o => o.isTiberium?.() && o.value > 0 && /^TIB/.test(o.name));
        const gem = objects.find(o => o.isTiberium?.() && o.value > 0 && /^GEM/.test(o.name));
        const water = d.terrainHd?.placedBindings?.find(b => b.member === 'shore41.tem');
        return { ore: window.__feedbackBinding(ore), gem: window.__feedbackBinding(gem), water: water?.tile ?? [62, 46] };
    });
    report.route = [
        { name: 'bridge', tile: [86, 54] }, { name: 'water-lake', tile: [80, 47] },
        { name: 'water-shore', tile: report.targets.water },
        { name: 'ore', tile: report.targets.ore.tile }, { name: 'gem', tile: report.targets.gem.tile },
        { name: 'waterfall', tile: [64, 48] },
    ];
    const routeFile = process.argv.find(arg => arg.startsWith('--route-file='))?.slice(13);
    if (routeFile) report.route = JSON.parse(await fs.readFile(routeFile, 'utf8')).route;
    for (const target of report.route) { await pan(target.tile); await capture(target.name); }
    if (diagnostic) {
        await pan(report.route.find(t => t.name === 'water-shore').tile);
        report.bridgeDepth = await page.evaluate(() => {
            const d = window.__ra2debug;
            return d.game.getWorld().getAllObjects().filter(o => o.isLowBridge?.()).map(o => {
                const m = d.renderableManager.getRenderableByGameObject(o)?.mainRenderable?.getShapeMesh();
                return { name: o.name, renderOrder: m?.renderOrder, depthTest: m?.material?.depthTest,
                    depthWrite: m?.material?.depthWrite, orderedCoverage: m?.orderedHdCoverage };
            });
        });
        await page.evaluate(() => {
            const d = window.__ra2debug;
            for (const o of d.game.getWorld().getAllObjects().filter(o => o.isLowBridge?.())) {
                const m = d.renderableManager.getRenderableByGameObject(o)?.mainRenderable?.getShapeMesh();
                if (m) { m.material.depthTest = false; m.material.depthWrite = false; }
            }
        });
        await capture('diagnostic-bridge-native-depth');
        report.projected = await page.evaluate(() => {
            const d = window.__ra2debug, c = d.renderer.renderer.domElement, v = d.worldScene.viewport;
            return d.game.getWorld().getAllObjects().filter(o => o.isTerrain() || o.isBuilding() || o.isLowBridge?.()).map(o => {
                const r = d.renderableManager.getRenderableByGameObject(o), p = r.getPosition().clone().project(d.worldScene.camera);
                return { name: o.name, id: o.id, tile: [o.tile.rx, o.tile.ry],
                    projected: [(v.x + (p.x + 1) * v.width / 2) * c.width / d.renderer.width,
                        (v.y + (1 - p.y) * v.height / 2) * c.width / d.renderer.width] };
            }).filter(o => o.projected[0] > 50 && o.projected[0] < 250 && o.projected[1] > 0 && o.projected[1] < 180);
        });
        await page.evaluate(() => {
            const d = window.__ra2debug;
            for (const o of d.game.getWorld().getAllObjects().filter(o => o.isLowBridge?.())) {
                const b = d.renderableManager.getRenderableByGameObject(o)?.mainRenderable?.builder;
                if (b) b.setHdOverride(undefined);
            }
        });
        await capture('diagnostic-original-bridge-only');
        report.hutMeshes = await page.evaluate(() => {
            const d = window.__ra2debug, huts = d.game.getWorld().getAllObjects().filter(o => o.name === 'CABHUT');
            return huts.map(o => {
                const r = d.renderableManager.getRenderableByGameObject(o), b = r.mainObj?.builder;
                const m = b?.mesh?.material;
                return { ...window.__feedbackBinding(o), builder: !!b, renderOrder: b?.mesh?.renderOrder,
                    material: m && { type: m.type, depthTest: m.depthTest, transparent: m.transparent },
                    embeddedShadow: b?.embeddedShadow };
            });
        });
        await page.evaluate(() => {
            const d = window.__ra2debug;
            for (const o of d.game.getWorld().getAllObjects().filter(o => o.isLowBridge?.())) {
                d.renderableManager.getRenderableByGameObject(o)?.get3DObject().traverse(m => { m.visible = false; });
            }
        });
        await capture('diagnostic-bridge-hidden');
        await page.evaluate(() => {
            const d = window.__ra2debug;
            for (const o of d.game.getWorld().getAllObjects().filter(o => o.isLowBridge?.())) {
                d.renderableManager.getRenderableByGameObject(o)?.get3DObject().traverse(m => { m.visible = true; });
            }
            for (const o of d.game.getWorld().getAllObjects().filter(o => o.name === 'CABHUT')) {
                const m = d.renderableManager.getRenderableByGameObject(o).mainObj?.builder?.mesh;
                if (m) { m.material.depthTest = false; m.renderOrder = 2; }
            }
        });
        await capture('diagnostic-hut-no-depth');
    }
    report.waterfalls = await page.evaluate(() => window.__ra2debug.mapRenderable.tileLayer.anims
        .filter(a => /^WB/.test(a.name)).map(a => ({ name: a.name, frame: a.mainObj.builder.getFrame(),
            hd: a.mainObj.builder.hdOverride?.identity, visualOpacity: a.mainObj.builder.hdOverride?.visualOpacity,
            effectiveOpacity: a.mainObj.builder.getVisualOpacity?.(),
            materialOpacity: a.mainObj.builder.mesh.material.opacity,
            transparent: a.mainObj.builder.mesh.material.transparent })));
    await startClip();
    await page.waitForTimeout(1300);
    report.waterfallAfter = await page.evaluate(() => window.__ra2debug.mapRenderable.tileLayer.anims
        .filter(a => /^WB/.test(a.name)).map(a => a.mainObj.builder.getFrame()));
    assert(report.waterfallAfter.some((frame, i) => frame !== report.waterfalls[i].frame));
    if (!comparison) assert(report.waterfalls.every(a => a.hd && a.visualOpacity === .64 && a.transparent));
    await stopClip('waterfall-native-phases');
    if (!comparison) {
        await page.evaluate(() => {
            const d = window.__ra2debug, f = window.__allied;
            f.colorHouse = d.game.getWorld().getAllObjects().find(o => o.name === 'CAGAS01' && o.garrisonTrait?.canBeOccupied());
            if (!f.colorHouse) throw Error('No native gas station for owner-color check');
        });
        const house = await page.evaluate(() => window.__feedbackBinding(window.__allied.colorHouse));
        await pan(house.tile); await startClip(); await capture('owner-neutral');
        report.ownerColors = [];
        for (const side of ['player', 'enemy']) {
            await page.evaluate(side => {
                const d = window.__ra2debug, f = window.__allied, owner = f[side];
                d.game.mapShroudTrait.revealMap(owner, d.game);
                f.colorUnit = f.spawn('E1', 3, f.colorHouse.tile, owner);
                const old = d.actionsApi.localPlayer, queue = d.actionsApi.actionQueue;
                try {
                    d.actionsApi.localPlayer = owner;
                    if (side === 'enemy') d.actionsApi.actionQueue = { push: action => action.process() };
                    d.actionsApi.orderUnits([f.colorUnit.id], 8, f.colorHouse.id);
                } finally { d.actionsApi.localPlayer = old; d.actionsApi.actionQueue = queue; }
            }, side);
            await page.waitForFunction(() => window.__allied.colorHouse.garrisonTrait.units.length === 1,
                undefined, { timeout: 45000 });
            await page.waitForTimeout(200);
            const state = await page.evaluate(() => window.__feedbackBinding(window.__allied.colorHouse));
            assert(state.hd && state.occupants === 1);
            assert.deepEqual(state.ownerColor, state.lastOwnerColor);
            report.ownerColors.push({ side, ...state }); await capture('owner-' + side);
            await page.evaluate(side => {
                const d = window.__ra2debug, f = window.__allied, old = d.actionsApi.localPlayer, queue = d.actionsApi.actionQueue;
                try {
                    d.actionsApi.localPlayer = f[side];
                    if (side === 'enemy') d.actionsApi.actionQueue = { push: action => action.process() };
                    d.actionsApi.orderUnits([f.colorHouse.id], 10);
                } finally { d.actionsApi.localPlayer = old; d.actionsApi.actionQueue = queue; }
            }, side);
            await page.waitForFunction(() => !window.__allied.colorHouse.garrisonTrait.units.length);
            await page.evaluate(() => window.__ra2debug.game.unspawnObject(window.__allied.colorUnit));
        }
        assert.notEqual(report.ownerColors[0].owner, report.ownerColors[1].owner);
        assert.notDeepEqual(report.ownerColors[0].palette, report.ownerColors[1].palette);
        report.ownerNeutralRestored = await page.evaluate(() => window.__allied.colorHouse.owner === window.__ra2debug.game.getCivilianPlayer());
        assert(report.ownerNeutralRestored); await capture('owner-evacuated'); await stopClip('native-occupier-colors');
        report.bridge = await page.evaluate(() => {
            const d = window.__ra2debug, f = window.__allied;
            f.bridgeHut = d.game.getWorld().getAllObjects().find(o => o.cabHutTrait?.getBridgePieces()?.some(p => /^LOBRDB/.test(p.obj.name)));
            const pieces = f.bridgeHut.cabHutTrait.getBridgePieces();
            f.bridgePiece = pieces[Math.floor(pieces.length / 2)].obj;
            return pieces.map(p => window.__feedbackBinding(p.obj));
        });
        assert(report.bridge.every(b => b.hd)); await pan([86, 54]); await startClip();
        await page.evaluate(() => {
            const f = window.__allied, d = window.__ra2debug;
            f.bridgePiece.healthTrait.inflictDamage(Math.floor(f.bridgePiece.healthTrait.maxHitPoints * .6), f.bridgePiece, d.game);
        });
        await page.waitForTimeout(400);
        report.bridgeDamaged = await page.evaluate(() => window.__feedbackBinding(window.__allied.bridgePiece));
        assert(report.bridgeDamaged.hd && report.bridgeDamaged.health < 50); await capture('bridge-damaged');
        await page.evaluate(() => {
            const d = window.__ra2debug, f = window.__allied;
            f.bridgeHut.cabHutTrait.demolishBridge(d.game, { player: d.localPlayer });
        });
        await page.waitForTimeout(400); await capture('bridge-demolished');
        await page.evaluate(() => {
            const d = window.__ra2debug, f = window.__allied;
            f.engineer = f.spawn('ENGINEER', 3, f.bridgeHut.tile);
            d.actionsApi.orderUnits([f.engineer.id], 15, f.bridgeHut.id);
        });
        await page.waitForFunction(() => !window.__allied.bridgeHut.cabHutTrait.canRepairBridge(), undefined, { timeout: 45000 });
        report.bridgeRepaired = await page.evaluate(() => window.__allied.bridgeHut.cabHutTrait.getBridgePieces().map(p => window.__feedbackBinding(p.obj)));
        assert(report.bridgeRepaired.every(b => b.hd)); await capture('bridge-repaired'); await stopClip('bridge-native-repair');
        await pan(report.targets.ore.tile);
        await page.evaluate(id => {
            const d = window.__ra2debug, f = window.__allied;
            f.ore = d.game.getObjectById(id); f.beforeOre = f.ore.value;
            f.miner = f.spawn('CMIN', 7, f.ore.tile);
            d.actionsApi.orderUnits([f.miner.id], 14, f.ore.tile.rx, f.ore.tile.ry);
        }, report.targets.ore.id);
        await startClip();
        await page.waitForFunction(() => !window.__allied.miner.harvesterTrait.isEmpty(), undefined, { timeout: 60000 });
        report.harvest = await page.evaluate(() => ({ before: window.__allied.beforeOre,
            after: window.__feedbackBinding(window.__allied.ore), miner: window.__allied.sample(window.__allied.miner) }));
        assert(report.harvest.after.hd && report.harvest.after.value < report.harvest.before);
        await capture('ore-native-harvest'); await stopClip('ore-native-amount');
    }
    if (!comparison) {
        report.focusedPerformance = [];
        for (const target of report.route.filter(t => ['water-shore', 'bridge', 'waterfall'].includes(t.name))) {
            await pan(target.tile);
            await page.waitForTimeout(600);
            const frames = await page.evaluate(() => new Promise(resolve => {
                const samples = [], start = performance.now();
                let previous;
                function sample(now) {
                    if (previous !== undefined) samples.push(now - previous);
                    previous = now;
                    if (now - start < 3000) requestAnimationFrame(sample); else resolve(samples);
                }
                requestAnimationFrame(sample);
            }));
            const sorted = [...frames].sort((a, b) => a - b);
            report.focusedPerformance.push({ scene: target.name, samples: frames.length,
                meanMs: frames.reduce((n, v) => n + v, 0) / frames.length,
                p95Ms: sorted[Math.floor(sorted.length * .95)], over50Ms: frames.filter(v => v > 50).length });
        }
        report.bridgeRenderBands = await page.evaluate(() => {
            const d = window.__ra2debug;
            return d.game.getWorld().getAllObjects().filter(o => o.isLowBridge?.() && !o.isBridgePlaceholder?.()).map(o => {
                const m = d.renderableManager.getRenderableByGameObject(o)?.mainRenderable?.getShapeMesh();
                return { name: o.name, renderOrder: m?.renderOrder, orderedCoverage: m?.orderedHdCoverage,
                    depthTest: m?.material?.depthTest, depthWrite: m?.material?.depthWrite };
            });
        });
        assert(report.bridgeRenderBands.every(b => b.renderOrder === -1 && b.orderedCoverage === true));
        assert(report.bridgeRenderBands.every(b => b.depthTest === false && b.depthWrite === false));
        report.willowShadow = await page.evaluate(() => {
            const d = window.__ra2debug, layer = d.mapRenderable.terrainLayer;
            const willow = d.game.getWorld().getAllObjects().find(o => o.name === 'TREE14');
            const spec = layer.batchShpSpecsByObject.get(willow)?.shadow;
            const builder = layer.shadowBatchShpBuilders.find(b => b.has(spec));
            const mesh = builder.build();
            return { filteredNativeContour: builder.shadowCoverage, opacity: mesh.material.opacity,
                material: mesh.material.type, nativeFrame: spec.frameNo, position: spec.position.toArray() };
        });
        assert.equal(report.willowShadow.filteredNativeContour, true);
        assert.equal(report.willowShadow.opacity, .38);
    }
    report.glError = await page.evaluate(() => window.__ra2debug.renderer.renderer.getContext().getError());
    report.combinedWorldAllocation = await page.evaluate(() => {
        const d = window.__ra2debug, w = d.worldView;
        const terrain = d.terrainHd?.worldChargeBytes ?? 0, environment = d.environmentHd?.worldChargeBytes ?? 0;
        const baseline = (w.conscriptHd?.report.gpuBytes ?? 0) + (w.powerPlantHd?.report.gpuBytes ?? 0)
            + (w.napowrHd?.report.gpuBytes ?? 0)
            + [...(w.rhinoHd?.parts.values() ?? [])].reduce((n, p) => n + p.bitmap.width * p.bitmap.height * 5
                + p.palette.image.data.byteLength, 0);
        const eager = Object.entries(w.sovietBuildingsHd ?? {}).filter(([name]) => !d.sovietUnitsHd.families[name])
            .reduce((n, [, f]) => n + f.report.gpuBytes, 0);
        const demand = d.sovietUnitsHd.gpuBytes;
        return { terrain, environment, baseline, eager, demand, total: terrain + environment + baseline + eager + demand,
            limit: d.terrainHd?.budget || 256 * 1024 * 1024 };
    });
    assert(report.combinedWorldAllocation.total <= report.combinedWorldAllocation.limit);
    assert.equal(report.glError, 0); assert.equal(report.errors.length, 0);
    report.processMemory = await app.evaluate(({ app }) => app.getAppMetrics().map(p => ({ type: p.type, memory: p.memory })));
} catch (error) { failure = error; }
await close(failure);
if (failure) throw failure;
