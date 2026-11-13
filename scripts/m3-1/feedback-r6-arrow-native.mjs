import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { _electron as electron } from '@playwright/test';
import { PNG } from 'pngjs';

const root = path.resolve(import.meta.dirname, '../..'), receipt = JSON.parse(await fs.readFile(path.resolve(process.argv[2])));
const out = path.resolve(process.argv[3]); await fs.mkdir(out, { recursive: false });
await fs.copyFile(import.meta.filename, path.join(out, 'harness.mjs'));
const checkpoint = JSON.parse(await fs.readFile(path.join(root, 'scripts/m3-1/fixtures/mid-mission-checkpoint.json')));
const baseline = JSON.parse(await fs.readFile(path.join(root, '.artifacts/m3-1/input-final/report.json')));
const metadata = JSON.parse(await fs.readFile(path.join(receipt.app, 'Contents/Resources/app/package.json')));
const report = { status: 'RUNNING', app: receipt.app, sourceHead: metadata.sourceHead, cases: [], screenshots: [], errors: [], failedResources: [],
    harnessSha256: createHash('sha256').update(await fs.readFile(import.meta.filename)).digest('hex'),
    scope: 'Restore the authentic Normal checkpoint and replay its original ordinary orders only through bridge repair, in HD and Original. Brief render-only controls hold one naturally triggered arrow pose and hide other world meshes to measure its complete green silhouette against the real bridge scene; gameplay values and source scripts are untouched.' };
let app, page, labels;
const save = () => fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
async function shot(name) {
    const file = path.join(out, name + '.png'); await page.screenshot({ path: file });
    report.screenshots.push(name + '.png'); await save(); return PNG.sync.read(await fs.readFile(file));
}
async function stepUntil(target) {
    while (await page.evaluate(() => window.__ra2debug.game.currentTick) < target) {
        await page.evaluate(target => {
            const d = window.__ra2debug, g = d.game, m = d.gameScreen.gameTurnMgr; m.setCampaignPaused(false);
            try {
                for (let i = 0; i < 120 && g.currentTick < target; i++) {
                    for (const command of window.__bridgeOrders.filter(command => command.tick === g.currentTick)) {
                        const action = d.actionFactory.create(command.type); action.unserialize(new Uint8Array(command.data));
                        action.player = g.getPlayer(command.player); g.campaign.journal.record(g, action.player, [action]); action.process();
                    }
                    m.doGameTurn(performance.now());
                }
            } finally { m.setCampaignPaused(true); }
        }, target);
    }
}
async function bridgeState() {
    return page.evaluate(() => {
        const d = window.__ra2debug, g = d.game, hut = g.world.getAllObjects().find(o => o.id === 1607), trait = hut.cabHutTrait;
        return { tick: g.currentTick, hash: g.getHash(), missing: trait.bridges.findDestroyedPieceTiles(trait.findClosestBridgeBounds()).length,
            repairable: trait.canRepairBridge(), trusted: g.campaign.journal.trusted, modified: !!g.campaign.inspectionModified };
    });
}
try {
    app = await electron.launch({ executablePath: path.join(receipt.app, 'Contents/MacOS', receipt.executable), cwd: '/private/tmp',
        env: { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('RA2_'))), RA2_DESKTOP_USER_DATA: path.join(out, 'profile') } });
    page = await app.firstWindow(); page.on('pageerror', error => report.errors.push(error.stack));
    page.on('response', response => { if (response.status() >= 400) report.failedResources.push({ url: response.url(), status: response.status() }); });
    app.process().stderr?.on('data', bytes => { void fs.appendFile(path.join(out, 'electron.log'), bytes); });
    await page.waitForSelector('[data-campaign-ready=true]', { timeout: 90000 });
    const browserWindow = await app.browserWindow(page);
    await browserWindow.evaluate(window => { window.unmaximize(); window.setContentSize(1280, 960); });
    const language = await page.evaluate(() => document.documentElement.lang);
    labels = { ...JSON.parse(await fs.readFile(path.join(root, `public/res/locale/retail-ra2-${language}.json`))).labels,
        ...JSON.parse(await fs.readFile(path.join(root, `public/res/locale/${language}.json`))) };
    for (const density of [4, 1]) {
        await page.evaluate(density => { const options = window.__ra2debug.generalOptions.graphics;
            options.hdEnabled.value = density !== 1; options.hdDensity.value = 4;
            window.__previousArrowGame = window.__ra2debug.game;
        }, density);
        await page.evaluate(checkpoint => window.__ra2debug.mainMenuController.screens.get(22).launchMission(checkpoint), checkpoint);
        await page.waitForFunction(tick => { const d = window.__ra2debug; return d.game !== window.__previousArrowGame
            && d.game?.currentTick === tick && d.gameScreen?.menu.getCurrentScreen(); }, checkpoint.tick, { timeout: 180000 });
        assert.equal(await page.evaluate(() => window.__ra2debug.game.getHash()), checkpoint.expected.worldHash);
        await page.evaluate(commands => {
            const d = window.__ra2debug; d.gameScreen.gameTurnMgr.setCampaignPaused(true); d.gameScreen.pointer.unlock(true); d.gameScreen.menu.close();
            window.__bridgeOrders = commands; window.__missionArrows = []; window.__animationNames = {};
            const manager = d.renderableManager, create = manager.createTransientAnim.bind(manager);
            manager.createTransientAnim = (...args) => {
                const animation = create(...args);
                window.__animationNames[animation.name] = (window.__animationNames[animation.name] ?? 0) + 1;
                if (animation.objectArt.art.getString('Layer').toLowerCase() === 'top') {
                    window.__missionArrows.push(animation);
                    if (d.game.currentTick >= 9410 && d.game.currentTick < 9440) {
                        animation.__updateBeforeProbe = animation.update;
                        animation.update = function (time) { this.__updateBeforeProbe(time); this.animation?.pause(); };
                    }
                }
                return animation;
            };
        }, baseline.final.commands.filter(command => command.tick >= checkpoint.tick));
        await stepUntil(9440);
        await page.evaluate(() => { const d = window.__ra2debug;
            d.worldInteraction.minimapHandler.panToTile(d.game.map.getTileAtWaypoint(75)); });
        await page.waitForTimeout(200);
        const before = await bridgeState(); assert.equal(before.hash, baseline.stages.find(stage => stage.name === 'first-base').hash);
        assert(before.missing > 0 && before.repairable && before.trusted && !before.modified);
        const arrows = await page.evaluate(() => {
            const d = window.__ra2debug, camera = d.worldScene.camera, viewport = d.worldScene.viewport;
            const live = window.__missionArrows.filter(a => a.get3DObject()?.parent && a.mainObj?.getShapeMesh());
            window.__liveMissionArrows = live;
            return live.map(animation => {
                animation.__tickBeforeProbe = animation.animationRunner.tick;
                animation.animationRunner.tick = () => {};
                const mesh = animation.mainObj.getShapeMesh(), positions = mesh.geometry.attributes.position;
                const xs = [], ys = [];
                for (let i = 0; i < positions.count; i++) {
                    const point = camera.position.clone().fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld).project(camera);
                    xs.push(viewport.x + (point.x + 1) * viewport.width / 2);
                    ys.push(viewport.y + (1 - point.y) * viewport.height / 2);
                }
                return { name: animation.name, layer: animation.objectArt.art.getString('Layer'), order: mesh.renderOrder,
                    depthTest: mesh.material.depthTest, transparent: mesh.material.transparent,
                    bounds: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)],
                    position: animation.getPosition().toArray() };
            });
        });
        const observed = await page.evaluate(() => ({ names: window.__animationNames,
            createdTail: window.__missionArrows.slice(-5).map(a => ({ name: a.name, parent: !!a.get3DObject()?.parent, finished: a.isAnimFinished() })),
            traceTail: window.__ra2debug.game.campaign.trace.filter(a => a.key === '083182BC').slice(-5) }));
        report.activeCase = { density, before, arrows, observed }; await save();
        assert(arrows.length > 0, 'The original bridge hint must actually create an arrow');
        assert(arrows.every(a => a.order === 1000000 && !a.depthTest && a.transparent));
        const viewport = await page.evaluate(() => [innerWidth, innerHeight]);
        await page.waitForTimeout(80); const foreground = await shot(`bridge-${density}x-arrow-top`);
        await page.evaluate(() => {
            const meshes = new Set(window.__liveMissionArrows.map(a => a.mainObj.getShapeMesh())); window.__hiddenWorldMeshes = [];
            window.__ra2debug.worldScene.scene.traverse(object => {
                if (object.isMesh && object.visible && !meshes.has(object)) { window.__hiddenWorldMeshes.push(object); object.visible = false; }
            });
        });
        await page.waitForTimeout(80); const control = await shot(`bridge-${density}x-isolated-reference`);
        await page.evaluate(() => { for (const animation of window.__liveMissionArrows) {
            animation.animationRunner.tick = animation.__tickBeforeProbe;
            if (animation.__updateBeforeProbe) { animation.update = animation.__updateBeforeProbe; animation.animation.unpause(); }
        }
        for (const mesh of window.__hiddenWorldMeshes) mesh.visible = true;
        });
        let referenceGreen = 0, visibleGreen = 0;
        const green = (image, at) => image.data[at + 1] > 70 && image.data[at + 1] > image.data[at] * 1.4
            && image.data[at + 1] > image.data[at + 2] * 1.3;
        const sx = foreground.width / viewport[0], sy = foreground.height / viewport[1];
        for (const arrow of arrows.filter(a => a.bounds[0] >= 0 && a.bounds[1] >= 0 && a.bounds[2] < viewport[0] && a.bounds[3] < viewport[1])) {
            const [x0, y0, x1, y1] = arrow.bounds;
            for (let y = Math.max(0, Math.floor(y0 * sy) - 4); y <= Math.min(foreground.height - 1, Math.ceil(y1 * sy) + 4); y++) {
                for (let x = Math.max(0, Math.floor(x0 * sx) - 4); x <= Math.min(foreground.width - 1, Math.ceil(x1 * sx) + 4); x++) {
                    const at = (y * foreground.width + x) * 4;
                    if (green(control, at)) { referenceGreen++; if (green(foreground, at)) visibleGreen++; }
                }
            }
        }
        const visibleFraction = visibleGreen / referenceGreen;
        report.activeCase.silhouette = { referenceGreen, visibleGreen, visibleFraction, viewport }; await save();
        assert(referenceGreen > 100, 'The isolated native arrow must have a measurable green silhouette');
        assert(visibleFraction > .995, 'Bridge geometry must leave the complete arrow silhouette visible');
        assert.equal((await bridgeState()).hash, before.hash);
        await stepUntil(10548); const after = await bridgeState();
        assert.equal(after.missing, 0); assert(!after.repairable && after.trusted && !after.modified);
        await shot(`bridge-${density}x-engineer-repaired`);
        report.cases.push({ density, before, arrows, referenceGreen, visibleGreen, visibleFraction, after }); delete report.activeCase; await save();
        await page.evaluate(() => window.__ra2debug.gameScreen.menu.open());
        await page.getByRole('button', { name: labels['gui:abortmission'], exact: true }).click();
        await page.getByRole('button', { name: labels['gui:quit'], exact: true }).click();
        await page.waitForSelector('[data-campaign-ready=true]', { timeout: 90000 });
    }
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []);
    report.status = 'PASS_ORIGINAL_AND_HD_TOP_LAYER_ARROW_ABOVE_BROKEN_BRIDGE_AND_ORIGINAL_ENGINEER_REPAIR';
} catch (error) { report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1; await shot('failure').catch(() => {}); }
finally { await save(); await app?.close(); }
console.log(JSON.stringify({ status: report.status, cases: report.cases.map(row => ({ density: row.density, visibleFraction: row.visibleFraction })), out, error: report.error }));
