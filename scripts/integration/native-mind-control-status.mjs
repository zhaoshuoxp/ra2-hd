import assert from 'node:assert/strict';
import { startSession } from '../m1/yuri-units/desktop-session.mjs';

const [receipt, output] = process.argv.slice(2);
const density = Number(process.argv.find(x => x.startsWith('--density='))?.split('=')[1] ?? 4);
const missing = process.argv.includes('--expect-missing');
const configure = async ({ page }) => page.evaluate(density => {
    const g = window.__ra2debug.generalOptions.graphics;
    g.hdEnabled.value = density > 0;
    if (density) g.hdDensity.value = density;
}, density);
const s = await startSession(receipt, output, 'yr', process.argv.includes('--snow'), configure, configure);
const { page, report, stage, startClip, stopClip, close } = s;
report.density = density || 'Original';
report.expectedMissingDiagnostic = missing;
let failure, recording = false;
try {
    await page.evaluate(() => {
        const d = window.__ra2debug, f = window.__allied;
        f.markers = () => d.renderableManager.getRenderableContainer().getChildren()
            .filter(a => ['MINDANIM', 'MINDANIMR'].includes(a.name));
        f.markerSample = () => f.markers().map(a => ({ name: a.name,
            frame: a.mainObj.builder.getFrame(), loopCount: a.getAnimProps().loopCount,
            rate: a.getAnimProps().rate, frames: a.getShpFile().numImages,
            position: a.getPosition().toArray(), palette: a.palette.hash,
            drawnColors: [...new Set(a.getShpFile().images.flatMap(frame => [...frame.imageData]))]
                .filter(index => index).sort((a, b) => a - b).map(index => {
                    const base = a.theater.getPalette(a.objectArt.paletteType, a.objectArt.customPaletteName).colors[index];
                    return { index, actual: ['r', 'g', 'b'].map(c => a.palette.colors[index][c]),
                        expected: ['r', 'g', 'b'].map(c => base[c]) };
                }) }));
        f.detailSize = [640, 420]; f.markerResults = [];
        for (let i = 0; i < 4; i++) f.building('YAPOWR');
    });
    report.controllers = [];
    for (const [name, victimName, type] of (missing ? [['YURI', 'E2', 3]] :
        [['YURI', 'E2', 3], ['YURIPR', 'HTNK', 7], ['MIND', 'MTNK', 7], ['YAPSYT', 'E2', 3]])) {
        await page.evaluate(({ name, victimName, type }) => {
            const d = window.__ra2debug, f = window.__allied;
            f.controller = name === 'YAPSYT' ? f.building(name) : f.spawn(name, name === 'MIND' ? 7 : 3);
            f.victim = f.spawn(victimName, type, { rx: f.controller.tile.rx + 3, ry: f.controller.tile.ry }, f.enemy);
            f.victim.attackTrait?.setDisabled(true); f.victim.moveTrait.setDisabled(true);
            f.actor = f.victim; d.game.unitSelection.deselectAll();
            d.worldInteraction.minimapHandler.panToTile(f.victim.tile);
            d.actionsApi.orderUnits([f.controller.id], 2, f.victim.id);
        }, { name, victimName, type });
        await page.waitForFunction(() => window.__allied.victim.owner === window.__allied.player);
        await page.evaluate(() => window.__allied.controller.attackTrait.setDisabled(true));
        await page.waitForTimeout(200);
        if (missing) {
            assert.equal(await page.evaluate(() => window.__allied.markers().length), 0);
            report.rootCause = 'Retail controlled status animation is never attached; selected links are a separate effect.';
            await stage('baseline-controlled-no-marker');
            break;
        }
        await page.waitForFunction(() => window.__allied.markers().length === 1);
        const identity = await page.evaluate(() => {
            const f = window.__allied;
            f.originalMarker = f.markers()[0];
            return { controller: f.controller.name, victim: f.victim.name, sample: f.markerSample(),
                targetHd: f.sample(f.victim), ownerColor: f.player.color.asHex() };
        });
        assert.equal(identity.sample[0].loopCount, -1); assert.equal(identity.sample[0].rate, 5);
        assert.equal(identity.sample[0].frames, 8);
        for (const color of identity.sample[0].drawnColors) assert.deepEqual(color.actual, color.expected);
        await startClip(); recording = true;
        const frames = [];
        for (let i = 0; i < 20; i++) {
            await page.waitForTimeout(150);
            frames.push(await page.evaluate(() => {
                const f = window.__allied;
                if (f.markers()[0] !== f.originalMarker) throw Error('Marker was replaced during its native loop');
                return f.markerSample()[0].frame;
            }));
            if (i === 4 || i === 10) await stage(name + '-unselected-rings-' + i);
        }
        assert(new Set(frames).size >= 6, 'Native animation must advance and wrap without selection');
        for (const mode of ['source', 'target', 'both', 'none']) {
            await page.evaluate(mode => {
                const d = window.__ra2debug, f = window.__allied; d.game.unitSelection.deselectAll();
                if (['source', 'both'].includes(mode)) d.game.unitSelection.addToSelection(f.controller);
                if (['target', 'both'].includes(mode)) d.game.unitSelection.addToSelection(f.victim);
            }, mode);
            await page.waitForTimeout(100);
            assert.equal(await page.evaluate(() => window.__allied.markers().length), 1);
        }
        await page.evaluate(() => {
            const d = window.__ra2debug, f = window.__allied;
            f.beforeMove = f.victim.position.worldPosition.clone();
            f.victim.moveTrait.setDisabled(false);
            d.actionsApi.orderUnits([f.victim.id], 0, f.victim.tile.rx + 3, f.victim.tile.ry + 2);
        });
        await page.waitForFunction(() => window.__allied.victim.position.worldPosition.distanceTo(window.__allied.beforeMove) > 40);
        await page.waitForTimeout(120); await stage(name + '-moving-rings');
        const movement = await page.evaluate(() => ({ marker: window.__allied.markerSample(),
            before: window.__allied.beforeMove.toArray(), after: window.__allied.victim.position.worldPosition.toArray() }));
        assert.equal(movement.marker.length, 1);
        assert(Math.abs(movement.marker[0].position[0] - identity.sample[0].position[0]) > 10);
        await stopClip(name + '-continuous-rings'); recording = false;
        await page.evaluate(() => {
            const d = window.__ra2debug, f = window.__allied;
            d.game.destroyObject(f.controller, { obj: f.victim, player: f.enemy });
        });
        await page.waitForFunction(() => window.__allied.markers().length === 0);
        assert.equal(await page.evaluate(() => window.__allied.victim.owner === window.__allied.enemy), true);
        await stage(name + '-controller-destroyed-no-marker');
        report.controllers.push({ ...identity, frames, movement, released: true });
        // Released victims would become additional legal targets for the next tower.
        if (name !== 'YAPSYT') await page.evaluate(() =>
            window.__ra2debug.game.unspawnObject(window.__allied.victim));
    }
    if (!missing) {
        await page.evaluate(() => {
            const d = window.__ra2debug, f = window.__allied;
            f.victim.mindControllableTrait.controlPermanently(f.player, d.game);
        });
        await page.waitForFunction(() => window.__allied.markers()[0]?.name === 'MINDANIMR');
        report.permanent = await page.evaluate(() => window.__allied.markerSample());
        assert.equal(report.permanent[0].loopCount, -1);
        assert.equal(report.permanent[0].rate, 5);
        for (const color of report.permanent[0].drawnColors) assert.deepEqual(color.actual, color.expected);
        const permanentFrames = [];
        await page.evaluate(() => { window.__allied.permanentMarker = window.__allied.markers()[0]; });
        for (let i = 0; i < 20; i++) {
            await page.waitForTimeout(150);
            permanentFrames.push(await page.evaluate(() => {
                const f = window.__allied;
                if (f.markers().length !== 1 || f.markers()[0] !== f.permanentMarker)
                    throw Error('Permanent marker must remain attached across native loops');
                return f.markerSample()[0].frame;
            }));
        }
        assert(new Set(permanentFrames).size >= 6);
        report.permanentFrames = permanentFrames;
        await stage('permanent-retail-status');
        await page.evaluate(() => window.__ra2debug.game.unspawnObject(window.__allied.victim));
        await page.waitForFunction(() => window.__allied.markers().length === 0);
        report.targetRemoval = 'PASS_ZERO_MARKERS';
    }
} catch (error) { failure = error; }
finally {
    if (recording) await stopClip('failed-marker-diagnostic').catch(() => {});
    await close(failure);
}
if (failure) throw failure;
console.log(JSON.stringify({ status: report.status, density: report.density, controllers: report.controllers.length,
    diagnostic: missing, output }));
