import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { _electron as electron } from '@playwright/test';
import { campaignLaunchOptions, enterCampaignFromMain } from './native-campaign-session.mjs';

const root = path.resolve(import.meta.dirname, '../..'), base = path.resolve(process.argv[2]);
const receipt = JSON.parse(await fs.readFile(process.argv[4] ?? path.join(base, 'native-stage/stage.json')));
const out = path.join(base, process.argv[3] ?? 'opening-native-v1'); await fs.mkdir(out, { recursive: false });
await fs.copyFile(import.meta.filename, path.join(out, 'harness.mjs'));
const report = { status: 'RUNNING', sourceHead: receipt.sourceHead, app: receipt.app, cases: [], errors: [], failedResources: [],
    harnessSha256: createHash('sha256').update(await fs.readFile(import.meta.filename)).digest('hex'),
    scope: 'Isolated native Mac profiles. The original fresh Normal opening runs with accelerated ordinary simulation turns and no injected objects, orders, health, ownership, reveal, triggers or garrison state. Camera pans are observational. Fixed-tick Original/2X/4X controls are compared. This is bounded opening evidence, not a full mission or Windows run.' };
const save = () => fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
let app, page;
async function shot(record, name) {
    const file = `${record.density}x-${name}.png`; await page.screenshot({ path: path.join(out, file) });
    record.screenshots.push(file); await save();
}
async function advance(target) {
    while (await page.evaluate(() => window.__ra2debug.game.currentTick) < target) {
        await page.evaluate(target => {
            const d = window.__ra2debug, manager = d.gameScreen.gameTurnMgr; manager.setCampaignPaused(false);
            try { for (let i = 0; i < 90 && d.game.currentTick < target; i++) manager.doGameTurn(performance.now()); }
            finally { manager.setCampaignPaused(true); }
        }, target);
    }
}
async function memorial() {
    return page.evaluate(() => {
        const d = window.__ra2debug, g = d.game, object = g.world.getAllObjects().find(o => o.name === 'CAWASH19');
        const r = d.renderableManager.getRenderableByGameObject(object);
        const animations = [...r.animations].map(([sprite, animation]) => {
            const builder = sprite.builder, page = builder?.getHdPage?.(), mesh = sprite.getShapeMesh?.();
            return { art: animation.props.getArt().name, start: animation.props.start,
                loop: [animation.props.loopStart, animation.props.loopEnd], rate: animation.props.rate,
                frame: animation.getCurrentFrame(), aggregateFrame: builder?.frameNo, frameOffset: builder?.frameOffset,
                gpuHd: !!page && mesh?.material?.type === 'HdSpriteMaterial' && mesh.material.map === page.base };
        });
        return { id: object.id, tick: g.currentTick, house: object.owner.name,
            occupied: !!object.garrisonTrait?.isOccupied(), units: object.garrisonTrait?.units.map(u => ({ name: u.name, id: u.id, house: u.owner.name })),
            animations, modified: !!g.campaign.inspectionModified, trusted: g.campaign.journal.trusted };
    });
}
try {
    for (const density of [1, 2, 4]) {
        const record = { density, screenshots: [], worldHd: [] }; report.cases.push(record); await save();
        app = await electron.launch(await campaignLaunchOptions(receipt, path.join(out, `profile-${density}x`)));
        app.process().stderr?.on('data', bytes => { void fs.appendFile(path.join(out, `electron-${density}x.log`), bytes); });
        page = await app.firstWindow(); page.on('pageerror', error => report.errors.push(error.stack));
        page.on('response', response => { if (response.status() >= 400) report.failedResources.push({ url: response.url(), status: response.status() }); });
        page.on('console', message => {
            const text = message.text(), prefix = '[World HD match] ';
            if (text.startsWith(prefix)) record.worldHd.push(JSON.parse(text.slice(prefix.length)));
        });
        await enterCampaignFromMain(page, receipt);
        await page.waitForSelector('[data-campaign-ready=true]', { timeout: 90000 });
        const windowHandle = await app.browserWindow(page);
        await windowHandle.evaluate(window => { window.unmaximize(); window.setContentSize(1280, 960); });
        await page.evaluate(density => {
            const d = window.__ra2debug, graphics = d.generalOptions.graphics;
            graphics.hdEnabled.value = density !== 1; graphics.hdDensity.value = density === 1 ? 4 : density;
            window.__r7Frozen = false;
            const timer = setInterval(() => {
                if (d.game?.campaign && d.gameScreen?.gameTurnMgr) {
                    d.gameScreen.gameTurnMgr.setCampaignPaused(true); window.__r7Frozen = true; clearInterval(timer);
                }
            }, 0);
            d.mainMenuController.screens.get(22).launchMission();
        }, density);
        await page.waitForFunction(() => window.__r7Frozen && window.__ra2debug.gameScreen?.playerUi, undefined, { timeout: 180000 });
        await page.evaluate(() => window.__ra2debug.gameScreen.pointer.unlock(true));
        await advance(30);
        await page.evaluate(() => { const d = window.__ra2debug, o = d.game.world.getAllObjects().find(o => o.name === 'CAWASH19');
            d.worldInteraction.minimapHandler.panToTile(o.tile); });
        await page.waitForTimeout(120); record.before = await memorial();
        assert.equal(record.before.occupied, false); assert.equal(record.before.modified, false);
        assert(record.before.animations.some(a => a.art === 'CAWA19_A' && a.loop[1] === 15));
        await shot(record, 'original-us-flag');
        for (let target = 60; target <= 3600; target += 30) {
            await advance(target);
            const observed = await page.evaluate(() => {
                const d = window.__ra2debug, g = d.game;
                const statue = g.world.getAllObjects().find(o => o.name === 'CAWASH19');
                const plane = g.world.getAllObjects().find(o => o.name === 'PDPLANE');
                return { occupied: !!statue.garrisonTrait?.isOccupied(), plane: plane && { id: plane.id, tick: g.currentTick } };
            });
            if (observed.plane && !record.plane) {
                await page.evaluate(id => { const d = window.__ra2debug, o = d.game.world.getAllObjects().find(o => o.id === id);
                    d.worldInteraction.minimapHandler.panToTile(o.tile); }, observed.plane.id);
                await page.waitForTimeout(100);
                record.plane = await page.evaluate(id => {
                    const d = window.__ra2debug, o = d.game.world.getAllObjects().find(o => o.id === id);
                    const r = d.renderableManager.getRenderableByGameObject(o), hd = r.unitVxlHd;
                    return { id, tick: d.game.currentTick, nativeSpawn: true, tile: [o.tile.rx, o.tile.ry],
                        bound: !!hd, active: !!hd?.active, family: structuredClone(d.sovietUnitsHd?.families.PDPLANE ?? null),
                        layers: hd?.layers.map(layer => layer.frames.map(f => ({ material: f.batch.material.type,
                            gpuHd: f.batch.material.map === f.part.override.pages[0].base, attached: !!f.batch.parent }))) ?? [] };
                }, observed.plane.id);
                if (density !== 1) { assert(record.plane.bound && record.plane.active); assert.equal(record.plane.family.density, density); }
                await shot(record, 'native-paradrop-plane');
            }
            if (observed.occupied) { record.firstOccupiedObservedAt = target; break; }
        }
        assert(record.firstOccupiedObservedAt, 'Original paradrop team did not occupy the memorial by tick 3600');
        await page.evaluate(() => { const d = window.__ra2debug, o = d.game.world.getAllObjects().find(o => o.name === 'CAWASH19');
            d.worldInteraction.minimapHandler.panToTile(o.tile); });
        await page.waitForTimeout(150); record.after = await memorial();
        const flag = record.after.animations.find(a => a.art === 'CAWA19_AG'); assert(flag);
        assert.deepEqual(flag.loop, [33, 47]); assert(flag.frame >= 33 && flag.frame <= 47);
        assert.equal(flag.rate, 220 / 60); assert.equal(flag.gpuHd, density !== 1);
        assert.equal(record.after.house, 'Other3 House');
        assert(record.after.units.some(u => u.name === 'E2' && u.house === record.after.house));
        assert.equal(record.after.modified, false); assert.equal(record.after.trusted, true);
        await shot(record, 'original-scripted-soviet-flag');
        if (process.argv.includes('--soviet-insignia') && density !== 1) {
            // A separate paused renderer sweep inspects every garrison slot.
            // It leaves the naturally reached simulation and animation state intact.
            await page.evaluate(() => window.__ra2debug.gameScreen.gameAnimationLoop.stop());
            record.flagSweep = await page.evaluate(() => {
                const d = window.__ra2debug, w = d.worldScene, gl = d.renderer.renderer, v = w.viewport;
                const statue = d.game.world.getAllObjects().find(o => o.name === 'CAWASH19');
                const r = d.renderableManager.getRenderableByGameObject(statue);
                const [sprite] = [...r.animations].find(([, a]) => a.props.getArt().name === 'CAWA19_AG');
                const previous = sprite.builder.frameNo, before = d.game.getHash(), frames = [];
                try {
                    for (let frame = 33; frame <= 47; frame++) {
                        sprite.setFrame(frame); w.meshBatchManager.updateMeshes(); d.renderer.render();
                        const mesh = sprite.getShapeMesh(), page = sprite.builder.getHdPage();
                        const position = mesh.geometry.attributes.position, points = [], ratio = gl.domElement.width / d.renderer.width;
                        for (let i = 0; i < position.count; i++) {
                            const p = w.camera.position.clone().fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld).project(w.camera);
                            points.push([(v.x + (p.x + 1) * v.width / 2) * ratio, (v.y + (1 - p.y) * v.height / 2) * ratio]);
                        }
                        const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
                        const crop = [Math.round((Math.min(...xs) + Math.max(...xs)) / 2 - 128),
                            Math.round((Math.min(...ys) + Math.max(...ys)) / 2 - 128), 256, 256];
                        const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 256;
                        canvas.getContext('2d').drawImage(gl.domElement, ...crop, 0, 0, 256, 256);
                        frames.push({ frame, gpuHd: mesh.material.type === 'HdSpriteMaterial' && mesh.material.map === page.base,
                            crop, png: canvas.toDataURL('image/png') });
                    }
                } finally { sprite.setFrame(previous); w.meshBatchManager.updateMeshes(); d.renderer.render(); }
                return { disclosure: 'Renderer-only slot sweep after natural original-team occupation; no world or animation timing changes.',
                    before, after: d.game.getHash(), frames, glError: gl.getContext().getError() };
            });
            assert.equal(record.flagSweep.before, record.flagSweep.after); assert.equal(record.flagSweep.glError, 0);
            for (const frame of record.flagSweep.frames) {
                assert(frame.gpuHd); const file = `${density}x-soviet-insignia-${frame.frame}.png`;
                await fs.writeFile(path.join(out, file), Buffer.from(frame.png.split(',')[1], 'base64'));
                delete frame.png; frame.screenshot = file;
            }
            await page.evaluate(() => window.__ra2debug.gameScreen.gameAnimationLoop.start());
        }
        await advance(3600);
        record.control = await page.evaluate(() => { const d = window.__ra2debug, g = d.game;
            return { tick: g.currentTick, hash: g.getHash(), rng: g.prng.snapshot(), mission: g.campaign.checkpointState(),
                glError: d.renderer.renderer.getContext().getError() }; });
        assert.equal(record.control.glError, 0);
        const expectedBudget = density === 4 ? 1280 * 1024 * 1024 : 512 * 1024 * 1024;
        if (density !== 1) assert.equal(record.worldHd.at(-1).worldBudget, expectedBudget);
        await save(); await app.close(); app = undefined;
    }
    assert.deepEqual(report.cases[1].control, report.cases[0].control);
    assert.deepEqual(report.cases[2].control, report.cases[0].control);
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []);
    report.status = 'PASS_ORIGINAL_SCRIPTED_FLAG_CHANGE_AND_MATCHED_3600_TICK_ORIGINAL_2X_4X_OPENING';
} catch (error) {
    report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1;
    if (page) await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
} finally { await save(); await app?.close(); }
console.log(JSON.stringify({ status: report.status, cases: report.cases.length, error: report.error, out }));
