// Isolated current-app integration and explicitly labeled frozen-frame fixtures.
import { _electron as electron } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = path.resolve('.artifacts/soviet-remaining');
const output = path.join(root, process.env.SOVIET_RUN ?? `runtime-review-${Date.now()}`);
await fs.mkdir(output, { recursive: false });
const profile = path.join(output, 'profile'); await fs.mkdir(profile);
await fs.writeFile(path.join(profile, 'resource-registration.json'), JSON.stringify({ schemaVersion: 1, directory: path.resolve('.local') }));
const artifact = JSON.parse(await fs.readFile(process.argv[2], 'utf8'));
const inventory = JSON.parse(await fs.readFile(path.join(root, 'source-v1/inventory.json'), 'utf8'));
const report = { status: 'RUNNING', app: artifact.artifact, scope: 'Actual app activation and native update paths; spawned/frozen visual fixtures are labeled separately',
    errors: [], consoleErrors: [], families: {}, gameplayAcceptance: 'PENDING_USER' };
const app = await electron.launch({ executablePath: artifact.executable, cwd: '/private/tmp',
    env: { ...process.env, RA2_DESKTOP_USER_DATA: profile }, timeout: 60000 });
try {
    const page = await app.firstWindow();
    page.on('pageerror', e => report.errors.push(e.stack));
    page.on('console', m => { if (m.type() === 'error') report.consoleErrors.push(m.text()); });
    await page.getByText('Offline Skirmish', { exact: true }).waitFor({ timeout: 90000 });
    report.defaultHd = await page.evaluate(() => window.__ra2debug.generalOptions.graphics.hdEnabled.value);
    assert.equal(report.defaultHd, true);
    await page.evaluate(() => {
        const g = window.__ra2debug.generalOptions.graphics; g.renderResolution.value = '4k';
        Object.entries({ _r_lastMap: 'MP01T4.map', _r_lastMode: '1', _r_lastCountry: '5', _r_lastColor: '1',
            _r_lastStartPos: '0', _r_lastTeam: '0', _r_hostOpts: '6;10000;0;1;1;0;1;0;;0;1;0;0',
            _r_lastBots: JSON.stringify([null, null, null, { d: 4, c: 5, co: 2, s: 3, t: 1 }, null, null, null, null])
        }).forEach(([k, v]) => localStorage.setItem(k, v));
    });
    await page.getByText('Offline Skirmish', { exact: true }).click();
    await page.waitForFunction(() => window.__ra2debug?.skirmishLobby);
    await page.evaluate(() => window.__ra2debug.skirmishLobby.startGame(1700000000000));
    await page.waitForFunction(() => window.__ra2debug?.game?.status === 1, undefined, { timeout: 180000 });
    report.activation = await page.evaluate(() => {
        const d = window.__ra2debug;
        return { families: d.sovietBuildingsHd, napowr: d.napowrHd, powerPlant: d.powerPlantHd,
            conscript: d.conscriptHd, rhino: d.rhinoHd, availability: d.generalOptions.graphics.hdAvailability,
            logical: [d.renderer.width, d.renderer.height], buffer: [d.renderer.renderer.domElement.width, d.renderer.renderer.domElement.height] };
    });
    await fs.writeFile(path.join(output, 'activation.json'), JSON.stringify(report.activation, null, 2));
    for (const id of Object.keys(inventory.families)) assert.equal(report.activation.families[id]?.density, 2, `${id}: whole-family activation failed`);
    await page.evaluate(() => {
        const d = window.__ra2debug;
        window.__remainingFixture = undefined;
        window.__remainingCapture = () => {
            const u = window.__remainingFixture, r = d.renderableManager.getRenderableByGameObject(u);
            d.renderer.render();
            const rr = d.renderer.renderer, c = rr.domElement, v = d.worldScene.viewport;
            const point = r.getPosition().clone().project(d.worldScene.camera);
            const cx = v.x + (point.x + 1) * v.width / 2, cy = v.y + (1 - point.y) * v.height / 2;
            const sx = c.width / d.renderer.width, sy = c.height / d.renderer.height;
            const crop = [Math.round((cx - 210) * sx), Math.round((cy - 245) * sy), Math.round(420 * sx), Math.round(300 * sy)];
            const out = document.createElement('canvas'); out.width = crop[2]; out.height = crop[3];
            out.getContext('2d').drawImage(c, ...crop, 0, 0, out.width, out.height);
            const parts = [{ role: 'body', m: r.mainObj }, { role: 'bib', m: r.bib },
                ...[...(r.animObjects ?? [])].flatMap(([type, ms]) => ms.map(m => ({ role: String(type), m })))].filter(p => p.m);
            return { png: out.toDataURL(), logical: [420, 300], crop, tick: d.game.currentTick,
                glError: rr.getContext().getError(), textures: rr.info.memory.textures,
                turret: r.buildingTurretHd ? { parts: r.buildingTurretHd.meshes.size, nativeParts: r.turretBuilders.length,
                    visible: [...r.buildingTurretHd.meshes].filter(([h, meshes]) => meshes[1].visible).map(([h]) => h) } : null,
                parts: parts.map(({ role, m }) => ({ role, visible: m.get3DObject().visible,
                    frame: m.builder.getFrame(), offset: m.builder.frameOffset, material: m.getShapeMesh().material.type,
                    identity: m.builder.hdOverride?.identity, geometry: Array.from(m.getShapeMesh().geometry.attributes.position.array) })) };
        };
    });
    for (const [index, id] of Object.keys(inventory.families).filter(n => n !== 'NAWALL').entries()) {
        const directory = path.join(output, id); await fs.mkdir(directory);
        const family = report.families[id] = { status: 'RUNNING', fixture: 'Spawned native object; no production/placement claim', samples: [] };
        await page.evaluate(({ id, index }) => {
            const d = window.__ra2debug, mcv = d.localPlayer.getOwnedObjects().find(u => u.name === 'SMCV');
            const tile = d.game.map.tiles.getByMapCoords(mcv.tile.rx - 5 - index % 3 * 5, mcv.tile.ry - 5 - Math.floor(index / 3) * 5);
            const unit = d.game.createObject(2, id); d.game.changeObjectOwner(unit, d.localPlayer); d.game.spawnObject(unit, tile);
            window.__remainingFixture = unit; d.worldInteraction.minimapHandler.panToTile(tile);
        }, { id, index });
        await page.waitForTimeout(1100);
        await page.evaluate(() => { const d = window.__ra2debug; d.gameScreen.gameAnimationLoop.stop(); d.gameScreen.pointer.unlock(); });
        for (const [label, damage] of [['normal', false], ['damaged', true]]) {
            if (damage) await page.evaluate(() => {
                const d = window.__ra2debug, r = d.renderableManager.getRenderableByGameObject(window.__remainingFixture);
                r.updateImage(1);
            });
            const sample = await page.evaluate(() => window.__remainingCapture());
            assert.equal(sample.glError, 0);
            await fs.writeFile(path.join(directory, `${label}.png`), Buffer.from(sample.png.split(',')[1], 'base64')); delete sample.png;
            family.samples.push({ label, ...sample });
        }
        if (['NALASR', 'NAFLAK'].includes(id)) {
            for (let heading = 0; heading < 360; heading += 45) {
                await page.evaluate(heading => {
                    const d = window.__ra2debug, u = window.__remainingFixture, r = d.renderableManager.getRenderableByGameObject(u);
                    r.updateImage(0); u.turretTrait.facing = heading; r.turretRot.rotation.y = heading * Math.PI / 180;
                    r.turretRot.updateMatrix(); r.buildingTurretHd.update();
                }, heading);
                const sample = await page.evaluate(() => window.__remainingCapture());
                assert.equal(sample.glError, 0); assert.deepEqual(sample.turret.visible, [heading]);
                await fs.writeFile(path.join(directory, `turret-${heading}.png`), Buffer.from(sample.png.split(',')[1], 'base64')); delete sample.png;
                family.samples.push({ label: `turret-${heading}`, ...sample });
            }
        }
        family.status = 'PASS_ACTIVATION_AND_NATIVE_RENDER_FIXTURES';
        await fs.writeFile(path.join(output, 'result.json'), JSON.stringify(report, null, 2));
        await page.evaluate(() => window.__ra2debug.gameScreen.gameAnimationLoop.start());
        console.log(id, family.status);
    }
    await page.screenshot({ path: path.join(output, 'scene.png') });
    assert.deepEqual(report.errors, []); assert.deepEqual(report.consoleErrors, []);
    report.status = 'PASS_INITIAL_INTEGRATION_WALL_AND_BEHAVIOR_PENDING';
} catch (error) { report.status = 'FAIL'; report.failure = error.stack; process.exitCode = 1; }
finally { await fs.writeFile(path.join(output, 'result.json'), JSON.stringify(report, null, 2)); await app.close(); }
console.log(output, report.status);
