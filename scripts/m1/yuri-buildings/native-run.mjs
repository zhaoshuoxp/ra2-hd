// Grouped observations from the task's independently copied Mac resource root.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { startSession } from '../allied-units/desktop-session.mjs';
import catalog from '../../../desktop/yuri-building-coverage.json' with { type: 'json' };

const original = process.argv.includes('--original');
const density = original ? 1 : Number(process.argv[4] ?? 4), snow = process.argv.includes('--snow');
const selected = process.argv.find(a => a.startsWith('--families='))?.slice(11);
const families = selected ? selected.split(',') : [...new Set(Object.values(catalog).map(e => e.family))];
const functional = !process.argv.includes('--bindings-only');
const selectedCases = process.argv.find(a => a.startsWith('--cases='))?.slice(8).split(',');
const session = await startSession(process.argv[2], process.argv[3], 'yr', snow,
    async ({ page, report }) => {
        report.options = await page.evaluate(({ density, original }) => {
            const d = window.__ra2debug, graphics = d.generalOptions.graphics;
            const before = { enabled: graphics.hdEnabled.value, density: graphics.hdDensity.value };
            graphics.hdEnabled.value = !original; graphics.hdDensity.value = original ? 4 : density;
            return { before, selected: density, trainer: d.generalOptions.trainer?.enabled?.value ?? false };
        }, { density, original });
        assert.equal(report.options.trainer, false);
    }, async ({ page, report }) => {
        await page.locator('.country-select .select-value').first().click();
        const yuriIndex = await page.evaluate(() => window.__ra2debug.skirmishLobby.formModel.availablePlayerCountries.indexOf('YuriCountry'));
        assert(yuriIndex >= 0);
        await page.locator('.country-select .select-layer .option').nth(yuriIndex).click();
        await page.locator('.player-color-select .select-value').first().click();
        const options = page.locator('.player-color-select .select-layer .option');
        const colors = await options.evaluateAll(nodes => nodes.map(node => getComputedStyle(node.firstElementChild).backgroundColor));
        const scores = colors.map((color, index) => {
            const rgb = color.match(/\d+/g)?.map(Number) ?? [0, 0, 0];
            return { index, score: snow ? rgb[2] - rgb[0] + rgb[1] * .3 : rgb[1] - rgb[0] - rgb[2] * .25 };
        }).filter((_, index) => !colors[index].startsWith('rgba'));
        scores.sort((a, b) => b.score - a.score);
        await options.nth(scores[0].index).click();
        await page.waitForFunction(() => window.__ra2debug.skirmishLobby.gameOpts.humanPlayers[0].countryId === 9);
        report.lobby = await page.evaluate(() => window.__ra2debug.skirmishLobby.gameOpts);
        report.selectedColor = colors[scores[0].index];
    });
const { page, out, report, stage, startClip, stopClip, close } = session;
const save = () => fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
const observe = async (name, operation) => {
    if (selectedCases && !name.endsWith('-binding') && !selectedCases.includes(name)) return;
    try { report.cases[name] = { status: 'PASS', result: await operation() }; }
    catch (error) {
        report.cases[name] = { status: 'FAIL', failure: error.stack,
            diagnostics: await page.evaluate(() => {
                const d = window.__ra2debug, f = window.__allied;
                return { credits: f.player.credits, power: f.player.powerTrait.debugGetState(),
                    queues: f.player.production.getAllQueues().map(q => ({ type: q.type, status: q.status,
                        items: q.items.map(i => ({ name: i.rules.name, progress: i.progress, creditsSpent: i.creditsSpent })) })),
                    ship: f.ship && f.sample(f.ship), victim: f.swVictim && f.sample(f.swVictim),
                    superWeapons: f.player.superWeaponsTrait.getAll().map(s => ({ name: s.name, status: s.status, chargeTicks: s.chargeTicks })) };
            }).catch(() => undefined) };
    }
    console.log(name, report.cases[name].status); await save();
};
const wait = async (predicate, timeout = 20000) => page.waitForFunction(predicate, undefined, { timeout });
let failure;
try {
    report.cases = {}; report.families = {};
    report.boundary = 'Controlled legal placement and one-time charge presets; native production, orders, damage notification and state controllers. Trainer off. Selected bindings are checked against the requested density.';
    await page.evaluate(() => {
        const d = window.__ra2debug, g = d.game, f = window.__allied;
        f.buildings = {}; f.detailSize = [1000, 1000]; f.visualTrace = []; f.events = []; f.effectTrace = [];
        f.renderable = u => d.renderableManager.getRenderableByGameObject(u);
        f.sampleBuilding = u => {
            const r = f.renderable(u);
            const member = o => ({ member: o?.builder?.image?.filename, frame: o?.builder?.getFrame(),
                hd: !!o?.builder?.hdOverride, density: Number(o?.builder?.hdOverride?.identity.split('/').at(-1)),
                visible: o?.get3DObject().visible });
            return { name: u.name, id: u.id, tick: g.currentTick, owner: u.owner.name, color: u.owner.color,
                spawned: u.isSpawned, health: u.healthTrait.health, buildStatus: u.buildStatus,
                powered: u.poweredTrait?.isPoweredOn(), currentAnimType: r?.currentAnimType,
                main: member(r?.mainObj), bib: member(r?.bib),
                heat: u.armedTrait?.gattlingHeat, weapon: u.armedTrait?.specialWeaponIndex,
                turret: u.turretTrait?.facing,
                turretVisible: r?.turret?.visible,
                animations: r && [...r.animObjects].map(([type, objects]) => ({ type, members: objects.map(member) })) };
        };
        f.point = (angle, radius = 18) => ({ rx: f.center.rx + Math.round(Math.cos(angle) * radius),
            ry: f.center.ry + Math.round(Math.sin(angle) * radius) });
        f.place = (name, near, owner = f.player) => {
            const worker = g.getConstructionWorker(owner);
            const tile = g.map.tiles.getAll().filter(t => g.map.isWithinBounds(t) &&
                worker.canPlaceAt(name, t, { normalizedTile: true, ignoreAdjacent: true }))
                .sort((a, b) => Math.hypot(a.rx - near.rx, a.ry - near.ry) - Math.hypot(b.rx - near.rx, b.ry - near.ry))[0];
            if (!tile) throw Error('No legal native placement: ' + name);
            return worker.placeAt(name, tile, true)[0];
        };
        f.focus = u => { f.actor = u; f.actors[u.id] = u; d.worldInteraction.minimapHandler.panToTile(u.tile); };
        f.disable = u => { u.attackTrait?.setDisabled(true); u.moveTrait?.setDisabled(true); return u; };
        g.events.subscribe(event => {
            if (event.target?.owner === f.player || event.recycler?.owner === f.player)
                f.events.push({ type: event.type, target: event.target?.name, id: event.target?.id,
                    factory: event.factory?.name, recycler: event.recycler?.name, tick: g.currentTick });
        });
        f.visualTimer = setInterval(() => {
            f.visualTrace.push(Object.values(f.buildings).filter(u => !u.isDisposed).map(f.sampleBuilding));
            const effect = f.deathRenderable?.deathAnimRenderable;
            if (effect) f.effectTrace.push({ tick: g.currentTick, name: effect.name,
                frame: effect.mainObj?.builder?.getFrame(), visible: effect.get3DObject().visible,
                member: effect.getShpFile()?.filename, finished: effect.isAnimFinished() });
            if (f.visualTrace.length > 2000) f.visualTrace.shift();
        }, 100);
        for (let i = 0; i < 10; i++) f.place('YAPOWR', f.point(Math.PI, 30));
    });
    for (const [index, name] of families.entries()) {
        await observe(name + '-binding', async () => {
            await page.evaluate(({ name, index, count }) => {
                const f = window.__allied, u = f.place(name, f.point(index / count * Math.PI * 2));
                f.buildings[name] = u; f.focus(u);
            }, { name, index, count: families.length });
            await page.waitForFunction(({ name, density, original }) => {
                const d = window.__ra2debug, f = window.__allied, u = f.buildings[name], r = f.renderable(u);
                const builders = [r?.mainObj?.builder, r?.bib?.builder, ...[...(r?.animObjects.values() ?? [])].flat().map(o => o.builder)].filter(Boolean);
                if (original) return u.buildStatus === 1 && builders.length && builders.every(b => !b.hdOverride);
                return u.buildStatus === 1 && d.sovietUnitsHd.families[name]?.status === 'READY' &&
                    d.sovietUnitsHd.families[name].density === density && builders.length &&
                    builders.every(b => b.hdOverride?.identity.endsWith('/' + density));
            }, { name, density, original }, { timeout: 45000 });
            const result = await page.evaluate(({ name, original }) => ({ ...window.__allied.sampleBuilding(window.__allied.buildings[name]),
                allocation: original ? { status: 'ORIGINAL', density: 1 } : window.__ra2debug.sovietUnitsHd.families[name] }), { name, original });
            report.families[name] = result;
            await stage(name + '-owner-native-ready'); return result;
        });
        if (process.argv.includes('--destroy-after-binding')) {
            await observe(name + '-native-destruction', async () => {
                const result = await page.evaluate(name => {
                    const d = window.__ra2debug, f = window.__allied, u = f.buildings[name];
                    f.deathRenderable = f.renderable(u); f.destroyedTarget = u;
                    d.game.unitSelection.addToSelection(u);
                    const before = f.sampleBuilding(u);
                    f.destroyWeaponActor ??= f.disable(f.spawn('MTNK', 7, f.point(2, 30), f.enemy));
                    const weapon = f.destroyWeaponActor.primaryWeapon;
                    weapon.warhead.inflictDamage(u.healthTrait.getHitPoints() * 2, u,
                        { player: f.enemy, obj: f.destroyWeaponActor, weapon }, d.game, true);
                    return { before, destroyed: u.isDestroyed, spawned: u.isSpawned,
                        health: u.healthTrait.health, events: f.events.filter(e => e.id === u.id) };
                }, name);
                await wait(() => window.__allied.destroyedTarget.isDestroyed, 15000);
                Object.assign(result, await page.evaluate(() => {
                    const f = window.__allied, u = f.destroyedTarget;
                    return { destroyed: u.isDestroyed, spawned: u.isSpawned, health: u.healthTrait.health,
                        selectedAfter: window.__ra2debug.game.unitSelection.isSelected(u),
                        events: f.events.filter(e => e.id === u.id) };
                }));
                assert(result.destroyed && result.health === 0 && !result.selectedAfter);
                await stage(name + '-native-destroyed');
                await page.evaluate(name => {
                    const f = window.__allied;
                    delete f.actors[f.buildings[name].id]; delete f.buildings[name];
                }, name);
                return result;
            });
        }
        if (density === 2 && !functional) {
            await page.evaluate(name => {
                const d = window.__ra2debug, f = window.__allied;
                let object = f.buildings[name]; while (object.replacedBy) object = object.replacedBy;
                d.game.destroyObject(object, { player: f.enemy }, true);
                delete f.actors[object.id]; delete f.buildings[name];
            }, name);
        }
    }
    report.initialResidency = await page.evaluate(() => window.__ra2debug.sovietUnitsHd);
    report.presentation = await page.evaluate(() => {
        const d = window.__ra2debug, canvas = d.renderer.renderer.domElement;
        return { densityOption: d.generalOptions.graphics.hdDensity.value,
            outputOption: d.generalOptions.graphics.renderResolution.value,
            renderer: [d.renderer.width, d.renderer.height], drawingBuffer: [canvas.width, canvas.height],
            viewport: d.worldScene.viewport, camera: { top: d.worldScene.camera.top, bottom: d.worldScene.camera.bottom,
                left: d.worldScene.camera.left, right: d.worldScene.camera.right },
            savedDensity: Object.entries(localStorage).filter(([key]) => /density|hdEnabled/i.test(key)) };
    });
    if (process.argv.includes('--damaged')) {
        await page.evaluate(() => {
            const d = window.__ra2debug, f = window.__allied;
            for (const object of Object.values(f.buildings)) object.healthTrait.inflictDamage(
                Math.floor(object.healthTrait.getHitPoints() * .7), { player: f.enemy }, d.game);
        });
        report.damageSetup = 'One controlled 70 percent damage notification before native actions; rules and trainer unchanged.';
    }
    if (functional) {
        await observe('output-resolution-logical-geometry', async () => {
            const samples = [];
            for (const resolution of ['1080p', '4k']) {
                await page.evaluate(resolution => window.__ra2debug.generalOptions.graphics.renderResolution.value = resolution, resolution);
                await page.waitForTimeout(250);
                samples.push(await page.evaluate(() => {
                    const d = window.__ra2debug, f = window.__allied, canvas = d.renderer.renderer.domElement;
                    const powerPlant = f.buildings.YAPOWR ?? f.player.getOwnedObjects().find(unit => unit.name === 'YAPOWR');
                    const r = f.renderable(powerPlant);
                    const root = document.querySelector('#ra2web-root').getBoundingClientRect();
                    return { buffer: [canvas.width, canvas.height], renderer: [d.renderer.width, d.renderer.height],
                        viewport: d.worldScene.viewport, camera: d.worldScene.camera.position.toArray(),
                        root: [root.x, root.y, root.width, root.height], logicalSize: r.mainObj.builder.getSize(),
                        scale: r.mainObj.builder.scale, density: d.sovietUnitsHd.families.YAPOWR.density };
                }));
            }
            assert.notDeepEqual(samples[0].buffer, samples[1].buffer);
            for (const key of ['renderer', 'viewport', 'camera', 'root', 'logicalSize', 'scale', 'density'])
                assert.deepEqual(samples[0][key], samples[1][key], key);
            return samples;
        });
        await observe('Construction-Yard-native-production', async () => {
            await page.evaluate(() => {
                const d = window.__ra2debug, f = window.__allied; f.focus(f.buildings.YACNST);
                d.actionsApi.queueForProduction(0, 2, 'YAPOWR', 1);
            });
            await wait(() => window.__allied.player.production.getQueue(0).status === 3, 45000);
            await stage('YACNST-native-production-crane');
            const result = await page.evaluate(() => window.__allied.sampleBuilding(window.__allied.buildings.YACNST));
            await page.evaluate(() => window.__ra2debug.actionsApi.unqueueFromProduction(0, 2, 'YAPOWR', 1));
            return result;
        });
        await observe('Bio-Reactor-occupy-evacuate', async () => {
            await page.evaluate(() => {
                const d = window.__ra2debug, f = window.__allied, b = f.buildings.YAPOWR;
                f.focus(b); f.bio = f.spawn('INIT', 3, b.tile); f.powerBefore = f.player.powerTrait;
                d.actionsApi.orderUnits([f.bio.id], 8, b.id);
            });
            await wait(() => window.__allied.buildings.YAPOWR.absorberTrait.units.length === 1);
            await stage('YAPOWR-native-occupied');
            const occupied = await page.evaluate(() => ({ power: window.__allied.buildings.YAPOWR.absorberTrait.getExtraPower(), sample: window.__allied.sampleBuilding(window.__allied.buildings.YAPOWR) }));
            await page.evaluate(() => window.__ra2debug.actionsApi.orderUnits([window.__allied.buildings.YAPOWR.id], 10));
            await wait(() => !window.__allied.buildings.YAPOWR.absorberTrait.units.length && window.__allied.bio.isSpawned);
            await stage('YAPOWR-native-evacuated'); assert(occupied.power > 0); return occupied;
        });
        await observe('Tank-Bunker-occupy-evacuate', async () => {
            if (process.argv.includes('--bunker-rise-motion')) await startClip();
            await page.evaluate(() => {
                const d = window.__ra2debug, f = window.__allied, b = f.buildings.NATBNK;
                f.focus(b); f.bunkerTank = f.spawn('LTNK', 7, b.tile); d.actionsApi.orderUnits([f.bunkerTank.id], 8, b.id);
            });
            await wait(() => !!window.__allied.buildings.NATBNK.bunkerTrait.unit);
            if (process.argv.includes('--bunker-rise-motion')) {
                await page.evaluate(() => { window.__allied.guardStart = window.__ra2debug.game.currentTick; });
                await wait(() => window.__ra2debug.game.currentTick >= window.__allied.guardStart + 30);
            }
            await stage('NATBNK-native-occupied');
            if (process.argv.includes('--bunker-rise-motion')) await stopClip('NATBNK-native-guard-rise');
            const occupied = await page.evaluate(() => {
                const f = window.__allied, b = f.buildings.NATBNK, u = b.bunkerTrait.unit;
                const dock = b.dockTrait.getDockOffset(0), p = b.position.getMapPosition();
                return { unit: u.name, range: b.bunkerTrait.rangeBonus, sample: f.sampleBuilding(b),
                    occupantPosition: u.position.getMapPosition(), nativeDock: { x: p.x + dock.x, y: p.y + dock.z },
                    facing: u.direction, buildingWorld: b.position.worldPosition, tankWorld: u.position.worldPosition,
                    bibGeometry: (() => {
                        const r = f.renderable(b), obj = r.bib.get3DObject(); obj.updateMatrixWorld(true);
                        const meshes = []; obj.traverse(o => {
                            if (o.geometry?.attributes?.position) meshes.push({ matrix: o.matrixWorld.elements,
                                positions: [...o.geometry.attributes.position.array], uv: [...(o.geometry.attributes.uv?.array ?? [])] });
                        });
                        return { size: r.bib.builder.shpSize, offset: r.bib.builder.offset, meshes };
                    })() };
            });
            if (process.argv.includes('--feedback-phases')) {
                assert(Math.hypot(occupied.occupantPosition.x - occupied.nativeDock.x,
                    occupied.occupantPosition.y - occupied.nativeDock.y) < 4, 'Bunker occupant did not reach its native dock');
                if (process.argv.includes('--aligned-bunker'))
                    assert([0,180].includes(occupied.facing), 'Bunker hull is not aligned with its wheel strips');
                await startClip();
                await page.evaluate(() => {
                    const d = window.__ra2debug, f = window.__allied, b = f.buildings.NATBNK;
                    f.bunkerTarget = f.disable(f.spawn('APOC', 7, { rx: b.tile.rx + 5, ry: b.tile.ry }, f.enemy));
                    d.actionsApi.orderUnits([f.bunkerTank.id], 2, f.bunkerTarget.id);
                });
                await wait(() => window.__allied.bunkerTarget.healthTrait.health < window.__allied.bunkerTarget.healthTrait.getHitPoints());
                await stage('NATBNK-native-occupied-fire');
                await stopClip('NATBNK-native-occupied-fire');
            }
            if (process.argv.includes('--bunker-rise-motion')) await startClip();
            await page.evaluate(() => window.__ra2debug.actionsApi.orderUnits([window.__allied.buildings.NATBNK.id], 10));
            await wait(() => !window.__allied.buildings.NATBNK.bunkerTrait.unit);
            if (process.argv.includes('--bunker-rise-motion')) {
                await page.evaluate(() => { window.__allied.guardStart = window.__ra2debug.game.currentTick; });
                await wait(() => window.__ra2debug.game.currentTick >= window.__allied.guardStart + 30);
            }
            await stage('NATBNK-native-evacuated');
            if (process.argv.includes('--bunker-rise-motion')) await stopClip('NATBNK-native-guard-return');
            return occupied;
        });
        const recordGrinderIdle = async label => {
            await page.evaluate(() => window.__allied.focus(window.__allied.buildings.YAGRND));
            await wait(() => window.__allied.renderable(window.__allied.buildings.YAGRND).currentAnimType === 0);
            await startClip();
            const frames = [];
            for (let i = 0; i < 18; i++) {
                frames.push(await page.evaluate(() => {
                    const r = window.__allied.renderable(window.__allied.buildings.YAGRND);
                    return r.animObjects.get(0)[0].builder.getFrame();
                }));
                await page.waitForTimeout(80);
            }
            await stage('YAGRND-idle-' + label);
            await stopClip('YAGRND-idle-' + label);
            assert(new Set(frames).size >= 4, 'Idle rotor must keep advancing');
            return { frames, distinctFrames: new Set(frames).size };
        };
        if (process.argv.includes('--r8-motion')) await observe('Grinder-native-idle-before', () => recordGrinderIdle('before'));
        await observe('Grinder-native-intake-animation', async () => {
            if (process.argv.includes('--grinder-motion')) await startClip();
            await page.evaluate(() => {
                const d = window.__ra2debug, f = window.__allied, b = f.buildings.YAGRND;
                f.focus(b); f.recycle = f.spawn('INIT', 3, b.tile); f.creditsBefore = f.player.credits;
                d.actionsApi.orderUnits([f.recycle.id], 8, b.id);
            });
            await wait(() => window.__allied.renderable(window.__allied.buildings.YAGRND).currentAnimType === 20, 30000);
            await stage('YAGRND-native-intake-moving');
            await wait(() => window.__allied.renderable(window.__allied.buildings.YAGRND).currentAnimType === 0, 18000);
            if (process.argv.includes('--grinder-motion')) await stopClip('YAGRND-native-complete-intake');
            const result = await page.evaluate(() => ({ removed: !window.__allied.recycle.isSpawned,
                refund: window.__allied.player.credits - window.__allied.creditsBefore,
                sequence: window.__allied.visualTrace.flat().filter(s => s.name === 'YAGRND' && s.currentAnimType === 20) }));
            assert(result.removed && result.refund > 0 && result.sequence.length > 1);
            assert(result.sequence.every(s => s.animations.find(a => a.type === 2)?.members.every(m => !m.visible)));
            return result;
        });
        if (process.argv.includes('--r8-motion')) await observe('Grinder-native-idle-after', () => recordGrinderIdle('after'));
        await observe('Grinder-native-damaged-intake-animation', async () => {
            await page.evaluate(() => {
                const d = window.__ra2debug, f = window.__allied, b = f.buildings.YAGRND;
                b.healthTrait.inflictDamage(Math.floor(b.healthTrait.getHitPoints() * .7), { player: f.enemy }, d.game);
                f.focus(b);
                f.damagedIntakeStart = d.game.currentTick;
            });
            await stage('YAGRND-native-damaged-before-intake');
            await startClip();
            await page.evaluate(() => {
                const d = window.__ra2debug, f = window.__allied, b = f.buildings.YAGRND;
                f.recycle = f.spawn('INIT', 3, b.tile); f.creditsBefore = f.player.credits;
                d.actionsApi.orderUnits([f.recycle.id], 8, b.id);
            });
            await wait(() => window.__allied.renderable(window.__allied.buildings.YAGRND).currentAnimType === 20, 30000);
            await stage('YAGRND-native-damaged-intake-moving');
            await wait(() => window.__allied.renderable(window.__allied.buildings.YAGRND).currentAnimType === 0, 18000);
            await stopClip('YAGRND-native-damaged-complete-intake');
            const result = await page.evaluate(() => ({ removed: !window.__allied.recycle.isSpawned,
                refund: window.__allied.player.credits - window.__allied.creditsBefore,
                sequence: window.__allied.visualTrace.flat().filter(s => s.name === 'YAGRND' && s.currentAnimType === 20 &&
                    s.tick >= window.__allied.damagedIntakeStart) }));
            assert(result.removed && result.refund > 0);
            const frames = result.sequence.flatMap(s => s.animations.find(a => a.type === 3)?.members
                .filter(m => m.visible).map(m => m.frame) ?? []);
            assert(frames.length > 3 && frames.every(frame => frame >= 48), 'Damaged recycling must use native damaged active slots');
            return result;
        });
        await observe('Psychic-Tower-native-control', async () => {
            await page.evaluate(() => {
                const d = window.__ra2debug, f = window.__allied, b = f.buildings.YAPSYT;
                f.focus(b); f.controlTarget = f.disable(f.spawn('E2', 3, b.tile, f.enemy));
                d.actionsApi.orderUnits([b.id], 2, f.controlTarget.id);
            });
            await wait(() => window.__allied.controlTarget.owner === window.__allied.player);
            await stage('YAPSYT-native-control');
            if (process.argv.includes('--r8-motion')) {
                await page.evaluate(() => {
                    const d = window.__ra2debug, f = window.__allied;
                    f.countMindLinks = () => {
                        let count = 0;
                        d.worldScene.get3DObject().traverse(o => { if (o.name === 'fx_mclink') count++; });
                        return count;
                    };
                    d.game.unitSelection.deselectAll();
                    d.game.unitSelection.addToSelection(f.controlTarget);
                });
                await wait(() => window.__allied.countMindLinks() === 1);
                await stage('Mind-control-target-selected');
                await page.evaluate(() => window.__ra2debug.game.unitSelection.addToSelection(window.__allied.buildings.YAPSYT));
                await page.waitForTimeout(160);
                assert.equal(await page.evaluate(() => window.__allied.countMindLinks()), 1, 'Both selected must share one arc');
                await stage('Mind-control-both-selected');
                await page.evaluate(() => window.__ra2debug.game.unitSelection.deselectAll());
                await wait(() => window.__allied.countMindLinks() === 0);
                await stage('Mind-control-deselected');
                report.controlSelection = { targetOnly: 1, bothSelected: 1, deselected: 0 };
            }
            return page.evaluate(() => ({ targets: window.__allied.buildings.YAPSYT.mindControllerTrait.getTargets().map(u => u.id),
                sample: window.__allied.sampleBuilding(window.__allied.buildings.YAPSYT) }));
        });
        if (process.argv.includes('--r8-motion')) await observe('Controlled-unit-selection-link', async () => {
            await page.evaluate(() => {
                const d = window.__ra2debug, f = window.__allied;
                f.buildings.YAPSYT.attackTrait.setDisabled(true);
                const towerTile = f.buildings.YAPSYT.tile;
                f.controllerUnit = f.spawn('YURI', 3, { rx: towerTile.rx + 10, ry: towerTile.ry + 10 });
                f.controlledUnit = f.disable(f.spawn('E2', 3, f.controllerUnit.tile, f.enemy));
                f.focus(f.controllerUnit);
                d.actionsApi.orderUnits([f.controllerUnit.id], 2, f.controlledUnit.id);
            });
            await wait(() => window.__allied.controlledUnit.owner === window.__allied.player);
            await page.evaluate(() => {
                const d = window.__ra2debug, f = window.__allied;
                d.game.unitSelection.deselectAll(); d.game.unitSelection.addToSelection(f.controlledUnit);
            });
            await wait(() => window.__allied.countMindLinks() === 1);
            await stage('Mind-control-unit-target-selected');
            const result = await page.evaluate(() => ({ links: window.__allied.countMindLinks(),
                controller: window.__allied.controllerUnit.name,
                sourceSelected: window.__ra2debug.game.unitSelection.isSelected(window.__allied.controllerUnit),
                targetSelected: window.__ra2debug.game.unitSelection.isSelected(window.__allied.controlledUnit) }));
            assert(!result.sourceSelected && result.targetSelected);
            await page.evaluate(() => window.__ra2debug.game.unitSelection.deselectAll());
            await wait(() => window.__allied.countMindLinks() === 0);
            return result;
        });
        await observe('Gatling-native-stages', async () => {
            await page.evaluate(() => {
                const d = window.__ra2debug, f = window.__allied, b = f.buildings.YAGGUN;
                f.focus(b); f.gatTarget = f.disable(f.spawn('APOC', 7, b.tile, f.enemy));
                d.actionsApi.orderUnits([b.id], 2, f.gatTarget.id);
            });
            await wait(() => window.__allied.buildings.YAGGUN.armedTrait.gattlingHeat >= window.__allied.buildings.YAGGUN.rules.gattlingStages[1], 15000);
            await stage('YAGGUN-native-high-stage');
            const result = await page.evaluate(() => ({ sample: window.__allied.sampleBuilding(window.__allied.buildings.YAGGUN),
                stages: window.__allied.buildings.YAGGUN.rules.gattlingStages }));
            await page.evaluate(() => window.__ra2debug.actionsApi.orderUnits([window.__allied.buildings.YAGGUN.id], 11));
            return result;
        });
        await observe('Gatling-native-air-rotation', async () => {
            await page.evaluate(() => {
                const d = window.__ra2debug, f = window.__allied, b = f.buildings.YAGGUN;
                f.focus(b); f.airTarget = f.disable(f.spawn('DISK', 7,
                    { rx: b.tile.rx + 5, ry: b.tile.ry - 3 }, f.enemy));
                d.actionsApi.orderUnits([b.id], 2, f.airTarget.id);
            });
            await wait(() => window.__allied.airTarget.healthTrait.health < 100, 20000);
            await stage('YAGGUN-native-air-rotation');
            return page.evaluate(() => ({ target: window.__allied.sample(window.__allied.airTarget),
                turret: window.__allied.buildings.YAGGUN.turretTrait.facing,
                activeDensity: window.__allied.renderable(window.__allied.buildings.YAGGUN).buildingTurretHd?.resources.density ?? 1 }));
        });
        await observe('Psychic-Sensor-native-detection', async () => {
            await page.evaluate(() => {
                const d = window.__ra2debug, f = window.__allied, map = d.game.map;
                d.game.mapShroudTrait.revealMap(f.enemy, d.game);
                f.place('YAPOWR', f.point(1.4, 35), f.enemy);
                f.place('YAPOWR', f.point(1.4, 35), f.enemy);
                f.cloaker = f.spawn('BSUB', 7, f.buildings.YAYARD.tile);
                f.cloaker.attackTrait.setDisabled(true);
            });
            await wait(() => window.__allied.cloaker.cloakableTrait.isCloaked(), 25000);
            const before = await page.evaluate(() => ({ cloaked: window.__allied.cloaker.cloakableTrait.isCloaked(), tick: window.__ra2debug.game.currentTick }));
            await page.evaluate(() => {
                const d = window.__ra2debug, f = window.__allied;
                f.sensor = f.place('NAPSIS', f.cloaker.tile, f.enemy); f.focus(f.sensor);
                const distance = Math.hypot(f.cloaker.tile.rx - f.sensor.tile.rx, f.cloaker.tile.ry - f.sensor.tile.ry);
                if (distance > f.sensor.rules.sensorsSight) throw Error('No legal shore detector within native range: ' + distance);
            });
            await wait(() => window.__allied.sensor.buildStatus === 1 && !window.__allied.cloaker.cloakableTrait.isCloaked(), 20000);
            await stage('NAPSIS-native-detected-cloaker');
            return page.evaluate(before => ({ before, sample: window.__allied.sampleBuilding(window.__allied.sensor),
                cloaked: window.__allied.cloaker.cloakableTrait.isCloaked(),
                range: window.__allied.sensor.rules.sensorsSight }), before);
        });
        await observe('Barracks-Cloning-native-production', async () => {
            await page.evaluate(() => {
                const d = window.__ra2debug, f = window.__allied; f.focus(f.buildings.NACLON);
                f.clones = []; d.game.events.subscribe(e => { if (e.type === 44 && e.target.owner === f.player && e.target.name === 'INIT') f.clones.push({ id: e.target.id, factory: e.factory?.name }); });
                d.actionsApi.queueForProduction(2, 3, 'INIT', 1);
            });
            await wait(() => window.__allied.clones.length === 2, 30000);
            await stage('NACLON-native-production');
            const result = await page.evaluate(() => window.__allied.clones);
            assert.equal(new Set(result.map(u => u.id)).size, 2); assert.deepEqual(result.map(u => u.factory).sort(), ['NACLON', 'YABRCK']); return result;
        });
        await observe('War-Factory-ground-air-production', async () => {
            await page.evaluate(() => {
                const d = window.__ra2debug, f = window.__allied; f.focus(f.buildings.YAWEAP); f.products = [];
                d.game.events.subscribe(e => { if (e.type === 44 && e.target.owner === f.player && ['LTNK', 'DISK'].includes(e.target.name)) f.products.push({ name: e.target.name, id: e.target.id, factory: e.factory?.name }); });
                d.actionsApi.queueForProduction(3, 7, 'LTNK', 1); d.actionsApi.queueForProduction(3, 7, 'DISK', 1);
            });
            await wait(() => window.__allied.products.some(u => u.name === 'LTNK') && window.__allied.products.some(u => u.name === 'DISK'), 60000);
            await stage('YAWEAP-native-production'); return page.evaluate(() => window.__allied.products);
        });
        await observe('Slave-Miner-production-deployment', async () => {
            const motion = process.argv.includes('--miner-motion');
            if (motion) await startClip();
            await page.evaluate(() => {
                const d = window.__ra2debug, f = window.__allied;
                d.game.events.subscribe(e => { if (e.type === 44 && e.target.owner === f.player && e.target.name === 'SMIN') f.miner = e.target; });
                d.actionsApi.queueForProduction(3, 7, 'SMIN', 1);
            });
            await wait(() => !!window.__allied.miner?.replacedBy?.isSpawned && window.__allied.miner.replacedBy.slaveMinerTrait.getSlaves().length === 5, 85000);
            await page.evaluate(() => window.__allied.focus(window.__allied.miner.replacedBy));
            await stage('YAREFN-native-produced-deployed');
            if (motion) {
                await stopClip('YAREFN-native-production-deploy');
                await startClip();
                await page.evaluate(() => {
                    const d = window.__ra2debug, f = window.__allied;
                    f.deployedMiner = f.miner.replacedBy;
                    const worker = d.game.getConstructionWorker(f.player), origin = f.deployedMiner.tile;
                    f.minerMoveTarget = d.game.map.tiles.getAll().filter(t => d.game.map.isWithinBounds(t) &&
                        Math.hypot(t.rx-origin.rx,t.ry-origin.ry) >= 3 &&
                        worker.canPlaceAt('YAREFN',t,{ignoreAdjacent:true}))
                        .sort((a,b) => Math.hypot(a.rx-origin.rx,a.ry-origin.ry)-Math.hypot(b.rx-origin.rx,b.ry-origin.ry))[0];
                    if (!f.minerMoveTarget) throw Error('No legal miner movement/deployment target');
                    d.actionsApi.orderUnits([f.deployedMiner.id], 0, f.minerMoveTarget.rx, f.minerMoveTarget.ry);
                });
                await wait(() => !!window.__allied.deployedMiner.replacedBy?.isSpawned, 25000);
                await page.evaluate(() => {
                    const d = window.__ra2debug, f = window.__allied;
                    f.mobileMiner = f.deployedMiner.replacedBy; f.focus(f.mobileMiner);
                    d.actionsApi.orderUnits([f.mobileMiner.id], 11);
                });
                await stage('YAREFN-native-mobile');
                await page.evaluate(() => {
                    const d = window.__ra2debug, f = window.__allied;
                    d.actionsApi.orderUnits([f.mobileMiner.id], 10);
                });
                await wait(() => !!window.__allied.mobileMiner.replacedBy?.isSpawned &&
                    window.__allied.mobileMiner.replacedBy.buildStatus === 1, 25000);
                await page.evaluate(() => window.__allied.focus(window.__allied.mobileMiner.replacedBy));
                await stage('YAREFN-native-redeployed');
                await stopClip('YAREFN-native-undeploy-redeploy');
            }
            return page.evaluate(() => ({ name: window.__allied.miner.replacedBy.name,
                slaves: window.__allied.miner.replacedBy.slaveMinerTrait.getSlaves().length,
                sample: window.__allied.sampleBuilding(window.__allied.miner.replacedBy) }));
        });
        await observe('Shipyard-native-production-repair', async () => {
            await page.evaluate(() => {
                const d = window.__ra2debug, f = window.__allied; f.focus(f.buildings.YAYARD);
                d.game.events.subscribe(e => { if (e.type === 44 && e.target.owner === f.player && e.target.name === 'BSUB') f.ship = e.target; });
                d.actionsApi.queueForProduction(5, 7, 'BSUB', 1);
            });
            await wait(() => !!window.__allied.ship, 90000);
            await page.evaluate(() => {
                const d = window.__ra2debug, f = window.__allied;
                f.ship.healthTrait.health = 50; d.actionsApi.orderUnits([f.ship.id], 13, f.buildings.YAYARD.id);
            });
            await wait(() => window.__allied.ship.healthTrait.health > 50, 35000);
            await stage('YAYARD-native-dock-repair');
            return page.evaluate(() => ({ name: window.__allied.ship.name, health: window.__allied.ship.healthTrait.health,
                sample: window.__allied.sampleBuilding(window.__allied.buildings.YAYARD) }));
        });
        for (const [name, type, targetName] of [['YAGNTC', 9, 'GeneticConverterSpecial'], ['YAPPET', 7, 'PsychicDominatorSpecial']]) {
            await observe(name + '-native-charge-fire-close', async () => {
                const hingeMotion = name === 'YAPPET' && process.argv.includes('--hinge-motion');
                const buildingElectricity = name === 'YAGNTC' && process.argv.includes('--building-electricity');
                if (hingeMotion || buildingElectricity) {
                    await page.evaluate(name => window.__allied.focus(window.__allied.buildings[name]), name);
                    await startClip();
                }
                await page.evaluate(({ name, targetName, feedback }) => {
                    const f = window.__allied, b = f.buildings[name]; f.focus(b);
                    const sw = f.player.superWeaponsTrait.get(targetName); sw.chargeTicks = 120; sw.resumeTimer();
                    let near = f.point(.6, 28);
                    if (feedback) {
                        const game = window.__ra2debug.game, tiles = game.map.tiles.getAll();
                        const occupied = tiles.filter(t => game.map.getGroundObjectsOnTile(t).some(o => o.isTechno() || o.isTerrain()));
                        const buildings = tiles.filter(t => game.map.getGroundObjectsOnTile(t).some(o => o.isBuilding()));
                        const victimRule = game.rules.getObject(name === 'YAPPET' ? 'APOC' : 'E2', name === 'YAPPET' ? 7 : 3);
                        near = tiles.filter(t => game.map.isWithinBounds(t) && !t.rampType &&
                            game.map.terrain.getPassableSpeed(t, victimRule.speedType, name !== 'YAPPET', false) > 0 &&
                            !game.map.getGroundObjectsOnTile(t).some(o => o.isTechno() || o.isTerrain()) &&
                            occupied.every(p => Math.hypot(p.rx-t.rx, p.ry-t.ry) > 3) &&
                            (name !== 'YAPPET' || buildings.every(p => Math.hypot(p.rx-t.rx, p.ry-t.ry) > 16)))
                            .sort((a,b) => Math.hypot(a.rx-near.rx,a.ry-near.ry)-Math.hypot(b.rx-near.rx,b.ry-near.ry))[0];
                        if (!near) throw Error('No clear legal superweapon victim tile');
                    }
                    f.swVictim = f.disable(f.spawn(name === 'YAPPET' ? 'APOC' : 'E2', name === 'YAPPET' ? 7 : 3, near, f.enemy));
                    if (feedback && (f.swVictim.tile.rx !== near.rx || f.swVictim.tile.ry !== near.ry))
                        throw Error('Native victim placement moved outside the verified clear area');
                }, { name, targetName, feedback: process.argv.includes('--feedback-phases') });
                await page.waitForFunction(targetName => window.__allied.player.superWeaponsTrait.get(targetName).status === 2, targetName, { timeout: 25000 });
                await page.waitForFunction(name => window.__allied.renderable(window.__allied.buildings[name]).currentAnimType === 11, name, { timeout: 18000 });
                await stage(name + '-native-charged');
                if (hingeMotion || buildingElectricity) await stopClip(name + '-native-opening-charged');
                if (process.argv.includes('--feedback-phases') && !buildingElectricity) await page.evaluate(() => {
                    const f = window.__allied; f.deathRenderable = f.renderable(f.swVictim); f.focus(f.swVictim);
                });
                await startClip();
                await page.evaluate(type => window.__ra2debug.actionsApi.activateSuperWeapon(type, window.__allied.swVictim.tile), type);
                await page.waitForFunction(type => type === 9 ? window.__allied.swVictim.isDestroyed : window.__allied.swVictim.owner === window.__allied.player, type, { timeout: 25000 });
                if (buildingElectricity) {
                    await page.waitForFunction(name => window.__allied.renderable(window.__allied.buildings[name]).currentAnimType === 12,
                        name, { timeout: 15000 });
                } else if (type === 9 && process.argv.includes('--feedback-phases')) {
                    await wait(() => window.__allied.deathRenderable?.deathAnimRenderable?.mainObj?.builder?.getFrame() >= 3);
                }
                await stage(name + '-native-fired');
                if (type === 9 && process.argv.includes('--feedback-phases') && !buildingElectricity) {
                    await wait(() => window.__allied.player.getOwnedObjects().some(u => u.name === 'BRUTE' &&
                        Math.hypot(u.tile.rx-window.__allied.swVictim.tile.rx,u.tile.ry-window.__allied.swVictim.tile.ry) < 3));
                    await page.evaluate(() => { const f = window.__allied; f.brute = f.player.getOwnedObjects().find(u =>
                        u.name === 'BRUTE' && Math.hypot(u.tile.rx-f.swVictim.tile.rx,u.tile.ry-f.swVictim.tile.ry) < 3); f.focus(f.brute); });
                    await stage(name + '-native-mutated');
                }
                if (process.argv.includes('--feedback-phases')) await page.evaluate(name => window.__allied.focus(window.__allied.buildings[name]), name);
                await page.waitForFunction(name => window.__allied.renderable(window.__allied.buildings[name]).currentAnimType === 0, name, { timeout: 18000 });
                if (hingeMotion || buildingElectricity) await stage(name + '-native-closed');
                await stopClip(name + '-native-fire-close');
                return page.evaluate(name => ({ victim: { destroyed: window.__allied.swVictim.isDestroyed, owner: window.__allied.swVictim.owner.name },
                    sequence: window.__allied.visualTrace.flat().filter(s => s.name === name && [10, 11, 12].includes(s.currentAnimType)) }), name);
            });
        }
        await observe('native-capture-owner-change', async () => {
            await page.evaluate(() => {
                const d = window.__ra2debug, f = window.__allied;
                f.captureBuilding = f.place('YABRCK', f.point(1, 28), f.enemy); f.focus(f.captureBuilding);
                f.engineer = f.spawn('YENGINEER', 3, f.captureBuilding.tile);
            });
            await wait(() => window.__allied.captureBuilding.buildStatus === 1);
            await stage('YABRCK-enemy-owner-before-capture');
            const before = await page.evaluate(() => window.__allied.sampleBuilding(window.__allied.captureBuilding));
            await page.evaluate(() => window.__ra2debug.actionsApi.orderUnits([window.__allied.engineer.id], 7, window.__allied.captureBuilding.id));
            await wait(() => window.__allied.captureBuilding.owner === window.__allied.player, 30000);
            await stage('YABRCK-native-captured-new-owner');
            const after = await page.evaluate(() => window.__allied.sampleBuilding(window.__allied.captureBuilding));
            assert.notDeepEqual(before.color, after.color); return { before, after };
        });
        await observe('Battle-Lab-shield-power-restoration', async () => {
            await page.evaluate(() => {
                const d = window.__ra2debug, f = window.__allied;
                f.focus(f.buildings.YATECH);
                const sw = f.player.superWeaponsTrait.get('ForceShieldSpecial'); sw.chargeTicks = 0; sw.status = 2;
                d.actionsApi.activateSuperWeapon(10, f.buildings.YATECH.tile);
            });
            await wait(() => window.__allied.buildings.YATECH.invulnerableTrait.isActive());
            await stage('YATECH-native-shield-blackout');
            const before = await page.evaluate(() => ({ blackout: window.__allied.player.powerTrait.getBlackoutDuration(),
                lab: window.__allied.sampleBuilding(window.__allied.buildings.YATECH),
                tower: window.__allied.sampleBuilding(window.__allied.buildings.YAPSYT),
                grinder: window.__allied.sampleBuilding(window.__allied.buildings.YAGRND) }));
            await wait(() => window.__allied.player.powerTrait.getBlackoutDuration() === 0, 60000);
            await stage('YATECH-native-power-restored');
            assert(before.blackout > 0); return before;
        });
    }
    await observe('mixed-accepted-peer-residency', async () => {
            await page.evaluate(() => {
                const f = window.__allied; f.peers = ['GAPOWR', 'NAPOWR'].map(name => f.place(name, f.point(2, 27)));
                f.peerInfantry = f.spawn('E1', 3); f.peerTank = f.spawn('MTNK', 7);
            });
            await wait(() => {
                const f = window.__allied;
                return f.peers.every(u => f.renderable(u)?.mainObj?.builder?.hdOverride) &&
                    !!f.renderable(f.peerInfantry)?.shpRenderable?.builder?.hdOverride &&
                    !!f.renderable(f.peerTank)?.unitVxlHd?.active;
            }, 40000);
            return page.evaluate(() => window.__ra2debug.sovietUnitsHd);
        });
    if ((snow && density === 4 && functional) || process.argv.includes('--construction-motion')) {
        report.constructionChargePreset = process.argv.includes('--ready-during-construction');
        await page.evaluate(ready => window.__readyDuringConstruction = ready, report.constructionChargePreset);
        for (const name of families) await observe(name + '-construction-damage-selling', async () => {
            if (process.argv.includes('--construction-motion')) await startClip();
            await page.evaluate(name => {
                const d = window.__ra2debug, f = window.__allied;
                const near = name === 'YAREFN' ? d.game.map.tiles.getAll().find(t => d.game.map.getObjectsOnTile(t).some(o => o.isOverlay() && o.isTiberium())) : f.point(2.4, 24);
                if (window.__readyDuringConstruction && name === 'YAGNTC') {
                    const weapon = f.player.superWeaponsTrait.get('GeneticConverterSpecial');
                    weapon.chargeTicks = 120; weapon.resumeTimer();
                }
                f.construction = f.place(name, near); f.focus(f.construction);
                f.buildings[name + '-construction'] = f.construction;
            }, name);
            await stage(name + '-native-construction');
            await wait(() => window.__allied.construction.buildStatus === 1, 18000);
            if (process.argv.includes('--construction-motion')) {
                await page.waitForFunction(() => window.__allied.renderable(window.__allied.construction).currentAnimType !== 5);
                await stage(name + '-native-completed');
                if (name === 'YAGGUN') {
                    const preview = await page.evaluate(() => window.__allied.visualTrace.flat().filter(s =>
                        s.id === window.__allied.construction.id && s.currentAnimType === 5 &&
                        s.animations.find(a => a.type === 5)?.members.some(m => m.frame >= 10)));
                    assert(preview.length && preview.every(s => s.turretVisible), 'Raised receiver must remain fully visible in native completion slots');
                }
                await stopClip(name + '-native-construction-motion');
            }
            await page.evaluate(() => {
                const d = window.__ra2debug, f = window.__allied, u = f.construction;
                u.healthTrait.inflictDamage(Math.floor(u.healthTrait.getHitPoints() * .7), { player: f.enemy }, d.game);
            });
            await stage(name + '-native-damaged');
            const damaged = await page.evaluate(() => window.__allied.sampleBuilding(window.__allied.construction));
            await page.evaluate(name => {
                const d = window.__ra2debug, f = window.__allied;
                if (name === 'YAREFN') {
                    const target = f.point(1.1, 12);
                    d.actionsApi.orderUnits([f.construction.id], 0, target.rx, target.ry);
                }
                else d.actionsApi.sellBuilding(f.construction.id);
            }, name);
            await stage(name + '-native-selling');
            await wait(() => !window.__allied.construction.isSpawned, 18000);
            return damaged;
        });
    }
    await page.evaluate(() => clearInterval(window.__allied.visualTimer));
    report.visualTrace = await page.evaluate(() => window.__allied.visualTrace);
    report.effectTrace = await page.evaluate(() => window.__allied.effectTrace);
    report.events = await page.evaluate(() => window.__allied.events);
    const failed = Object.entries(report.cases).filter(([, result]) => result.status === 'FAIL');
    report.statusBoundary = 'REQUESTED_DENSITY_AND_GROUPED_CASES_ONLY';
    if (failed.length) failure = new Error('Failed cases: ' + failed.map(([name]) => name).join(', '));
} catch (error) { failure = error; }
await close(failure);
if (failure) throw failure;
