// Continuous native yaw and projection evidence with unchanged retail geometry.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { startSession } from '../allied-units/desktop-session.mjs';

const original = process.argv.includes('--original');
const density = Number(process.argv[4] ?? 4);
const session = await startSession(process.argv[2], process.argv[3], 'yr', false,
    async ({ page }) => page.evaluate(({ original, density }) => {
        const graphics = window.__ra2debug.generalOptions.graphics;
        graphics.hdEnabled.value = !original;
        graphics.hdDensity.value = density;
    }, { original, density }),
    async ({ page }) => page.evaluate(() => {
        window.__ra2debug.mainMenuController.getCurrentScreen().buildFormProps()
            .onCountrySelect('YuriCountry', 0);
    }));
const { page, out, report, stage, startClip, stopClip, close } = session;
let failure;
try {
    await page.evaluate(() => {
        const d = window.__ra2debug, f = window.__allied;
        const worker = d.game.getConstructionWorker(f.player);
        const place = (name, near) => {
            const tile = d.game.map.tiles.getAll().filter(t => d.game.map.isWithinBounds(t) &&
                worker.canPlaceAt(name, t, { normalizedTile: true, ignoreAdjacent: true }))
                .sort((a, b) => Math.hypot(a.rx - near.rx, a.ry - near.ry) -
                    Math.hypot(b.rx - near.rx, b.ry - near.ry))[0];
            if (!tile) throw Error('No legal native yaw placement');
            const u = worker.placeAt(name, tile, true)[0]; f.actors[u.id] = u; return u;
        };
        for (let i = 0; i < 4; i++) place('YAPOWR', { rx: f.center.rx - 22, ry: f.center.ry - 22 });
        f.gun = place('YAGGUN', { rx: f.center.rx + 10, ry: f.center.ry + 10 });
        f.gun.attackTrait.setDisabled(true);
        f.actor = f.gun; f.detailSize = [640, 540];
        d.worldInteraction.minimapHandler.panToTile(f.gun.tile);
        f.rotationTrace = [];
        f.rotationTimer = setInterval(() => {
            const r = d.renderableManager.getRenderableByGameObject(f.gun);
            if (r) f.rotationTrace.push({ tick: d.game.currentTick, facing: f.gun.turretTrait.facing,
                parent: r.turret.matrix.elements, rotating: r.turretRot.matrix.elements,
                hd: !!r.buildingTurretHd });
        }, 20);
    });
    await page.waitForFunction(original => {
        const d = window.__ra2debug, f = window.__allied;
        const r = d.renderableManager.getRenderableByGameObject(f.gun);
        return f.gun.buildStatus === 1 && r?.currentAnimType === 0 &&
            (original ? !r.buildingTurretHd && !r.mainObj.builder.hdOverride : !!r.buildingTurretHd);
    }, original, { timeout: 45000 });
    await stage('Gatling-rest');
    report.nativeModel = await page.evaluate(() => {
        const d = window.__ra2debug, r = d.renderableManager.getRenderableByGameObject(window.__allied.gun);
        return r.turretBuilders.map(builder => (builder.vxlFile?.sections ?? []).map(section => ({
            name: section.name, min: section.minBounds, max: section.maxBounds, scale: section.scale,
            matrix: section.transfMatrix.elements, voxels: section.getAllVoxels().voxels,
        })));
    });
    await startClip();
    report.headings = [];
    // Use the native turret controller and ROT speed; only its target is a fixture.
    for (let turn = 0; turn < 2; turn++) for (let heading = 0; heading < 360; heading += 45) {
        await page.evaluate(heading => { window.__allied.gun.turretTrait.desiredFacing = heading; }, heading);
        await page.waitForFunction(heading => window.__allied.gun.turretTrait.facing === heading, heading);
        await page.waitForTimeout(160);
        const value = await page.evaluate(() => {
            const d = window.__ra2debug, f = window.__allied;
            const r = d.renderableManager.getRenderableByGameObject(f.gun);
            const project = point => {
                const p = point.clone().project(d.worldScene.camera), v = d.worldScene.viewport;
                const scale = d.renderer.renderer.domElement.width / d.renderer.width;
                return [(v.x + (p.x + 1) * v.width / 2) * scale,
                    (v.y + (1 - p.y) * v.height / 2) * scale];
            };
            return { facing: f.gun.turretTrait.facing, tick: d.game.currentTick,
                pivotScreen: project(r.turret.getWorldPosition(r.turret.position.clone())),
                bodyAnchorScreen: project(r.getPosition()),
                turretWorld: r.turret.matrixWorld.elements, bodyWorld: r.mainObj.get3DObject().matrixWorld.elements,
                nativeSections: r.turretBuilders.map(b => [...b.sections.values()].map(s =>
                    ({ name: s.name, matrix: s.matrixWorld.elements }))),
                hd: !!r.buildingTurretHd, owner: f.gun.owner.color };
        });
        assert.equal(value.hd, !original); report.headings.push(value);
        if (!turn) await stage('Gatling-' + heading);
    }
    await stopClip('Gatling-native-full-yaw');
    report.rotationTrace = await page.evaluate(() => {
        clearInterval(window.__allied.rotationTimer); return window.__allied.rotationTrace;
    });
    report.mode = original ? 'ORIGINAL_RETAIL_VXL_HVA_NO_HD' : `HD_${density}X`;
    report.boundary = 'Unchanged native ROT interpolation and original camera; fixture sets desired yaw. Full drawing-buffer recording and actual projected section transforms.';
} catch (error) { failure = error; report.failure = error.stack; }
await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
await close(failure);
if (failure) throw failure;
console.log('PASS_NATIVE_ROTATION_RECORDING', report.mode, report.headings.length);
