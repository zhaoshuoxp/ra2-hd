// Original-only render fixtures; never part of the application payload or production proof.
import { _electron as electron } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve('.artifacts/soviet-remaining/turret-references-v3');
await fs.mkdir(root,{recursive:false});
const profile=path.join(root,'profile');await fs.mkdir(profile);
await fs.writeFile(path.join(profile,'resource-registration.json'),JSON.stringify({schemaVersion:1,directory:path.resolve('.local')}));
const artifact=JSON.parse(await fs.readFile(process.argv[2],'utf8'));
const report={status:'RUNNING',scope:'Explicit Original-only review fixtures; not native production or gameplay validation',errors:[],families:{}};
const app=await electron.launch({executablePath:artifact.executable,cwd:'/private/tmp',env:{...process.env,RA2_DESKTOP_USER_DATA:profile},timeout:60000});
try {
 const page=await app.firstWindow();page.on('pageerror',e=>report.errors.push(e.stack));
 await page.getByText('Offline Skirmish',{exact:true}).waitFor({timeout:90000});
 await page.evaluate(()=>{window.__ra2debug.generalOptions.graphics.hdEnabled.value=false;Object.entries({_r_lastMap:'MP01T4.map',_r_lastMode:'1',_r_lastCountry:'5',_r_lastColor:'1',_r_lastStartPos:'0',_r_lastTeam:'0',_r_hostOpts:'6;10000;0;1;1;0;1;0;;0;1;0;0',_r_lastBots:JSON.stringify([null,null,null,{d:4,c:5,co:2,s:3,t:1},null,null,null,null])}).forEach(([k,v])=>localStorage.setItem(k,v));});
 await page.getByText('Offline Skirmish',{exact:true}).click();await page.waitForFunction(()=>window.__ra2debug?.skirmishLobby);
 await page.evaluate(()=>{window.__ra2debug.generalOptions.graphics.renderResolution.value='4k';window.__ra2debug.skirmishLobby.startGame(1700000000000);});
 await page.waitForFunction(()=>window.__ra2debug?.game?.status===1,undefined,{timeout:90000});
 for (const [index,id] of ['NALASR','NAFLAK'].entries()) {
  await page.evaluate(({id,index})=>{const d=window.__ra2debug,mcv=d.localPlayer.getOwnedObjects().find(u=>u.name==='SMCV');const tile=d.game.map.tiles.getByMapCoords(mcv.tile.rx-4-index*3,mcv.tile.ry-4);const unit=d.game.createObject(2,id);d.game.changeObjectOwner(unit,d.localPlayer);d.game.spawnObject(unit,tile);window.__turretFixture=unit;d.worldInteraction.minimapHandler.panToTile(tile);}, {id,index});
  await page.waitForTimeout(1500);
  const captures=await page.evaluate(()=>{
   const d=window.__ra2debug,unit=window.__turretFixture,r=d.renderableManager.getRenderableByGameObject(unit),world=d.worldScene,gl=d.renderer.renderer;
   d.gameScreen.gameAnimationLoop.stop();d.gameScreen.pointer.unlock();
   const all=[];world.scene.traverse(o=>{if(o.isMesh)all.push([o,o.visible]);});
   const own=new Set();r.get3DObject().traverse(o=>{if(o.isMesh)own.add(o);});
   if(!r.turretRot)throw Error('Missing native turret');
   const originalRotation=r.turretRot.rotation.clone(),background=world.scene.background,clear=gl.getClearColor(world.ambientLight.color.clone()),alpha=gl.getClearAlpha();
   const v=world.viewport,center=r.getPosition().clone().project(world.camera),ratio=gl.domElement.width/d.renderer.width;
   const logical=[gl.domElement.width,gl.domElement.height];
   const crop=[Math.round((v.x+(center.x+1)*v.width/2-100)),Math.round((v.y+(1-center.y)*v.height/2-130)),200,180];
   const scale=gl.domElement.width/(d.gameScreen.resolution?.width||1920);
   const render=()=>{world.scene.updateMatrixWorld(true);world.meshBatchManager.updateMeshes();gl.clear();gl.render(world.scene,world.camera);const c=document.createElement('canvas');const factor=gl.domElement.width/gl.getSize({set(x,y){this.x=x;this.y=y;return this;}}).x;c.width=crop[2]*factor;c.height=crop[3]*factor;c.getContext('2d').drawImage(gl.domElement,...crop.map(n=>n*factor),0,0,c.width,c.height);return c.toDataURL();};
   const frames=[];const sz0=gl.getSize({set(x,y){this.x=x;this.y=y;return this;}});gl.setViewport(v.x,sz0.y-v.y-v.height,v.width,v.height);frames.push({heading:'complete-native',png:render()});
   try {
    for(const [m]of all)if(!own.has(m))m.visible=false;
    world.scene.background=null;gl.setClearColor(0x34483d,1);const sz=gl.getSize({set(x,y){this.x=x;this.y=y;return this;}});gl.setViewport(v.x,sz.y-v.y-v.height,v.width,v.height);
    for(let heading=0;heading<360;heading+=45){r.turretRot.rotation.y=heading*Math.PI/180;r.turretRot.updateMatrix();frames.push({heading,png:render()});}
   }finally{for(const [m,visible]of all)m.visible=visible;r.turretRot.rotation.copy(originalRotation);r.turretRot.updateMatrix();world.scene.background=background;gl.setClearColor(clear,alpha);d.renderer.render();d.gameScreen.gameAnimationLoop.start();}
   return {frames,crop,logical,ownMeshes:own.size,parts:r.turretBuilders.length};
  });
  await fs.mkdir(path.join(root,id));
  for(const frame of captures.frames){await fs.writeFile(path.join(root,id,`${frame.heading}.png`),Buffer.from(frame.png.split(',')[1],'base64'));delete frame.png;}
  report.families[id]=captures;
 }
 report.status='PASS_ORIGINAL_TURRET_REFERENCES';
} catch(e){report.status='FAIL';report.failure=e.stack;process.exitCode=1;}finally{await fs.writeFile(path.join(root,'result.json'),JSON.stringify(report,null,2));await app.close();}
