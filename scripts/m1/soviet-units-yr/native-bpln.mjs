import assert from 'node:assert/strict';
// Legal prerequisite fixtures, native spy unlocks, production and combat.
import { _electron as electron } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
const build = path.resolve(process.argv[2]);
const out = path.resolve(process.argv[3]);
await fs.mkdir(out, { recursive: false });
const identity='ROSTER';
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
    'Controlled paused native BPLN placement and owner/heading sweep. Production and airstrike actions are validated separately by native-boris-actions.',
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
  await page.evaluate(()=>{
    const d=window.__ra2debug,g=d.game,home=d.localPlayer.getOwnedObjects()[0].tile;
    for(const bot of g.botManager.bots.values())bot.onGameTick=()=>{};
    g.mapShroudTrait.revealMap(d.localPlayer,g);
    const u=g.createUnitForPlayer(g.rules.getObject('BPLN',1),d.localPlayer);
    g.spawnObject(u,g.map.tiles.getByMapCoords(home.rx+8,home.ry+8));
    window.__plane=u;u.attackTrait?.setDisabled(true);
    d.worldInteraction.minimapHandler.panToTile(u.tile);
  });
  await page.waitForFunction(()=>window.__ra2debug.renderableManager.getRenderableByGameObject(window.__plane)?.unitVxlHd?.active,undefined,{timeout:45000});
  await page.evaluate(()=>window.__ra2debug.gameScreen.gameAnimationLoop.stop());
  report.views=[];
  for(const owner of [0,1])for(const yaw of [0,45,90,135,180,225,270,315]) {
    const row=await page.evaluate(({owner,yaw})=>{
      const d=window.__ra2debug,g=d.game,u=window.__plane,p=owner?g.getCombatants().find(p=>p!==d.localPlayer):d.localPlayer;
      if(u.owner!==p)g.changeObjectOwner(u,p);
      const r=d.renderableManager.getRenderableByGameObject(u);u.yaw=yaw;u.pitch=u.roll=0;
      r.update(0,0);r.updateVxlRotation(yaw,true);r.unitVxlHd.update();
      d.worldScene.scene.updateMatrixWorld(true);d.worldScene.meshBatchManager.updateMeshes();d.worldScene.meshBatchManager.processRenderQueue();d.renderer.render();
      const gl=d.renderer.renderer,v=d.worldScene.viewport,pivot=r.posObj.position.clone().set(0,0,0).applyMatrix4(r.posObj.matrixWorld).project(d.worldScene.camera);
      const ratio=gl.domElement.width/d.renderer.width,c=document.createElement('canvas');c.width=c.height=240;
      const x=(v.x+(pivot.x+1)*v.width/2)*ratio-120,y=(v.y+(1-pivot.y)*v.height/2)*ratio-120;
      c.getContext('2d').drawImage(gl.domElement,x,y,240,240,0,0,240,240);
      return {owner:p.color,yaw,active:r.unitVxlHd.active,parts:r.unitVxlHd.layers.length,gl:gl.getContext().getError(),png:c.toDataURL()};
    },{owner,yaw});
    assert(row.active);assert.equal(row.parts,1);assert.equal(row.gl,0);
    const file=`owner-${owner}-yaw-${yaw}.png`;await fs.writeFile(path.join(out,file),Buffer.from(row.png.split(',')[1],'base64'));delete row.png;report.views.push({...row,file});
  }
  assert.deepEqual(report.errors,[]);report.status='PASS_BPLN_TWO_OWNER_EIGHT_HEADING_NATIVE_RENDER';
} catch(error){report.failure=error.stack;process.exitCode=1;}
finally {await fs.writeFile(path.join(out,'result.json'),JSON.stringify(report,null,2)+'\n');await app.close();}
console.log(report.status);
