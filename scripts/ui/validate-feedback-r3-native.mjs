import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { startSession } from '../m1/yuri-units/desktop-session.mjs';
import { recordNativePage } from './record-native-page.mjs';

const [receipt, output] = process.argv.slice(2), out = path.resolve(output);
await fs.mkdir(out, { recursive: false });
const report = { status: 'RUNNING', cases: [], disclosure: 'Controlled native UI fixtures; original movie playback, source-derived cursor shapes and deliberately taller building health geometry. No performance or physical-input acceptance claim.' };
try {
    const cases = process.argv.includes('--first-case') ? [['ra2', 2, false]] : process.argv.includes('--yr-only')
        ? [['yr', 4, true]] : [['ra2', 2, false], ['yr', 4, true]];
    for (const [edition, density, snow] of cases) {
        const row = { edition, density, snow, homeFrames: [] }; report.cases.push(row);
        const s = await startSession(receipt, path.join(out, edition), edition, snow, async ({ page }) => {
            await page.evaluate(density => { const g = window.__ra2debug.generalOptions.graphics; g.hdEnabled.value = true; g.hdDensity.value = density; }, density);
            await page.locator('.hd-menu-scene[data-radar-footage=retail]').waitFor({ timeout: 30000 });
            const movie = page.locator('video[data-retail-menu-video]');
            row.movie = await movie.evaluate(v => ({ width: v.videoWidth, height: v.videoHeight, duration: v.duration, source: v.currentSrc, paused: v.paused }));
            assert.equal(row.movie.width, 632); assert(row.movie.duration > 28 && !row.movie.paused);
            const initial = await movie.evaluate(v => v.currentTime); await page.waitForTimeout(500);
            assert((await movie.evaluate(v => v.currentTime)) > initial);
            if (edition === 'ra2' && !process.argv.includes('--quick-home')) {
                const stopRecording = process.argv.includes('--record-home')
                    ? await recordNativePage(page, path.join(out, 'home-native-compositor.webm')) : undefined;
                const duration = stopRecording ? 30 : 28;
                const start = Date.now();
                for (let elapsed = 0; elapsed <= duration; elapsed += 2) {
                    await page.waitForTimeout(Math.max(0, start + elapsed * 1000 - Date.now()));
                    const file = `${edition}-home-${String(elapsed).padStart(2, '0')}.png`;
                    await page.screenshot({ path: path.join(out, file) });
                    row.homeFrames.push({ file, time: await movie.evaluate(v => v.currentTime), renderedFrames: await page.locator('[data-retail-menu-footage]').getAttribute('data-movie-frames') });
                }
                if (stopRecording) row.homeRecording = await stopRecording();
            }
            await page.getByRole('button', { name: /Options|设置/, exact: true }).click();
            await page.locator('[data-language-options]').waitFor();
            assert.equal(await page.locator('[data-retail-menu-footage]').count(), 0, 'Home decoder must unmount outside Home');
            await page.evaluate(() => window.__ra2debug.mainMenuController.goToScreenBlocking(0));
            await page.locator('.hd-menu-scene[data-radar-footage=retail]').waitFor();
            row.resumedMovieTime = await movie.evaluate(v => v.currentTime);
            assert(row.resumedMovieTime > 0);
        }, undefined, (edition === 'yr' ? 'X' : '') + (snow ? 'MP12S4.map' : 'MP03T4.map'), 3);
        try {
            await s.page.evaluate(() => {
                const f = window.__allied;
                f.uiBuilding = f.building('GACNST', { rx: f.center.rx + 8, ry: f.center.ry + 8 });
                f.uiUnit = f.spawn('MTNK', 7, { rx: f.uiBuilding.tile.rx + 4, ry: f.uiBuilding.tile.ry });
                f.uiInfantry = f.spawn('E1', 3, { rx: f.uiBuilding.tile.rx + 4, ry: f.uiBuilding.tile.ry + 2 });
                f.actor = f.uiBuilding; f.detailSize = [900, 650];
                window.__ra2debug.worldInteraction.minimapHandler.panToTile(f.uiBuilding.tile);
            });
            await s.page.waitForTimeout(1800);
            row.health = [];
            for (const health of [100, 50, 25, 1]) {
                const samples = await s.page.evaluate(health => {
                    const d = window.__ra2debug, f = window.__allied;
                    return [f.uiBuilding, f.uiUnit, f.uiInfantry].map(object => {
                        object.healthTrait.health = health;
                        const overlay = d.renderableManager.getRenderableByGameObject(object).pipOverlay;
                        overlay.selectionModel.setSelected(true); overlay.update(0);
                        const bounds = () => {
                            const mesh = overlay.healthBar, values = [];
                            mesh.updateMatrixWorld(true);
                            mesh.traverse(child => { if (child.isMesh) {
                                const a = child.geometry.attributes.position;
                                for (let i = 0; i < (object.isBuilding() ? Math.min(8, a.count) : a.count); i++) {
                                    const p = object.position.worldPosition.clone();
                                    p.set(a.getX(i), a.getY(i), a.getZ(i)).applyMatrix4(child.matrixWorld).project(d.worldScene.camera);
                                    values.push([p.x, p.y]);
                                }
                            }});
                            return { x0: Math.min(...values.map(p => p[0])), x1: Math.max(...values.map(p => p[0])),
                                y0: Math.min(...values.map(p => p[1])), y1: Math.max(...values.map(p => p[1])) };
                        };
                        const hd = bounds(); d.generalOptions.graphics.hdEnabled.value = false; overlay.update(0);
                        const original = bounds(); d.generalOptions.graphics.hdEnabled.value = true; overlay.update(0);
                        const textures = [];
                        overlay.healthBar.traverse(child => { if (child.isMesh) for (const material of Array.isArray(child.material) ? child.material : [child.material])
                            textures.push({ width: material.map.image.width, height: material.map.image.height, name: material.name,
                                png: material.map.image.toDataURL?.('image/png').split(',')[1] }); });
                        return { name: object.name, health, hd, original, widthRatio: (hd.x1 - hd.x0) / (original.x1 - original.x0),
                            heightRatio: (hd.y1 - hd.y0) / (original.y1 - original.y0), bottomDelta: hd.y0 - original.y0, textures };
                    });
                }, health);
                row.health.push(...samples);
                for (const sample of samples) {
                    for (let i = 0; i < sample.textures.length; i++) {
                        const texture = sample.textures[i];
                        if (texture.png) {
                            texture.file = `${edition}-${sample.name}-health-${health}-${i}.png`;
                            await fs.writeFile(path.join(out, texture.file), Buffer.from(texture.png, 'base64')); delete texture.png;
                        }
                    }
                    assert(Math.abs(sample.widthRatio - 1) < .0001, 'Native health width must remain exact');
                    if (sample.name === 'GACNST') { assert(sample.heightRatio > 1.2 && sample.heightRatio < 1.3); assert(Math.abs(sample.bottomDelta) < 1e-6); }
                    else assert(Math.abs(sample.heightRatio - 1) < .0001);
                }
                await s.page.waitForTimeout(200); await s.stage(`${edition}-health-${health}`);
            }
            await s.startClip(); await s.page.waitForTimeout(4200); row.healthClip = await s.stopClip(`${edition}-health-native`);
            row.cursor = await s.page.evaluate(() => {
                const sprite = window.__ra2debug.gameScreen.pointer.getSprite(), result = [];
                for (const frame of [0, 18, 31, 41, 53, 129, 150, 204, 259, 435, 450, 488, 516].filter(i => i < sprite.getFrameCount())) {
                    sprite.setFrame(frame); const c = sprite.targetContext.canvas;
                    result.push({ frame, width: c.width, height: c.height, png: c.toDataURL('image/png').split(',')[1] });
                }
                return { logical: sprite.getSize(), frames: result };
            });
            for (const cursor of row.cursor.frames) {
                assert.equal(cursor.width, row.cursor.logical.width * 4); assert.equal(cursor.height, row.cursor.logical.height * 4);
                const file = `${edition}-cursor-${cursor.frame}.png`; await fs.writeFile(path.join(out, file), Buffer.from(cursor.png, 'base64'));
                delete cursor.png; cursor.file = file;
            }
            assert.deepEqual(s.report.errors, []); assert.deepEqual(s.report.consoleErrors, []);
            row.status = 'PASS_NATIVE_MOVIE_CURVE_CURSORS_AND_TALLER_HEALTH';
        } catch (error) {
            row.failure = error.stack;
            await s.page.screenshot({ path: path.join(out, `${edition}-failure.png`) }).catch(() => {});
            throw error;
        } finally { await s.close(row.failure ? new Error(row.failure) : undefined); }
        await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
        console.log(JSON.stringify({ edition, density, status: row.status }));
    }
    report.status = 'PASS_NATIVE_R3_PRESENTATION_CASES';
} catch (error) { report.status = 'FAIL'; report.failure = error.stack; process.exitCode = 1; console.error(error); }
await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(report.status);
