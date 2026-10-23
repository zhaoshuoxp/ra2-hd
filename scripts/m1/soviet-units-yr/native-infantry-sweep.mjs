import { _electron as electron } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const build = path.resolve(process.argv[2]);
const output = path.resolve(process.argv[3]);
const identity = process.argv[4];
assert.ok(['BORIS','CCOMAND','PTROOP'].includes(identity));
await fs.mkdir(output, { recursive: false });
const profile = path.join(output, 'profile');
await fs.mkdir(profile);
await fs.writeFile(
  path.join(profile, 'resource-registration.json'),
  JSON.stringify({ schemaVersion: 1, directory: path.resolve('.local') }),
);
const report = {
  identity,
  status: 'RUNNING',
  app: build,
  errors: [],
  stages: [],
  disclosure:
    'Controlled flat-ground actor placement, paused native-frame sweep and owner transfer. This is rendering and lifecycle evidence, not ordinary production or naturally executed animation.',
};
const save = async () =>
  fs.writeFile(path.join(output, 'result.json'), JSON.stringify(report, null, 2) + '\n');
const stage = async (name, data) => {
  report.stages.push({ name, data });
  await save();
  console.log(name, JSON.stringify(data ?? ''));
};
const app = await electron.launch({
  executablePath: await fs.realpath('node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'),
  args: [build],
  cwd: '/private/tmp',
  env: { ...process.env, RA2_DESKTOP_USER_DATA: profile, RA2_DESKTOP_NO_DISCOVERY: '1' },
  timeout: 60000,
});
try {
  const page = await app.firstWindow();
  page.on('pageerror', (error) => report.errors.push(error.stack));
  await page.locator('[data-edition=yr]').click({timeout:60000});
  const locale=JSON.parse(await fs.readFile('public/res/locale/zh-CN.json','utf8'));
  await page.getByRole('button',{name:locale['hd:menuskirmish'],exact:true}).waitFor({timeout:90000});
  await page.evaluate(()=>{
    const g=window.__ra2debug.generalOptions.graphics;g.hdEnabled.value=true;g.renderResolution.value='1080p';
    const prefs={_r_lastMap:'XMP23T4.map',_r_lastMode:'1',_r_lastCountry:'5',_r_lastColor:'1',_r_lastStartPos:'0',_r_lastTeam:'0',
      _r_hostOpts:'6;10000;0;1;1;0;1;0;;0;1;0;0',_r_lastBots:JSON.stringify([null,null,null,{d:2,c:5,co:2,s:3,t:1},null,null,null,null])};
    Object.entries(prefs).forEach(([k,v])=>localStorage.setItem(`_edition:yr:${k}`,v));
  });
  await page.getByRole('button',{name:locale['hd:menuskirmish'],exact:true}).click();
  await page.waitForFunction(() => window.__ra2debug?.skirmishLobby);
  await page.evaluate(() => window.__ra2debug.skirmishLobby.startGame(1700000000000));
  await page.waitForFunction(() => window.__ra2debug?.game?.status === 1, undefined, {
    timeout: 90000,
  });
  report.selection = await page.evaluate(() => {
    const d = window.__ra2debug;
    return {
      units: d.sovietUnitsHd,
      conscript: d.conscriptHd,
      powerPlant: d.powerPlantHd,
      napowr: d.napowrHd,
      buildings: d.sovietBuildingsHd,
      rhino: d.rhinoHd,
    };
  });
  await stage('initial-selection', report.selection);
  report.setup = await page.evaluate(async (identity) => {
    const d = window.__ra2debug,
      g = d.game,
      rule = g.rules.getObject(identity, identity === 'SQD' ? 7 : 3);
    const yard = d.localPlayer.getOwnedObjects().find((u) => /MCV$/.test(u.name));
    const tiles = g.map.tiles
      .getAll()
      .filter(
        (t) =>
          !t.rampType &&
          g.map.mapBounds.isWithinBounds(t) &&
          g.map.terrain.getPassableSpeed(t, rule.speedType, true, false) > 0 &&
          !g.map.tileOccupation.getObjectsOnTile(t).some((o) => o.isTechno() || o.isTerrain()),
      );
    tiles.sort(
      (a, b) =>
        Math.abs(Math.hypot(a.rx - yard.tile.rx, a.ry - yard.tile.ry) - 8) -
        Math.abs(Math.hypot(b.rx - yard.tile.rx, b.ry - yard.tile.ry) - 8),
    );
    const u = g.createUnitForPlayer(rule, d.localPlayer);
    g.spawnObject(u, tiles[0]);
    g.mapShroudTrait.revealMap(d.localPlayer, g);
    d.worldInteraction.minimapHandler.panToTile(u.tile);
    window.__sweepUnit = u;
    return {
      id: u.id,
      tile: [u.tile.rx, u.tile.ry],
      disclosure: 'Fixture spawn; game rules unchanged.',
    };
  }, identity);
  await page.waitForFunction(() => window.__ra2debug.renderableManager
    .getRenderableByGameObject(window.__sweepUnit)?.shpRenderable?.builder?.hdOverride,
    undefined, { timeout: 30000 });
  report.selection = await page.evaluate(() => {
    const d = window.__ra2debug;
    return { units: d.sovietUnitsHd, conscript: d.conscriptHd, powerPlant: d.powerPlantHd,
      napowr: d.napowrHd, buildings: d.sovietBuildingsHd, rhino: d.rhinoHd };
  });
  assert.ok([2, 4].includes(report.selection.units.families[identity].density));
  await stage('combined-selection', report.selection);
  report.geometry = await page.evaluate(() => {
    const d = window.__ra2debug,
      u = window.__sweepUnit;
    d.gameScreen.gameAnimationLoop.stop();
    const r = d.renderableManager.getRenderableByGameObject(u),
      hd = r.shpRenderable,
      b = hd.builder;
    const original = hd.constructor.factory(
      b.shpFile,
      b.palette,
      b.camera,
      b.offset,
      r.objectArt.hasShadow,
    );
    original.setFlat(b.flat);
    original.setBatched(b.useMeshBatching);
    if (b.useMeshBatching) original.setBatchPalettes(r.paletteRemaps);
    original.setSmoothCoverage(b.smoothCoverage);
    original.create3DObject();
    const ho = hd.get3DObject(),
      oo = original.get3DObject();
    oo.matrix.copy(ho.matrix);
    oo.matrixWorld.copy(ho.matrixWorld);
    oo.position.copy(ho.position);
    oo.quaternion.copy(ho.quaternion);
    oo.scale.copy(ho.scale);
    ho.parent.add(oo);
    oo.visible = false;
    window.__sweep = {
      r,
      hd,
      original,
      tick: d.game.currentTick,
      renderer: d.renderer.renderer,
      textures: [...d.worldView.sovietUnitsHd.families.values()].flatMap((f) =>
        [...f.members.values()].flatMap((m) => m.override.pages.flatMap((p) => p.tiles ? [p.base, p.data, p.tiles.map] : [p.base, p.data])),
      ),
      owners: [d.localPlayer, d.game.getCombatants().find((p) => p !== d.localPlayer)],
    };
    window.__flush = () => {
      d.worldScene.scene.updateMatrixWorld(true);
      d.worldScene.meshBatchManager.updateMeshes();
      d.worldScene.meshBatchManager.processRenderQueue();
      d.renderer.render();
    };
    window.__capture = (role, frame, opacity = 1) => {
      const { hd, original } = window.__sweep,
        ho = hd.get3DObject(),
        oo = original.get3DObject();
      hd.setFrame(frame);
      original.setFrame(frame);
      hd.setOpacity(opacity);
      original.setOpacity(opacity);
      ho.visible = role === 'hd';
      oo.visible = role === 'original';
      window.__flush();
      const active = role === 'hd' ? hd : original,
        mesh = active.getShapeMesh(),
        ab = active.builder;
      const canvas = d.renderer.renderer.domElement,
        rect = canvas.getBoundingClientRect(),
        vp = d.worldScene.viewport;
      const factor = canvas.height / d.renderer.height;
      const p = ho.getWorldPosition(new window.THREE.Vector3()).project(d.worldScene.camera);
      const cx = (vp.x + ((p.x + 1) * vp.width) / 2) * factor,
        cy = (vp.y + ((1 - p.y) * vp.height) / 2) * factor;
      const crop = { x: Math.round(cx) - 90, y: Math.round(cy) - 110, width: 180, height: 180 };
      const cut = document.createElement('canvas');
      cut.width = crop.width;
      cut.height = crop.height;
      cut
        .getContext('2d')
        .drawImage(canvas, crop.x, crop.y, crop.width, crop.height, 0, 0, crop.width, crop.height);
      const page = ab.getHdPage(),
        shadow = active.getShadowMesh();
      return {
        image: cut.toDataURL('image/png'),
        frame,
        tick: d.game.currentTick,
        role,
        opacity,
        crop,
        hd: !!ab.hdOverride,
        material: mesh.material.type,
        identity: ab.hdOverride?.identity,
        boundBase: page
          ? mesh.material.map === page.base
          : mesh.material.map === ab.atlas.getTexture(),
        boundRemap: page ? mesh.material.uniforms.remapMap.value === page.data : undefined,
        positions: Array.from(mesh.geometry.attributes.position.array),
        world: mesh.matrixWorld.toArray(),
        shadow: {
          visible: shadow?.visible,
          positions: Array.from(shadow?.geometry.attributes.position.array ?? []),
          world: shadow?.matrixWorld.toArray(),
        },
        gl: d.renderer.renderer.getContext().getError(),
        viewport: vp,
        buffer: [canvas.width, canvas.height],
        css: [rect.width, rect.height],
        dpr: devicePixelRatio,
        camera: {
          zoom: d.worldScene.camera.zoom,
          projection: d.worldScene.camera.projectionMatrix.toArray(),
        },
      };
    };
    return {
      originalHasHd: !!original.builder.hdOverride,
      hdHasHd: !!b.hdOverride,
      source: b.shpFile.filename,
      frameCount: b.hdOverride.frames.length,
    };
  });
  assert.equal(report.geometry.originalHasHd, false);
  assert.equal(report.geometry.hdHasHd, true);
  report.frames = [];
  for (const owner of [0, 1]) {
    await page.evaluate((owner) => {
      const d = window.__ra2debug,
        s = window.__sweep;
      d.game.changeObjectOwner(window.__sweepUnit, s.owners[owner]);
      s.r.update(0, 0);
      s.original.setPalette(s.r.palette);
      s.original.setExtraLight(s.hd.builder.extraLight);
    }, owner);
    for (let frame = 0; frame < report.geometry.frameCount; frame++) {
      const pair = [];
      for (const role of ['original', 'hd']) {
        const row = await page.evaluate(({ role, frame }) => window.__capture(role, frame), {
          role,
          frame,
        });
        const filename = `owner-${owner}-${String(frame).padStart(3, '0')}-${role}.png`;
        await fs.writeFile(
          path.join(output, filename),
          Buffer.from(row.image.split(',')[1], 'base64'),
        );
        delete row.image;
        row.file = filename;
        row.owner = owner;
        pair.push(row);
        report.frames.push(row);
        assert(row.boundBase && row.gl === 0);
        if (role === 'hd') assert(row.boundRemap);
      }
      assert.deepEqual(pair[0].positions, pair[1].positions, 'logical geometry changed');
      assert.deepEqual(pair[0].world, pair[1].world, 'world transform changed');
      assert.deepEqual(pair[0].shadow, pair[1].shadow, 'native shadow changed');
      assert.equal(pair[0].tick, pair[1].tick);
    }
    await stage('owner-frame-sweep', {
      owner,
      frames: report.geometry.frameCount,
      geometry: 'IDENTICAL',
      shadows: 'IDENTICAL',
    });
  }
  report.opacity = [];
  for (const opacity of [1, 0.5, 0, 1]) {
    const row = await page.evaluate((opacity) => window.__capture('hd', 48, opacity), opacity);
    const filename = `opacity-${report.opacity.length}.png`;
    await fs.writeFile(path.join(output, filename), Buffer.from(row.image.split(',')[1], 'base64'));
    delete row.image;
    row.file = filename;
    report.opacity.push(row);
  }
  await page.screenshot({ path: path.join(output, 'context.png') });
  await page.evaluate(() => {
    const s = window.__sweep;
    s.original.get3DObject().removeFromParent();
    s.original.dispose();
    s.hd.get3DObject().visible = true;
    s.hd.setOpacity(1);
    window.__ra2debug.gameScreen.gameAnimationLoop.start();
  });
  const abort = await page.evaluate(() => {
    const d = window.__ra2debug;
    d.gameScreen.menu.open();
    return d.gameScreen.strings.get('GUI:AbortMission');
  });
  await page.getByText(abort, { exact: true }).click();
  await page
    .getByText(await page.evaluate(() => window.__ra2debug.gameScreen.strings.get('GUI:Quit')), {
      exact: true,
    })
    .click();
  await page.waitForFunction(() => !window.__ra2debug.game, undefined, { timeout: 45000 });
  report.cleanup = await page.evaluate(() => {
    const s = window.__sweep;
    return {
      gameCleared: !window.__ra2debug.game,
      unitTextureCount: s.textures.length,
      texturesReleased: s.textures.every((t) => !s.renderer.properties.get(t).__webglTexture),
      memory: s.renderer.info.memory,
    };
  });
  assert(report.cleanup.texturesReleased);
  report.status = 'PASS_PAUSED_SHP_FRAMES_TWO_OWNER_GEOMETRY_SHADOW_AND_TEARDOWN';
} catch (error) {
  report.status = 'FAIL';
  report.failure = error.stack;
  console.error(error);
  process.exitCode = 1;
} finally {
  await save();
  await app.close();
}
