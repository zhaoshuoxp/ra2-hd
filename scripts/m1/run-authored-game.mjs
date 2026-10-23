import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { checkRenderResolutionMenu, checkRenderResolutionMatch } from './check-render-resolution.mjs';

const density = process.env.M11_DENSITY ?? '4';
const expectedDensity = Number(process.env.M11_EXPECT_DENSITY ?? density);
const color = Number(process.env.M11_COLOR ?? 0);
const extended = process.env.M11_EXTENDED === '1';
const origin = process.env.M11_ORIGIN ?? 'http://127.0.0.1:4000';
const check4k = process.env.M11_CHECK_4K === '1';
const output = process.env.M11_OUTPUT ?? `.artifacts/m1-1/hd-gameplay-v1/game-${density}x`;
await fs.mkdir(output, { recursive: true });
const result = { status: 'FAIL', density, expectedDensity, color, errors: [], external: [], consoleErrors: [], phases: [] };
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true, args: ['--disable-background-networking', '--disable-component-update', '--no-first-run'] });
try {
    const context = await browser.newContext({ viewport: check4k ? { width: 1920, height: 1080 } : { width: 1280, height: 960 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
    await context.route('**/*', route => {
        const url = route.request().url();
        if (process.env.M11_REJECT_4X === '1' && /\/local-hd\/[^/]+\/4\//.test(url)) return route.fulfill({ status: 404, body: 'Deliberately missing 4x page for fallback verification' });
        if (!url.startsWith(origin + '/') && !/^(blob|data):/.test(url)) {
            result.external.push(url); return route.abort();
        }
        return route.continue();
    });
    await context.addInitScript(({ color }) => {
        const otherColors = [0, 1, 2, 3].filter(c => c !== color);
        const prefs = { _r_lastMap: 'MP01T4.map', _r_lastMode: '1', _r_lastCountry: '5', _r_lastColor: String(color),
            _r_lastStartPos: '0', _r_lastTeam: '0', _r_hostOpts: '3;10000;10;1;1;0;1;0;;0;1;0;0',
            _r_lastBots: JSON.stringify([null, ...[1, 2, 3].map(i => ({ d: 4, c: 5, co: otherColors[i-1], s: i, t: 1 })), null, null, null, null]) };
        for (const [key, value] of Object.entries(prefs)) localStorage.setItem(key, value);
    }, { color });
    const page = await context.newPage();
    page.on('pageerror', error => result.errors.push(error.stack));
    page.on('console', msg => { if (msg.type() === 'error') result.consoleErrors.push(msg.text()); });
    await page.goto(`${origin}/${density === '1' ? '' : '?conscript-hd=' + density}`);
    if (check4k) result.resolutionMenu = await checkRenderResolutionMenu(page, output);
    await page.getByText('Offline Skirmish', { exact: true }).click({ timeout: 45000 });
    await page.waitForFunction(() => window.__ra2debug?.skirmishLobby);
    if (!check4k) await page.evaluate(() => { window.__ra2debug.generalOptions.graphics.renderResolution.value = 'original'; });
    await page.evaluate(() => window.__ra2debug.skirmishLobby.startGame(1700000000000));
    await page.waitForFunction(() => window.__ra2debug?.game?.status === 1, undefined, { timeout: 60000 });
    await page.waitForTimeout(2000);
    result.initial = await page.evaluate(() => {
        const d = window.__ra2debug, renderer = d.renderer.renderer, camera = d.worldScene.camera;
        const units = d.localPlayer.getOwnedObjects().filter(u => u.name === 'E2');
        window.__m11Units = units;
        return { selection: d.conscriptHd, tick: d.game.currentTick, units: units.map(u => {
            const r = d.renderableManager.getRenderableByGameObject(u);
            return { id: u.id, tile: [u.tile.rx, u.tile.ry], material: r.shpRenderable?.getShapeMesh()?.material?.type,
                identity: r.shpRenderable?.builder?.hdOverride?.identity, hasShadow: !!r.shpRenderable?.getShadowMesh() };
        }), camera: { zoom: camera.zoom, bounds: [camera.left, camera.right, camera.top, camera.bottom], rotation: camera.rotation.toArray() },
        canvas: [renderer.domElement.width, renderer.domElement.height], rendererPixelRatio: renderer.getPixelRatio(), dpr: devicePixelRatio,
        players: d.game.getCombatants().map(p => ({ country: p.country, color: p.color, count: p.getOwnedObjects().filter(u => u.name === 'E2').length })) };
    });
    assert.equal(result.initial.selection.density, expectedDensity);
    assert(result.initial.units.length > 0, 'No local Conscript infantry');
    assert(result.initial.units.every(u => u.hasShadow && (expectedDensity === 1 ? !u.identity : !!u.identity)));
    await page.screenshot({ path: `${output}/initial.png` });
    // Compare every logical frame with original geometry using real match inputs, outside the scene.
    result.geometry = await page.evaluate(() => {
        const d = window.__ra2debug, unit = window.__m11Units[0], r = d.renderableManager.getRenderableByGameObject(unit);
        const image = r.imageFinder.findByObjectArt(unit.art), Factory = r.shpRenderable.constructor;
        const models = [false, true].map(hd => {
            const model = Factory.factory(image, r.palette, r.camera, unit.art.getDrawOffset(), unit.art.hasShadow);
            model.setBatched(true); model.setBatchPalettes(r.paletteRemaps);
            if (hd && r.shpRenderable.builder.hdOverride) model.setHdOverride(r.shpRenderable.builder.hdOverride);
            model.create3DObject(); return model;
        });
        let body = 0, shadows = 0;
        const pages = new Set();
        try {
            for (let frame = 0; frame < 301; frame++) {
                for (const model of models) model.setFrame(frame);
                for (const kind of ['getShapeMesh', 'getShadowMesh']) {
                    const values = models.map(m => Array.from(m[kind]().geometry.attributes.position.array));
                    if (JSON.stringify(values[0]) !== JSON.stringify(values[1])) throw Error(`${kind} frame ${frame}`);
                    if (kind === 'getShapeMesh') body++; else shadows++;
                }
                if (models[0].getShadowMesh().material.map !== models[1].getShadowMesh().material.map) throw Error(`Shadow texture replaced at ${frame}`);
                const override = models[1].builder.hdOverride;
                if (override) pages.add(override.frames[frame].page);
            }
        } finally { models.forEach(m => m.dispose()); }
        return { body, shadows, pages: [...pages] };
    });
    await page.evaluate(() => {
        const d = window.__ra2debug, u = window.__m11Units[0];
        d.unitSelection.deselectAll(); d.unitSelection.addToSelection(u);
        const r = d.renderableManager.getRenderableByGameObject(u);
        window.__m11Trace = [];
        window.__m11TraceActive = true;
        const sample = () => {
            if (!window.__m11TraceActive) return;
            const builder=r.shpRenderable.builder,frame=builder.getFrame(),override=builder.hdOverride;
            const pageIndex=override?.frames[frame]?.page,expectedPage=override?.pages[pageIndex];
            const material=r.shpRenderable.getShapeMesh().material;
            window.__m11Trace.push({ tick: d.game.currentTick, frame: r.shpRenderable.builder.getFrame(), moving: u.isMoving,
                firing: u.isFiring, stance: u.stance, position: u.position.worldPosition.toArray(),
                selected: d.unitSelection.getSelectedUnits().includes(u), selectionVisible: r.pipOverlay?.selectionBox?.visible,
                material: r.shpRenderable.getShapeMesh().material.type, shadow: !!r.shpRenderable.getShadowMesh(),
                page:pageIndex,pageMatches:!expectedPage||(material.map===expectedPage.base&&material.uniforms.remapMap.value===expectedPage.data),
                glError: d.renderer.renderer.getContext().getError() });
            requestAnimationFrame(sample);
        };
        sample();
        d.actionsApi.orderUnits([u.id], 0, u.tile.rx + 3, u.tile.ry + 1);
    });
    await page.waitForTimeout(4500);
    await page.screenshot({ path: `${output}/selected-movement.png` });
    if (process.env.M11_MOUSE === '1') {
        const point = await page.evaluate(() => {
            const d=window.__ra2debug;d.unitSelection.deselectAll();
            return d.helpers.getOwnedUnitClickPointById(window.__m11Units[0].id);
        });
        await page.mouse.click(point.x,point.y-8);
        await page.waitForTimeout(400);
        result.mouseSelection=await page.evaluate(()=>({selected:window.__ra2debug.helpers.getSelectedUnitIds(),expected:window.__m11Units[0].id,kind:'Browser mouse input; not a physical-mouse acceptance claim'}));
        assert(result.mouseSelection.selected.includes(result.mouseSelection.expected),'Browser click did not select Conscript');
    }
    result.phases.push(await page.evaluate(() => {
        const d = window.__ra2debug, u = window.__m11Units[0];
        d.actionsApi.orderUnits([u.id], 3, u.tile.rx + 2, u.tile.ry);
        return { action: 'ForceAttackGround', tick: d.game.currentTick, target: [u.tile.rx + 2, u.tile.ry] };
    }));
    await page.waitForTimeout(6000);
    await page.screenshot({ path: `${output}/selected-fire.png` });
    await page.evaluate(() => {
        const d = window.__ra2debug, u = window.__m11Units[0];
        d.actionsApi.orderUnits([u.id], 11); d.actionsApi.orderUnits([u.id], 12);
    });
    await page.waitForTimeout(1800);
    await page.screenshot({ path: `${output}/selected-cheer.png` });
    result.trace = await page.evaluate(() => { window.__m11TraceActive = false; return window.__m11Trace; });
    assert(result.trace.some(f => f.moving), 'Movement not observed');
    assert(result.trace.some(f => f.firing), 'Firing not observed');
    assert(result.trace.some(f => f.frame >= 293), 'Cheer/page transition not observed');
    assert(result.trace.some(f => f.selected && f.selectionVisible), 'Selection box not observed');
    assert(result.trace.every(f => f.glError === 0 && f.shadow && f.pageMatches), 'GL, shadow or page binding failure');
    if (process.env.M11_COMBAT === '1') {
        await page.evaluate(() => {
            const d=window.__ra2debug,victim=window.__m11Units[2];
            const r=d.renderableManager.getRenderableByGameObject(victim);
            window.__m11Victim=victim;window.__m11Combat=[];window.__m11CombatActive=true;
            const sample=()=>{
                if(!window.__m11CombatActive)return;
                window.__m11Combat.push({tick:d.game.currentTick,frame:r.shpRenderable.builder.getFrame(),stance:victim.stance,
                    moving:victim.isMoving,firing:victim.isFiring,health:victim.healthTrait.health,destroyed:victim.isDestroyed,
                    material:r.shpRenderable.getShapeMesh()?.material?.type});
                requestAnimationFrame(sample);
            };sample();
            d.actionsApi.orderUnits([victim.id],0,victim.tile.rx+1,victim.tile.ry+1);
            d.actionsApi.orderUnits([window.__m11Units[1].id,window.__m11Units[3].id],3,victim.id);
        });
        await page.waitForTimeout(2000);
        await page.evaluate(()=>{const d=window.__ra2debug,u=window.__m11Victim;if(!u.isDestroyed)d.actionsApi.orderUnits([u.id],3,u.tile.rx+1,u.tile.ry);});
        await page.screenshot({path:`${output}/combat-prone.png`});
        await page.waitForFunction(()=>window.__m11Victim.isDestroyed,undefined,{timeout:30000}).catch(()=>{});
        await page.waitForTimeout(1800);
        result.combat=await page.evaluate(()=>{window.__m11CombatActive=false;return window.__m11Combat;});
        await page.screenshot({path:`${output}/combat-final.png`});
    }
    if (extended) {
        result.deployment = await page.evaluate(() => {
            const d = window.__ra2debug, mcv = d.localPlayer.getOwnedObjects().find(u => /MCV$/.test(u.name));
            if (!mcv) throw Error('No MCV to deploy');
            window.__m11Mcv = mcv;
            const candidates=[];
            for(let dx=-7;dx<=7;dx++)for(let dy=-7;dy<=7;dy++)candidates.push({rx:mcv.tile.rx+dx,ry:mcv.tile.ry+dy});
            candidates.sort((a,b)=>(a.rx-mcv.tile.rx)**2+(a.ry-mcv.tile.ry)**2-(b.rx-mcv.tile.rx)**2-(b.ry-mcv.tile.ry)**2);
            const tile=candidates.find(t=>d.game.getConstructionWorker(d.localPlayer).canPlaceAt(mcv.rules.deploysInto,t,{ignoreObjects:[mcv],ignoreAdjacent:true}));
            if(!tile)throw Error('No legal deployment tile');
            d.actionsApi.orderUnits([mcv.id],0,tile.rx,tile.ry);
            return {id:mcv.id,name:mcv.name,tile,deploysInto:mcv.rules.deploysInto};
        });
        await page.waitForFunction(tile=>{const u=window.__m11Mcv;return u.tile.rx===tile.rx&&u.tile.ry===tile.ry&&!u.isMoving;},result.deployment.tile,{timeout:20000});
        await page.evaluate(()=>{const d=window.__ra2debug;d.actionsApi.orderUnits([window.__m11Mcv.id],10);});
        await page.waitForFunction(() => window.__ra2debug.localPlayer.getOwnedObjects().some(u => ['GACNST','NACNST'].includes(u.name)), undefined, { timeout: 15000 });
        await page.waitForTimeout(2500);
        result.occlusion = [];
        for (const offset of [[1,-1],[-1,1],[-1,-1]]) {
            await page.evaluate(offset => {
                const d = window.__ra2debug, u = window.__m11Units[0];
                const yard = d.localPlayer.getOwnedObjects().find(u => ['GACNST','NACNST'].includes(u.name));
                d.actionsApi.orderUnits([u.id], 0, yard.tile.rx + offset[0], yard.tile.ry + offset[1]);
            }, offset);
            await page.waitForTimeout(5000);
            const probe = await page.evaluate(() => {
                const d = window.__ra2debug, u = window.__m11Units[0];
                const yard = d.localPlayer.getOwnedObjects().find(u => ['GACNST','NACNST'].includes(u.name));
                const unitR = d.renderableManager.getRenderableByGameObject(u), yardR = d.renderableManager.getRenderableByGameObject(yard);
                const body = unitR.shpRenderable.getShapeMesh(), building = yardR.get3DObject();
                const saved = [body.visible, building.visible], gl = d.renderer.renderer.getContext();
                const point = unitR.getPosition().clone().project(d.worldScene.camera), v = d.worldScene.viewport;
                const cx = v.x + (point.x + 1) * v.width / 2, cy = v.y + (1 - point.y) * v.height / 2;
                const left = Math.max(0, Math.min(gl.drawingBufferWidth - 80, Math.round(cx) - 40));
                const bottom = Math.max(0, Math.min(gl.drawingBufferHeight - 96, gl.drawingBufferHeight - Math.round(cy) - 30));
                const read = (showBody, showBuilding) => {
                    body.visible = showBody; building.visible = showBuilding;
                    d.worldScene.meshBatchManager.updateMeshes(); d.renderer.render();
                    const bytes = new Uint8Array(80 * 96 * 4);
                    gl.readPixels(left, bottom, 80, 96, gl.RGBA, gl.UNSIGNED_BYTE, bytes); return bytes;
                };
                const different = (a,b) => {
                    let count=0; for(let i=0;i<a.length;i+=4) if(Math.max(...[0,1,2].map(k=>Math.abs(a[i+k]-b[i+k])))>1)count++;
                    return count;
                };
                try {
                    const normal=read(true,true), noUnit=read(false,true), noBuilding=read(true,false), neither=read(false,false);
                    return { tick:d.game.currentTick, unitTile:[u.tile.rx,u.tile.ry], yardTile:[yard.tile.rx,yard.tile.ry],
                        visibleBodyPixels:different(normal,noUnit), unobstructedBodyPixels:different(noBuilding,neither),
                        screen:[cx,cy], glError:gl.getError(), method:'Synchronous actual-scene body contribution with occluder visible/hidden; all visibility restored; no simulation mutation' };
                } finally {
                    [body.visible,building.visible]=saved;d.worldScene.meshBatchManager.updateMeshes();d.renderer.render();
                }
            });
            result.occlusion.push(probe);
            await page.screenshot({ path: `${output}/occlusion-${result.occlusion.length}.png` });
            if (probe.unobstructedBodyPixels > probe.visibleBodyPixels && probe.unobstructedBodyPixels > 0) break;
        }
        assert(result.occlusion.some(p => p.unobstructedBodyPixels > p.visibleBodyPixels && p.unobstructedBodyPixels > 0), 'Building occlusion not reproduced');
    }
    if (check4k) result.renderResolution = await checkRenderResolutionMatch(page, output);
    result.disposal = await page.evaluate(async () => {
        const d=window.__ra2debug, renderer=d.renderer.renderer;
        const r=d.renderableManager.getRenderableByGameObject(window.__m11Units[0]);
        const textures=r.shpRenderable.builder.hdOverride?.pages.flatMap(p=>[p.base,p.data])??[];
        const before=textures.filter(t=>!!renderer.properties.get(t).__webglTexture).length;
        await d.gameScreen.onLeave();
        return { allocatedBefore:before, released:textures.every(t=>!renderer.properties.get(t).__webglTexture), remainingGame:!!d.game };
    });
    assert(result.disposal.released && !result.disposal.remainingGame, 'HD textures retained after match teardown');
    assert.deepEqual(result.errors, []); assert.deepEqual(result.external, []);
    const unexpectedConsoleErrors = result.consoleErrors.filter(message => !(process.env.M11_REJECT_4X === '1' && message.includes('404')));
    assert.deepEqual(unexpectedConsoleErrors, []);
    result.status = 'PASS_BOUNDED_GAMEPLAY';
} catch (error) {
    result.failure = error.stack;
    await browser.contexts()[0]?.pages()[0]?.screenshot({ path: `${output}/failure.png` }).catch(() => {});
    process.exitCode = 1;
} finally {
    await fs.writeFile(`${output}/result.json`, JSON.stringify(result, null, 2) + '\n');
    await browser.close();
}
console.log(JSON.stringify({ status: result.status, initial: result.initial, geometry: result.geometry,
    traceCount: result.trace?.length, failure: result.failure, errors: result.errors, consoleErrors: result.consoleErrors }));
