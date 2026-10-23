import assert from 'node:assert/strict';
import path from 'node:path';
import { PNG } from 'pngjs';

export async function validateLightingScore(page, report, out) {
    const reproduce = process.argv.includes('--reproduce');
    const result = report.lightingScore = {};
    result.scene = await page.evaluate(() => {
        const d = window.__ra2debug, g = d.game;
        for (const bot of g.botManager.bots.values()) bot.onGameTick = () => {};
        for (const u of g.getWorld().getAllObjects()) u.attackTrait?.setDisabled(true);
        g.mapShroudTrait.revealMap(d.localPlayer, g);
        const helper = d.gameScreen.playerUi.worldInteraction.minimapHandler.mapPanningHelper;
        d.worldScene.cameraPan.setPan(helper.computeCameraPanFromTile(153, 95));
        window.mapLamps = [];
        const lamps = [];
        for (const u of g.getWorld().getAllObjects()) {
            if (!u.rules?.lightIntensity) continue;
            const r = d.renderableManager.getRenderableByGameObject(u);
            r?.get3DObject()?.traverse(o => { if (o.renderOrder === 999995) window.mapLamps.push(o); });
            lamps.push({ name: u.name, tile: [u.tile.rx, u.tile.ry], intensity: u.rules.lightIntensity,
                tint: [u.rules.lightRedTint, u.rules.lightGreenTint, u.rules.lightBlueTint] });
        }
        return { map: g.gameOpts.mapName, lamps, ambient: d.worldView.lighting?.getAmbient(),
            shaders: window.mapLamps.map(o => o.material.type) };
    });
    assert(result.scene.lamps.some(l => l.name === 'INGALITE' && l.tile[0] === 153 && l.tile[1] === 95));
    const measure = bytes => {
        const png = PNG.sync.read(bytes); let white = 0, sum = 0, pixels = 0;
        for (let y = 0; y < png.height * .9; y++) for (let x = 0; x < png.width * .8; x++) {
            const i = (y * png.width + x) * 4, [r, g, b] = png.data.subarray(i, i + 3);
            white += Number(r >= 250 && g >= 250 && b >= 250); sum += (r + g + b) / 3; pixels++;
        }
        return { whiteFraction: white / pixels, mean: sum / pixels, pixels };
    };
    await page.waitForTimeout(300);
    result.lightsOn = measure(await page.screenshot({ path: path.join(out, 'bering-lights-on.png') }));
    await page.evaluate(() => window.mapLamps.forEach(o => o.visible = false));
    await page.waitForTimeout(300);
    result.lightsOff = measure(await page.screenshot({ path: path.join(out, 'bering-lights-off.png') }));
    await page.evaluate(() => window.mapLamps.forEach(o => o.visible = true));
    result.blendProbe = await page.evaluate(() => {
        const T = window.THREE;
        const renderer = new T.WebGLRenderer({ alpha: true, preserveDrawingBuffer: true });
        renderer.setSize(4, 4); renderer.outputColorSpace = T.SRGBColorSpace;
        const scene = new T.Scene(), camera = new T.OrthographicCamera(-1, 1, 1, -1, .1, 10);
        camera.position.z = 1;
        const geometry = new T.PlaneGeometry(2, 2);
        const background = new T.ShaderMaterial({
            vertexShader: 'void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
            fragmentShader: 'void main() { gl_FragColor = vec4(0.4, 0.4, 0.4, 1.0); }' });
        scene.add(new T.Mesh(geometry, background));
        const texture = new T.DataTexture(new Uint8Array([64, 26, 0, 255]), 1, 1);
        texture.needsUpdate = true;
        const rows = [];
        for (const [sign, equation] of [[1, T.AddEquation], [-1, T.ReverseSubtractEquation]]) {
            const original = window.mapLamps.find(o => o.material.blendEquation === equation).material;
            const material = original.clone();
            if (material.uniforms?.lampMap) material.uniforms.lampMap.value = texture;
            else material.map = texture;
            const mesh = new T.Mesh(geometry, material); mesh.renderOrder = 1; scene.add(mesh);
            renderer.render(scene, camera);
            const rgba = new Uint8Array(4), gl = renderer.getContext();
            gl.readPixels(2, 2, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
            rows.push({ sign, rgba: [...rgba], expected: [64, 26, 0].map(c => Math.round(102 * (1 + sign * c / 255))).concat(255), gl: gl.getError() });
            scene.remove(mesh); material.dispose();
        }
        texture.dispose(); background.dispose(); geometry.dispose(); renderer.dispose(); renderer.forceContextLoss();
        return rows;
    });
    if (!reproduce) for (const row of result.blendProbe) {
        assert.equal(row.gl, 0);
        row.rgba.forEach((value, i) => assert(Math.abs(value - row.expected[i]) <= 2, JSON.stringify(row)));
    }
    result.beforePause = await page.evaluate(() => {
        const d = window.__ra2debug;
        d.gameScreen.menu.open();
        return { milliseconds: d.game.currentTime, sidebarSeconds: d.gameScreen.sidebarModel.currentGameTime };
    });
    await page.waitForFunction(() => window.__ra2debug.game.speed.value === Number.EPSILON);
    result.paused = await page.evaluate(() => {
        const d = window.__ra2debug;
        const value = { milliseconds: d.game.currentTime, speed: d.game.speed.value };
        d.gameScreen.menu.controller.close();
        d.gameScreen.menu._onQuit.dispatch(d.gameScreen.menu);
        return value;
    });
    await page.locator('.score-table').waitFor({ timeout: 20000 });
    result.scoreText = await page.locator('.score-header span').nth(1).innerText();
    await page.screenshot({ path: path.join(out, 'score-after-pause-quit.png') });
    const seconds = Math.floor(result.paused.milliseconds / 1000);
    result.expected = `${Math.floor(seconds / 3600)}:${String(Math.floor(seconds / 60) % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
    if (!reproduce) assert(result.scoreText.endsWith(result.expected), `${result.scoreText} must match ${result.expected}`);
    result.status = reproduce ? 'REPRODUCTION_RECORDED' : 'PASS_LIGHTING_AND_PAUSED_SCORE';
}
