import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { installDisplayProbe } from './display-review-probe.mjs';

export async function checkPauseAndShroud(page, output) {
    await fs.mkdir(output, { recursive: false });
    const report = { status: 'FAIL', coverage: [], resolution: [], speed: [] };
    const save = async (capture, name) => {
        await fs.writeFile(`${output}/${name}.png`, Buffer.from(capture.png.split(',')[1], 'base64'));
        delete capture.png; return { ...capture, file: name + '.png' };
    };
    try {
        await page.evaluate(installDisplayProbe);
        const legacy = JSON.parse(await fs.readFile('.artifacts/m1-4/followup-visual/diagnosis/result.json', 'utf8')).geometry;
        const boundary = await page.evaluate(legacy => {
            const d = window.__ra2debug;
            d.unitSelection.deselectAll(); d.gameScreen.pointer.unlock(); d.gameScreen.gameAnimationLoop.stop();
            let mesh; d.worldScene.scene.traverse(o => { if (o.name === 'map_shroud_layer') mesh = o.children[0]; });
            const pos = mesh.geometry.attributes.position, uv = mesh.geometry.attributes.uv;
            const fixedPos = pos.array.slice(), fixedUv = uv.array.slice(), oldUv = uv.array.slice();
            if (legacy.positions.length !== pos.array.length) throw Error('Control map geometry mismatch');
            const pattern = legacy.uv.slice(0, 16), xs = pattern.filter((_, i) => i % 2 === 0), ys = pattern.filter((_, i) => i % 2);
            for (let base = 0; base < oldUv.length; base += 16) {
                const x = fixedUv.slice(base, base + 16).filter((_, i) => i % 2 === 0);
                const y = fixedUv.slice(base, base + 16).filter((_, i) => i % 2);
                for (let i = 0; i < 16; i += 2) {
                    oldUv[base + i] = Math.min(...x) + (pattern[i] - Math.min(...xs)) / (Math.max(...xs) - Math.min(...xs)) * (Math.max(...x) - Math.min(...x));
                    oldUv[base + i + 1] = Math.min(...y) + (pattern[i + 1] - Math.min(...ys)) / (Math.max(...ys) - Math.min(...ys)) * (Math.max(...y) - Math.min(...y));
                }
            }
            const set = fixed => { pos.array.set(fixed ? fixedPos : legacy.positions); uv.array.set(fixed ? fixedUv : oldUv); pos.needsUpdate = uv.needsUpdate = true; };
            set(false); const before = window.__m14.capture('4k', true);
            set(true); const after = window.__m14.capture('4k', true);
            window.__pauseShroud = { mesh, fixedUv, fixedPos, oldUv, oldPos: legacy.positions };
            return { before, after };
        }, legacy);
        report.boundary = [await save(boundary.before, 'boundary-before'), await save(boundary.after, 'boundary-fixed')];
        report.coverage = await page.evaluate(() => {
            const d = window.__ra2debug, s = window.__pauseShroud, uv = s.mesh.geometry.attributes.uv;
            const camera = d.worldScene.camera, saved = camera.position.clone(), rows = [];
            try {
                for (const mode of ['original', '720p', '1080p', '1440p', 'native', '4k']) for (const shift of [0, .25, 10.5]) {
                    camera.position.copy(saved); camera.position.x += shift; camera.updateMatrixWorld(true);
                    for (let i = 0; i < uv.array.length; i += 16) uv.array.set(s.fixedUv.subarray(0, 16), i);
                    uv.needsUpdate = true;
                    const c = window.__m14.capture(mode), gl = d.renderer.renderer.getContext(), v = c.draws.find(x => x.defaultFramebuffer).viewport;
                    const pixels = new Uint8Array((v[2] - 4) * (v[3] - 4) * 4);
                    gl.readPixels(v[0] + 2, v[1] + 2, v[2] - 4, v[3] - 4, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
                    let bright = 0;
                    for (let i = 0; i < pixels.length; i += 4) if (Math.max(pixels[i], pixels[i + 1], pixels[i + 2]) > 3) bright++;
                    rows.push({ mode, shift, bright, buffer: c.buffer, captureError: c.glError, glError: gl.getError() });
                }
            } finally { camera.position.copy(saved); camera.updateMatrixWorld(true); uv.array.set(s.fixedUv); uv.needsUpdate = true; }
            return rows;
        });
        for (const row of report.coverage) {
            assert.equal(row.bright, 0, JSON.stringify(row)); assert.equal(row.glError, 0); assert.equal(row.captureError, 0);
        }
        const credits = await page.evaluate(() => {
            const d = window.__ra2debug, text = d.gameScreen.hud.sidebarCredits.text;
            window.__m14.capture('4k');
            const fixed = { width: text.ctx.canvas.width, height: text.ctx.canvas.height,
                minFilter: text.texture.minFilter, magFilter: text.texture.magFilter };
            const state = () => ({ value: text.value, texture: [text.ctx.canvas.width, text.ctx.canvas.height],
                logical: [text.props.width, text.props.height], vertices: Array.from(text.mesh.geometry.attributes.position.array) });
            text.texture.dispose(); text.ctx.canvas.width = text.props.width; text.ctx.canvas.height = text.props.height;
            text.texture.minFilter = text.texture.magFilter = 1003; // Three.NearestFilter, previous production behavior.
            text.updateTexture(text.value, text.textAlign, text.props.textColor);
            const before = { ...window.__m14.capture('4k', true), text: state() };
            text.texture.dispose(); text.ctx.canvas.width = fixed.width; text.ctx.canvas.height = fixed.height;
            text.texture.minFilter = fixed.minFilter; text.texture.magFilter = fixed.magFilter;
            text.updateTexture(text.value, text.textAlign, text.props.textColor);
            const after = { ...window.__m14.capture('4k', true), text: state() };
            return { before, after };
        });
        assert.deepEqual(credits.before.text.vertices, credits.after.text.vertices);
        assert.equal(credits.before.text.value, credits.after.text.value);
        assert.equal(credits.before.glError, 0); assert.equal(credits.after.glError, 0);
        assert(credits.after.text.texture[1] > credits.before.text.texture[1]);
        report.credits = [await save(credits.before, 'credits-before'), await save(credits.after, 'credits-fixed')];
        // Uniform translucent coverage distinguishes double-dark overlap from
        // native boundary artwork, without changing game exploration state.
        const partition = await page.evaluate(() => {
            const d = window.__ra2debug, s = window.__pauseShroud, scene = d.worldScene.scene;
            const parents = new Set(); for (let p = s.mesh; p; p = p.parent) parents.add(p);
            const visible = []; scene.traverse(o => { visible.push([o, o.visible]); o.visible = parents.has(o); });
            const background = scene.background, material = s.mesh.material, fragment = material.fragmentShader, key = material.customProgramCacheKey;
            scene.background = material.color.clone().setRGB(1, 1, 1);
            material.fragmentShader = 'void main(){gl_FragColor=vec4(0.5,0.5,0.5,1.0);}';
            material.customProgramCacheKey = () => 'm14-mask-partition'; material.needsUpdate = true;
            const rows = [];
            try {
                for (const fixed of [false, true]) {
                    s.mesh.geometry.attributes.position.array.set(fixed ? s.fixedPos : s.oldPos);
                    s.mesh.geometry.attributes.position.needsUpdate = true;
                    const c = window.__m14.capture('4k', true), gl = d.renderer.renderer.getContext(), v = c.draws.find(x => x.defaultFramebuffer).viewport;
                    const pixels = new Uint8Array((v[2] - 4) * (v[3] - 4) * 4); gl.readPixels(v[0] + 2, v[1] + 2, v[2] - 4, v[3] - 4, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
                    const histogram = {}; for (let i = 0; i < pixels.length; i += 4) histogram[pixels[i]] = (histogram[pixels[i]] ?? 0) + 1;
                    rows.push({ fixed, histogram, png: c.png });
                }
            } finally {
                scene.background = background; visible.forEach(([o, value]) => o.visible = value);
                material.fragmentShader = fragment; material.customProgramCacheKey = key; material.needsUpdate = true;
                s.mesh.geometry.attributes.position.array.set(s.fixedPos); s.mesh.geometry.attributes.position.needsUpdate = true;
            }
            return rows;
        });
        report.partition = [await save(partition[0], 'partition-before'), await save(partition[1], 'partition-fixed')];
        const fixedBins = Object.keys(partition[1].histogram).map(Number);
        assert(fixedBins.every(n => n >= 127 && n <= 128), JSON.stringify(partition[1].histogram));
        assert(Object.keys(partition[0].histogram).some(n => Number(n) < 100));
        await page.evaluate(() => { window.__ra2debug.gameScreen.gameAnimationLoop.start(); delete window.__pauseShroud; });

        const labels = await page.evaluate(() => {
            const d = window.__ra2debug; d.gameScreen.menu.open();
            return ['GUI:Options', 'GUI:Back', 'GUI:ResumeMission'].map(k => d.gameScreen.strings.get(k));
        });
        await page.getByText(labels[0], { exact: true }).click();
        await page.locator('input[name=gameSpeed]').waitFor();
        await page.waitForTimeout(300);
        let pausedTick = await page.evaluate(() => window.__ra2debug.game.currentTick);
        for (const [mode, label] of [['720p', '720p (720 high)'], ['1080p', '1080p (1080 high)'], ['1440p', '1440p (1440 high)'], ['4k', 'High (2160 high)'], ['native', 'Auto (window density)']]) {
            const select = page.locator('.render-resolution-select');
            await select.locator('.select-value').click(); await select.getByText(label, { exact: true }).last().click();
            await page.waitForTimeout(100);
            const c = await page.evaluate(() => {
                const d = window.__ra2debug, canvas = d.renderer.renderer.domElement, rect = canvas.getBoundingClientRect();
                return { mode: d.generalOptions.graphics.renderResolution.value, tick: d.game.currentTick,
                    buffer: [canvas.width, canvas.height], css: [rect.width, rect.height], logical: [canvas.dataset.logicalWidth, canvas.dataset.logicalHeight],
                    text: (() => { const t = d.gameScreen.hud.sidebarCredits.text; return { value: t.value,
                        pixels: [t.ctx.canvas.width, t.ctx.canvas.height], logical: [t.props.width, t.props.height],
                        textureId: t.texture.uuid, geometry: Array.from(t.mesh.geometry.attributes.position.array) }; })(),
                    metrics: JSON.parse(canvas.dataset.renderOutput), desiredSpeed: d.game.desiredSpeed.value,
                    glError: d.renderer.renderer.getContext().getError() };
            });
            assert.equal(c.mode, mode); assert.equal(c.tick, pausedTick); assert.equal(c.desiredSpeed, Number.EPSILON);
            assert.equal(c.glError, 0);
            assert.equal(c.buffer[1], { '720p': 720, '1080p': 1080, '1440p': 1440, '4k': 2160, native: 2160 }[mode]);
            assert.deepEqual(c.text.pixels, c.text.logical.map(n => Math.ceil(n * c.buffer[1] / Number(c.logical[1]))));
            if (report.resolution.length) {
                for (const key of ['css', 'logical']) assert.deepEqual(c[key], report.resolution[0][key]);
                assert.equal(c.text.textureId, report.resolution[0].text.textureId);
                assert.deepEqual(c.text.geometry, report.resolution[0].text.geometry);
            }
            assert((await page.locator('.render-output').innerText()).includes(c.buffer.join(' x ')));
            await page.screenshot({ path: `${output}/pause-${mode}.png` }); report.resolution.push(c);
        }
        await page.setViewportSize({ width: 1000, height: 720 }); await page.waitForTimeout(200);
        const speed = page.locator('input[name=gameSpeed]'); await speed.scrollIntoViewIfNeeded();
        await page.screenshot({ path: `${output}/pause-narrow-speed.png` });
        await page.setViewportSize({ width: 1920, height: 1080 });
        for (const [selection, expected] of [[0, 2 / 3], [6, 4], [3, 4 / 3]]) {
            await speed.fill(String(selection));
            assert.equal(await page.evaluate(() => window.__ra2debug.game.currentTick), pausedTick);
            assert.equal(await page.evaluate(() => window.__ra2debug.game.desiredSpeed.value), Number.EPSILON);
            await page.getByText(labels[1], { exact: true }).click(); await page.getByText(labels[2], { exact: true }).click();
            await page.waitForTimeout(250);
            const before = await page.evaluate(() => ({ tick: window.__ra2debug.game.currentTick, speed: window.__ra2debug.game.speed.value }));
            assert.equal(before.speed, expected);
            await page.waitForTimeout(1200);
            const after = await page.evaluate(() => window.__ra2debug.game.currentTick); assert(after > before.tick);
            report.speed.push({ selection, expected, actual: before.speed, ticksIn1200ms: after - before.tick });
            await page.evaluate(() => window.__ra2debug.gameScreen.menu.open()); await page.getByText(labels[0], { exact: true }).click();
            assert.equal(await speed.inputValue(), String(selection));
            // The next speed selection must preserve this newly paused tick.
            await page.waitForTimeout(100);
            pausedTick = await page.evaluate(() => window.__ra2debug.game.currentTick);
        }
        await page.getByText(labels[1], { exact: true }).click(); await page.getByText(labels[2], { exact: true }).click();
        // The pause menu intentionally hides the credit label. Capture the real
        // game view separately at the UI-verified presets, with its tick frozen.
        await page.waitForTimeout(250);
        await page.evaluate(() => window.__ra2debug.gameScreen.gameAnimationLoop.stop());
        report.resolutionMoney = [];
        try {
            for (const mode of ['720p', '1080p', '1440p', '4k', 'native']) {
                const c = await page.evaluate(mode => {
                    const d = window.__ra2debug, c = window.__m14.capture(mode), t = d.gameScreen.hud.sidebarCredits.text;
                    return { mode, tick: c.tick, glError: c.glError, value: t.value,
                        pixels: [t.ctx.canvas.width, t.ctx.canvas.height] };
                }, mode);
                assert.equal(c.glError, 0);
                if (report.resolutionMoney.length) {
                    assert.equal(c.tick, report.resolutionMoney[0].tick); assert.equal(c.value, report.resolutionMoney[0].value);
                }
                await page.screenshot({ path: `${output}/resolution-game-${mode}.png` });
                report.resolutionMoney.push(c);
            }
        } finally { await page.evaluate(() => window.__ra2debug.gameScreen.gameAnimationLoop.start()); }
        report.status = 'PASS_PAUSE_OPTIONS_AND_SHROUD';
    } finally {
        await fs.writeFile(`${output}/result.json`, JSON.stringify(report, null, 2) + '\n');
    }
    return { status: report.status, output };
}
