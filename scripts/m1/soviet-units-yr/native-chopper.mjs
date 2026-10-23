// Controlled placement with native actions; this does not prove production unlocks.
import { _electron as electron } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
const build = path.resolve(process.argv[2]);
const out = path.resolve(process.argv[3]);
await fs.mkdir(out, { recursive: false });
const inv = JSON.parse(await fs.readFile('.artifacts/m1-7-yr/source-v1/inventory.json'));
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
    'Legal prerequisite building fixtures followed by native SCHP production and action orders. Elite promotion and test targets are controlled fixtures, not natural-match evidence.',
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
  report.production = await page.evaluate(() => {
    const d=window.__ra2debug,g=d.game,p=d.localPlayer;
    for(const bot of g.botManager.bots.values()) bot.onGameTick=()=>{};
    const center=p.getOwnedObjects().find(o=>/MCV$/.test(o.name)).tile;
    const worker=g.getConstructionWorker(p), rule=g.rules.getObject('SCHP',7);
    const before=p.production.isAvailableForProduction(rule), fixtures=[];
    for(const name of ['NAPOWR','NAPOWR','NAPOWR','NAHAND','NAREFN','NAWEAP','NARADR','NATECH']) {
      const tile=g.map.tiles.getAll().filter(t=>g.map.isWithinBounds(t)&&worker.canPlaceAt(name,t,{normalizedTile:true,ignoreAdjacent:true}))
        .sort((a,b)=>Math.hypot(a.rx-center.rx,a.ry-center.ry)-Math.hypot(b.rx-center.rx,b.ry-center.ry))[0];
      if(!tile) throw Error('No legal prerequisite foundation: '+name);
      const b=g.createObject(2,name);g.changeObjectOwner(b,p);g.spawnObject(b,tile);fixtures.push(name);
    }
    return {before,after:p.production.isAvailableForProduction(rule),fixtures,cost:rule.cost,country:p.country.name};
  });
  if(report.production.before || !report.production.after) throw Error('Unexpected SCHP production gate');
  await page.waitForTimeout(1500);
  await page.evaluate(()=>window.__ra2debug.actionsApi.queueForProduction(3,7,'SCHP',1));
  await page.waitForFunction(()=>window.__ra2debug.localPlayer.getOwnedObjects().some(o=>o.name==='SCHP'),undefined,{timeout:120000});
  await page.evaluate(() => {
    const d = window.__ra2debug, g = d.game;
    const m = d.localPlayer.getOwnedObjects().find(o => /MCV$/.test(o.name));
    const rule = g.rules.getObject('SCHP', 7), u = d.localPlayer.getOwnedObjects().find(o=>o.name==='SCHP');
    const tile = g.map.tiles.getAll().filter(t => g.map.isWithinBounds(t) && !t.rampType &&
      g.map.terrain.getPassableSpeed(t, rule.speedType, false, false) > 0 &&
      !g.map.getGroundObjectsOnTile(t).some(o => o.isTechno() || o.isTerrain()))
      .sort((a,b) => Math.hypot(a.rx-m.tile.rx-9,a.ry-m.tile.ry+7)-Math.hypot(b.rx-m.tile.rx-9,b.ry-m.tile.ry+7))[0];
    for (const bot of g.botManager.bots.values()) bot.onGameTick = () => {};
    g.mapShroudTrait.revealMap(d.localPlayer,g); window.__chopper = u; window.__testTile=tile;
    d.worldInteraction.minimapHandler.panToTile(u.tile);
    window.__transitions = []; window.__trace = [];
    const rm = d.renderableManager, original = rm.createTransientAnim.bind(rm);
    rm.createTransientAnim = (name, callback) => {
      const anim = original(name,callback);
      if (name === 'SCHPDEPL') window.__transitions.push(anim);
      return anim;
    };
    window.__sample = () => {
      const r = rm.getRenderableByGameObject(u), hd = r?.unitVxlHd;
      const layers = hd?.layers.flatMap(p=>p.frames).filter(f=>f.batch.visible || f.translucent.visible) ?? [];
      return { tick:g.currentTick, hd:!!hd?.active, deploying:!!u.simpleDeployAnimating,
        deployed:u.deployerTrait.isDeployed(), moving:u.isMoving, zone:u.zone, direction:u.direction,
        parts:layers.map(f=>f.part.key), rotorMatrices:r?.rotors?.map(m=>m.matrix.toArray()),
        transitions:window.__transitions.filter(a=>a.mainObj).map(a=>({frame:a.mainObj.builder.getFrame(),
          hd:!!a.mainObj.builder.hdOverride, shadow:!!a.mainObj.shadowRenderable, reverse:a.getAnimProps()?.reverse})),
        status:d.sovietUnitsHd.families.SCHP };
    };
    window.__timer = setInterval(()=>window.__trace.push(window.__sample()),30);
  });
  await page.waitForFunction(() => ['READY','FAILED'].includes(window.__ra2debug.sovietUnitsHd.families.SCHP.status),undefined,{timeout:45000});
  const stage = async name => { const sample=await page.evaluate(()=>window.__sample()); report.stages.push({name,sample});
    await page.screenshot({path:path.join(out,name+'.png')}); console.log(name,JSON.stringify(sample)); };
  await page.evaluate(()=>{const d=window.__ra2debug,t=window.__testTile;d.actionsApi.orderUnits([window.__chopper.id],0,t.rx,t.ry);});
  await page.waitForFunction(()=>{const u=window.__chopper,t=window.__testTile;return !u.isMoving&&u.tile.rx===t.rx&&u.tile.ry===t.ry;},undefined,{timeout:60000});
  await page.evaluate(()=>window.__ra2debug.worldInteraction.minimapHandler.panToTile(window.__chopper.tile));
  await stage('ground-ready');
  if (!(await page.evaluate(()=>window.__sample().hd))) throw Error('SCHP HD did not activate');
  report.recording = await page.evaluate(() => {
    const canvas = window.__ra2debug.renderer.renderer.domElement;
    const stream = canvas.captureStream(15);
    const recorder = new MediaRecorder(stream, {mimeType:'video/webm;codecs=vp9',videoBitsPerSecond:8000000});
    window.__videoChunks = [];
    recorder.ondataavailable = e => { if(e.data.size) window.__videoChunks.push(e.data); };
    window.__nativeRecorder = recorder; window.__nativeVideoStream = stream;
    recorder.start(1000);
    return {width:canvas.width,height:canvas.height,fps:15};
  });
  await page.evaluate(()=>window.__ra2debug.actionsApi.orderUnits([window.__chopper.id],10));
  await page.waitForFunction(()=>window.__chopper.simpleDeployAnimating,undefined,{timeout:30000});
  await page.waitForTimeout(250); await stage('deploying');
  await page.waitForFunction(()=>window.__chopper.deployerTrait.isDeployed(),undefined,{timeout:30000});
  await stage('deployed');
  await page.evaluate(()=>{const d=window.__ra2debug,u=window.__chopper;d.actionsApi.orderUnits([u.id],0,u.tile.rx+3,u.tile.ry);});
  await page.waitForFunction(()=>window.__chopper.simpleDeployAnimating,undefined,{timeout:30000});
  await page.waitForTimeout(250); await stage('undeploying');
  await page.waitForFunction(()=>!window.__chopper.deployerTrait.isDeployed()&&!window.__chopper.simpleDeployAnimating,undefined,{timeout:30000});
  await page.waitForTimeout(1000); await stage('flight-moving');
  await page.waitForTimeout(2000); await stage('flight-arrival');
  report.weapons=[];
  for(const elite of [false,true]) for(const deployed of [false,true]) {
    if(elite) await page.evaluate(()=>{const d=window.__ra2debug;window.__chopper.veteranTrait.promote(2,d.game);});
    if(deployed) {
      await page.evaluate(()=>window.__ra2debug.actionsApi.orderUnits([window.__chopper.id],10));
      await page.waitForFunction(()=>window.__chopper.deployerTrait.isDeployed(),undefined,{timeout:30000});
    } else if(await page.evaluate(()=>window.__chopper.deployerTrait.isDeployed())) {
      await page.evaluate(()=>{const d=window.__ra2debug,u=window.__chopper;d.actionsApi.orderUnits([u.id],0,u.tile.rx+2,u.tile.ry);});
      await page.waitForFunction(()=>!window.__chopper.deployerTrait.isDeployed()&&!window.__chopper.simpleDeployAnimating,undefined,{timeout:30000});
      await page.waitForTimeout(1500);
    }
    const initial=await page.evaluate(()=>{
      const d=window.__ra2debug,g=d.game,u=window.__chopper,enemy=g.getCombatants().find(p=>p!==d.localPlayer);
      const rule=g.rules.getObject('HTNK',7);
      const tile=g.map.tiles.getAll().filter(t=>g.map.isWithinBounds(t)&&!t.rampType&&g.map.terrain.getPassableSpeed(t,rule.speedType,false,false)>0
        &&!g.map.getGroundObjectsOnTile(t).some(o=>o.isTechno()||o.isTerrain()))
        .sort((a,b)=>Math.abs(Math.hypot(a.rx-u.tile.rx,a.ry-u.tile.ry)-4)-Math.abs(Math.hypot(b.rx-u.tile.rx,b.ry-u.tile.ry)-4))[0];
      const target=g.createUnitForPlayer(rule,enemy);g.spawnObject(target,tile);
      target.attackTrait.setDisabled(true);target.moveTrait.setDisabled(true);window.__target=target;
      const hp=target.healthTrait.health;d.actionsApi.orderUnits([u.id],2,target.id);
      return {hp,weapon:u.attackTrait.selectDefaultWeapon(u).name,elite:u.veteranTrait.isElite()};
    });
    await page.waitForFunction(()=>window.__target.healthTrait.health<100,undefined,{timeout:45000});
    await stage((elite?'elite':'normal')+'-'+(deployed?'ground':'air')+'-fire');
    const result=await page.evaluate(()=>{
      const d=window.__ra2debug,u=window.__chopper,t=window.__target;
      const result={hp:t.healthTrait.health,zone:u.zone,deployed:u.deployerTrait.isDeployed(),hd:window.__sample().hd};
      d.actionsApi.orderUnits([u.id],11);if(!t.isDestroyed)d.game.destroyObject(t,{player:d.localPlayer});return result;
    });
    if(!result.hd||result.hp>=initial.hp||result.deployed!==deployed)throw Error('Native weapon state failed');
    report.weapons.push({elite,deployed,initial,result});
  }
  report.ownerHeadingSweep=[];
  for(const deployed of [true,false]) {
    if(!deployed) {
      await page.evaluate(()=>{const d=window.__ra2debug,u=window.__chopper;d.actionsApi.orderUnits([u.id],0,u.tile.rx+2,u.tile.ry);});
      await page.waitForFunction(()=>!window.__chopper.deployerTrait.isDeployed()&&!window.__chopper.simpleDeployAnimating,undefined,{timeout:30000});
      await page.waitForTimeout(1800);
    }
    await page.evaluate(()=>window.__ra2debug.gameScreen.gameAnimationLoop.stop());
    for(const owner of [0,1]) for(const yaw of [0,45,90,135,180,225,270,315]) {
      const row=await page.evaluate(({owner,yaw})=>{
        const d=window.__ra2debug,u=window.__chopper,g=d.game;
        const p=owner?g.getCombatants().find(p=>p!==d.localPlayer):d.localPlayer;
        if(u.owner!==p)g.changeObjectOwner(u,p);
        u.turretTrait.facing=(yaw+45)%360;
        const r=d.renderableManager.getRenderableByGameObject(u);r.update(0,0);r.updateVxlRotation(yaw,true);r.unitVxlHd.update();
        d.worldScene.scene.updateMatrixWorld(true);d.worldScene.meshBatchManager.updateMeshes();d.worldScene.meshBatchManager.processRenderQueue();d.renderer.render();
        return {owner:p.color,yaw,turret:u.turretTrait.facing,...window.__sample()};
      },{owner,yaw});
      if(!row.hd||row.parts.length!==(deployed?2:3))throw Error('Incomplete owner/heading render');
      const file=`${deployed?'deployed':'flight'}-owner-${owner}-yaw-${yaw}.png`;
      await page.screenshot({path:path.join(out,file)});report.ownerHeadingSweep.push({...row,file});
    }
    await page.evaluate(()=>{const d=window.__ra2debug;d.game.changeObjectOwner(window.__chopper,d.localPlayer);d.gameScreen.gameAnimationLoop.start();});
  }
  await page.evaluate(()=>{const d=window.__ra2debug,u=window.__chopper;d.actionsApi.orderUnits([u.id],0,u.tile.rx+6,u.tile.ry);});
  await page.waitForFunction(()=>window.__chopper.zone===1&&window.__chopper.isMoving,undefined,{timeout:30000});
  await stage('airborne-before-death');
  report.death=await page.evaluate(()=>{const d=window.__ra2debug,u=window.__chopper;
    u.primaryWeapon.warhead.inflictDamage(100000,u,{player:u.owner,obj:u,weapon:u.primaryWeapon},d.game);
    return {controlledLethalDamage:true,initialZone:u.zone};});
  await page.waitForFunction(()=>window.__chopper.isDestroyed&&!window.__ra2debug.renderableManager.getRenderableByGameObject(window.__chopper),undefined,{timeout:60000});
  await stage('airborne-death');
  report.trace = await page.evaluate(()=>{clearInterval(window.__timer);return window.__trace;});
  if (report.trace.filter(s=>s.deploying).some(s=>!s.hd||!s.transitions.some(a=>a.hd))) throw Error('Transition lost complete-family binding');
  if (!report.trace.some(s=>s.transitions.some(a=>a.reverse))) throw Error('No reverse transition observed');
  if (report.errors.length) throw Error('Runtime errors');
  if (!report.trace.some(s=>s.moving && s.zone === 1)) throw Error('No airborne movement observed');
  if (new Set(report.trace.map(s=>JSON.stringify(s.rotorMatrices))).size < 3) throw Error('Native rotors did not rotate');
  report.status='PASS_NATIVE_PRODUCTION_DEPLOY_MOVEMENT_ROTORS_WEAPONS_OWNERS_HEADINGS_DEATH';
} catch(error) { report.failure=String(error.stack??error); console.error(report.failure); process.exitCode=1; }
finally {
  try {
    const video = await page?.evaluate(async () => {
      const recorder = window.__nativeRecorder;
      if (!recorder) return;
      if(recorder.state !== 'inactive') await new Promise(resolve => {recorder.onstop=resolve;recorder.stop();});
      window.__nativeVideoStream.getTracks().forEach(t=>t.stop());
      return new Promise(resolve => {
        const reader = new FileReader(); reader.onload=()=>resolve(reader.result);
        reader.readAsDataURL(new Blob(window.__videoChunks,{type:recorder.mimeType}));
      });
    });
    if(video) {
      const bytes = Buffer.from(video.split(',')[1],'base64');
      await fs.writeFile(path.join(out,'native-actions.webm'),bytes);
      report.recording.bytes=bytes.length;
    }
  } catch(error) { report.recordingFailure=String(error); }
  await fs.writeFile(path.join(out,'result.json'),JSON.stringify(report,null,2)); await app.close();
}
