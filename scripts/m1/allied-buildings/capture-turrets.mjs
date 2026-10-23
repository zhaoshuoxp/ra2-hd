// Wait for actual turret visibility: construction poses are SHP, not rotation evidence.
// Original-only render fixtures; never part of the application payload or production proof.
import { _electron as electron } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve(process.argv[2] || '.artifacts/allied-buildings/turret-references-v1');
const partsOnly = process.argv.includes('--parts');
await fs.mkdir(root, { recursive: false });
const profile = path.join(root, 'profile');
await fs.mkdir(profile);
const receipt = JSON.parse(await fs.readFile('.artifacts/hd-resource-r6/package/package-receipt.json', 'utf8'));
const artifact = { executable: path.join(receipt.app, 'Contents/MacOS/RA2 HD Editions') };
const locale = JSON.parse(await fs.readFile('public/res/locale/zh-CN.json', 'utf8'));
const report = { status: 'RUNNING', scope: 'Explicit Original-only review fixtures; not native production or gameplay validation', errors: [], families: {} };
const app = await electron.launch({ executablePath: artifact.executable, cwd: '/private/tmp', env: { ...process.env, RA2_DESKTOP_USER_DATA: profile, RA2_DESKTOP_NO_DISCOVERY: '0' }, timeout: 60000 });
try {
    const page = await app.firstWindow();
    page.on('pageerror', e => report.errors.push(e.stack));
    await page.locator('[data-edition=yr]').click({ timeout: 60000 });
    await page.getByRole('button', { name: locale['hd:menuskirmish'], exact: true }).waitFor({ timeout: 90000 });
    await page.evaluate(() => { window.__ra2debug.generalOptions.graphics.hdEnabled.value = false; Object.entries({ _r_lastMap: 'XMP01T4.map', _r_lastMode: '1', _r_lastCountry: '1', _r_lastColor: '1', _r_lastStartPos: '0', _r_lastTeam: '0', _r_hostOpts: '6;10000;0;1;1;0;1;0;;0;1;0;0', _r_lastBots: JSON.stringify([null, null, null, { d: 4, c: 5, co: 2, s: 3, t: 1 }, null, null, null, null]) }).forEach(([k, v]) => localStorage.setItem('_edition:yr:' + k, v)); });
    await page.getByRole('button', { name: locale['hd:menuskirmish'], exact: true }).click();
    await page.waitForFunction(() => window.__ra2debug?.skirmishLobby);
    await page.evaluate(() => { window.__ra2debug.generalOptions.graphics.renderResolution.value = '4k'; window.__ra2debug.skirmishLobby.startGame(1700000000000); });
    await page.waitForFunction(() => window.__ra2debug?.game?.status === 1, undefined, { timeout: 90000 });
    for (const [index, id] of ['NASAM', 'GTGCAN'].entries()) {
        await page.evaluate(({ id, index }) => { const d = window.__ra2debug, mcv = d.localPlayer.getOwnedObjects().find(u => u.name === 'AMCV'); const tile = d.game.map.tiles.getByMapCoords(mcv.tile.rx - 4 - index * 3, mcv.tile.ry - 4); const unit = d.game.createObject(2, id); d.game.changeObjectOwner(unit, d.localPlayer); d.game.spawnObject(unit, tile); window.__turretFixture = unit; d.worldInteraction.minimapHandler.panToTile(tile); }, { id, index });
        await page.waitForFunction(() => {
            const d = window.__ra2debug;
            const r = d.renderableManager.getRenderableByGameObject(window.__turretFixture);
            return !!r?.turretRot && r.turret.visible;
        }, undefined, { timeout: 30000 });
        const captures = await page.evaluate(partsOnly => {
            const d = window.__ra2debug, unit = window.__turretFixture, r = d.renderableManager.getRenderableByGameObject(unit), world = d.worldScene, gl = d.renderer.renderer;
            d.gameScreen.gameAnimationLoop.stop();
            d.gameScreen.pointer.unlock();
            const all = [];
            world.scene.traverse(o => { if (o.isMesh)
                all.push([o, o.visible]); });
            const batchOutput = new Set();
            world.meshBatchManager.get3DObject().traverse(o => batchOutput.add(o));
            const own = new Set();
            (partsOnly ? r.turret : r.get3DObject()).traverse(o => { if (o.isMesh)
                own.add(o); });
            if (!r.turretRot)
                throw Error('Missing native turret');
            const originalRotation = r.turretRot.rotation.clone(), background = world.scene.background, clear = gl.getClearColor(world.ambientLight.color.clone()), alpha = gl.getClearAlpha();
            const v = world.viewport, center = r.getPosition().clone().project(world.camera), ratio = gl.domElement.width / d.renderer.width;
            const logical = [gl.domElement.width, gl.domElement.height];
            const crop = [Math.round((v.x + (center.x + 1) * v.width / 2 - 100)), Math.round((v.y + (1 - center.y) * v.height / 2 - 130)), 200, 180];
            const scale = gl.domElement.width / (d.gameScreen.resolution?.width || 1920);
            const render = () => { world.scene.updateMatrixWorld(true); world.meshBatchManager.updateMeshes(); gl.clear(); gl.render(world.scene, world.camera); const c = document.createElement('canvas'); const factor = gl.domElement.width / gl.getSize({ set(x, y) { this.x = x; this.y = y; return this; } }).x; c.width = crop[2] * factor; c.height = crop[3] * factor; c.getContext('2d').drawImage(gl.domElement, ...crop.map(n => n * factor), 0, 0, c.width, c.height); const pixels = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let count = 0; for (let i = 0; i < pixels.length; i += 4)
                if (Math.abs(pixels[i] - 52) + Math.abs(pixels[i + 1] - 72) + Math.abs(pixels[i + 2] - 61) > 25)
                    count++; if (count < 100)
                throw Error('Empty isolated reference'); return c.toDataURL(); };
            const frames = [];
            world.scene.updateMatrixWorld(true);
            const pivot = r.turret.getWorldPosition(world.camera.position.clone()).project(world.camera);
            const pivotScreen = [v.x + (pivot.x + 1) * v.width / 2, v.y + (1 - pivot.y) * v.height / 2];
            const sz0 = gl.getSize({ set(x, y) { this.x = x; this.y = y; return this; } });
            gl.setViewport(v.x, sz0.y - v.y - v.height, v.width, v.height);
            frames.push({ heading: 'complete-native', png: render() });
            try {
                for (const [m] of all)
                    if (!own.has(m) && !batchOutput.has(m))
                        m.visible = false;
                world.scene.background = null;
                gl.setClearColor(0x34483d, 1);
                const sz = gl.getSize({ set(x, y) { this.x = x; this.y = y; return this; } });
                gl.setViewport(v.x, sz.y - v.y - v.height, v.width, v.height);
                for (let heading = 0; heading < 360; heading += 45) {
                    unit.turretTrait.facing = heading;
                    r.lastTurretFacing = undefined;
                    r.update(0);
                    r.turretRot.rotation.y = heading * Math.PI / 180;
                    r.turretRot.updateMatrix();
                    r.turretRot.updateWorldMatrix(true, true);
                    frames.push({ heading, png: render() });
                }
            }
            finally {
                for (const [m, visible] of all)
                    m.visible = visible;
                r.turretRot.rotation.copy(originalRotation);
                r.turretRot.updateMatrix();
                world.scene.background = background;
                gl.setClearColor(clear, alpha);
                d.renderer.render();
                d.gameScreen.gameAnimationLoop.start();
            }
            return { frames, crop, logical, pivotScreen, partsOnly, ownMeshes: own.size, parts: r.turretBuilders.length };
        }, partsOnly);
        await fs.mkdir(path.join(root, id));
        for (const frame of captures.frames) {
            await fs.writeFile(path.join(root, id, `${frame.heading}.png`), Buffer.from(frame.png.split(',')[1], 'base64'));
            frame.hash = (await import('node:crypto')).createHash('sha256').update(frame.png).digest('hex');
            delete frame.png;
        }
        report.families[id] = captures;
        if (new Set(captures.frames.filter(f => typeof f.heading === 'number').map(f => f.hash)).size < 4)
            throw Error('Heading sweep did not rotate');
    }
    report.status = 'PASS_ORIGINAL_TURRET_REFERENCES';
}
catch (e) {
    report.status = 'FAIL';
    report.failure = e.stack;
    process.exitCode = 1;
}
finally {
    await fs.writeFile(path.join(root, 'result.json'), JSON.stringify(report, null, 2));
    await app.close();
}
