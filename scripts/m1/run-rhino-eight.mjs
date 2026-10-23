import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { installDisplayProbe } from './display-review-probe.mjs';

export async function runRhinoEight(page, output) {
    await fs.mkdir(output, { recursive: false });
    const result = { status: 'FAIL', rows: [] };
    try {
        await page.addScriptTag({ url: '/rhino-eight/adapter.js' });
        result.synthetic = await page.evaluate(() => window.__m13eModule.syntheticProof());
        await page.evaluate(installDisplayProbe);
        result.fixture = await page.evaluate(() => {
            const d = window.__ra2debug, plant = window.__m12Plant;
            const rule = d.game.rules.getObject('HTNK', 7), created = [];
            for (let dx = 3; dx <= 7 && created.length < 2; dx++) for (let dy = -3; dy <= 4 && created.length < 2; dy++) {
                const tile = d.game.map.tiles.getByMapCoords(plant.tile.rx + dx, plant.tile.ry + dy);
                if (!tile || d.game.map.tileOccupation.getObjectsOnTile(tile).length
                    || d.game.map.terrain.getPassableSpeed(tile, rule.speedType, true, false) <= 0) continue;
                if (!created.length) {
                    const route = [0,1,2].flatMap(x => [0,-1,-2].map(y => d.game.map.tiles.getByMapCoords(tile.rx+x,tile.ry+y)));
                    if (route.some(t => !t || t.rampType || t.z !== tile.z || d.game.map.tileOccupation.getObjectsOnTile(t).length
                        || d.game.map.terrain.getPassableSpeed(t,rule.speedType,true,false)<=0)) continue;
                } else if (tile.rx >= created[0].tile.rx && tile.rx <= created[0].tile.rx+2
                    && tile.ry >= created[0].tile.ry-2 && tile.ry <= created[0].tile.ry) continue;
                const unit = d.game.createUnitForPlayer(rule, d.localPlayer); d.game.spawnObject(unit, tile); created.push(unit);
            }
            if (created.length !== 2) throw Error('Cannot place two Rhino fixtures');
            window.__m13eUnits = created;
            d.unitSelection.deselectAll();
            return created.map(u => ({ id: u.id, tile: [u.tile.rx, u.tile.ry], owner: u.owner.color }));
        });
        await page.waitForTimeout(600);
        result.install = await page.evaluate(async () => {
            const d = window.__ra2debug, m = window.__m13eModule;
            d.gameScreen.gameAnimationLoop.stop();
            const resources = await m.PartResources.load();
            const proofs = window.__m13eUnits.map(u => {
                u.direction = 0; u.turretTrait.facing = 0;
                const r = d.renderableManager.getRenderableByGameObject(u); r.updateVxlRotation(0, true);
                return new m.RhinoPartsProof(r, resources, d.worldScene.camera);
            });
            const p = window.__m13e = { proofs, resources, mode: 'original' };
            p.refresh = () => {
                proofs.forEach(a => a.update()); d.worldScene.scene.updateMatrixWorld(true);
                d.worldScene.meshBatchManager.updateMeshes(); d.worldScene.meshBatchManager.processRenderQueue();
                d.worldScene.scene.updateMatrixWorld(true); d.renderer.render();
            };
            p.modeSet = mode => {
                p.mode = mode;
                proofs.forEach(a => { a.background = mode === 'background'; a.setEnabled(mode === 'candidate'); }); p.refresh();
            };
            p.pose = (body, turret) => {
                proofs.forEach(a => { const u = a.renderable.gameObject; u.direction = body; u.turretTrait.facing = turret;
                    a.renderable.updateVxlRotation(body, true); }); p.refresh();
            };
            p.bounds = mesh => {
                const v = d.worldScene.viewport, points = []; mesh.updateWorldMatrix(true, false);
                for (let i = 0; i < mesh.geometry.attributes.position.count; i++) {
                    const point = d.worldScene.camera.position.clone().fromBufferAttribute(mesh.geometry.attributes.position, i)
                        .applyMatrix4(mesh.matrixWorld).project(d.worldScene.camera);
                    points.push([v.x + (point.x + 1) * v.width / 2, v.y + (1 - point.y) * v.height / 2]);
                }
                return [Math.min(...points.map(p => p[0])), Math.min(...points.map(p => p[1])),
                    Math.max(...points.map(p => p[0])), Math.max(...points.map(p => p[1]))];
            };
            proofs[1].renderable.get3DObject().visible = false; p.refresh();
            return { registration: m.registration, pivot: proofs[0].initialPivot.toArray(),
                owner: proofs[0].ownerColor, parts: [...resources.parts.keys()],
                shadow: 'Original live body/turret/barrel VXL shadows; no sprite casts. Approximate silhouette.',
                depth: 'Ground-clamped folded planes, turret shifted 0.5 world units along view axis; unchanged projection.',
                remap: 'Fixed reference owner only. Unsupported owner/color uses complete original.' };
        });
        async function capture(body, turret, preset, historical = false) {
            const rows = await page.evaluate(({ body, turret, preset, historical }) => {
                const d = window.__ra2debug, p = window.__m13e, camera = d.worldScene.camera, zoom = camera.zoom;
                if (historical) { camera.zoom *= 5 / 3; camera.updateProjectionMatrix(); }
                p.pose(body, turret);
                const rows = [];
                try {
                    for (const mode of ['original', 'background', 'candidate', 'restored']) {
                        p.modeSet(mode === 'restored' ? 'original' : mode);
                        const draws = [], shadows = [], restore = [];
                        for (const [idx, a] of p.proofs.entries()) {
                            for (const [key, l] of a.layers) for (const mesh of [l.proxy, l.batch, ...l.batch.children]) {
                                restore.push([mesh, 'onBeforeRender', mesh.onBeforeRender]);
                                mesh.onBeforeRender = (renderer, scene, camera, geometry, mat) => draws.push({ idx, key,
                                    name: mesh.name, depthTest: mat.depthTest, depthWrite: mat.depthWrite,
                                    colorWrite: mat.colorWrite, pass: mat.uniforms.hdPass.value, filtered: mat.uniforms.hdFiltering.value });
                            }
                            a.originalMeshes.forEach((mesh, section) => {
                                restore.push([mesh, 'onBeforeShadow', mesh.onBeforeShadow]);
                                mesh.onBeforeShadow = () => shadows.push([idx, section]);
                            });
                        }
                        let row;
                        try { row = window.__m14.capture(preset, true); }
                        finally { restore.forEach(([m, key, fn]) => m[key] = fn); }
                        row.mode = mode; row.body = body; row.turret = turret; row.historical = historical;
                        row.rhinoDraws = draws; row.shadowDraws = shadows;
                        row.rhinoBounds = p.proofs.map(a => p.bounds(a.layers.get(`body-${body}`).batch));
                        row.active = p.proofs.map(a => a.active); row.pivotDelta = p.proofs[0].pivot.toArray();
                        row.originalColorWrites = p.proofs.map(a => a.originalMeshes.map(m => m.material.colorWrite));
                        row.transforms = p.proofs.map(a => a.originalMeshes.map(m => Array.from(m.matrixWorld.elements)));
                        rows.push(row);
                    }
                } finally { camera.zoom = zoom; camera.updateProjectionMatrix(); p.modeSet('original'); }
                return rows;
            }, { body, turret, preset, historical });
            const name = `b${body}-t${turret}-${historical ? 'historical' : 'standard'}-${preset}`;
            assert.equal(rows[0].png, rows[3].png, 'Original byte-exact restoration');
            assert.deepEqual(rows[0].transforms, rows[2].transforms, 'Native transforms unchanged by candidate');
            assert.deepEqual(rows[0].shadowDraws, rows[2].shadowDraws, 'Same original shadow sections');
            assert(rows[2].active.every(Boolean));
            assert(rows[2].originalColorWrites.flat().every(v => !v));
            assert.deepEqual([...new Set(rows[2].rhinoDraws.map(r => r.key))].sort(), [`body-${body}`, `turret-${turret}`].sort());
            assert(rows[2].rhinoDraws.every(d => d.depthTest && d.filtered));
            assert(rows[2].rhinoDraws.some(d => d.pass === 2 && !d.depthWrite));
            for (const row of rows) {
                assert.equal(row.logical[1], 900); assert.equal(row.glError, 0); assert.equal(row.tick, rows[0].tick);
                assert.deepEqual(row.camera, rows[0].camera); assert.deepEqual(row.ui, rows[0].ui);
                row.file = `${name}-${row.mode}.png`;
                await fs.writeFile(`${output}/${row.file}`, Buffer.from(row.png.split(',')[1], 'base64')); delete row.png;
            }
            result.rows.push({ name, rows });
        }
        if (process.env.M14_PLAY !== '1') {
            for (let body = 0; body < 360; body += 45) for (let turret = 0; turret < 360; turret += 45) await capture(body, turret, '1080p');
            for (let body = 0; body < 360; body += 45) for (const turret of [body, (body + 90) % 360]) await capture(body, turret, '4k');
            result.checks = await technicalChecks(page, output);
            result.depth = await depthChecks(page, output);
            result.interaction = await interactionChecks(page);
            result.motion = await motionChecks(page, output);
        }
        if (process.env.M14_PLAY === '1') {
            await enableUI(page);
            console.log('Eight-heading Rhino fixture ready: A original / R parts. Independent Body and Turret buttons.');
            if (process.env.M13E_SMOKE === '1') {
                await page.getByRole('button', { name: 'Body 315', exact: true }).click();
                await page.getByRole('button', { name: 'Turret 135', exact: true }).click();
                await page.getByRole('button', { name: 'R parts', exact: true }).click();
                assert.deepEqual(await page.evaluate(() => {
                    const a = window.__m13e.proofs[0]; return [a.renderable.gameObject.direction, a.renderable.gameObject.turretTrait.facing, a.active];
                }), [315, 135, true]);
                await page.getByRole('button', { name: 'Move nearby', exact: true }).click();
                await page.waitForFunction(() => window.__m13e.proofs[0].renderable.gameObject.isMoving && window.__m13e.proofs[0].active);
                await page.getByRole('button', { name: 'Run / pause', exact: true }).click();
                result.visibleControls = 'PASS_BODY_315_TURRET_135_AND_NATIVE_MOVEMENT';
                await page.screenshot({ path: `${output}/visible-smoke.png` });
            } else await new Promise(resolve => { process.once('SIGINT', resolve); process.once('SIGTERM', resolve); page.once('close', resolve); });
        }
        if (!page.isClosed()) {
            result.disposal = await page.evaluate(() => {
                const d = window.__ra2debug, p = window.__m13e;
                p.proofs.forEach(a => a.dispose()); p.refresh();
                return { refs: [...p.resources.parts.values()].map(r => r.refs),
                    released: [...p.resources.parts.values()].every(r => [r.texture,r.remap,r.palette].every(t => !d.renderer.renderer.properties.get(t).__webglTexture)),
                    restored: p.proofs.every(a => a.originalMeshes.every((m, i) => m.material === a.originals[i])) };
            });
            assert(result.disposal.released && result.disposal.restored); assert(result.disposal.refs.every(v => v === 0));
        }
        result.status = process.env.M14_PLAY === '1' ? 'EIGHT_HEADING_INTERACTIVE_READY_VISUAL_REVIEW_PENDING'
            : 'EIGHT_HEADING_RUNTIME_PASS_VISUAL_REVIEW_PENDING';
    } catch (error) { result.failure = error.stack; throw error; }
    finally { await fs.writeFile(`${output}/result.json`, JSON.stringify(result, null, 2) + '\n'); }
    return { status: result.status, output, checks: result.checks, disposal: result.disposal };
}

async function technicalChecks(page, output) {
    const result = await page.evaluate(async () => {
        const d = window.__ra2debug, p = window.__m13e, a = p.proofs[0], u = a.renderable.gameObject, checks = [];
        const check = (name, ok) => { if (!ok) throw Error(name); checks.push({ name, status: 'PASS' }); };
        p.pose(0, 0); p.modeSet('original'); const original = d.renderer.renderer.domElement.toDataURL();
        const fetch = window.fetch;
        for (const invalid of ['missing', 'corrupt']) {
            let rejected = false;
            window.fetch = async (...args) => String(args[0]).endsWith('/turret-315.png')
                ? new Response(invalid === 'missing' ? '' : 'bad', { status: invalid === 'missing' ? 404 : 200 }) : fetch(...args);
            try { await window.__m13eModule.PartResources.load(); } catch { rejected = true; }
            finally { window.fetch = fetch; }
            p.refresh(); check(`${invalid} part fails before any replacement`, rejected && original === d.renderer.renderer.domElement.toDataURL());
        }
        p.modeSet('candidate');
        const buffers = [...a.layers.values()].map(l => [l.batch.geometry, l.batch.children[0], l.resource.texture]);
        const unitState = () => JSON.stringify({ tile: [u.tile.rx,u.tile.ry], health: u.healthTrait.health, strength: u.rules.strength, speed: u.rules.speed, weapon: u.rules.primary });
        const initialState = unitState(), bodyMatrices = [], turretMatrices = [];
        const matrix = m => Array.from(m.matrixWorld.elements);
        for (let body = 0; body < 360; body += 45) for (let turret = 0; turret < 360; turret += 45) {
            p.pose(body,turret); check(`two world layers active at ${body}/${turret}`, a.active && [...a.layers.values()].filter(l => l.batch.visible).length === 2);
            bodyMatrices.push({body,turret,matrix:matrix(a.originalMeshes[0])});
            turretMatrices.push({body,turret,matrix:matrix(a.originalMeshes[1])});
            check('turret pivot remains registered', a.pivot.length() < 1e-6);
        }
        check('body transform independent of turret', bodyMatrices.every((v,i) => JSON.stringify(v.matrix) === JSON.stringify(bodyMatrices[Math.floor(i/8)*8].matrix)));
        check('turret world transform independent of body', turretMatrices.every((v,i) => v.matrix.every((x,j)=>Math.abs(x-turretMatrices[i%8].matrix[j])<1e-5)));
        for (let angle = 0; angle < 360; angle += 3) {
            p.pose(angle,(angle+73)%360);
            check(`continuous native facing remains active ${angle}`, a.active && [...a.layers.values()].filter(l=>l.batch.visible).length===2);
        }
        check('diagnostic pose switches preserve gameplay state', initialState === unitState());
        for (const [body,turret] of [[NaN,0],[0,NaN],[Infinity,0]]) {
            p.pose(body,turret); check(`whole-family unsupported pose ${body}/${turret}`, !a.active && a.originalMeshes.every((m,i)=>m.material === a.originals[i]));
        }
        p.pose(0,0);
        for (const key of ['isFiring','onBridge','isDestroyed']) {
            const desc = Object.getOwnPropertyDescriptor(u,key);
            Object.defineProperty(u,key,{configurable:true,value:true});
            p.refresh(); check(`whole-family ${key} fallback`, !a.active && a.originalMeshes.every((m,i)=>m.material === a.originals[i]));
            if(desc) Object.defineProperty(u,key,desc); else delete u[key];
        }
        const savedColor = a.owner.color; a.owner.color = 'diagnostic-unsupported-owner';
        p.refresh(); check('owner color fallback, no false red remap', !a.active);
        a.owner.color = savedColor;
        const visible = a.renderable.mainObj.visible; a.renderable.mainObj.visible = false; p.refresh();
        check('hidden entity hides both layers and proxies', [...a.layers.values()].every(l=>!l.batch.visible&&!l.proxy.visible));
        a.renderable.mainObj.visible = visible; p.refresh();
        for(let i=0;i<64;i++) p.pose(Math.floor(i/8)*45,(i%8)*45);
        check('pose switches reuse textures and shared buffers', [...a.layers.values()].every((l,i)=>l.batch.geometry===buffers[i][0]
            &&l.batch.children[0]===buffers[i][1]&&l.resource.texture===buffers[i][2]
            &&l.batch.geometry.attributes.position===l.batch.children[0].geometry.attributes.position));
        p.pose(0,0); p.modeSet('original'); check('exact original restoration after checks', original===d.renderer.renderer.domElement.toDataURL());
        p.modeSet('candidate');
        return { checks, bodyMatrices, turretMatrices, buffer: [d.renderer.renderer.domElement.width,d.renderer.renderer.domElement.height] };
    });
    await fs.writeFile(`${output}/checks.json`, JSON.stringify(result,null,2)+'\n'); return result;
}

async function depthChecks(page, output) {
    const data = await page.evaluate(() => {
        const d=window.__ra2debug,p=window.__m13e,a=p.proofs[0],b=p.proofs[1],u=a.renderable.gameObject;
        const plant=window.__m12Plant,building=d.renderableManager.getRenderableByGameObject(plant).get3DObject();
        const yardUnit=d.localPlayer.getOwnedObjects().find(u=>u.name==='GACNST');
        const yard=d.renderableManager.getRenderableByGameObject(yardUnit).get3DObject();
        const savedMap=u.position.getMapPosition(),saved=a.renderable.getPosition().clone(),savedB=b.renderable.getPosition().clone();
        const bRoot=b.renderable.get3DObject(),savedVisible=bRoot.visible;
        const canvas=d.renderer.renderer.domElement,gl=d.renderer.renderer.getContext(),rows=[],pngs=[];
        p.modeSet('candidate');d.generalOptions.graphics.renderResolution.value='4k';
        function read(pass,show,obstruct,occluder) {
            building.visible=yard.visible=true;bRoot.visible=occluder===bRoot;
            p.refresh();occluder.visible=obstruct;
            for(const layer of a.layers.values()) if(layer.batch.visible) {
                layer.proxy.visible=true;layer.batch.visible=show;
                layer.batch.material.uniforms.hdPass.value=pass==='edge'?0:1;
                layer.batch.children[0].visible=pass!=='opaque';
            }
            d.worldScene.meshBatchManager.updateMeshes();d.worldScene.meshBatchManager.processRenderQueue();
            d.worldScene.scene.updateMatrixWorld(true);d.renderer.render();
            const bounds=p.bounds(a.layers.get('body-0').batch),ratio=canvas.height/Number(canvas.dataset.logicalHeight);
            const x=Math.floor(bounds[0]*ratio)-8,top=Math.floor(bounds[1]*ratio)-8;
            const width=Math.ceil((bounds[2]-bounds[0])*ratio)+16,height=Math.ceil((bounds[3]-bounds[1])*ratio)+16;
            const pixels=new Uint8Array(width*height*4);gl.readPixels(x,canvas.height-top-height,width,height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
            return pixels;
        }
        function changed(a,b) {let n=0;for(let i=0;i<a.length;i+=4)if([0,1,2].some(c=>Math.abs(a[i+c]-b[i+c])>2))n++;return n;}
        function probe(name,body,turret,occluder) {
            const passes=['opaque','edge','both'].map(pass=>({pass,
                visible:changed(read(pass,true,true,occluder),read(pass,false,true,occluder)),
                unobstructed:changed(read(pass,true,false,occluder),read(pass,false,false,occluder))}));
            for(const layer of a.layers.values()){layer.batch.material.uniforms.hdPass.value=1;layer.batch.children[0].visible=true;}
            building.visible=yard.visible=true;bRoot.visible=occluder===bRoot;p.refresh();
            rows.push({name,body,turret,passes,glError:gl.getError()});
            pngs.push({name:`b${body}-t${turret}-${name}`,png:canvas.toDataURL()});
        }
        function move(tile) {u.position.moveToTileCoords(tile.rx+0.5,tile.ry+0.5);a.renderable.setPosition(u.position.worldPosition);}
        try {
            for(let body=0;body<360;body+=45)for(const turret of [body,(body+90)%360]) {
                p.pose(body,turret);u.position.moveToLeptons(savedMap);a.renderable.setPosition(saved);
                probe('open',body,turret,building);
                move(d.game.map.tiles.getByMapCoords(plant.tile.rx+1,plant.tile.ry-1));probe('plant-partial',body,turret,building);
                for(const [dx,dy] of [[0,0],[0,1],[1,1],[-1,-1]]) {
                    move(d.game.map.tiles.getByMapCoords(yardUnit.tile.rx+dx,yardUnit.tile.ry+dy));
                    probe(`yard-${dx}-${dy}`,body,turret,yard);
                }
                u.position.moveToLeptons(savedMap);a.renderable.setPosition(saved);
                b.renderable.setPosition(saved.clone().add({x:120,y:0,z:110}));probe('two-tanks',body,turret,bRoot);
            }
        } finally {
            u.position.moveToLeptons(savedMap);a.renderable.setPosition(saved);b.renderable.setPosition(savedB);bRoot.visible=savedVisible;
            building.visible=yard.visible=true;p.pose(0,0);p.modeSet('candidate');
        }
        return {rows,pngs,scope:'Rendering-only stress placement, native positions restored. Folded surfaces and live VXL shadow approximation.'};
    });
    for(const row of data.pngs)await fs.writeFile(`${output}/depth-${row.name}.png`,Buffer.from(row.png.split(',')[1],'base64'));
    delete data.pngs;
    data.status=data.rows.every(r=>r.glError===0)&&[0,45,90,135,180,225,270,315].every(b=>[b,(b+90)%360].every(t=>data.rows.some(r=>r.body===b&&r.turret===t&&r.name.startsWith('yard-')&&r.passes.every(p=>p.visible===0)&&r.passes[2].unobstructed>0)))
        &&data.rows.filter(r=>r.name==='two-tanks').every(r=>r.passes[2].visible>0&&r.passes[2].visible<r.passes[2].unobstructed)
        ?'PASS_BOUNDED_SIXTEEN_POSE_DEPTH':'DEPTH_REVIEW_REQUIRED';
    await fs.writeFile(`${output}/depth.json`,JSON.stringify(data,null,2)+'\n');
    assert.equal(data.status,'PASS_BOUNDED_SIXTEEN_POSE_DEPTH');return data;
}

async function enableUI(page) {
    await page.evaluate(() => {
        const d=window.__ra2debug,p=window.__m13e;
        p.pose(0,0);p.modeSet('candidate');d.generalOptions.graphics.renderResolution.value='native';
        const bar=document.createElement('div');bar.id='m13e-controls';
        bar.style.cssText='position:fixed;left:12px;bottom:12px;z-index:99999;background:#17212bee;color:white;padding:12px;font:15px system-ui;max-width:850px';
        const label=document.createElement('div');label.textContent='Rhino eight headings · standard 900 · red only · original default preserved';bar.append(label);
        const status=document.createElement('div');
        const update=()=>{const a=p.proofs[0],u=a.renderable.gameObject;status.textContent=`Body ${u.direction} / turret ${u.turretTrait.facing} · ${p.mode} · ${a.active?'parts active':'original'}`;};
        const button=(text,fn)=>{const b=document.createElement('button');b.textContent=text;b.style.cssText='margin:6px 6px 6px 0;padding:6px';b.onclick=()=>{fn();update();};bar.append(b);};
        button('A original',()=>p.modeSet('original'));button('R parts',()=>p.modeSet('candidate'));
        for(const h of [0,45,90,135,180,225,270,315])button(`Body ${h}`,()=>p.pose(h,p.proofs[0].renderable.gameObject.turretTrait.facing));
        for(const h of [0,45,90,135,180,225,270,315])button(`Turret ${h}`,()=>p.pose(p.proofs[0].renderable.gameObject.direction,h));
        for(const mode of ['both','body','turret'])button(`Show ${mode}`,()=>{p.proofs.forEach(a=>a.partView=mode);p.refresh();});
        button('Run / pause',()=>{p.running=!p.running;if(p.running)d.gameScreen.gameAnimationLoop.start();else d.gameScreen.gameAnimationLoop.stop();});
        button('Move nearby',()=>{const u=p.proofs[0].renderable.gameObject;for(const [dx,dy] of [[0,-2],[2,0],[0,2],[-2,0]]){const t=d.game.map.tiles.getByMapCoords(u.tile.rx+dx,u.tile.ry+dy);if(t&&!d.game.map.tileOccupation.getObjectsOnTile(t).length&&d.game.map.terrain.getPassableSpeed(t,u.rules.speedType,true,false)>0){d.actionsApi.orderUnits([u.id],0,t.rx,t.ry);p.running=true;d.gameScreen.gameAnimationLoop.start();break;}}});
        const note=document.createElement('div');note.textContent='Movement uses native commands. Eight discrete visual headings; static tracks. Firing, slopes and other colors use the original.';bar.append(note,status);document.body.append(bar);update();p.refresh();
    });
}

async function interactionChecks(page) {
    const result = await page.evaluate(() => {
        const d=window.__ra2debug,p=window.__m13e,a=p.proofs[0],camera=d.worldScene.camera;
        p.pose(0,0);p.modeSet('candidate');
        const position=camera.position.clone(),layer=a.layers.get('body-0'),before=p.bounds(layer.batch);
        camera.position.x+=80;camera.updateMatrixWorld();p.refresh();const moved=p.bounds(layer.batch);
        camera.position.copy(position);camera.updateMatrixWorld();p.refresh();
        if(JSON.stringify(before)===JSON.stringify(moved)||JSON.stringify(before)!==JSON.stringify(p.bounds(layer.batch)))throw Error('Pan registration');
        const programs=d.renderer.renderer.info.programs.length,times=[];
        for(let i=0;i<32;i++){const start=performance.now();p.refresh();d.renderer.renderer.getContext().finish();times.push(performance.now()-start);}
        if(programs!==d.renderer.renderer.info.programs.length)throw Error('Shader churn');
        times.sort((a,b)=>a-b);
        return {panning:'PASS',programsStable:true,medianMs:times[16],p95Ms:times[30],
            click:d.helpers.getOwnedUnitClickPointById(a.renderable.gameObject.id),
            textureBytes:16*(320*288*4+8),geometryBytesPerInstance:[...a.layers.values()].reduce((n,l)=>n+Object.values(l.batch.geometry.attributes).reduce((m,a)=>m+a.array.byteLength,l.batch.geometry.index.array.byteLength),0)};
    });
    await page.mouse.click(result.click.x,result.click.y);
    result.selection=await page.evaluate(()=>({ids:window.__ra2debug.helpers.getSelectedUnitIds(),expected:window.__m13e.proofs[0].renderable.gameObject.id}));
    assert(result.selection.ids.includes(result.selection.expected));
    const prior=page.viewportSize();
    if(prior){
        await page.setViewportSize({width:1440,height:900});await page.waitForTimeout(250);
        result.resize=await page.evaluate(()=>{const d=window.__ra2debug,p=window.__m13e;p.refresh();return {height:Number(d.renderer.renderer.domElement.dataset.logicalHeight),active:p.proofs[0].active,error:d.renderer.renderer.getContext().getError()};});
        assert.equal(result.resize.height,900);assert(result.resize.active);assert.equal(result.resize.error,0);
        await page.setViewportSize(prior);await page.waitForTimeout(250);
    }
    await page.evaluate(()=>{window.__ra2debug.unitSelection.deselectAll();window.__m13e.refresh();});return result;
}

async function motionChecks(page, output) {
    const start = await page.evaluate(() => {
        const d = window.__ra2debug, p = window.__m13e, a = p.proofs[0], u = a.renderable.gameObject;
        d.generalOptions.graphics.renderResolution.value = '1080p'; p.pose(0, 0); p.modeSet('candidate');
        const canvas = d.renderer.renderer.domElement, bounds = p.bounds(a.layers.get('body-0').batch);
        const ratio = canvas.height / Number(canvas.dataset.logicalHeight);
        const crop = document.createElement('canvas'); crop.width = 640; crop.height = 360;
        const ctx = crop.getContext('2d');
        const origin = [Math.round((bounds[0]+bounds[2])*ratio/2-320), Math.round((bounds[1]+bounds[3])*ratio/2-180)];
        const stream = crop.captureStream(15), recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9', videoBitsPerSecond: 6000000 });
        const chunks = [], samples = [];
        recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
        p.motion = { recorder, chunks, samples, stream, crop, origin, recording: true, start: performance.now() };
        let last = -1;
        const sample = () => {
            if (!p.motion.recording) return;
            ctx.drawImage(canvas, origin[0], origin[1], 640, 360, 0, 0, 640, 360);
            if (last !== d.game.currentTick) {
                last = d.game.currentTick;
                samples.push({ ms: performance.now()-p.motion.start, tick: last, active: a.active, moving: u.isMoving,
                    direction: u.direction, turret: u.turretTrait.facing, spinVelocity: u.spinVelocity, tile: [u.tile.rx,u.tile.ry],
                    position: a.renderable.getPosition().toArray(), parts: [...a.layers].filter(([,l])=>l.batch.visible).map(([key])=>key),
                    shadows: a.originalMeshes.map(m=>m.castShadow), glError: d.renderer.renderer.getContext().getError() });
            }
            requestAnimationFrame(sample);
        };
        recorder.start(); sample(); d.gameScreen.gameAnimationLoop.start();
        return { tile: [u.tile.rx,u.tile.ry], cropOrigin: origin, cropSize: [640,360], buffer: [canvas.width,canvas.height],
            css: [canvas.getBoundingClientRect().width,canvas.getBoundingClientRect().height], referenceHeight: Number(canvas.dataset.logicalHeight) };
    });
    const legs = [];
    try {
        for (const offset of [[0,-2],[2,-2],[2,0],[0,0]]) {
            const leg = await page.evaluate(({ start, offset }) => {
                const d=window.__ra2debug,p=window.__m13e,u=p.proofs[0].renderable.gameObject;
                const tile=d.game.map.tiles.getByMapCoords(start[0]+offset[0],start[1]+offset[1]);
                if(!tile || (d.game.map.tileOccupation.getObjectsOnTile(tile).filter(o=>o!==u).length)
                    || d.game.map.terrain.getPassableSpeed(tile,u.rules.speedType,true,false)<=0) throw Error('Motion destination unavailable');
                d.actionsApi.orderUnits([u.id],0,tile.rx,tile.ry);
                return { target:[tile.rx,tile.ry], issuedTick:d.game.currentTick };
            }, { start:start.tile,offset });
            await page.waitForFunction(({ target, issuedTick }) => {
                const d=window.__ra2debug,u=window.__m13e.proofs[0].renderable.gameObject;
                return d.game.currentTick>issuedTick+3 && u.tile.rx===target[0] && u.tile.ry===target[1] && !u.isMoving;
            }, leg, { timeout: 20000 });
            legs.push(leg); await page.waitForTimeout(350);
        }
    } finally {
        const motion = await page.evaluate(async () => {
            const d=window.__ra2debug,p=window.__m13e,m=p.motion;
            d.gameScreen.gameAnimationLoop.stop();m.recording=false;
            await new Promise(resolve=>{m.recorder.onstop=resolve;m.recorder.stop();});m.stream.getTracks().forEach(t=>t.stop());
            const blob=new Blob(m.chunks,{type:'video/webm'});
            const video=await new Promise(resolve=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.readAsDataURL(blob);});
            return { samples:m.samples,video,durationMs:performance.now()-m.start };
        });
        await fs.writeFile(`${output}/motion-native.webm`,Buffer.from(motion.video.split(',')[1],'base64'));delete motion.video;
        Object.assign(start,motion,{legs});
        await fs.writeFile(`${output}/motion.json`,JSON.stringify(start,null,2)+'\n');
    }
    const moving=start.samples.filter(s=>s.moving);
    assert(moving.length>8);
    assert(start.samples.every(s=>s.active&&s.parts.length===2&&s.glError===0), 'Every sampled frame stays HD, including in-place turns and stops');
    assert(start.samples.some(s=>s.spinVelocity!==0), 'Native turning velocity sampled');
    assert(start.samples.some(s=>s.direction%45!==0),'Native intermediate facing sampled');
    assert(new Set(start.samples.map(s=>s.parts[0])).size>=7,'Actual movement and turns span the authored body headings');
    assert(moving.every(s=>s.shadows.every(Boolean)));
    start.status='PASS_FOUR_NATIVE_MOVE_COMMANDS';
    await fs.writeFile(`${output}/motion.json`,JSON.stringify(start,null,2)+'\n');return start;
}
