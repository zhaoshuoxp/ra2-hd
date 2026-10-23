import { _electron as electron } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const artifact = JSON.parse(await fs.readFile(process.argv[2], 'utf8'));
const output = path.resolve(process.argv[3]);
await fs.mkdir(output, { recursive: false });
const profile = path.join(output, 'profile');
await fs.mkdir(profile);
await fs.writeFile(
  path.join(profile, 'resource-registration.json'),
  JSON.stringify({ schemaVersion: 1, directory: path.resolve('.local') }),
);
const combined = process.env.RA2_SQD_COMBINED === '1';
const userOriginal = process.env.RA2_SQD_USER_ORIGINAL === '1';
const expectOriginal = userOriginal || process.env.RA2_SQD_EXPECT_ORIGINAL === '1';
const report = {
  combined,
  expectOriginal,
  userOriginal,
  status: 'RUNNING',
  app: artifact.artifact,
  errors: [],
  stages: [],
  disclosure:
    'SQD is normally queued and produced from a naval yard. Prerequisite buildings and target ships are legal-foundation fixtures. Rules, prices and abilities remain unchanged. Approach, submersion, grapple, rocking, punch, host death and removal use native simulation. Combined mode enables the accepted global HD preference; EXPECT_ORIGINAL selects historical capacity fallback; USER_ORIGINAL verifies the user-requested complete-family opt-out. Actual allocations and effective densities are recorded.',
};
const save = async () =>
  fs.writeFile(path.join(output, 'result.json'), JSON.stringify(report, null, 2) + '\n');
const stage = async (name, data) => {
  report.stages.push({ name, data });
  await save();
  console.log(name, JSON.stringify(data ?? ''));
};
const app = await electron.launch({
  executablePath: artifact.executable,
  cwd: '/private/tmp',
  env: { ...process.env, RA2_DESKTOP_USER_DATA: profile, RA2_DESKTOP_NO_DISCOVERY: '1' },
  timeout: 60000,
});
async function sweepOverlay(page) {
  const setup = await page.evaluate(() => {
    const d = window.__ra2debug,
      host = d.renderableManager.getRenderableByGameObject(window.__sqdHost);
    d.gameScreen.gameAnimationLoop.stop();
    const anim = host.squidGrabAnim,
      native = anim.mainObj,
      b = native.builder;
    const actors = [d.localPlayer, d.game.getCombatants().find((p) => p !== d.localPlayer)];
    const pairs = actors.map((actor) => {
      const palette = b.palette.clone();
      palette.remap(actor.color);
      return ['original', 'hd'].map((role) => {
        const sprite = native.constructor.factory(b.shpFile, palette, b.camera, b.offset, false);
        sprite.setFlat(b.flat);
        sprite.setBatched(b.useMeshBatching);
        if (b.useMeshBatching) sprite.setBatchPalettes([palette]);
        sprite.setSmoothCoverage(b.smoothCoverage);
        sprite.setExtraLight(b.extraLight);
        sprite.setForceTransparent(b.forceTransparent);
        if (role === 'hd') sprite.setHdOverride(b.hdOverride);
        sprite.create3DObject();
        const no = native.get3DObject(),
          obj = sprite.get3DObject();
        obj.matrix.copy(no.matrix);
        obj.matrixWorld.copy(no.matrixWorld);
        obj.position.copy(no.position);
        obj.quaternion.copy(no.quaternion);
        obj.scale.copy(no.scale);
        no.parent.add(obj);
        obj.visible = false;
        return sprite;
      });
    });
    native.get3DObject().visible = false;
    window.__overlaySweep = { pairs, native, anim, tick: d.game.currentTick };
    window.__overlayCapture = (role, frame, owner) => {
      const s = window.__overlaySweep;
      s.pairs.flat().forEach((sprite) => (sprite.get3DObject().visible = false));
      const sprite = s.pairs[owner][role === 'hd' ? 1 : 0];
      sprite.setFrame(frame);
      sprite.get3DObject().visible = true;
      d.worldScene.scene.updateMatrixWorld(true);
      d.worldScene.meshBatchManager.updateMeshes();
      d.worldScene.meshBatchManager.processRenderQueue();
      d.renderer.render();
      const b = sprite.builder,
        m = sprite.getShapeMesh(),
        p = b.getHdPage();
      return {
        role,
        frame,
        owner,
        hd: !!b.hdOverride,
        positions: Array.from(m.geometry.attributes.position.array),
        world: m.matrixWorld.toArray(),
        boundBase: m.material.map === (p ? p.base : b.atlas.getTexture()),
        boundRemap: !!p && m.material.uniforms.remapMap.value === p.data,
        tick: d.game.currentTick,
        gl: d.renderer.renderer.getContext().getError(),
      };
    };
    return {
      source: b.shpFile.filename,
      frames: b.hdOverride.frames.length,
      originalHasHd: !!pairs[0][0].builder.hdOverride,
    };
  });
  assert.equal(setup.source, 'sqdg.shp');
  assert.equal(setup.frames, 240);
  assert(!setup.originalHasHd);
  const rows = [];
  for (const owner of [0, 1])
    for (let frame = 0; frame < 240; frame++) {
      const pair = [];
      for (const role of ['original', 'hd']) {
        const row = await page.evaluate(
          ({ role, frame, owner }) => window.__overlayCapture(role, frame, owner),
          { role, frame, owner },
        );
        assert(row.boundBase && row.gl === 0);
        assert.equal(row.hd, role === 'hd');
        if (role === 'hd') assert(row.boundRemap);
        pair.push(row);
        rows.push(row);
        if ([0, 76, 80, 159, 160, 239].includes(frame))
          await page.screenshot({
            path: path.join(output, `overlay-${owner}-${frame}-${role}.png`),
          });
      }
      assert.deepEqual(pair[0].positions, pair[1].positions);
      assert.deepEqual(pair[0].world, pair[1].world);
      assert.equal(pair[0].tick, pair[1].tick);
    }
  await fs.writeFile(
    path.join(output, 'overlay-sweep.json'),
    JSON.stringify(
      {
        status: 'PASS_PAUSED_SQDG_240_FRAMES_TWO_PALETTES_GEOMETRY_AND_BINDING',
        disclosure:
          'Forced native frames on clones of the native-created host animation with its actual HD override and two palettes registered before mesh creation; not 240 naturally executed states.',
        setup,
        rows,
      },
      null,
      2,
    ) + '\n',
  );
  await page.evaluate(() => {
    const d = window.__ra2debug,
      s = window.__overlaySweep;
    s.pairs.flat().forEach((sprite) => {
      sprite.get3DObject().removeFromParent();
      sprite.dispose();
    });
    s.native.get3DObject().visible = true;
    d.gameScreen.gameAnimationLoop.start();
  });
}

try {
  const page = await app.firstWindow();
  page.on('pageerror', (error) => report.errors.push(error.stack));
  await page.getByText('Offline Skirmish', { exact: true }).waitFor({ timeout: 90000 });
  await page.evaluate((combined) => {
    const g = window.__ra2debug.generalOptions.graphics;
    for (const key of [
      'conscript',
      'powerPlant',
      'napowr',
      'nahand',
      'narefn',
      'naweap',
      'nacnst',
      'rhino',
      'sovietUnits',
    ])
      g[`${key}Hd`].value = combined || ['conscript', 'rhino', 'sovietUnits'].includes(key);
    g.renderResolution.value = '1080p';
    Object.entries({
      _r_lastMap: 'MP01T4.map',
      _r_lastMode: '1',
      _r_lastCountry: '5',
      _r_lastColor: '1',
      _r_lastStartPos: '0',
      _r_lastTeam: '0',
      _r_hostOpts: '6;10000;0;1;1;0;1;0;;0;1;0;0',
      _r_lastBots: JSON.stringify([
        null,
        null,
        null,
        { d: 4, c: 5, co: 2, s: 3, t: 1 },
        null,
        null,
        null,
        null,
      ]),
    }).forEach(([k, v]) => localStorage.setItem(k, v));
  }, combined);
  await page.getByText('Offline Skirmish', { exact: true }).click();
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
  assert.equal(report.selection.units.families.SQD.status, 'NOT_REQUESTED');
  await stage('combined-selection', report.selection);

  report.fixtures = await page.evaluate(() => {
    const d = window.__ra2debug,
      g = d.game,
      p = d.localPlayer;
    g.mapShroudTrait.revealMap(p, g);
    const worker = g.getConstructionWorker(p),
      center = p.getOwnedObjects().find((o) => /MCV$/.test(o.name)).tile;
    const before = p.production.isAvailableForProduction(g.rules.getObject('SQD', 7));
    const rows = [];
    for (const name of [
      'NAPOWR',
      'NAPOWR',
      'NAPOWR',
      'NAHAND',
      'NAREFN',
      'NARADR',
      'NAWEAP',
      'NATECH',
      'NAYARD',
    ]) {
      const tiles = g.map.tiles
        .getAll()
        .filter(
          (t) =>
            g.map.mapBounds.isWithinBounds(t) &&
            worker.canPlaceAt(
              name,
              { rx: t.rx, ry: t.ry },
              { normalizedTile: true, ignoreAdjacent: true },
            ),
        );
      tiles.sort(
        (a, b) =>
          Math.hypot(a.rx - center.rx, a.ry - center.ry) -
          Math.hypot(b.rx - center.rx, b.ry - center.ry),
      );
      if (!tiles.length) throw Error(`No legal fixture foundation: ${name}`);
      const b = g.createObject(2, name);
      g.changeObjectOwner(b, p);
      g.spawnObject(b, tiles[0]);
      rows.push({ name, tile: [b.tile.rx, b.tile.ry] });
    }
    return {
      before,
      rows,
      after: p.production.isAvailableForProduction(g.rules.getObject('SQD', 7)),
    };
  });
  assert(!report.fixtures.before && report.fixtures.after);
  await stage('prerequisite-fixtures-rules-unchanged', report.fixtures);
  await page.waitForTimeout(3000);
  await page.evaluate(() => window.__ra2debug.actionsApi.queueForProduction(5, 7, 'SQD', 1));
  await page.waitForFunction(
    () => window.__ra2debug.localPlayer.getOwnedObjects().some((u) => u.name === 'SQD'),
    undefined,
    { timeout: 120000 },
  );
  await page.waitForFunction(
    () =>
      ['READY', 'BUDGET_FALLBACK', 'FAILED'].includes(window.__ra2debug.sovietUnitsHd.families.SQD.status),
    undefined,
    { timeout: 30000 },
  );
  report.production = await page.evaluate(() => {
    const d = window.__ra2debug,
      u = d.localPlayer.getOwnedObjects().find((u) => u.name === 'SQD');
    window.__sqd = u;
    window.__sqdTrace = [];
    d.worldInteraction.minimapHandler.panToTile(u.tile);
    window.__sqdSample = () => {
      const r = d.renderableManager.getRenderableByGameObject(u),
        b = r?.shpRenderable?.builder;
      const hp = d.renderableManager.getRenderableByGameObject(window.__sqdHost),
        anim = hp?.squidGrabAnim;
      const ab = anim?.mainObj?.builder,
        ap = ab?.getHdPage(),
        am = anim?.mainObj?.getShapeMesh();
      const page = b?.getHdPage(),
        mesh = r?.shpRenderable?.getShapeMesh();
      return {
        tick: d.game.currentTick,
        frame: b?.getFrame(),
        hd: !!b?.hdOverride,
        source: b?.shpFile?.filename,
        boundBase: !!page && mesh.material.map === page.base,
        boundRemap: !!page && mesh.material.uniforms.remapMap.value === page.data,
        spawned: u.isSpawned,
        destroyed: u.isDestroyed,
        moving: u.isMoving,
        firing: u.isFiring,
        tile: [u.tile.rx, u.tile.ry],
        health: u.healthTrait.health,
        renderer: !!r,
        visible: r?.get3DObject()?.visible,
        submerged: u.submergibleTrait?.isSubmerged(),
        cloaked: u.cloakableTrait?.isCloaked(),
        hostHealth: window.__sqdHost?.healthTrait.health,
        hostDestroyed: window.__sqdHost?.isDestroyed,
        hostInfested: window.__sqdHost?.parasiteableTrait?.isInfested(),
        hostRocking: !!window.__sqdHost?.rocking,
        overlay: {
          present: !!anim,
          frame: ab?.getFrame(),
          source: ab?.shpFile?.filename,
          hd: !!ab?.hdOverride,
          boundBase: !!ap && am.material.map === ap.base,
          boundRemap: !!ap && am.material.uniforms.remapMap.value === ap.data,
        },
        gl: d.renderer.renderer.getContext().getError(),
      };
    };
    window.__sqdTimer = setInterval(() => window.__sqdTrace.push(window.__sqdSample()), 20);
    return {
      id: u.id,
      cost: u.rules.cost,
      selection: d.sovietUnitsHd,
      sample: window.__sqdSample(),
    };
  });
  assert.equal(report.production.cost, 1000);
  assert.equal(
    report.production.selection.families.SQD.status,
    userOriginal ? 'FAILED' : expectOriginal ? 'BUDGET_FALLBACK' : 'READY',
  );
  assert.equal(report.production.sample.hd, !expectOriginal);
  if (userOriginal) {
    assert.equal(report.production.selection.families.SQD.attempts[0].reason, 'USER_REQUESTED_ORIGINAL');
    assert.equal(report.production.selection.families.SQD.gpuBytes, 0);
  }
  await stage('native-sqd-production', report.production);
  report.recording = await page.evaluate(() => {
    const d = window.__ra2debug,
      canvas = d.renderer.renderer.domElement,
      stream = canvas.captureStream(15);
    const mimeType = 'video/webm;codecs=vp9';
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8000000 });
    window.__videoChunks = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size) window.__videoChunks.push(e.data);
    };
    window.__nativeRecorder = recorder;
    window.__nativeVideoStream = stream;
    recorder.start(1000);
    return {
      width: canvas.width,
      height: canvas.height,
      fps: 15,
      mimeType,
      cameraZoom: d.worldScene.camera.zoom,
    };
  });

  await page.waitForTimeout(3000);
  await page.screenshot({ path: path.join(output, 'sqd-produced-submerged.png') });
  report.target = await page.evaluate(() => {
    const d = window.__ra2debug,
      g = d.game,
      u = window.__sqd;
    const enemy = g.getCombatants().find((p) => p !== d.localPlayer),
      rule = g.rules.getObject('SAPC', 7);
    const tiles = g.map.tiles
      .getAll()
      .filter(
        (t) =>
          !t.rampType &&
          g.map.mapBounds.isWithinBounds(t) &&
          g.map.terrain.getPassableSpeed(t, u.rules.speedType, false, false) > 0 &&
          !g.map.tileOccupation.getObjectsOnTile(t).some((o) => o.isTechno() || o.isTerrain()),
      );
    tiles.sort(
      (a, b) =>
        Math.abs(Math.hypot(a.rx - u.tile.rx, a.ry - u.tile.ry) - 7) -
        Math.abs(Math.hypot(b.rx - u.tile.rx, b.ry - u.tile.ry) - 7),
    );
    const host = g.createUnitForPlayer(rule, enemy);
    g.spawnObject(host, tiles[0]);
    window.__sqdHost = host;
    d.actionsApi.orderUnits([u.id], 2, host.id);
    return { name: host.name, tile: [host.tile.rx, host.tile.ry], health: host.healthTrait.health };
  });
  await stage('host-fixture-and-native-attack-order', report.target);
  await page.waitForFunction(
    () => window.__sqdTrace.some((r) => r.hostInfested && !r.spawned && r.overlay.present),
    undefined,
    { timeout: 60000 },
  );
  await stage('native-grapple', await page.evaluate(() => window.__sqdSample()));
  if (!expectOriginal && process.env.RA2_SQD_OVERLAY_SWEEP === '1') await sweepOverlay(page);
  await page.screenshot({ path: path.join(output, 'sqd-grapple.png') });
  await page.waitForFunction(
    () => window.__sqdTrace.some((r) => r.hostRocking && r.hostHealth < 100),
    undefined,
    { timeout: 30000 },
  );
  await stage('native-rocking-and-damage', await page.evaluate(() => window.__sqdSample()));
  await page.screenshot({ path: path.join(output, 'sqd-rocking.png') });
  await page.waitForFunction(
    () => window.__sqdHost.isDestroyed && window.__sqd.isSpawned,
    undefined,
    { timeout: 120000 },
  );
  await stage(
    'native-host-death-and-squid-return',
    await page.evaluate(() => window.__sqdSample()),
  );
  assert(
    (await page.evaluate(() => window.__sqdTrace)).some(
      (r) => r.overlay.hd === !expectOriginal && r.overlay.present,
    ),
  );
  report.punch = await page.evaluate(() => {
    const d = window.__ra2debug,
      g = d.game,
      u = window.__sqd;
    const enemy = g.getCombatants().find((p) => p !== d.localPlayer),
      rule = g.rules.getObject('SQD', 7);
    const tiles = g.map.tiles
      .getAll()
      .filter(
        (t) =>
          !t.rampType &&
          g.map.mapBounds.isWithinBounds(t) &&
          g.map.terrain.getPassableSpeed(t, rule.speedType, false, false) > 0 &&
          !g.map.tileOccupation.getObjectsOnTile(t).some((o) => o.isTechno() || o.isTerrain()),
      );
    tiles.sort(
      (a, b) =>
        Math.abs(Math.hypot(a.rx - u.tile.rx, a.ry - u.tile.ry) - 4) -
        Math.abs(Math.hypot(b.rx - u.tile.rx, b.ry - u.tile.ry) - 4),
    );
    const target = g.createUnitForPlayer(rule, enemy);
    g.spawnObject(target, tiles[0]);
    window.__sqdPunchTarget = target;
    d.actionsApi.orderUnits([u.id], 2, target.id);
    return {
      target: target.name,
      parasiteable: target.rules.parasiteable,
      secondary: u.secondaryWeapon?.rules.name,
    };
  });
  await page.waitForFunction(() => window.__sqdPunchTarget.healthTrait.health < 100, undefined, {
    timeout: 60000,
  });
  await stage('native-secondary-punch', {
    ...report.punch,
    ...(await page.evaluate(() => ({
      targetHealth: window.__sqdPunchTarget.healthTrait.health,
      sample: window.__sqdSample(),
    }))),
  });
  await page.evaluate(() => {
    const d = window.__ra2debug,
      u = window.__sqd,
      t = window.__sqdPunchTarget;
    u.secondaryWeapon.warhead.inflictDamage(
      10000,
      u,
      { player: t.owner, obj: t, weapon: u.secondaryWeapon },
      d.game,
    );
  });
  await page.waitForFunction(
    () =>
      window.__sqd.isDestroyed &&
      !window.__ra2debug.renderableManager.getRenderableByGameObject(window.__sqd),
    undefined,
    { timeout: 30000 },
  );
  await stage('native-damage-boundary-removal', await page.evaluate(() => window.__sqdSample()));
  report.trace = await page.evaluate(() => {
    clearInterval(window.__sqdTimer);
    return window.__sqdTrace;
  });
  assert(report.trace.some((r) => r.moving));
  assert(report.trace.some((r) => r.submerged));
  assert(report.trace.some((r) => r.hostInfested && !r.spawned && !r.renderer));
  assert(report.trace.every((r) => r.gl === 0));
  if (!expectOriginal) assert(report.trace.some((r) => r.overlay.boundBase && r.overlay.boundRemap));
  else assert(report.trace.every((r) => !r.hd && !r.overlay.hd));
  report.status = userOriginal ? 'PASS_SQD_USER_REQUESTED_ORIGINAL_BODY_GRAPPLE_NATIVE_ACTIONS' : expectOriginal
    ? 'PASS_SQD_NATIVE_COMBINED_BUDGET_ORIGINAL_FALLBACK'
    : 'PASS_SQD_NATIVE_PRODUCTION_SUBMERGE_GRAPPLE_ROCK_PUNCH_RETURN_REMOVAL';
  await stage('complete', {
    samples: report.trace.length,
    overlayFrames: [...new Set(report.trace.map((r) => r.overlay.frame).filter(Number.isInteger))],
  });
} catch (error) {
  report.status = 'FAIL';
  report.failure = error.stack;
  console.error(error);
  process.exitCode = 1;
  const page = await app.firstWindow();
  report.trace = await page
    .evaluate(() => {
      clearInterval(window.__sqdTimer);
      return window.__sqdTrace;
    })
    .catch(() => undefined);
  await page.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {});
} finally {
  try {
    const page = app.windows()[0];
    const video = await page?.evaluate(async () => {
      const recorder = window.__nativeRecorder;
      if (!recorder) return;
      if (recorder.state !== 'inactive')
        await new Promise((resolve) => {
          recorder.onstop = resolve;
          recorder.stop();
        });
      window.__nativeVideoStream.getTracks().forEach((t) => t.stop());
      return await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(new Blob(window.__videoChunks, { type: recorder.mimeType }));
      });
    });
    if (video) {
      const bytes = Buffer.from(video.split(',')[1], 'base64');
      await fs.writeFile(path.join(output, 'native-actions.webm'), bytes);
      report.recording.bytes = bytes.length;
    }
  } catch (error) {
    report.recordingFailure = error.message;
  }
  await save();
  await app.close();
}
