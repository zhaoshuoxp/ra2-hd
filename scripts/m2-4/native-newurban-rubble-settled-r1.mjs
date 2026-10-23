// Supplement passing native bindings with unobscured representative material captures.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { startSession } from '../m1/allied-units/desktop-session.mjs';
import { installNativeObjectBindings } from '../m2/official-maps/native-object-bindings.mjs';

const [receipt, output] = process.argv.slice(2);
const density = process.argv.includes('--density=2') ? 2 : 4;
const names = ['CANEWY20', 'CANEWY15', 'CANWY26', 'CAWASH08', 'CANEWY10', 'CANEWY11'];
const read = async file => JSON.parse(await fs.readFile(file, 'utf8'));
const contract = await read('desktop/environment-newurban-hd-contract.json');
const pack = await read(path.join('.local/environment-packs', contract.selectedPack.revision, 'manifest.json'));
process.argv.push('--map=manhatta.map', '--bot-slot=1');
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
    report.disclosure = 'Supplemental clear material screenshots after the separately passing twenty-source native path checks. Four original objects use native damage/destruction; two already start destroyed. Native explosion effects finish naturally. No effect is hidden or disabled. Inherited reveal/stopped AI; unchanged map, rules, camera and original sources.';
    report.requestedDensity = density;
    report.selectedEnvironmentRevision = contract.selectedPack.revision;
    report.originalPlacements = await page.evaluate(names => {
        const d = window.__ra2debug;
        window.__r1ClearTargets = new Map();
        window.__r1ExplosionNames = () => d.renderableManager.getRenderableContainer().getChildren()
            .filter(child => typeof child.isAnimFinished === 'function' && !child.isAnimFinished()
                && /^(TWLT|S_(BANG|BRNL|CLSN|TUMU))/i.test(child.name ?? '')).map(child => child.name);
        return names.map(name => {
            const candidates = d.game.getWorld().getAllObjects().filter(object => object.name === name);
            const object = candidates.find(object => object.isSpawned && !object.isDestroyed) ?? candidates[0];
            if (!object) throw Error('Missing original source placement: ' + name);
            const original = window.__m23Binding(object);
            window.__r1ClearTargets.set(name, { object, renderable: d.renderableManager.getRenderableByGameObject(object) });
            return original;
        });
    }, names);
    assert.equal(report.originalPlacements.filter(row => row.destroyed).length, 2);
    report.tickBeforeDestruction = await page.evaluate(() => {
        const d = window.__ra2debug;
        for (const { object } of window.__r1ClearTargets.values()) {
            if (!object.isDestroyed) {
                object.healthTrait.inflictDamage(object.healthTrait.maxHitPoints, object, d.game);
                d.game.destroyObject(object, { player: d.localPlayer });
            }
        }
        return d.game.currentTick;
    });
    await page.waitForFunction(before => window.__ra2debug.game.currentTick >= before + 100
        && window.__r1ExplosionNames().length === 0, report.tickBeforeDestruction, { timeout: 30000 });
    report.settledAt = await page.evaluate(() => ({ tick: window.__ra2debug.game.currentTick,
        activeNativeExplosionEffects: window.__r1ExplosionNames() }));
    assert.deepEqual(report.settledAt.activeNativeExplosionEffects, []);
    report.correctedRubble = [];
    for (const name of names) {
        const [entry] = pack.families[contract.identities.yr[name]].members;
        const metadata = await read(path.join('.local/environment-packs', contract.selectedPack.revision, entry.path));
        const expected = `environment-aggregate/${entry.sha256}/${metadata.source.sha256}/NEWURBAN/tiles/${density}`;
        const original = report.originalPlacements.find(row => row.name === name);
        assert.equal(original.hd, expected);
        await page.evaluate(tile => {
            const d = window.__ra2debug;
            d.worldInteraction.minimapHandler.panToTile(d.game.map.tiles.getByMapCoords(tile[0], tile[1]));
        }, original.tile);
        await page.waitForTimeout(100);
        const capture = await page.evaluate(name => {
            const d = window.__ra2debug, target = window.__r1ClearTargets.get(name);
            d.renderer.render();
            const canvas = d.renderer.renderer.domElement, viewport = d.worldScene.viewport;
            const p = target.renderable.getPosition().clone().project(d.worldScene.camera);
            const ratio = canvas.width / d.renderer.width;
            const cx = (viewport.x + (p.x + 1) * viewport.width / 2) * ratio;
            const cy = (viewport.y + (1 - p.y) * viewport.height / 2) * ratio;
            const width = 960, height = 720;
            const left = Math.max(0, Math.min(canvas.width - width, Math.round(cx - width / 2)));
            const top = Math.max(0, Math.min(canvas.height - height, Math.round(cy - height / 2)));
            const detail = document.createElement('canvas');
            detail.width = width; detail.height = height;
            detail.getContext('2d').drawImage(canvas, left, top, width, height, 0, 0, width, height);
            const rubble = target.renderable.rubbleObj;
            return { png: detail.toDataURL('image/png').split(',')[1], source: [left, top, width, height],
                buffer: [canvas.width, canvas.height], tick: d.game.currentTick,
                destroyed: target.object.isDestroyed, rubble: { visible: rubble.get3DObject()?.visible,
                    frame: rubble.builder.getFrame(), hd: rubble.builder.hdOverride?.identity },
                activeNativeExplosionEffects: window.__r1ExplosionNames(),
                glError: d.renderer.renderer.getContext().getError() };
        }, name);
        assert(capture.destroyed && capture.rubble.visible && capture.rubble.frame === 3);
        assert.equal(capture.rubble.hd, expected);
        assert.equal(capture.glError, 0);
        assert.deepEqual(capture.activeNativeExplosionEffects, []);
        const file = `${name}-rubble-r1-settled-native-detail.png`;
        await fs.writeFile(path.join(session.out, file), Buffer.from(capture.png, 'base64'));
        delete capture.png;
        report.correctedRubble.push({ name, original, alreadyDestroyed: original.destroyed,
            capture: { ...capture, file, rescaled: false } });
    }
    report.bindingStatus = 'PASS_SIX_CLEAR_ORIGINAL_PLACEMENT_RUBBLE_CAPTURES_AFTER_NATIVE_EXPLOSIONS_FINISH';
} catch (error) { failure = error; }
await session.close(failure);
if (failure) throw failure;
console.log(JSON.stringify({ output, density, status: 'PASS_SETTLED_NATIVE_MATERIAL_CAPTURES' }));
