import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { startSession } from '../m1/yuri-units/desktop-session.mjs';
import { recordNativePage } from './record-native-page.mjs';
const [receipt, output] = process.argv.slice(2), out = path.resolve(output);
await fs.mkdir(out, { recursive: false });
const expected = JSON.parse(await fs.readFile('desktop/allied-unit-contracts.json')).shp.E1.members[0];
const report = { status: 'RUNNING', cases: [], disclosure: 'Controlled native fixtures and native death processing; no physical-input, natural-combat or Windows claim.' };
const save = () => fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
try {
    const configs = process.argv.includes('--first-case') ? [['ra2', 2, false]]
        : [['ra2', 2, false], ['ra2', 4, true], ['yr', 2, true], ['yr', 4, false]];
    for (const [edition, density, snow] of configs) {
        const name = `${edition}-${density}x`, folder = path.join(out, name), row = { edition, density, snow, home: [], deaths: [] };
        report.cases.push(row);
        const s = await startSession(receipt, folder, edition, snow, async ({ page }) => {
            await page.evaluate(density => { const g = window.__ra2debug.generalOptions.graphics; g.hdEnabled.value = true; g.hdDensity.value = density; }, density);
            await page.locator('[data-radar-footage=retail]').waitFor({ timeout: 30000 });
            for (const t of [1, 4, 9.9, 13, 18, 23, 27]) {
                const sample = await page.evaluate(t => new Promise((resolve, reject) => {
                    const video = document.querySelector('[data-retail-menu-video]');
                    video.pause();
                    const timer = setTimeout(() => reject(Error('Movie seek callback timeout')), 10000);
                    const original = document.querySelector('[data-retail-menu-footage]');
                    const gl = original.getContext('webgl');
                    video.addEventListener('seeked', () => {
                        gl.activeTexture(gl.TEXTURE0);
                        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
                        gl.viewport(0, 0, original.width, original.height);
                        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
                        clearTimeout(timer);
                        const c = document.createElement('canvas');
                        c.width = original.width;
                        c.height = original.height;
                        const context = c.getContext('2d'), image = context.createImageData(c.width, c.height), raw = new Uint8Array(image.data.length);
                        gl.readPixels(0, 0, c.width, c.height, gl.RGBA, gl.UNSIGNED_BYTE, raw);
                        for (let y = 0; y < c.height; y++)
                            image.data.set(raw.subarray((c.height - 1 - y) * c.width * 4, (c.height - y) * c.width * 4), y * c.width * 4);
                        context.putImageData(image, 0, 0);
                        const rgba = image.data;
                        const region = ([x0, y0, x1, y1]) => {
                            let maxAlpha = 0, nonzero = 0;
                            for (let y = Math.ceil((y0 - 36) / 500 * c.height); y < Math.floor((y1 - 36) / 500 * c.height); y++)
                                for (let x = Math.ceil((x0 - 46) / 540 * c.width); x < Math.floor((x1 - 46) / 540 * c.width); x++) {
                                    const a = rgba[(y * c.width + x) * 4 + 3];
                                    maxAlpha = Math.max(maxAlpha, a);
                                    if (a)
                                        nonzero++;
                                }
                            return { maxAlpha, nonzero };
                        };
                        let visible = 0;
                        for (let i = 3; i < rgba.length; i += 4)
                            if (rgba[i])
                                visible++;
                        resolve({ time: video.currentTime, text: region([210, 112, 438, 170]), wing: region([542, 153, 558, 169]), visible,
                            png: c.toDataURL('image/png').split(',')[1] });
                    }, { once: true });
                    video.currentTime = t;
                }), t);
                const png = sample.png;
                delete sample.png;
                row.home.push(sample);
                assert.equal(sample.text.maxAlpha, 0, 'Old lettering must be fully absent from the movie layer');
                assert.equal(sample.wing.maxAlpha, 0, 'Old right wing/bezel edge must be fully absent');
                assert(sample.visible > 1000, 'A transparent capture cannot prove movie cleanup');
                await fs.writeFile(path.join(out, `${name}-movie-layer-${t}.png`), Buffer.from(png, 'base64'));
                await page.screenshot({ path: path.join(out, `${name}-home-${t}.png`) });
            }
            await page.getByRole('button', { name: /Options|设置/, exact: true }).click();
            await page.locator('[data-language-options]').waitFor();
            assert.equal(await page.locator('[data-retail-menu-video]').count(), 0);
            await page.evaluate(() => window.__ra2debug.mainMenuController.goToScreenBlocking(0));
            await page.locator('[data-radar-footage=retail]').waitFor();
            if (edition === 'ra2' && density === 2 && process.argv.includes('--record-home')) {
                await page.locator('[data-retail-menu-video]').evaluate(v => v.play());
                const stop = await recordNativePage(page, path.join(out, 'home-native-compositor.webm'));
                await page.waitForTimeout(31000);
                row.homeRecording = await stop();
            }
        }, undefined, (edition === 'yr' ? 'X' : '') + (snow ? 'MP12S4.map' : 'MP03T4.map'), 3);
        try {
            await s.page.evaluate(() => {
                const d = window.__ra2debug, f = window.__allied;
                f.yard = f.building('GACNST', { rx: f.center.rx + 8, ry: f.center.ry + 8 });
                f.actor = f.spawn('E1', 3, { rx: f.yard.tile.rx + 4, ry: f.yard.tile.ry + 4 });
                f.detailSize = [600, 420];
                d.worldInteraction.minimapHandler.panToTile(f.actor.tile);
                f.ring = d.renderableManager.createTransientAnim(d.game.rules.audioVisual.moveFlash, r => r.setPosition(f.actor.position.worldPosition));
                f.ring.update = () => { };
            });
            await s.page.waitForTimeout(1000);
            row.marker = [];
            for (let frame = 0; frame < 15; frame++) {
                const sample = await s.page.evaluate(frame => {
                    const f = window.__allied, r = f.ring.mainObj, b = r.builder, hd = b.hdOverride;
                    r.setFrame(frame);
                    const geometry = () => Array.from(r.getShapeMesh().geometry.attributes.position.array);
                    const positions = geometry();
                    r.setHdOverride(undefined);
                    const original = geometry();
                    r.setHdOverride(hd);
                    const source = b.shpFile.getImage(frame), c = document.createElement('canvas');
                    c.width = source.width + source.width % 2;
                    c.height = source.height + source.height % 2;
                    const ctx = c.getContext('2d'), image = ctx.createImageData(c.width, c.height);
                    for (let y = 0; y < source.height; y++)
                        for (let x = 0; x < source.width; x++) {
                            const index = source.imageData[y * source.width + x];
                            if (!index)
                                continue;
                            const color = f.ring.palette.getColor(index);
                            image.data.set([color.r, color.g, color.b, 255], (y * c.width + x) * 4);
                        }
                    ctx.putImageData(image, 0, 0);
                    const rect = hd.frames[frame].sampleRect, texture = hd.pages[0].base.image, canvas = document.createElement('canvas');
                    canvas.width = rect.width;
                    canvas.height = rect.height;
                    canvas.getContext('2d').drawImage(texture, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height);
                    return { frame, positions, original, identity: hd.identity, atlas: [texture.width, texture.height], logical: [c.width, c.height],
                        pixels: [canvas.width, canvas.height], originalPng: c.toDataURL().split(',')[1], hdPng: canvas.toDataURL().split(',')[1] };
                }, frame);
                assert.deepEqual(sample.positions, sample.original);
                assert(sample.identity.startsWith('native-command-marker/ring.shp/'));
                assert.equal(sample.pixels[0], sample.logical[0] * 4);
                assert.equal(sample.pixels[1], sample.logical[1] * 4);
                assert(Math.max(...sample.atlas) <= 2048);
                for (const [role, key] of [['original', 'originalPng'], ['hd', 'hdPng']]) {
                    const file = `${name}-marker-${frame}-${role}.png`;
                    await fs.writeFile(path.join(out, file), Buffer.from(sample[key], 'base64'));
                    delete sample[key];
                    sample[role + 'File'] = file;
                }
                row.marker.push(sample);
            }
            await s.stage(name + '-marker');
            row.markerLease = await s.page.evaluate(() => {
                const d = window.__ra2debug, f = window.__allied, first = f.ring.commandHd.override;
                const second = d.renderableManager.createTransientAnim('RING', r => r.setPosition(f.actor.position.worldPosition));
                second.create3DObject();
                second.update = () => { };
                f.disposals = 0;
                for (const texture of [first.pages[0].base, first.pages[0].data])
                    texture.addEventListener('dispose', () => f.disposals++);
                const same = first === second.commandHd.override;
                f.ring.remove();
                f.ring.dispose();
                second.remove();
                second.dispose();
                return { same };
            });
            assert(row.markerLease.same);
            await s.page.waitForTimeout(2300);
            assert.equal(await s.page.evaluate(() => window.__allied.disposals), 2);
            await s.page.evaluate(() => { window.__ra2debug.generalOptions.graphics.hdEnabled.value = false; });
            await s.page.waitForTimeout(100);
            row.originalMarker = await s.page.evaluate(() => {
                const d = window.__ra2debug, f = window.__allied, r = d.renderableManager.createTransientAnim('RING', r => r.setPosition(f.actor.position.worldPosition));
                r.create3DObject();
                const hd = !!r.mainObj.builder.hdOverride;
                r.remove();
                r.dispose();
                d.generalOptions.graphics.hdEnabled.value = true;
                return { hd };
            });
            assert.equal(row.originalMarker.hd, false);
            for (const infDeath of [1, 2]) {
                await s.page.evaluate(() => {
                    const d = window.__ra2debug, f = window.__allied;
                    f.actor = f.spawn('E1', 3, { rx: f.yard.tile.rx + 4, ry: f.yard.tile.ry + 4 });
                    f.deathRenderable = d.renderableManager.getRenderableByGameObject(f.actor);
                    d.worldInteraction.minimapHandler.panToTile(f.actor.tile);
                });
                await s.page.waitForFunction(hash => (window.__allied.deathRenderable ??= window.__ra2debug.renderableManager.getRenderableByGameObject(window.__allied.actor))?.shpRenderable?.builder?.hdOverride?.identity.includes(hash), expected.manifestHash, { timeout: 30000 });
                await s.startClip();
                const binding = await s.page.evaluate(infDeath => {
                    const d = window.__ra2debug, f = window.__allied, r = f.deathRenderable, renderer = d.renderer.renderer;
                    f.deathSamples = [];
                    const render = renderer.render.bind(renderer);
                    let last = '';
                    f.restoreRender = () => { renderer.render = render; };
                    renderer.render = (...args) => {
                        render(...args);
                        if (!f.actor.isDestroyed)
                            return;
                        const corpse = r.deadBodyAnimRenderable, b = corpse?.mainObj?.builder ?? r.shpRenderable?.builder;
                        if (!b)
                            return;
                        const frame = b.getFrame(), key = (corpse ? 'corpse' : 'gi') + frame;
                        if (key === last)
                            return;
                        last = key;
                        const c = renderer.domElement, v = d.worldScene.viewport, p = r.getPosition().clone().project(d.worldScene.camera), ratio = c.width / d.renderer.width;
                        const x = (v.x + (p.x + 1) * v.width / 2) * ratio, y = (v.y + (1 - p.y) * v.height / 2) * ratio;
                        const detail = document.createElement('canvas');
                        detail.width = 600;
                        detail.height = 420;
                        detail.getContext('2d').drawImage(c, Math.round(x - 300), Math.round(y - 252), 600, 420, 0, 0, 600, 420);
                        f.deathSamples.push({ key, frame, bodyVisible: r.shpRenderable.get3DObject().visible, deathEffectVisible: r.deathAnimRenderable?.get3DObject()?.visible ?? false, sequence: r.currentSequenceParams, identity: r.shpRenderable.builder.hdOverride?.identity,
                            png: detail.toDataURL('image/png').split(',')[1] });
                    };
                    f.actor.deathType = 1;
                    f.actor.infDeathType = infDeath;
                    d.game.destroyObject(f.actor);
                    return r.shpRenderable.builder.hdOverride.identity;
                }, infDeath);
                await s.page.waitForTimeout(3600);
                const clip = await s.stopClip(`${name}-death-${infDeath}`);
                const samples = await s.page.evaluate(() => { window.__allied.restoreRender(); return window.__allied.deathSamples; });
                for (const sample of samples) {
                    sample.file = `${name}-death-${infDeath}-${sample.key}.png`;
                    await fs.writeFile(path.join(out, sample.file), Buffer.from(sample.png, 'base64'));
                    delete sample.png;
                }
                assert(samples.some(x => x.key.startsWith('corpse')));
                assert(samples.filter(x => x.key.startsWith('corpse')).every(x => !x.bodyVisible && !x.deathEffectVisible), 'Corpse handoff must never show both body images');
                assert(samples.some(x => x.sequence?.type === (infDeath === 1 ? 11 : 12)));
                row.deaths.push({ infDeath, binding, clip, samples });
            }
            assert.deepEqual(s.report.errors, []);
            assert.deepEqual(s.report.consoleErrors, []);
            row.status = 'PASS_NATIVE_CLEAN_MOVIE_MARKER_AND_GI_DEATH';
        }
        catch (error) {
            row.failure = error.stack;
            throw error;
        }
        finally {
            await s.close(row.failure ? new Error(row.failure) : undefined);
        }
        await save();
        console.log(JSON.stringify({ edition, density, status: row.status }));
    }
    report.status = 'PASS_NATIVE_R4_PRESENTATION_CASES';
}
catch (error) {
    report.status = 'FAIL';
    report.failure = error.stack;
    process.exitCode = 1;
    console.error(error);
}
await save();
console.log(report.status);
