// Faults affect only disposable copies, never accepted artwork or registrations.
import { _electron as electron } from '@playwright/test';
import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const artifact = JSON.parse(await fs.readFile(process.argv[2], 'utf8'));
const output = path.resolve(process.env.M16_OUTPUT ?? `.artifacts/m1-6a/fallback-${Date.now()}`), root = path.join(output, 'external data é');
await fs.mkdir(root, { recursive: true });
for (const relative of ['ra2-core-manifest.json', 'assets/ra2/ra2.mix', 'assets/ra2/language.mix', 'assets/ra2/multi.mix',
    'upstream-support/manifest.json', 'upstream-support/general.csf', 'upstream-support/ra2cd.mix']) {
    await fs.mkdir(path.dirname(path.join(root, relative)), { recursive: true });
    await fs.copyFile(path.resolve('.local', relative), path.join(root, relative), constants.COPYFILE_FICLONE);
}
const names = ['conscript-authored', 'power-plant-authored', 'power-plant-authored-body', 'power-plant-authored-active', 'power-plant-authored-buildup', 'rhino-authored'];
async function copyPacks() {
    for (const name of names)
        await fs.cp(path.resolve('.local/hd-packs', name, '1'), path.join(root, 'hd-packs', name, '1'), { recursive: true });
}
async function copySoviet() {
    for (const role of ['', '-body', '-active', '-buildup'])
        await fs.cp(path.resolve('.local/hd-packs', `soviet-power-plant-authored${role}`, '2'), path.join(root, 'hd-packs', `soviet-power-plant-authored${role}`, '2'), { recursive: true });
}
async function fault(density) {
    for (const name of ['soviet-power-plant-authored-active']) {
        const dir = path.join(root, 'hd-packs', name, '2'), m = JSON.parse(await fs.readFile(path.join(dir, 'manifest.json')));
        await fs.writeFile(path.join(dir, m.variants.find(v => v.density === density).pages[0].base), 'deliberately corrupt disposable page');
    }
}
const results = [];
async function run(name, expected, rhino, play = true, registration = root) {
    const profile = path.join(output, name, 'profile');
    await fs.mkdir(profile, { recursive: true });
    if (registration)
        await fs.writeFile(path.join(profile, 'resource-registration.json'), JSON.stringify({ schemaVersion: 1, directory: registration }));
    const app = await electron.launch({ executablePath: artifact.executable, cwd: '/private/tmp',
        env: { ...process.env, RA2_DESKTOP_USER_DATA: profile, RA2_DESKTOP_NO_DISCOVERY: '1' }, timeout: 60000 });
    const row = { name, errors: [], consoleErrors: [] };
    results.push(row);
    try {
        const page = await app.firstWindow();
        page.on('pageerror', e => row.errors.push(e.stack));
        page.on('console', m => { if (m.type() === 'error')
            row.consoleErrors.push(m.text()); });
        if (!play) {
            await page.getByText('Choose existing local resources', { exact: true }).waitFor({ timeout: 60000 });
            row.selectionFlow = await page.locator('body').innerText();
            await page.screenshot({ path: path.join(output, name, 'selection.png') });
        }
        else {
            await page.getByText('Offline Skirmish', { exact: true }).waitFor({ timeout: 90000 });
            await page.evaluate(() => {
                const d = window.__ra2debug;
                d.generalOptions.graphics.conscriptHd.value = true;
                d.generalOptions.graphics.napowrHd.value = true;
                d.generalOptions.graphics.powerPlantHd.value = true;
                d.generalOptions.graphics.rhinoHd.value = true;
                const prefs = { _r_lastMap: 'MP01T4.map', _r_lastMode: '1', _r_lastCountry: '5', _r_lastColor: '1', _r_lastStartPos: '0', _r_lastTeam: '0',
                    _r_hostOpts: '3;10000;10;1;1;0;1;0;;0;1;0;0', _r_lastBots: JSON.stringify([null, null, null, { d: 4, c: 5, co: 2, s: 3, t: 1 }, null, null, null, null]) };
                Object.entries(prefs).forEach(([k, v]) => localStorage.setItem(k, v));
            });
            await page.getByText('Offline Skirmish', { exact: true }).click();
            await page.waitForFunction(() => window.__ra2debug?.skirmishLobby);
            await page.evaluate(() => window.__ra2debug.skirmishLobby.startGame(1700000000000));
            await page.waitForFunction(() => window.__ra2debug?.game?.status === 1, undefined, { timeout: 90000 });
            await page.waitForTimeout(600);
            row.effective = await page.evaluate(() => {
                const d = window.__ra2debug;
                return { conscript: d.conscriptHd, powerPlant: d.powerPlantHd, napowr: d.napowrHd, rhino: d.rhinoHd,
                    units: d.localPlayer.getOwnedObjects().filter(u => ['E2', 'HTNK'].includes(u.name)).map(u => {
                        const r = d.renderableManager.getRenderableByGameObject(u);
                        return { name: u.name, hd: u.name === 'E2' ? !!r.shpRenderable.builder.hdOverride : !!r.rhinoHd?.active };
                    }), gl: d.renderer.renderer.getContext().getError() };
            });
            assert.equal(row.effective.conscript.density, 4);
            assert.equal(row.effective.powerPlant.density, 4);
            assert.equal(row.effective.napowr.density, expected);
            assert.equal(row.effective.rhino.status, rhino);
            assert.equal(row.effective.gl, 0);
            assert(row.effective.units.filter(u => u.name === 'E2').every(u => u.hd));
            await page.evaluate(() => { const d = window.__ra2debug; d.actionsApi.orderUnits([d.localPlayer.getOwnedObjects().find(u => /MCV$/.test(u.name)).id], 10); });
            await page.waitForFunction(() => window.__ra2debug.localPlayer.getOwnedObjects().some(u => u.name === 'NACNST'));
            await page.evaluate(() => window.__ra2debug.actionsApi.queueForProduction(0, 2, 'NAPOWR', 1));
            await page.waitForFunction(() => window.__ra2debug.localPlayer.production.getQueue(0).status === 3, undefined, { timeout: 90000 });
            await page.evaluate(() => { const d = window.__ra2debug, y = d.localPlayer.getOwnedObjects().find(u => u.name === 'NACNST'), ts = []; for (let x = -8; x <= 8; x++)
                for (let z = -8; z <= 8; z++)
                    ts.push({ rx: y.tile.rx + x, ry: y.tile.ry + z }); const t = ts.find(t => d.game.getConstructionWorker(d.localPlayer).canPlaceAt('NAPOWR', t, { normalizedTile: true })); if (!t)
                throw Error('No legal placement'); d.actionsApi.placeBuilding('NAPOWR', t.rx, t.ry); });
            await page.waitForFunction(() => window.__ra2debug.localPlayer.getOwnedObjects().some(u => u.name === 'NAPOWR'));
            await page.waitForTimeout(2500);
            row.reactor = await page.evaluate(() => { const d = window.__ra2debug, u = d.localPlayer.getOwnedObjects().find(u => u.name === 'NAPOWR'), r = d.renderableManager.getRenderableByGameObject(u); return { health: u.healthTrait.health, animationSpeed: r.gameSpeed.value, activeRate: r.animations.get(r.animObjects.get(2)[0]).props.rate, buildupRate: r.animations.get(r.animObjects.get(5)[0]).props.rate, power: d.localPlayer.powerTrait.power, drain: d.localPlayer.powerTrait.drain, rulePower: u.rules.power, cost: u.rules.cost, identity: r.mainObj.builder.hdOverride?.identity }; });
            assert.equal(row.reactor.power, 150);
            assert.equal(row.reactor.rulePower, 150);
            assert.equal(row.reactor.cost, 600);
            assert.equal(!!row.reactor.identity, expected > 1);
            if (expected === 4) {
                row.productionC = await page.evaluate(() => {
                    const d=window.__ra2debug, maps=new Set([...d.worldView.napowrHd.overrides.values()].flatMap(o=>o.pages.map(p=>p.base.uuid))), originals=[],draws=[];
                    d.worldScene.scene.traverse(m=>{if(!m.isMesh)return;const before=m.onBeforeRender;originals.push([m,before]);m.onBeforeRender=function(renderer,scene,camera,geometry,material){if(maps.has(material.map?.uuid))draws.push({type:material.type,filtering:material.uniforms.hdFiltering?.value,pass:material.uniforms.hdPass?.value,depthTest:material.depthTest,depthWrite:material.depthWrite,transparent:material.transparent});before?.call(this,renderer,scene,camera,geometry,material);};});
                    try {d.renderer.render();}finally{originals.forEach(([m,before])=>m.onBeforeRender=before);}
                    return draws;
                });
                assert(row.productionC.some(d=>d.filtering&&d.pass===1));assert(row.productionC.some(d=>d.filtering&&d.pass===2));
            }
            const target=await page.evaluate(()=>{const d=window.__ra2debug,u=d.localPlayer.getOwnedObjects().find(u=>u.name==='NAPOWR');d.worldInteraction.minimapHandler.panToTile(u.tile);d.unitSelection.deselectAll();return {id:u.id,point:d.helpers.getOwnedUnitClickPointById(u.id)};});
            await page.waitForTimeout(150);
            await page.mouse.click(target.point.x,target.point.y-15);
            await page.waitForTimeout(150);
            row.selection=await page.evaluate(()=>({ids:window.__ra2debug.helpers.getSelectedUnitIds(),locked:!!document.pointerLockElement}));
            row.selection.expected=target.id;row.selection.status=row.selection.ids.includes(target.id)?'PASS':'PHYSICAL_SELECTION_UNVERIFIED';
            await page.screenshot({ path: path.join(output, name, 'game.png') });
            if (process.env.M16_CAPTURE) {
                const {capture}=await import('./desktop-capture.mjs');await capture(page,path.join(output,name),row);
                await fs.writeFile(path.join(output,name,'result.json'),JSON.stringify(row,null,2)+'\n');
            }
            const route = await page.evaluate(() => fetch('/local-rhino/../not-allowlisted').then(r => r.status));
            assert.equal(route, 404);
        }
        assert.deepEqual(row.errors, []);
        row.status = 'PASS';
    }
    catch (error) {
        row.status = 'FAIL';
        row.error = error.stack;
        throw error;
    }
    finally {
        await app.close();
        await fs.writeFile(path.join(output, 'result.json'), JSON.stringify(results, null, 2));
    }
    console.log(name, row.status);
}
try {
    await copyPacks();
    if (process.env.M16_HEALTHY_ONLY) { await copySoviet(); await run('healthy-napowr',4,'READY'); } else {
    await run('missing-napowr', 1, 'READY');
    await copySoviet();
    await fault(4);
    await run('napowr-two-x', 2, 'READY');
    await fault(2);
    await run('napowr-original', 1, 'READY');
    }
}
finally {
    console.log('OUTPUT', output);
}
