// Eight measured receiver pivots in the actual copied-app world renderer.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { startSession } from '../allied-units/desktop-session.mjs';
import pivots from '../../../desktop/gatling-pivots.json' with { type: 'json' };
const density = Number(process.argv[4] ?? 4);
const session = await startSession(process.argv[2], process.argv[3], 'yr', false,
    async ({ page }) => page.evaluate(d => window.__ra2debug.generalOptions.graphics.hdDensity.value = d, density),
    async ({ page }) => page.evaluate(() => {
        const screen = window.__ra2debug.mainMenuController.getCurrentScreen();
        screen.buildFormProps().onCountrySelect('YuriCountry', 0);
    }));
const { page, out, report, stage, close } = session;
let failure;
try {
    await page.evaluate(() => {
        const d = window.__ra2debug, f = window.__allied;
        const place = (name, near) => {
            const worker = d.game.getConstructionWorker(f.player);
            const tile = d.game.map.tiles.getAll().filter(t => d.game.map.isWithinBounds(t) &&
                worker.canPlaceAt(name, t, { normalizedTile: true, ignoreAdjacent: true }))
                .sort((a,b) => Math.hypot(a.rx-near.rx,a.ry-near.ry)-Math.hypot(b.rx-near.rx,b.ry-near.ry))[0];
            if (!tile) throw Error('No legal heading fixture: '+name);
            const u = worker.placeAt(name,tile,true)[0]; f.actors[u.id] = u; return u;
        };
        for (let i=0;i<4;i++) place('YAPOWR',{rx:f.center.rx-22,ry:f.center.ry-22});
        f.gun=place('YAGGUN',{rx:f.center.rx+10,ry:f.center.ry+10});
        f.gun.attackTrait.setDisabled(true);f.detailSize=[640,540];f.actor=f.gun;
        d.worldInteraction.minimapHandler.panToTile(f.gun.tile);
    });
    await page.waitForFunction(() => {
        const d=window.__ra2debug,f=window.__allied;
        return f.gun.buildStatus===1 && d.renderableManager.getRenderableByGameObject(f.gun)?.buildingTurretHd;
    },undefined,{timeout:45000});
    await page.waitForTimeout(1200);
    await page.evaluate(() => window.__ra2debug.gameScreen.gameAnimationLoop.stop());
    report.headings=[];
    for(let heading=0;heading<360;heading+=45) {
        const value=await page.evaluate(heading => {
            const d=window.__ra2debug,f=window.__allied,r=d.renderableManager.getRenderableByGameObject(f.gun);
            f.gun.turretTrait.facing=heading;r.update(0);
            d.worldScene.scene.updateMatrixWorld(false);d.worldScene.meshBatchManager?.updateMeshes();d.renderer.render();
            return {heading,density:r.buildingTurretHd.resources.density,turretVisible:r.turret.visible,
                resourceCompletionFrame:r.buildingTurretHd.resources.assemblyCompletionFrame,
                visibleHeadings:[...r.buildingTurretHd.meshes].filter(([,pair])=>pair[1].visible).map(([h])=>h),
                owner:f.gun.owner.color,worldPosition:f.gun.position.worldPosition,
                hdBody:!!r.mainObj.builder.hdOverride};
        },heading);
        assert.equal(value.density,density);assert(value.hdBody && value.turretVisible);
        assert.deepEqual(value.visibleHeadings,[heading]);assert.equal(value.resourceCompletionFrame,10);
        const point=pivots.pivots[String(heading)];
        value.registeredReceiverCenter=point.map((p,i)=>p+pivots.targetPivot[i]-point[i]+pivots.turretOriginInBody[i]);
        assert.deepEqual(value.registeredReceiverCenter,pivots.bearingInBody);
        report.headings.push(value);await stage('Gatling-'+heading);
    }
    report.status='PASS_EIGHT_NATIVE_RECEIVER_HEADINGS';
    report.registration=pivots;
} catch(error) { failure=error;report.status='FAILED';report.failure=error.stack; }
await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
await close(failure);if(failure)throw failure;
console.log(report.status,density,report.headings.length);
