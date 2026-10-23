import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { startSession } from '../m1/yuri-units/desktop-session.mjs';
import { inspectRadarR6 } from './inspect-radar-r6.mjs';

const [receipt, output] = process.argv.slice(2), out = path.resolve(output);
await fs.mkdir(out);
const configs = process.argv.includes('--yr-only') ? [['yr', 4, false]] : process.argv.includes('--first-case')
    ? [['ra2', 2, false]] : [['ra2', 2, false], ['ra2', 4, true], ['yr', 2, true], ['yr', 4, false]];
const report = { status: 'RUNNING', cases: [], disclosure: 'Native occluded infantry, BEHIND rendering and original movie playback; controlled fixtures, no physical-input or Windows claim.' };
const save = () => fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
try {
    for (const [edition, density, snow] of configs) {
        const name = `${edition}-${density}x`, row = { edition, density, snow, home: [], marker: [] };
        report.cases.push(row);
        const session = await startSession(receipt, path.join(out, name), edition, snow, async ({ page }) => {
            await page.evaluate(density => {
                const g = window.__ra2debug.generalOptions.graphics;
                g.hdEnabled.value = true; g.hdDensity.value = density;
            }, density);
            row.home = await inspectRadarR6(page, out, name);
            await page.getByRole('button', { name: /Options|设置/, exact: true }).click();
            await page.locator('[data-language-options]').waitFor();
            assert.equal(await page.locator('[data-retail-menu-video]').count(), 0);
            await page.evaluate(() => window.__ra2debug.mainMenuController.goToScreenBlocking(0));
            await page.locator('[data-radar-footage=retail]').waitFor();
            row.resumedMovieTime = await page.locator('[data-retail-menu-video]').evaluate(v => v.currentTime);
        }, undefined, (edition === 'yr' ? 'X' : '') + (snow ? 'MP12S4.map' : 'MP03T4.map'), 1);
        try {
            await session.page.evaluate(edition => {
                const f = window.__allied;
                f.power = f.building(edition === 'yr' ? 'YAPOWR' : 'GAPOWR', { rx: f.center.rx + 7, ry: f.center.ry + 7 });
                window.__ra2debug.worldInteraction.minimapHandler.panToTile(f.power.tile);
            }, edition);
            await session.page.waitForTimeout(1000);
            await session.page.evaluate(edition => {
                const d = window.__ra2debug, f = window.__allied, g = d.game, unitName = edition === 'yr' ? 'INIT' : 'E1';
                const rule = g.rules.getObject(unitName, 3);
                const tiles = g.map.tiles.getAll().filter(t => t.occluded && g.map.isWithinBounds(t)
                    && g.map.terrain.getPassableSpeed(t, rule.speedType, true, false) > 0
                    && !g.map.getGroundObjectsOnTile(t).some(o => o.isTechno() || o.isTerrain()))
                    .sort((a, b) => Math.hypot(a.rx - f.power.tile.rx, a.ry - f.power.tile.ry)
                        - Math.hypot(b.rx - f.power.tile.rx, b.ry - f.power.tile.ry));
                f.hidden = tiles.slice(0, 2).map(tile => f.spawn(unitName, 3, tile));
                f.hidden.forEach(u => { d.renderableManager.getRenderableByGameObject(u).pipOverlay.hiddenObjectsOpt.value = true; });
                f.actor = f.hidden[0]; f.detailSize = [720, 540];
            }, edition);
            await session.page.waitForFunction(() => window.__allied.hidden.length === 2 && window.__allied.hidden.every(u =>
                window.__ra2debug.renderableManager.getRenderableByGameObject(u).pipOverlay.behindAnim?.occlusionHd));
            row.binding = await session.page.evaluate(() => {
                const d = window.__ra2debug, f = window.__allied;
                f.indicators = f.hidden.map(u => d.renderableManager.getRenderableByGameObject(u).pipOverlay.behindAnim);
                f.indicators.forEach(a => { a.savedUpdate = a.update.bind(a); a.update = () => {}; });
                return f.indicators.map((a, i) => ({ name: a.name, member: a.getShpFile().filename, occluded: f.hidden[i].tile.occluded,
                    renderOrder: a.renderOrder, frames: a.getShpFile().numImages, identity: a.occlusionHd.override.identity,
                    flipY: a.occlusionHd.override.pages[0].base.flipY, sameAtlas: a.occlusionHd.override === f.indicators[0].occlusionHd.override }));
            });
            assert(row.binding.every(b => b.name === 'BEHIND' && b.member === 'behind.shp' && b.occluded && b.frames === 18 && b.sameAtlas && b.flipY));
            for (let frame = 0; frame < 18; frame++) {
                const sample = await session.page.evaluate(frame => {
                    const a = window.__allied.indicators[0], r = a.mainObj, b = r.builder, hd = b.hdOverride;
                    window.__allied.indicators.forEach(indicator => indicator.mainObj.setFrame(frame));
                    const mesh = r.getShapeMesh(), positions = Array.from(mesh.geometry.attributes.position.array);
                    b.hdOverride = undefined; const originalGeometry = b.createGeometry(frame); b.hdOverride = hd;
                    const original = Array.from(originalGeometry.attributes.position.array); originalGeometry.dispose();
                    const source = b.shpFile.getImage(frame), rect = hd.frames[frame].sampleRect, atlas = hd.pages[0].base.image;
                    const c = document.createElement('canvas'); c.width = rect.width; c.height = rect.height;
                    c.getContext('2d').drawImage(atlas, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height);
                    return { frame, positions, original, pixels: [c.width, c.height], logical: [source.width + source.width % 2, source.height + source.height % 2],
                        atlas: [atlas.width, atlas.height], material: { alphaTest: mesh.material.alphaTest, transparent: mesh.material.transparent,
                            depthTest: mesh.material.depthTest, coveragePass: mesh.material.uniforms.hdPass?.value, premultipliedAlpha: mesh.material.premultipliedAlpha },
                        png: c.toDataURL().split(',')[1] };
                }, frame);
                assert.deepEqual(sample.positions, sample.original);
                assert.deepEqual(sample.pixels, sample.logical.map(v => v * 4));
                assert(sample.material.alphaTest <= .001 && sample.material.transparent && !sample.material.depthTest);
                assert.equal(sample.material.coveragePass, 3); assert(sample.material.premultipliedAlpha);
                await fs.writeFile(path.join(out, `${name}-behind-${frame}.png`), Buffer.from(sample.png, 'base64')); delete sample.png;
                row.marker.push(sample);
                if ([1, 6, 12, 17].includes(frame)) { await session.page.waitForTimeout(100); await session.stage(`${name}-behind-${frame}`); }
            }
            await session.page.evaluate(() => { window.__allied.indicators.forEach(a => { a.update = a.savedUpdate; }); });
            const duration = await session.page.evaluate(() => {
                const f = window.__allied, a = f.indicators[0], p = a.animation.props;
                f.watch = { samples: [], last: -1, running: true, loopStart: p.loopStart, loopEnd: p.loopEnd,
                    rate: p.rate * a.animation.speed.value };
                const tick = time => {
                    if (!f.watch.running) return;
                    const frame = a.mainObj.builder.getFrame();
                    if (frame !== f.watch.last) {
                        const obj = a.get3DObject(), b = a.mainObj.builder;
                        f.watch.samples.push({ time, frame, runner: a.animationRunner.getCurrentFrame(),
                            anchor: obj.position.toArray(), shown: obj.visible && !!obj.parent,
                            opacity: b.getVisualOpacity(), flipY: b.hdOverride.pages[0].base.flipY });
                        f.watch.last = frame;
                    }
                    f.watch.callback = requestAnimationFrame(tick);
                };
                f.watch.callback = requestAnimationFrame(tick);
                return Math.max(9000, 2300 * (p.loopEnd - p.loopStart + 1) / f.watch.rate);
            });
            assert(duration < 30000, 'Bounded recording must include more than two native loops');
            await session.startClip(); await session.page.waitForTimeout(duration); row.markerClip = await session.stopClip(`${name}-behind-native`);
            row.liveRotation = await session.page.evaluate(() => {
                const w = window.__allied.watch; w.running = false; cancelAnimationFrame(w.callback); return w;
            });
            const live = row.liveRotation.samples, anchor = live[0].anchor;
            assert(live.every(s => s.flipY && s.shown && s.opacity === 1 && s.frame === Math.min(17, s.runner)));
            assert(live.every(s => s.anchor.every((v, i) => v === anchor[i])), 'The marker node must not jump during rotation');
            row.liveRotation.wraps = live.filter((s, i) => i && s.frame < live[i - 1].frame).length;
            assert(row.liveRotation.wraps >= 2, 'Inspect at least two actual native animation loop boundaries');
            assert.equal(new Set(live.map(s => s.frame)).size, 17, 'The complete native 1..17 loop must be observed');
            row.hdToggle = [];
            for (const enabled of [false, true]) {
                await session.page.evaluate(enabled => { window.__ra2debug.generalOptions.graphics.hdEnabled.value = enabled; }, enabled);
                await session.page.waitForFunction(enabled => window.__allied.indicators.every(a => Boolean(a.occlusionHd) === enabled), enabled);
                const sample = await session.page.evaluate(() => window.__allied.indicators.map(a => ({
                    hd: !!a.mainObj.builder.hdOverride, alphaTest: a.mainObj.getShapeMesh().material.alphaTest,
                    depthTest: a.mainObj.getShapeMesh().material.depthTest, renderOrder: a.mainObj.getShapeMesh().renderOrder,
                })));
                assert(sample.every(s => s.hd === enabled && !s.depthTest && s.renderOrder === 999995));
                row.hdToggle.push({ enabled, sample });
                await session.stage(`${name}-${enabled ? 'hd-restored' : 'original-control'}`);
            }
            for (const enabled of [false, true]) {
                await session.page.evaluate(enabled => {
                    const d = window.__ra2debug, f = window.__allied;
                    d.renderableManager.getRenderableByGameObject(f.hidden[0]).pipOverlay.hiddenObjectsOpt.value = enabled;
                }, enabled);
                await session.page.waitForTimeout(200);
                const attached = await session.page.evaluate(() => window.__allied.indicators.map(a => !!a.get3DObject()?.parent));
                assert(attached.every(value => value === enabled));
            }
            assert.deepEqual(session.report.errors, []); assert.deepEqual(session.report.consoleErrors, []);
            row.status = 'PASS_NATIVE_CORRECT_GPU_ATLAS_STABLE_ROTATION_AND_NO_EXTRA_GRID';
        } catch (error) {
            row.failure = error.stack; await session.page.screenshot({ path: path.join(out, `${name}-failure.png`) }).catch(() => {}); throw error;
        } finally { await session.close(row.failure ? new Error(row.failure) : undefined); }
        await save(); console.log(JSON.stringify({ name, status: row.status }));
    }
    report.status = 'PASS_NATIVE_R6_GPU_REGISTRATION_LIVE_LOOPS_AND_SINGLE_GRID';
} catch (error) { report.status = 'FAIL'; report.failure = error.stack; process.exitCode = 1; console.error(error); }
await save(); console.log(report.status);
