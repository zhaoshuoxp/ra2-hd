// Legal prerequisite fixtures, native spy unlocks, production and combat.
import { _electron as electron } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
const build = path.resolve(process.argv[2]);
const out = path.resolve(process.argv[3]);
await fs.mkdir(out, { recursive: false });
const identity=process.argv[4];
if(!['BORIS','CCOMAND','PTROOP'].includes(identity))throw Error('Unknown infantry');
const profile = path.join(out, 'profile'); await fs.mkdir(profile);
await fs.writeFile(path.join(profile, 'resource-registration.json'), JSON.stringify({schemaVersion: 1, directory: path.resolve('.local')}));
const app = await electron.launch({
  executablePath: await fs.realpath('node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'),
  args: [build], cwd: '/private/tmp',
  env: {...process.env, RA2_DESKTOP_USER_DATA: profile, RA2_DESKTOP_NO_DISCOVERY: '1'}, timeout: 60000,
});
const report = {
  status: 'FAIL',
  disclosure:
    'Controlled legal prerequisite/spy/target fixtures followed by native infiltration, production, movement and combat. No stolen-tech flags are injected. This is not a natural-match claim.',
  errors: [],
  stages: [],
};
let page;
try {
  page = await app.firstWindow();
  page.on('pageerror', e => report.errors.push(e.stack));
  await page.locator('[data-edition=yr]').click({timeout: 60000});
  const locale = JSON.parse(await fs.readFile('public/res/locale/zh-CN.json', 'utf8'));
  await page.getByRole('button', {name: locale['hd:menuskirmish'], exact: true}).waitFor({timeout: 90000});
  await page.evaluate(() => {
    window.__ra2debug.generalOptions.graphics.hdEnabled.value = true;
    window.__ra2debug.generalOptions.graphics.renderResolution.value = '1080p';
    const prefs = {_r_lastMap:'XMP23T4.map',_r_lastMode:'1',_r_lastCountry:'5',_r_lastColor:'1',_r_lastStartPos:'0',_r_lastTeam:'0',
      _r_hostOpts:'6;10000;10;1;1;0;1;0;;0;1;0;0',_r_lastBots:JSON.stringify([null,null,null,{d:2,c:5,co:2,s:3,t:1},null,null,null,null])};
    Object.entries(prefs).forEach(([k,v]) => localStorage.setItem(`_edition:yr:${k}`,v));
  });
  await page.getByRole('button', {name:locale['hd:menuskirmish'],exact:true}).click();
  await page.waitForFunction(() => window.__ra2debug?.skirmishLobby);
  await page.evaluate(() => window.__ra2debug.skirmishLobby.startGame(1700000000000));
  await page.waitForFunction(() => window.__ra2debug?.game?.status === 1,undefined,{timeout:90000});
  await page.evaluate(identity=>{
    const d=window.__ra2debug,g=d.game,p=d.localPlayer,enemy=g.getCombatants().find(p=>p!==d.localPlayer);
    const center=p.getOwnedObjects().find(o=>/MCV$/.test(o.name)).tile;
    for(const bot of g.botManager.bots.values())bot.onGameTick=()=>{};
    for(const u of g.getWorld().getAllObjects())if(u.isUnit())u.attackTrait?.setDisabled(true);
    g.mapShroudTrait.revealMap(p,g);
    const building=(name,owner=p,near=center)=>{
      const worker=g.getConstructionWorker(owner);
      const tile=g.map.tiles.getAll().filter(t=>g.map.isWithinBounds(t)&&worker.canPlaceAt(name,t,{normalizedTile:true,ignoreAdjacent:true}))
        .sort((a,b)=>Math.hypot(a.rx-near.rx,a.ry-near.ry)-Math.hypot(b.rx-near.rx,b.ry-near.ry))[0];
      if(!tile)throw Error('Missing legal foundation '+name);
      const b=g.createObject(2,name);g.changeObjectOwner(b,owner);g.spawnObject(b,tile);return b;
    };
    const clear=(name,type,near,owner=p)=>{
      const rule=g.rules.getObject(name,type);
      const tile=g.map.tiles.getAll().filter(t=>g.map.isWithinBounds(t)&&!t.rampType&&g.map.terrain.getPassableSpeed(t,rule.speedType,type===3,false)>0
        &&!g.map.getGroundObjectsOnTile(t).some(o=>o.isTechno()||o.isTerrain()))
        .sort((a,b)=>Math.hypot(a.rx-near.rx,a.ry-near.ry)-Math.hypot(b.rx-near.rx,b.ry-near.ry))[0];
      const u=g.createUnitForPlayer(rule,owner);g.spawnObject(u,tile);return u;
    };
    for(const name of ['NAPOWR','NAPOWR','NAPOWR','NAHAND','NAREFN','NAWEAP','NARADR','NATECH'])building(name);
    window.__fixture={identity,building,clear,center,enemy};
  },identity);
  if(identity!=='BORIS') {
    report.unlock=await page.evaluate(identity=>{
      const d=window.__ra2debug,g=d.game,f=window.__fixture,p=d.localPlayer,rule=g.rules.getObject(identity,3);
      const before=p.production.isAvailableForProduction(rule);
      const lab=f.building(identity==='CCOMAND'?'GATECH':'YATECH',f.enemy,{rx:f.center.rx+10,ry:f.center.ry});
      const spy=f.clear('SPY',3,{rx:lab.tile.rx-1,ry:lab.tile.ry});
      window.__spy=spy;window.__lab=lab;d.actionsApi.orderUnits([spy.id],8,lab.id);
      return {before,lab:lab.name,spy:spy.name};
    },identity);
    if(report.unlock.before)throw Error('Stolen technology gate was already open');
    await page.waitForFunction(identity=>{const d=window.__ra2debug;return !window.__spy.isSpawned&&d.localPlayer.production.isAvailableForProduction(d.game.rules.getObject(identity,3));},identity,{timeout:60000});
    report.unlock.nativeInfiltration=true;
    await page.evaluate(()=>window.__ra2debug.game.unspawnObject(window.__lab));
  }
  report.production=await page.evaluate(identity=>{
    const d=window.__ra2debug,rule=d.game.rules.getObject(identity,3);
    const available=d.localPlayer.production.isAvailableForProduction(rule);
    d.actionsApi.queueForProduction(2,3,identity,1);return {available,cost:rule.cost};
  },identity);
  if(!report.production.available)throw Error('Production unavailable');
  await page.waitForFunction(identity=>window.__ra2debug.localPlayer.getOwnedObjects().some(o=>o.name===identity),identity,{timeout:120000});
  await page.evaluate(identity=>{
    const d=window.__ra2debug,u=d.localPlayer.getOwnedObjects().find(o=>o.name===identity);window.__actor=u;window.__trace=[];
    window.__sample=()=>{
      const live=d.renderableManager.getRenderableByGameObject(u);
      if(live)window.__lastActorRenderable=live;
      const r=live??window.__lastActorRenderable,b=r?.shpRenderable?.builder;
      return {tick:d.game.currentTick,frame:b?.getFrame(),hd:!!b?.hdOverride,moving:u.isMoving,firing:u.isFiring,
        tile:[u.tile.rx,u.tile.ry],warped:!!u.warpedOutTrait?.isActive(),destroyed:u.isDestroyed,infDeath:u.infDeathType,deathSequence:!!r?.deathAnimSequencePlaying,
        planes:d.localPlayer.getOwnedObjects().filter(o=>o.name==='BPLN').map(o=>({id:o.id,hd:!!d.renderableManager.getRenderableByGameObject(o)?.unitVxlHd?.active}))};
    };
    window.__timer=setInterval(()=>window.__trace.push(window.__sample()),25);
    d.worldInteraction.minimapHandler.panToTile(u.tile);
  },identity);
  await page.waitForFunction(()=>window.__sample().hd,undefined,{timeout:45000});
  const stage=async name=>{report.stages.push({name,sample:await page.evaluate(()=>window.__sample())});await page.screenshot({path:path.join(out,name+'.png')});};
  report.recording=await page.evaluate(()=>{
    const canvas=window.__ra2debug.renderer.renderer.domElement,stream=canvas.captureStream(15);
    const recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9',videoBitsPerSecond:8000000});
    window.__videoChunks=[];recorder.ondataavailable=e=>{if(e.data.size)window.__videoChunks.push(e.data);};
    window.__nativeRecorder=recorder;window.__nativeVideoStream=stream;recorder.start(1000);return {width:canvas.width,height:canvas.height,fps:15};
  });
  await stage('native-production');
  report.movement=await page.evaluate(()=>{
    const d=window.__ra2debug,g=d.game,u=window.__actor;
    const tile=g.map.tiles.getAll().filter(t=>g.map.isWithinBounds(t)&&!t.rampType&&g.map.terrain.getPassableSpeed(t,u.rules.speedType,true,false)>0
      &&!g.map.getGroundObjectsOnTile(t).some(o=>o.isTechno()||o.isTerrain()))
      .sort((a,b)=>Math.abs(Math.hypot(a.rx-u.tile.rx,a.ry-u.tile.ry)-8)-Math.abs(Math.hypot(b.rx-u.tile.rx,b.ry-u.tile.ry)-8))[0];
    window.__destination=tile;d.actionsApi.orderUnits([u.id],0,tile.rx,tile.ry);return {destination:[tile.rx,tile.ry],teleporter:u.rules.teleporter};
  });
  await page.waitForFunction(()=>{const u=window.__actor,t=window.__destination;return !u.isMoving&&!u.warpedOutTrait?.isActive()&&u.tile.rx===t.rx&&u.tile.ry===t.ry;},undefined,{timeout:60000});
  await page.evaluate(()=>window.__ra2debug.worldInteraction.minimapHandler.panToTile(window.__actor.tile));
  await stage('native-movement');
  await page.evaluate(()=>{
    const d=window.__ra2debug,f=window.__fixture,u=window.__actor;
    const target=f.clear('E2',3,{rx:u.tile.rx+3,ry:u.tile.ry},f.enemy);target.attackTrait.setDisabled(true);target.moveTrait.setDisabled(true);
    window.__target=target;d.actionsApi.orderUnits([u.id],2,target.id);
  });
  if(identity==='PTROOP') {
    await page.waitForFunction(()=>window.__target.owner===window.__ra2debug.localPlayer,undefined,{timeout:30000});
    report.mindControl=true;
  } else {
    await page.waitForFunction(()=>window.__target.isDestroyed||window.__target.healthTrait.health<100,undefined,{timeout:30000});
    report.primaryDamage=true;
  }
  await stage('native-primary');
  await page.evaluate(()=>window.__ra2debug.actionsApi.orderUnits([window.__actor.id],11));
  if(identity==='BORIS') {
    report.airstrikes=[];
    for(const elite of [false,true]) {
      await page.evaluate(elite=>{
        const d=window.__ra2debug,f=window.__fixture,u=window.__actor;
        if(elite)u.veteranTrait.promote(2,d.game);
        const target=f.building('NAPOWR',f.enemy,{rx:u.tile.rx+6,ry:u.tile.ry});window.__airTarget=target;
        d.actionsApi.orderUnits([u.id],2,target.id);
      },elite);
      await page.waitForFunction(count=>window.__ra2debug.localPlayer.getOwnedObjects().filter(o=>o.name==='BPLN').length===count,elite?4:2,{timeout:45000});
      await page.waitForFunction(()=>window.__sample().planes.every(p=>p.hd),undefined,{timeout:30000});
      const strike={elite,planes:await page.evaluate(()=>window.__sample().planes)};
      await page.evaluate(()=>{const d=window.__ra2debug;d.worldInteraction.minimapHandler.panToTile(window.__airTarget.tile);});
      await page.waitForFunction(()=>{const d=window.__ra2debug,t=window.__airTarget.tile;return d.localPlayer.getOwnedObjects().some(o=>o.name==='BPLN'&&Math.hypot(o.tile.rx-t.rx,o.tile.ry-t.ry)<12);},undefined,{timeout:45000});
      await stage(elite?'elite-airstrike':'normal-airstrike');
      await page.waitForFunction(()=>window.__airTarget.isDestroyed,undefined,{timeout:60000});
      await page.waitForFunction(()=>!window.__ra2debug.localPlayer.getOwnedObjects().some(o=>o.name==='BPLN'),undefined,{timeout:60000});
      report.airstrikes.push({...strike,targetDestroyed:true,planesReturned:true});
    }
  } else {
    await page.evaluate(()=>{
      const d=window.__ra2debug,f=window.__fixture,u=window.__actor;
      window.__demolition=f.building('NAPOWR',f.enemy,{rx:u.tile.rx+3,ry:u.tile.ry+2});
      d.actionsApi.orderUnits([u.id],2,window.__demolition.id);
    });
    await page.waitForFunction(()=>window.__demolition.isDestroyed,undefined,{timeout:60000});
    report.demolition=true;await stage('native-demolition');
  }
  await page.evaluate(()=>{
    const d=window.__ra2debug,u=window.__actor,f=window.__fixture;
    d.worldInteraction.minimapHandler.panToTile(u.tile);
    const attacker=f.clear('E2',3,{rx:u.tile.rx+5,ry:u.tile.ry},f.enemy);
    attacker.primaryWeapon.warhead.inflictDamage(100000,u,{player:attacker.owner,obj:attacker,weapon:attacker.primaryWeapon},d.game);
  });
  await page.waitForFunction(()=>window.__actor.isDestroyed,undefined,{timeout:30000});
  await page.waitForTimeout(1500);await stage('native-death');
  if(identity==='PTROOP') {
    report.releaseOnDeath=await page.evaluate(()=>window.__target.owner===window.__fixture.enemy&&!window.__target.mindControllableTrait.isActive());
    if(!report.releaseOnDeath)throw Error('Mind control did not release');
  }
  report.trace=await page.evaluate(()=>{clearInterval(window.__timer);return window.__trace;});
  const deathStart=identity==='BORIS'?139:134,deathEnd=identity==='BORIS'?168:163;
  report.nativeDeathFrames=[...new Set(report.trace.filter(s=>s.destroyed&&s.hd&&s.frame>=deathStart&&s.frame<=deathEnd).map(s=>s.frame))];
  if(!report.nativeDeathFrames.length)throw Error('No retained HD native death sequence observed');
  const firstHd=report.trace.findIndex(s=>s.hd);
  if(report.trace.slice(firstHd).some(s=>!s.destroyed&&!s.hd))throw Error('Unexpected Original switch after activation');
  if(identity==='CCOMAND'&&!report.trace.some(s=>s.warped&&s.hd))throw Error('No HD teleport recovery observed');
  if(report.errors.length)throw Error('Runtime errors');
  report.status='PASS_NATIVE_INFANTRY_PRODUCTION_ACTIONS_AND_DEPENDENCIES';
} catch(error){report.failure=String(error.stack??error);console.error(report.failure);process.exitCode=1;}
finally {
  try {
    const video=await page?.evaluate(async()=>{
      const r=window.__nativeRecorder;if(!r)return;
      if(r.state!=='inactive')await new Promise(resolve=>{r.onstop=resolve;r.stop();});
      window.__nativeVideoStream.getTracks().forEach(t=>t.stop());
      return new Promise(resolve=>{const f=new FileReader();f.onload=()=>resolve(f.result);f.readAsDataURL(new Blob(window.__videoChunks,{type:r.mimeType}));});
    });
    if(video){const bytes=Buffer.from(video.split(',')[1],'base64');await fs.writeFile(path.join(out,'native-actions.webm'),bytes);report.recording.bytes=bytes.length;}
  }catch(error){report.recordingFailure=String(error);}
  await fs.writeFile(path.join(out,'result.json'),JSON.stringify(report,null,2));await app.close();
}
