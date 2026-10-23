// Explicit isolated-game diagnostic. No URL or ordinary-game vehicle override.
import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const output = process.env.M13A_OUTPUT ?? '.artifacts/m1-3a/references-v1';
const origin = process.env.M13_ORIGIN ?? 'http://127.0.0.1:4014';
await fs.mkdir(output, { recursive: false });
const hash = b => createHash('sha256').update(b).digest('hex');
const result = { status: 'FAIL', errors: [], consoleErrors: [], external: [], sets: [],
    checkout: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), scope: 'Original Rhino reference layers only' };
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true, args: ['--disable-background-networking', '--disable-component-update', '--no-first-run'] });
let page;
try {
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
    await context.route('**/*', route => {
        const url = route.request().url();
        if (!url.startsWith(origin + '/') && !/^(blob|data):/.test(url)) { result.external.push(url); return route.abort(); }
        return route.continue();
    });
    await context.addInitScript(() => {
        const prefs = { _r_lastMap: 'MP01T4.map', _r_lastMode: '1', _r_lastCountry: '0', _r_lastColor: '1',
            _r_lastStartPos: '0', _r_lastTeam: '0', _r_hostOpts: '3;10000;0;1;1;0;1;0;;0;1;0;0',
            _r_lastBots: JSON.stringify([null, null, null, { d: 4, c: 5, co: 2, s: 3, t: 1 }, null, null, null, null]) };
        Object.entries(prefs).forEach(([k, v]) => localStorage.setItem(k, v));
    });
    page = await context.newPage();
    page.on('pageerror', e => result.errors.push(e.stack));
    page.on('console', m => { if (m.type() === 'error') result.consoleErrors.push(m.text()); });
    await page.goto(origin);
    await page.getByText('Offline Skirmish', { exact: true }).click({ timeout: 45000 });
    await page.waitForFunction(() => window.__ra2debug?.skirmishLobby);
    await page.evaluate(() => {
        const d = window.__ra2debug;
        d.generalOptions.graphics.renderResolution.value = '4k';
        d.skirmishLobby.startGame(1700000000000);
    });
    await page.waitForFunction(() => window.__ra2debug?.game?.status === 1, undefined, { timeout: 60000 });
    result.fixture = await page.evaluate(() => {
        const d = window.__ra2debug, mcv = d.localPlayer.getOwnedObjects().find(o => /MCV$/.test(o.name));
        const rule = d.game.rules.getObject('HTNK', 7);
        const candidates = [];
        for (let dx = -4; dx <= 4; dx++) for (let dy = -4; dy <= 4; dy++) {
            const tile = d.game.map.tiles.getByMapCoords(mcv.tile.rx + dx, mcv.tile.ry + dy);
            if (tile && !d.game.map.tileOccupation.getObjectsOnTile(tile).length
                && d.game.map.terrain.getPassableSpeed(tile, rule.speedType, true, false) > 0) candidates.push(tile);
        }
        candidates.sort((a, b) => ((a.rx-mcv.tile.rx-2)**2+(a.ry-mcv.tile.ry+2)**2)
            - ((b.rx-mcv.tile.rx-2)**2+(b.ry-mcv.tile.ry+2)**2));
        if (!candidates.length) throw Error('No valid Rhino fixture tile');
        const unit = d.game.createUnitForPlayer(rule, d.localPlayer);
        d.game.spawnObject(unit, candidates[0]); window.__m13Unit = unit;
        return { id: unit.id, tile: [unit.tile.rx, unit.tile.ry],
            disclosure: 'One explicit cross-faction HTNK fixture in the original South Pacific skirmish. No production or gameplay rule edits.' };
    });
    await page.waitForTimeout(900);
    for (const preset of ['4k', '1080p']) {
        await page.evaluate(p => { window.__ra2debug.generalOptions.graphics.renderResolution.value = p; }, preset);
        for (const heading of [0, 180]) {
            const capture = await page.evaluate(heading => {
                const d=window.__ra2debug, unit=window.__m13Unit;
                const r=d.renderableManager.getRenderableByGameObject(unit), world=d.worldScene;
                const gl=d.renderer.renderer, meshes=r.vxlBuilders.flatMap(b=>[...b.sections.values()]);
                if (meshes.some(m=>m.isBatchedMesh)) throw Error('Reference isolation requires the observed ordinary path');
                const oldFacing=unit.turretTrait.facing;
                const rotations=[r.dirWrapObj,r.tiltObj,r.turret,r.barrel].map(o=>[o,o.rotation.clone()]);
                const savedMeshes=[];world.scene.traverse(o=>{if(o.isMesh)savedMeshes.push([o,o.visible]);});
                const colors=meshes.map(m=>[m.material,m.material.colorWrite,m.material.depthWrite]);
                const clear=gl.getClearColor(world.ambientLight.color.clone()), alpha=gl.getClearAlpha();
                const background=world.scene.background;
                unit.turretTrait.facing=heading;r.updateVxlRotation(heading,true);
                world.scene.updateMatrixWorld(true);world.meshBatchManager.updateMeshes();d.renderer.render();
                const v=world.viewport, center=r.getPosition().clone().project(world.camera);
                const crop=[Math.round(v.x+(center.x+1)*v.width/2-180),Math.round(v.y+(1-center.y)*v.height/2-140),360,260];
                const ratio=gl.domElement.width/1920;
                const png=()=>{
                    const c=document.createElement('canvas');c.width=crop[2]*ratio;c.height=crop[3]*ratio;
                    c.getContext('2d').drawImage(gl.domElement,...crop.map(x=>x*ratio),0,0,c.width,c.height);
                    return c.toDataURL();
                };
                const layers={original:png()};
                const bounds=meshes.map(m=>{
                    const values=[];
                    for(let i=0;i<m.geometry.attributes.position.count;i++) {
                        const p=r.getPosition().clone().fromBufferAttribute(m.geometry.attributes.position,i).applyMatrix4(m.matrixWorld).project(world.camera);
                        values.push([v.x+(p.x+1)*v.width/2,v.y+(1-p.y)*v.height/2]);
                    }
                    return [Math.min(...values.map(p=>p[0])),Math.min(...values.map(p=>p[1])),Math.max(...values.map(p=>p[0])),Math.max(...values.map(p=>p[1]))];
                });
                try {
                    meshes.forEach(m=>{m.visible=false;});d.renderer.render();layers.background=png();
                    meshes.forEach(m=>{m.visible=true;m.material.colorWrite=false;m.material.depthWrite=false;});
                    d.renderer.render();layers.shadowBackground=png();
                    colors.forEach(([m,cw,dw])=>{m.colorWrite=cw;m.depthWrite=dw;});
                    savedMeshes.forEach(([m])=>{if(!meshes.includes(m))m.visible=false;});
                    world.scene.background=null;
                    for(const [name,color] of [['black',0x000000],['white',0xffffff]]) {
                        gl.setClearColor(color,1);gl.clear();
                        gl.setViewport(v.x,1080-v.y-v.height,v.width,v.height);
                        gl.render(world.scene,world.camera);layers[name]=png();
                    }
                } finally {
                    savedMeshes.forEach(([m,visible])=>{m.visible=visible;});
                    colors.forEach(([m,cw,dw])=>{m.colorWrite=cw;m.depthWrite=dw;});
                    world.scene.background=background;gl.setClearColor(clear,alpha);
                    d.renderer.render();layers.restored=png();
                    unit.turretTrait.facing=oldFacing;
                    rotations.forEach(([o,rotation])=>{o.rotation.copy(rotation);o.updateMatrix();});
                    r.lastTurretFacing=undefined;r.lastTilt=undefined;
                    world.scene.updateMatrixWorld(true);d.renderer.render();
                }
                return {heading,turretHeading:heading,tick:d.game.currentTick,layers,crop,ratio,
                    buffer:[gl.domElement.width,gl.domElement.height],css:[1920,1080],dpr:devicePixelRatio,
                    viewport:{...v},bounds,camera:{zoom:world.camera.zoom,projection:world.camera.projectionMatrix.toArray(),matrix:world.camera.matrixWorld.toArray()},glError:gl.getContext().getError()};
            },heading);
            assert.equal(capture.layers.original,capture.layers.restored,'Original capture restores exactly');
            assert.equal(capture.glError,0);
            for(const [name,data] of Object.entries(capture.layers)) {
                const bytes=Buffer.from(data.split(',')[1],'base64'),file=`${preset}-${heading}-${name}.png`;
                await fs.writeFile(`${output}/${file}`,bytes);capture.layers[name]={file,sha256:hash(bytes)};
            }
            result.sets.push({preset,...capture});
        }
    }
    await page.evaluate(async()=>{await window.__ra2debug.gameScreen.onLeave();});
    assert.deepEqual(result.errors,[]);assert.deepEqual(result.consoleErrors,[]);assert.deepEqual(result.external,[]);
    result.status='PASS_ORIGINAL_REFERENCE_CAPTURE';
} catch(error) {
    result.failure=error.stack;process.exitCode=1;
    await page?.screenshot({path:`${output}/failure.png`}).catch(()=>{});
} finally {
    await fs.writeFile(`${output}/result.json`,JSON.stringify(result,null,2)+'\n');await browser.close();
}
console.log(JSON.stringify({status:result.status,failure:result.failure,errors:result.errors,consoleErrors:result.consoleErrors}));
