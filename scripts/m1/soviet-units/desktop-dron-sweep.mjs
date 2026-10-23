import { _electron as electron } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const artifact = JSON.parse(await fs.readFile(process.argv[2], 'utf8'));
const output = path.resolve(process.argv[3]);
const identity = process.argv[4] ?? 'DRON';
assert.ok(['DRON', 'DOG'].includes(identity));
const bodyFrames = identity === 'DRON' ? 88 : 172;
await fs.mkdir(output, { recursive: false });
const profile = path.join(output, 'profile');
await fs.mkdir(profile);
await fs.writeFile(path.join(profile, 'resource-registration.json'), JSON.stringify({ schemaVersion: 1, directory: path.resolve('.local') }));
const report = { status: 'RUNNING', app: artifact.artifact, errors: [], stages: [], disclosure: 'Controlled flat-ground actor placement, paused native-frame sweep and owner transfer. This is rendering and lifecycle evidence, not ordinary production or naturally executed animation.' };
const save = async () => fs.writeFile(path.join(output, 'result.json'), JSON.stringify(report, null, 2) + '\n');
const stage = async (name, data) => { report.stages.push({ name, data }); await save(); console.log(name, JSON.stringify(data ?? '')); };
const app = await electron.launch({ executablePath: artifact.executable, cwd: '/private/tmp', env: { ...process.env, RA2_DESKTOP_USER_DATA: profile, RA2_DESKTOP_NO_DISCOVERY: '1' }, timeout: 60000 });
try {
    const page = await app.firstWindow();
    await page.evaluate(identity => window.__limboIdentity = identity, identity);
    page.on('pageerror', error => report.errors.push(error.stack));
    await page.getByText('Offline Skirmish', { exact: true }).waitFor({ timeout: 90000 });
    await page.evaluate(() => {
        const g = window.__ra2debug.generalOptions.graphics;
        for (const key of ['conscript', 'powerPlant', 'napowr', 'nahand', 'narefn', 'naweap', 'nacnst', 'rhino', 'sovietUnits']) g[`${key}Hd`].value = true;
        g.renderResolution.value = '1080p';
        Object.entries({ _r_lastMap: 'MP01T4.map', _r_lastMode: '1', _r_lastCountry: '5', _r_lastColor: '1', _r_lastStartPos: '0', _r_lastTeam: '0', _r_hostOpts: '6;10000;0;1;1;0;1;0;;0;1;0;0', _r_lastBots: JSON.stringify([null, null, null, { d: 4, c: 5, co: 2, s: 3, t: 1 }, null, null, null, null]) }).forEach(([k, v]) => localStorage.setItem(k, v));
    });
    await page.getByText('Offline Skirmish', { exact: true }).click();
    await page.waitForFunction(() => window.__ra2debug?.skirmishLobby);
    await page.evaluate(() => window.__ra2debug.skirmishLobby.startGame(1700000000000));
    await page.waitForFunction(() => window.__ra2debug?.game?.status === 1, undefined, { timeout: 90000 });
    report.selection = await page.evaluate(() => {
        const d = window.__ra2debug;
        return { units: d.sovietUnitsHd, conscript: d.conscriptHd, powerPlant: d.powerPlantHd, napowr: d.napowrHd, buildings: d.sovietBuildingsHd, rhino: d.rhinoHd };
    });
    assert.equal(report.selection.units.families[identity].status, 'NOT_REQUESTED');
    await stage('combined-selection', report.selection);
    report.setup = await page.evaluate(async () => {
        const d = window.__ra2debug, g = d.game, rule = g.rules.getObject(window.__limboIdentity, window.__limboIdentity === 'DRON' ? 7 : 3);
        const yard = d.localPlayer.getOwnedObjects().find(u => /MCV$/.test(u.name));
        const tiles = g.map.tiles.getAll().filter(t => !t.rampType && g.map.mapBounds.isWithinBounds(t)
            && g.map.terrain.getPassableSpeed(t, rule.speedType, true, false) > 0
            && !g.map.tileOccupation.getObjectsOnTile(t).some(o => o.isTechno() || o.isTerrain()));
        tiles.sort((a, b) => Math.abs(Math.hypot(a.rx-yard.tile.rx, a.ry-yard.tile.ry)-8) - Math.abs(Math.hypot(b.rx-yard.tile.rx, b.ry-yard.tile.ry)-8));
        const u = g.createUnitForPlayer(rule, d.localPlayer); g.spawnObject(u, tiles[0]);
        g.mapShroudTrait.revealMap(d.localPlayer, g); d.worldInteraction.minimapHandler.panToTile(u.tile);
        window.__sweepUnit = u;
        return { id: u.id, tile: [u.tile.rx,u.tile.ry], disclosure: 'Fixture spawn; game rules unchanged.' };
    });
    await page.waitForFunction(() => window.__ra2debug.renderableManager.getRenderableByGameObject(window.__sweepUnit)?.shpRenderable?.builder?.hdOverride, undefined, { timeout: 30000 });
    report.selection.units = await page.evaluate(() => window.__ra2debug.sovietUnitsHd);
    report.geometry = await page.evaluate(() => {
        const d = window.__ra2debug, u = window.__sweepUnit;
        d.gameScreen.gameAnimationLoop.stop();
        const r = d.renderableManager.getRenderableByGameObject(u), hd = r.shpRenderable, b = hd.builder;
        const original = hd.constructor.factory(b.shpFile,b.palette,b.camera,b.offset,r.objectArt.hasShadow);
        original.setBatched(b.useMeshBatching); if (b.useMeshBatching) original.setBatchPalettes(r.paletteRemaps); original.setSmoothCoverage(b.smoothCoverage); original.create3DObject();
        const ho = hd.get3DObject(), oo = original.get3DObject();
        oo.matrix.copy(ho.matrix); oo.matrixWorld.copy(ho.matrixWorld); oo.position.copy(ho.position); oo.quaternion.copy(ho.quaternion); oo.scale.copy(ho.scale);
        ho.parent.add(oo); oo.visible=false;
        window.__sweep = { r, hd, original, tick:d.game.currentTick, renderer:d.renderer.renderer,
            textures:[...d.worldView.sovietUnitsHd.families.values()].flatMap(f=>[...f.members.values()].flatMap(m=>m.override.pages.flatMap(p=>[p.base,p.data]))),
            owners:[d.localPlayer,d.game.getCombatants().find(p=>p!==d.localPlayer)] };
        window.__flush = () => { d.worldScene.scene.updateMatrixWorld(true); d.worldScene.meshBatchManager.updateMeshes(); d.worldScene.meshBatchManager.processRenderQueue(); d.renderer.render(); };
        window.__capture = (role,frame,opacity=1) => {
            const {hd,original}=window.__sweep,ho=hd.get3DObject(),oo=original.get3DObject();
            hd.setFrame(frame); original.setFrame(frame);
            hd.setOpacity(opacity); original.setOpacity(opacity);
            ho.visible=role==='hd'; oo.visible=role==='original'; window.__flush();
            const active=role==='hd'?hd:original, mesh=active.getShapeMesh(), ab=active.builder;
            const canvas=d.renderer.renderer.domElement, rect=canvas.getBoundingClientRect(), vp=d.worldScene.viewport;
            const factor=canvas.height/d.renderer.height;
            const p=ho.getWorldPosition(new window.THREE.Vector3()).project(d.worldScene.camera);
            const cx=(vp.x+(p.x+1)*vp.width/2)*factor, cy=(vp.y+(1-p.y)*vp.height/2)*factor;
            const crop={x:Math.round(cx)-90,y:Math.round(cy)-110,width:180,height:180};
            const cut=document.createElement('canvas');cut.width=crop.width;cut.height=crop.height;
            cut.getContext('2d').drawImage(canvas,crop.x,crop.y,crop.width,crop.height,0,0,crop.width,crop.height);
            const page=ab.getHdPage(), shadow=active.getShadowMesh();
            return { image:cut.toDataURL('image/png'), frame,tick:d.game.currentTick,role,opacity,crop,
                hd:!!ab.hdOverride,material:mesh.material.type,identity:ab.hdOverride?.identity,
                boundBase:page?mesh.material.map===page.base:mesh.material.map===ab.atlas.getTexture(),
                boundRemap:page?mesh.material.uniforms.remapMap.value===page.data:undefined,
                positions:Array.from(mesh.geometry.attributes.position.array),world:mesh.matrixWorld.toArray(),
                shadow:{visible:shadow?.visible,positions:Array.from(shadow?.geometry.attributes.position.array??[]),world:shadow?.matrixWorld.toArray()},
                gl:d.renderer.renderer.getContext().getError(),viewport:vp,buffer:[canvas.width,canvas.height],css:[rect.width,rect.height],dpr:devicePixelRatio,
                camera:{zoom:d.worldScene.camera.zoom,projection:d.worldScene.camera.projectionMatrix.toArray()} };
        };
        return { originalHasHd:!!original.builder.hdOverride, hdHasHd:!!b.hdOverride, source:b.shpFile.filename, frameCount:hd.frameCount };
    });
    assert.equal(report.geometry.originalHasHd,false); assert.equal(report.geometry.hdHasHd,true);
    report.frames=[];
    for (const owner of [0,1]) {
        await page.evaluate(owner => {
            const d=window.__ra2debug,s=window.__sweep;
            d.game.changeObjectOwner(window.__sweepUnit,s.owners[owner]);
            s.r.update(0,0); s.original.setPalette(s.r.palette);
            s.original.setExtraLight(s.hd.builder.extraLight);
        },owner);
        for (let frame=0;frame<bodyFrames;frame++) {
            const pair=[];
            for (const role of ['original','hd']) {
                const row=await page.evaluate(({role,frame})=>window.__capture(role,frame),{role,frame});
                const filename=`owner-${owner}-${String(frame).padStart(3,'0')}-${role}.png`;
                await fs.writeFile(path.join(output,filename),Buffer.from(row.image.split(',')[1],'base64'));
                delete row.image;row.file=filename;row.owner=owner;pair.push(row);report.frames.push(row);
                assert(row.boundBase&&row.gl===0);if(role==='hd') assert(row.boundRemap);
            }
            assert.deepEqual(pair[0].positions,pair[1].positions,'logical geometry changed');
            assert.deepEqual(pair[0].world,pair[1].world,'world transform changed');
            assert.deepEqual(pair[0].shadow,pair[1].shadow,'native shadow changed');
            assert.equal(pair[0].tick,pair[1].tick);
        }
        await stage('owner-frame-sweep',{owner,frames:bodyFrames,geometry:'IDENTICAL',shadows:'IDENTICAL'});
    }
    // A synthetic projectile frame sweep shares the actor location but uses its own source and native offset.
    report.projectileSweep = await page.evaluate(() => {
        const d=window.__ra2debug,s=window.__sweep,member=d.worldView.sovietUnitsHd.families.get(window.__limboIdentity).members.get(window.__limboIdentity.toLowerCase() + 'p.shp');
        s.bodyHd=s.hd;s.bodyOriginal=s.original;
        s.hd.get3DObject().visible=false;s.original.get3DObject().visible=false;
        const parts=[];
        for (const role of ['original','hd']) {
            const p=s.hd.constructor.factory(member.image,s.r.palette,s.hd.builder.camera,{x:0,y:0},false);
            if(role==='hd')p.setHdOverride(member.override);
            p.setBatched(s.hd.builder.useMeshBatching);
            if(s.hd.builder.useMeshBatching)p.setBatchPalettes(s.r.paletteRemaps);
            p.setExtraLight(s.hd.builder.extraLight);p.create3DObject();
            s.hd.get3DObject().parent.add(p.get3DObject());parts.push(p);
        }
        [s.original,s.hd]=parts;
        return {disclosure:'Paused projectile source sweep, not the flight path. Projectile has no native shadow.',source:member.image.filename};
    });
    report.projectileFrames=[];
    for (const owner of [0,1]) {
        await page.evaluate(owner=>{
            const d=window.__ra2debug,s=window.__sweep;d.game.changeObjectOwner(window.__sweepUnit,s.owners[owner]);s.r.update(0,0);
            s.hd.setPalette(s.r.palette);s.original.setPalette(s.r.palette);
        },owner);
        for(let frame=0;frame<32;frame++) {
            const pair=[];
            for(const role of ['original','hd']) {
                const row=await page.evaluate(({role,frame})=>window.__capture(role,frame),{role,frame});
                const filename=`leap-owner-${owner}-${String(frame).padStart(3,'0')}-${role}.png`;
                await fs.writeFile(path.join(output,filename),Buffer.from(row.image.split(',')[1],'base64'));
                delete row.image;row.file=filename;row.owner=owner;pair.push(row);report.projectileFrames.push(row);
                assert(row.boundBase&&row.gl===0);if(role==='hd')assert(row.boundRemap);
            }
            assert.deepEqual(pair[0].positions,pair[1].positions);assert.deepEqual(pair[0].world,pair[1].world);
        }
    }
    await stage('projectile-bearings',{frames:32,owners:2,geometry:'IDENTICAL'});
    await page.evaluate(()=>{
        const s=window.__sweep;
        for(const p of [s.hd,s.original]){p.get3DObject().removeFromParent();p.dispose();}
        s.hd=s.bodyHd;s.original=s.bodyOriginal;
    });
    report.opacity=[];
    for (const opacity of [1,0.5,0,1]) {
        const row=await page.evaluate(opacity=>window.__capture('hd',48,opacity),opacity);
        const filename=`opacity-${report.opacity.length}.png`;
        await fs.writeFile(path.join(output,filename),Buffer.from(row.image.split(',')[1],'base64'));
        delete row.image;row.file=filename;report.opacity.push(row);
    }
    await page.screenshot({path:path.join(output,'context.png')});
    await page.evaluate(() => {
        const s=window.__sweep;s.original.get3DObject().removeFromParent();s.original.dispose();
        s.hd.get3DObject().visible=true;s.hd.setOpacity(1);
        window.__ra2debug.gameScreen.gameAnimationLoop.start();
    });
    const abort=await page.evaluate(()=>{const d=window.__ra2debug;d.gameScreen.menu.open();return d.gameScreen.strings.get('GUI:AbortMission');});
    await page.getByText(abort,{exact:true}).click();
    await page.getByText(await page.evaluate(()=>window.__ra2debug.gameScreen.strings.get('GUI:Quit')),{exact:true}).click();
    await page.waitForFunction(()=>!window.__ra2debug.game,undefined,{timeout:45000});
    report.cleanup=await page.evaluate(()=>{
        const s=window.__sweep;
        return {gameCleared:!window.__ra2debug.game,unitTextureCount:s.textures.length,
            texturesReleased:s.textures.every(t=>!s.renderer.properties.get(t).__webglTexture),memory:s.renderer.info.memory};
    });
    assert(report.cleanup.texturesReleased);
    report.status='PASS_PAUSED_COMPLETE_BODY_AND_LIMBO_TWO_OWNER_GEOMETRY_SHADOW_AND_TEARDOWN';
    report.identity=identity; report.uniqueFrames=bodyFrames+32;
} catch(error) {report.status='FAIL';report.failure=error.stack;console.error(error);process.exitCode=1;}
finally {await save();await app.close();}
