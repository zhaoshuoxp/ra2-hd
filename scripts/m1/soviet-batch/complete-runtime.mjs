// Combined complete-family review in the versioned app; fixture code stays outside its payload.
import { _electron as electron } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const root = path.resolve('.artifacts/m1-6b');
const output = path.join(root, process.env.M16B_OUTPUT ?? `runtime-complete-${Date.now()}`);
await fs.mkdir(output, { recursive: false });
const artifact = JSON.parse(await fs.readFile(process.argv[2], 'utf8'));
const accepted = { app: artifact.artifact };
const inventory = JSON.parse(await fs.readFile(path.join(root, 'source-v1/inventory.json'), 'utf8'));
const states = JSON.parse(await fs.readFile(path.join(root, process.env.M16B_STATES ?? 'complete-review-states.json'), 'utf8'));
const profile = path.join(output, 'profile');
await fs.mkdir(profile);
await fs.writeFile(path.join(profile, 'resource-registration.json'), JSON.stringify({ schemaVersion: 1, directory: path.resolve('.local') }));
const report = { exports: process.env.M16B_EXPORTS ?? 'exports-v1', status: 'RUNNING', scope: 'Ordinary complete-family activation with separately labeled frozen-frame visual fixtures', sourceApp: accepted.app, errors: [], consoleErrors: [], placements: [], families: {} };
const app = await electron.launch({ executablePath: path.join(accepted.app, 'Contents/MacOS/Electron'), cwd: '/private/tmp', env: { ...process.env, RA2_DESKTOP_USER_DATA: profile }, timeout: 60000 });
try {
    const page = await app.firstWindow();
    page.on('pageerror', e => report.errors.push(e.stack));
    page.on('console', m => { if (m.type() === 'error')
        report.consoleErrors.push(m.text()); });
    await page.getByText('Offline Skirmish', { exact: true }).waitFor({ timeout: 90000 });
    await page.evaluate(() => {
        const proto=WebGL2RenderingContext.prototype,storage=proto.texStorage2D,remove=proto.deleteTexture;
        const allocations=new Map();window.__batchStorage={live:0,peak:0,unknownFormats:[]};
        proto.texStorage2D=function(...args){
            const [target,levels,format,width,height]=args;
            const bpp=({33321:1,33323:2,32856:4,35907:4,34842:8,34836:16,33325:2,33327:4,33326:4,33328:8})[format];
            if(target===this.TEXTURE_2D&&bpp){
                const texture=this.getParameter(this.TEXTURE_BINDING_2D);let bytes=0;
                for(let i=0;i<levels;i++)bytes+=Math.max(1,width>>i)*Math.max(1,height>>i)*bpp;
                window.__batchStorage.live+=bytes-(allocations.get(texture)??0);allocations.set(texture,bytes);
                window.__batchStorage.peak=Math.max(window.__batchStorage.peak,window.__batchStorage.live);
            } else window.__batchStorage.unknownFormats.push({target,levels,format,width,height});
            return storage.apply(this,args);
        };
        proto.deleteTexture=function(texture){window.__batchStorage.live-=allocations.get(texture)??0;allocations.delete(texture);return remove.call(this,texture);};
    });
    await page.evaluate(() => {
        const g = window.__ra2debug.generalOptions.graphics;
        g.conscriptHd.value = true;
        g.napowrHd.value = true;
        g.rhinoHd.value = true;
        g.powerPlantHd.value = true;
        for (const name of ['nahand', 'narefn', 'naweap', 'nacnst']) g[`${name}Hd`].value = true;
        Object.entries({ _r_lastMap: 'MP01T4.map', _r_lastMode: '1', _r_lastCountry: '5', _r_lastColor: '1', _r_lastStartPos: '0', _r_lastTeam: '0', _r_hostOpts: '6;10000;10;1;1;0;1;0;;0;1;0;0', _r_lastBots: JSON.stringify([null, null, null, { d: 4, c: 5, co: 2, s: 3, t: 1 }, null, null, null, null]) }).forEach(([k, v]) => localStorage.setItem(k, v));
    });
    await page.getByText('Offline Skirmish', { exact: true }).click();
    await page.waitForFunction(() => window.__ra2debug?.skirmishLobby);
    await page.evaluate(() => window.__ra2debug.skirmishLobby.startGame(1700000000000));
    await page.waitForFunction(() => window.__ra2debug?.game?.status === 1, undefined, { timeout: 90000 });
    const { startTrace } = await import('./native-production.mjs');
    await startTrace(page);
    await page.evaluate(() => { const d = window.__ra2debug; d.actionsApi.orderUnits([d.localPlayer.getOwnedObjects().find(u => /MCV$/.test(u.name)).id], 10); });
    await page.waitForFunction(() => window.__ra2debug.localPlayer.getOwnedObjects().some(u => u.name === 'NACNST'));
    for (const name of ['NAPOWR', 'NAHAND', 'NAREFN', 'NAWEAP']) {
        await page.evaluate(n => window.__ra2debug.actionsApi.queueForProduction(0, 2, n, 1), name);
        await page.waitForFunction(() => window.__ra2debug.localPlayer.production.getQueue(0).status === 3, undefined, { timeout: 120000 });
        report.placements.push(await page.evaluate(name => {
            const d = window.__ra2debug, y = d.localPlayer.getOwnedObjects().find(u => u.name === 'NACNST'), tiles = [];
            for (let x = -12; x <= 12; x++)
                for (let z = -12; z <= 12; z++)
                    tiles.push({ rx: y.tile.rx + x, ry: y.tile.ry + z });
            const [dx, dz] = ({ NAPOWR: [-4, -2], NAHAND: [-5, 2], NAREFN: [-5, 7], NAWEAP: [5, 5] })[name];
            tiles.sort((a, b) => Math.hypot(a.rx - y.tile.rx - dx, a.ry - y.tile.ry - dz) - Math.hypot(b.rx - y.tile.rx - dx, b.ry - y.tile.ry - dz));
            const tile = tiles.find(t => d.game.getConstructionWorker(d.localPlayer).canPlaceAt(name, t, { normalizedTile: true }));
            if (!tile)
                throw Error(`No legal foundation: ${name}`);
            d.actionsApi.placeBuilding(name, tile.rx, tile.ry);
            return { name, tile, tick: d.game.currentTick };
        }, name));
        await page.waitForFunction(n => window.__ra2debug.localPlayer.getOwnedObjects().some(u => u.name === n), name);
        await page.waitForTimeout(2400);
        console.log('Naturally built', name);
    }
    const { exercise } = await import('./native-production.mjs');
    report.native = await exercise(page, output);
    await page.screenshot({ path: path.join(output, 'all-families-scene.png') });
    await page.evaluate(() => { const d = window.__ra2debug; d.gameScreen.gameAnimationLoop.stop(); d.gameScreen.pointer.unlock(); });
    report.acceptedAssets = await page.evaluate(() => { const d = window.__ra2debug; return { napowr: d.napowrHd, conscript: d.conscriptHd, powerPlant: d.powerPlantHd, rhino: d.rhinoHd, sovietBuildings: d.sovietBuildingsHd };  });
    await page.evaluate(inventory => {
        const d = window.__ra2debug;
        window.__batchParts = id => {
            const u = d.localPlayer.getOwnedObjects().find(u => u.name === id), r = d.renderableManager.getRenderableByGameObject(u);
            return { u, r, parts: [{ role: 'body', m: r.mainObj }, { role: 'bib', m: r.bib }, ...[...r.animObjects].flatMap(([type, ms]) => ms.map(m => ({ role: String(type), m })))].filter(p => p.m).map(p => ({ ...p, member: inventory.families[id].members.find(m => m.aggregateOffset === p.m.builder.frameOffset).source.member })) };
        };
        window.__captureBatch = ({ id, layers, mode = '4k' }) => {
            const { r, parts } = window.__batchParts(id);
            d.generalOptions.graphics.renderResolution.value = mode;
            for (const p of parts)
                p.m.get3DObject().visible = false;
            for (const m of r.fireObjects)
                m.get3DObject().visible = false;
            for (const [member, frame] of layers) {
                const p = parts.find(p => p.member === member && p.role !== '6');
                if (!p)
                    throw Error(`Missing ${id}/${member}`);
                p.m.setFrame(frame);
                p.m.get3DObject().visible = true;
            }
            d.worldScene.scene.updateMatrixWorld(true);
            d.worldScene.meshBatchManager.updateMeshes();
            d.worldScene.meshBatchManager.processRenderQueue();
            d.renderer.render();
            const rr = d.renderer.renderer, canvas = rr.domElement, gl = rr.getContext(), w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
            const pixels = new Uint8Array(w * h * 4);
            gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
            const c = document.createElement('canvas');
            c.width = w;
            c.height = h;
            const ctx = c.getContext('2d'), im = ctx.createImageData(w, h);
            for (let y = 0; y < h; y++)
                im.data.set(pixels.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
            ctx.putImageData(im, 0, 0);
            const v = d.worldScene.viewport, points = [];
            for (const { m } of parts.filter(p => p.m.get3DObject().visible)) {
                const mesh = m.getShapeMesh(), pos = mesh.geometry.attributes.position;
                for (let i = 0; i < pos.count; i++) {
                    const p = d.worldScene.camera.position.clone().fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld).project(d.worldScene.camera);
                    points.push([v.x + (p.x + 1) * v.width / 2, v.y + (1 - p.y) * v.height / 2]);
                }
            }
            window.__batchCropCenters ??= {};
            const [cx,cy] = window.__batchCropCenters[id] ??= [points.reduce((sum,p)=>sum+p[0],0)/points.length, points.reduce((sum,p)=>sum+p[1],0)/points.length];
            const crop=[Math.round((cx-170)*w/d.renderer.width),Math.round((cy-130)*h/d.renderer.height),Math.round(340*w/d.renderer.width),Math.round(260*h/d.renderer.height)];
            const preview=document.createElement('canvas');preview.width=crop[2];preview.height=crop[3];preview.getContext('2d').drawImage(c,...crop,0,0,crop[2],crop[3]);
            return { png: preview.toDataURL(), crop, id, mode, tick: d.game.currentTick, logical: [d.renderer.width, d.renderer.height], css: [canvas.getBoundingClientRect().width, canvas.getBoundingClientRect().height], buffer: [w, h], dpr: devicePixelRatio, camera: d.worldScene.camera.projectionMatrix.toArray(), points, glError: gl.getError(), animationSpeed: r.gameSpeed.value,
                parts: parts.map(({ m, role, member }) => ({ role, member, visible: m.get3DObject().visible, frame: m.builder.getFrame(), offset: m.builder.frameOffset, vertices: Array.from(m.getShapeMesh().geometry.attributes.position.array) })),
                materials: parts.filter(p => p.m.get3DObject().visible).map(({ m, role }) => ({ role, type: m.getShapeMesh().material.type, identity: m.builder.hdOverride?.identity ?? null, shadowMap: m.getShadowMesh()?.material.map?.uuid ?? null })) };
        };
    }, inventory);
    await page.evaluate(() => {
        window.__batchBindings = new Map();
        window.__setBatchProduction = (id, enabled) => {
            const { r, parts } = window.__batchParts(id);
            for (const { m } of parts) for (const b of [m.builder, m.zShapeFixBuilder].filter(Boolean)) {
                if (!window.__batchBindings.has(b)) window.__batchBindings.set(b, b.hdOverride);
                b.setFrame(r.aggregatedImageData.file.numImages / 2 - b.frameOffset);
                b.hdOverride = enabled ? window.__batchBindings.get(b) : undefined;
            }
        };
    });
    for (const id of Object.keys(states)) {
        report.families[id] = { status: 'RUNNING', samples: [] };
        const dir = path.join(output, id); await fs.mkdir(dir);
        await page.evaluate(id => { const d = window.__ra2debug, { u } = window.__batchParts(id); d.worldInteraction.minimapHandler.panToTile(u.tile); }, id);
        const effective = report.acceptedAssets.sovietBuildings[id].density;
        assert(effective > 1, `${id} failed ordinary HD activation`);
        for (const [state, layers] of Object.entries(states[id])) {
            for (const mode of (['normal', 'damaged'].includes(state) ? ['1080p', '4k'] : ['4k'])) {
                for (const enabled of [false, true]) {
                    await page.evaluate(({id,enabled}) => window.__setBatchProduction(id,enabled), {id,enabled});
                    const sample = await page.evaluate(args => window.__captureBatch(args), { id, layers, mode });
                    assert.equal(sample.glError,0);
                    assert(sample.materials.every(m => enabled ? m.type === 'HdSpriteMaterial' && m.identity?.startsWith(id.toLowerCase()+'/') : m.type !== 'HdSpriteMaterial' && !m.identity));
                    const density = enabled ? effective : 1;
                    const file = `${state}-${mode}-${enabled ? 'hd' : 'original'}.png`;
                    await fs.writeFile(path.join(dir,file),Buffer.from(sample.png.split(',')[1],'base64'));delete sample.png;
                    report.families[id].samples.push({...sample,state,density,file});
                }
            }
        }
        await page.evaluate(id=>window.__setBatchProduction(id,true),id);
        await page.evaluate(({id,layers})=>window.__captureBatch({id,layers}),{id,layers:states[id].normal});
        for (const [owner,color] of [['blue',{r:32,g:80,b:255}],['yellow',{r:255,g:235,b:32}]]) {
            const palette=await page.evaluate(({id,color})=>{
                const {r,parts}=window.__batchParts(id);
                const p=[...r.paletteRemaps].sort((a,b)=>{
                    const dist=p=>['r','g','b'].reduce((sum,k)=>sum+(p.colors[16][k]-color[k])**2,0);return dist(a)-dist(b);
                })[0];parts.forEach(({m})=>m.setPalette(p));return p.colors.slice(16,32);
            },{id,color});
            const sample=await page.evaluate(({id,layers})=>window.__captureBatch({id,layers}),{id,layers:states[id].normal});
            const file=`owner-${owner}.png`;await fs.writeFile(path.join(dir,file),Buffer.from(sample.png.split(',')[1],'base64'));delete sample.png;
            report.families[id].samples.push({...sample,state:`owner-${owner}`,density:effective,file,palette});
        }
        await page.evaluate(id=>{const {r,parts}=window.__batchParts(id);parts.forEach(({m})=>m.setPalette(r.palette));},id);
        report.families[id].status='PASS_COMPLETE_FAMILY_RENDER';
        await fs.writeFile(path.join(output,'result.json'),JSON.stringify(report,null,2)+'\n');
        console.log(id,report.families[id].status,report.families[id].samples.length);
    }
    report.allocations = await page.evaluate(() => {
        const d=window.__ra2debug, rr=d.renderer.renderer;
        return Object.fromEntries(Object.entries(d.worldView.sovietBuildingsHd).map(([name,family])=>[name,
            {report:family.report,pages:[...family.overrides.values()].flatMap(o=>o.pages).map(p=>({base:p.base.image.data.byteLength,data:p.data.image.data.byteLength,
                initialized:!!rr.properties.get(p.base).__webglTexture&&!!rr.properties.get(p.data).__webglTexture}))}]));
    });
    report.textureStorage=await page.evaluate(()=>window.__batchStorage);
    const { damageRepairRemoval } = await import('./native-production.mjs');
    report.damageRepairRemoval = await damageRepairRemoval(page,output);
    assert.deepEqual(report.errors, []);
    report.status = 'PASS_COMPLETE_FAMILY_RENDER';
}
catch (e) {
    report.status = 'FAIL';
    report.failure = e.stack;
    throw e;
}
finally {
    await fs.writeFile(path.join(output, 'result.json'), JSON.stringify(report, null, 2) + '\n');
    await app.close();
}
