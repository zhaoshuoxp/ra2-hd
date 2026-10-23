// Adapted from accepted Allied native reference capture. Original art only.
// Controlled native rendering only; spawned fixtures do not prove buildability or actions.
import { _electron as electron } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
const build = path.resolve(process.argv[2]);
const out = path.resolve(process.argv[3]);
await fs.mkdir(out, { recursive: false });
const inv = JSON.parse(await fs.readFile('.artifacts/yuri-units/source-v2/inventory.json'));
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
    'Controlled actor creation and paused native rendering. Not natural production, movement, flight or water behavior. Miner autonomous scanning is postponed only in this posed fixture.',
  errors: [],
  units: [],
};
let page;
try {
  page = await app.firstWindow();
  page.on('pageerror', e => report.errors.push(e.stack));
  await page.locator('[data-edition=yr]').click({timeout: 60000});
  const locale = JSON.parse(await fs.readFile('public/res/locale/zh-CN.json', 'utf8'));
  await page.getByRole('button', {name: locale['hd:menuskirmish'], exact: true}).waitFor({timeout: 90000});
  await page.evaluate(() => {
    window.__ra2debug.generalOptions.graphics.hdEnabled.value = false;
    window.__ra2debug.generalOptions.graphics.renderResolution.value = '1080p';
    const prefs = {_r_lastMap:'XMP23T4.map',_r_lastMode:'1',_r_lastCountry:'9',_r_lastColor:'1',_r_lastStartPos:'0',_r_lastTeam:'0',
      _r_hostOpts:'6;10000;10;1;1;0;1;0;;0;1;0;0',_r_lastBots:JSON.stringify([null,null,null,{d:2,c:5,co:2,s:3,t:1},null,null,null,null])};
    Object.entries(prefs).forEach(([k,v]) => localStorage.setItem(`_edition:yr:${k}`,v));
  });
  await page.getByRole('button', {name:locale['hd:menuskirmish'],exact:true}).click();
  await page.waitForFunction(() => window.__ra2debug?.skirmishLobby);
  await page.evaluate(() => window.__ra2debug.skirmishLobby.startGame(1700000000000));
  await page.waitForFunction(() => window.__ra2debug?.game?.status === 1,undefined,{timeout:90000});
  const only = process.argv.find(a => a.startsWith('--only='))?.slice(7).split(',');
  const targets = inv.families.flatMap(f => [f, ...f.children]).filter(f => f.representation === 'VXL/HVA').filter((f,i,a) => a.findIndex(x => x.id === f.id) === i).filter(f => !only || only.includes(f.id));
  for (const family of targets) {
    const setup = await page.evaluate(
      ({ id, type }) => {
        const d = window.__ra2debug;
        d.gameScreen.gameAnimationLoop.start();
        const m = d.localPlayer.getOwnedObjects().find((o) => /MCV$|^PCV$/.test(o.name));
        const rule = d.game.rules.getObject(id, type);
        const u = d.game.createUnitForPlayer(rule, d.localPlayer);
        const tile = d.game.map.tiles.getAll().filter(t => d.game.map.isWithinBounds(t) && !t.rampType &&
          d.game.map.terrain.getPassableSpeed(t, rule.speedType, false, false) > 0 &&
          !d.game.map.getGroundObjectsOnTile(t).some(o => o.isTechno() || o.isTerrain()))
          .sort((a,b) => Math.hypot(a.rx-m.tile.rx-3,a.ry-m.tile.ry+3)-Math.hypot(b.rx-m.tile.rx-3,b.ry-m.tile.ry+3))[0];
        for (const bot of d.game.botManager.bots.values()) bot.onGameTick = () => {};
        d.game.mapShroudTrait.revealMap(d.localPlayer, d.game);
        // Reference-only fixture: postpone automatic miner deployment before posing.
        if (u.slaveMinerTrait) u.slaveMinerTrait.nextScan = Number.MAX_SAFE_INTEGER;
        d.game.spawnObject(u, tile);
        d.worldInteraction.minimapHandler.panToTile(u.tile);
        window.__unitRef = u;
        return {
          id: u.id,
          name: u.name,
          tile: [tile.rx, tile.ry],
          ruleName: rule.name,
          imageName: rule.imageName,
        };
      },
      { id: family.id, type: ['ORCA','BEAG','HORNET','ASW','CMISL'].includes(family.id) ? 1 : 7 },
    );
    await page.waitForFunction(() => {
      const d = window.__ra2debug;
      return d.renderableManager.getRenderableByGameObject(window.__unitRef)?.vxlBuilders?.length > 0;
    });
    await page.evaluate(() => {
      const d = window.__ra2debug;
      d.gameScreen.gameAnimationLoop.stop();
      d.gameScreen.pointer.unlock();
    });
    const entry = { ...setup, name: family.id, views: [] };
    for (const heading of (process.argv.includes('--production') ? [0,45,90,135,180,225,270,315] : [0,90])) {
      const capture = await page.evaluate(({heading, production}) => {
        const d = window.__ra2debug,
          u = window.__unitRef,
          r = d.renderableManager.getRenderableByGameObject(u),
          w = d.worldScene,
          gl = d.renderer.renderer;
        if (u.turretTrait) u.turretTrait.facing = heading;
        if (['ORCA','BEAG','HORNET','ASW','CMISL'].includes(u.name)) {u.yaw = heading; r.updateVxlRotation(); r.tiltObj.updateMatrix();}
        else r.updateVxlRotation(heading, true);
        w.scene.updateMatrixWorld(true);
        w.meshBatchManager.updateMeshes();
        d.renderer.render();
        const ratio = gl.domElement.width / d.renderer.width,
          v = w.viewport,
          points = [];
        for (const b of r.vxlBuilders)
          for (const mesh of b.sections.values())
            for (let i = 0; i < mesh.geometry.attributes.position.count; i++) {
              const p = w.camera.position
                .clone()
                .fromBufferAttribute(mesh.geometry.attributes.position, i)
                .applyMatrix4(mesh.matrixWorld)
                .project(w.camera);
              points.push([
                (v.x + ((p.x + 1) * v.width) / 2) * ratio,
                (v.y + ((1 - p.y) * v.height) / 2) * ratio,
              ]);
            }
        const bounds = [
          Math.min(...points.map((p) => p[0])),
          Math.min(...points.map((p) => p[1])),
          Math.max(...points.map((p) => p[0])),
          Math.max(...points.map((p) => p[1])),
        ];
        if (!bounds.every(Number.isFinite) || bounds[0] < v.x * ratio || bounds[1] < v.y * ratio ||
            bounds[2] > (v.x + v.width) * ratio || bounds[3] > (v.y + v.height) * ratio)
          throw Error('Reference actor lies outside the visible world viewport');
        const crop = [
          Math.round((bounds[0] + bounds[2]) / 2 - 180),
          Math.round((bounds[1] + bounds[3]) / 2 - 150),
          360,
          300,
        ];
        const png = () => {
          const c = document.createElement('canvas');
          c.width = 360;
          c.height = 300;
          c.getContext('2d').drawImage(gl.domElement, ...crop, 0, 0, 360, 300);
          return c.toDataURL();
        };
        const projectedPivot = r.posObj.position.clone().set(0,0,0).applyMatrix4(r.posObj.matrixWorld).project(w.camera);
        const pivot = [(v.x+(projectedPivot.x+1)*v.width/2)*ratio-crop[0],
                       (v.y+(1-projectedPivot.y)*v.height/2)*ratio-crop[1]];
        const partMetadata = [], transforms = [];
        r.posObj.traverse(o => transforms.push([o, o.visible]));
        const layers = { context: png() },
          meshes = r.vxlBuilders.flatMap((b) => [...b.sections.values()]);
        if (meshes.some((m) => m.isBatchedMesh))
          throw Error('Batched reference path needs distinct extraction');
        const saved = [];
        w.scene.traverse((o) => {
          if (o.isMesh) saved.push([o, o.visible]);
        });
        const clear = gl.getClearColor(w.ambientLight.color.clone()),
          alpha = gl.getClearAlpha(),
          bg = w.scene.background;
        const visibility = meshes.map((m) => m.visible);
        const render = () => {
          w.scene.updateMatrixWorld(true);
          w.meshBatchManager.updateMeshes();
          gl.setViewport(v.x, d.renderer.height - v.y - v.height, v.width, v.height);
          gl.clear();
          gl.render(w.scene, w.camera);
          return png();
        };
        try {
          saved.forEach(([m]) => {
            if (!meshes.includes(m)) m.visible = false;
          });
          w.scene.background = null;
          gl.setClearColor(0x48584e, 1);
          layers.complete = render();
          meshes.forEach((m, i) => {
            m.visible = [...(r.bodyVxlBuilder ?? r.vxlBuilders[0]).sections.values()].includes(m);
          });
          layers.body = render();
          meshes.forEach((m, i) => {
            m.visible =
              visibility[i] &&
              ![...(r.bodyVxlBuilder ?? r.vxlBuilders[0]).sections.values()].includes(m);
          });
          layers.mechanical = render();
          if (r.noSpawnAltVxl || r.harvesterAltVxl) {
            meshes.forEach((m) => (m.visible = false));
            (r.noSpawnAltVxl ?? r.harvesterAltVxl).traverse((o) => {
              o.visible = true;
            });
            layers.alternate = render();
          }

          if (production) {
                    for (const builder of r.vxlBuilders) {
                        for (const [section, mesh] of builder.sections.entries()) {
                            transforms.forEach(([o]) => {
                                if (!o.isMesh) o.visible = true;
                            });
                            meshes.forEach((m) => (m.visible = m === mesh));
                            const key = `${builder.vxlFile.filename.replace('.vxl', '')}-${section}`;
                            layers[key] = render();
                            builder.setPalette(r.palette.clone().remap({ r: 0, g: 0, b: 255 }));
                            layers[key + '-owner-blue'] = render();
                            builder.setPalette(r.palette);
                            const partOrigin = w.camera.position
                                .clone()
                                .set(0, 0, 0)
                                .applyMatrix4(mesh.matrixWorld)
                                .project(w.camera);
                            partMetadata.push({
                                key,
                                source: builder.vxlFile.filename,
                                section,
                                pivot: [
                                    (v.x + ((partOrigin.x + 1) * v.width) / 2) * ratio - crop[0],
                                    (v.y + ((1 - partOrigin.y) * v.height) / 2) * ratio - crop[1],
                                ],
                                matrixWorld: mesh.matrixWorld.toArray(),
                                matrix: mesh.matrix.toArray(),
                                parentWorld: mesh.parent.matrixWorld.toArray(),
                                geometryVertices: mesh.geometry.attributes.position.count,
                            });
                        }
                    }
          }
        } finally {
          transforms.forEach(([o, visible]) => (o.visible = visible));
          saved.forEach(([m, b]) => (m.visible = b));
          w.scene.background = bg;
          gl.setClearColor(clear, alpha);
          d.renderer.render();
        }
        return {
          heading,
          pivot,
          partMetadata,
          crop,
          bounds,
          layers,
          tick: d.game.currentTick,
          source: r.vxlBuilders.map((b) => ({ vxl: b.vxlFile.filename, hva: b.hvaFile?.filename })),
          buffer: [gl.domElement.width, gl.domElement.height],
          css: [innerWidth, innerHeight],
          dpr: devicePixelRatio,
          projection: w.camera.projectionMatrix.toArray(),
          zoom: w.camera.zoom,
          logical: [d.renderer.width, d.renderer.height],
          ratio,
          glError: gl.getContext().getError(),
        };
      }, {heading, production: process.argv.includes('--production')});
      for (const [role, data] of Object.entries(capture.layers)) {
        const file = `${family.id}-${heading}-${role}.png`;
        await fs.writeFile(`${out}/${file}`, Buffer.from(data.split(',')[1], 'base64'));
        capture.layers[role] = file;
      }
      entry.views.push(capture);
    }
    report.units.push(entry);
    console.log('Captured', family.id);
  }
  report.status = 'CAPTURED_ORIGINAL_REFERENCES_REQUIRES_VISUAL_QA';
} catch (e) {
  report.failure = e.stack;
  process.exitCode = 1;
  await page?.screenshot({ path: `${out}/failure.png` }).catch(() => {});
} finally {
  await fs.writeFile(`${out}/result.json`, JSON.stringify(report, null, 2) + '\n');
  await app.close();
}
console.log(report.status, report.failure ?? '');
