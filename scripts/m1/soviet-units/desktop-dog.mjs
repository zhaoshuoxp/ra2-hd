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
const report = {
  status: 'RUNNING',
  app: artifact.artifact,
  errors: [],
  stages: [],
  disclosure:
    'DOG is naturally queued and built. The enemy infantry is a controlled placement; approach, leap, kill and return use native orders and simulation. Frame sweeps are separately labeled.',
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
try {
  const page = await app.firstWindow();
  page.on('pageerror', (error) => report.errors.push(error.stack));
  await page.getByText('Offline Skirmish', { exact: true }).waitFor({ timeout: 90000 });
  await page.evaluate(() => {
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
      g[`${key}Hd`].value = true;
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
  });
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
  assert.equal(report.selection.units.families.DOG.status, 'NOT_REQUESTED');
  await stage('combined-selection', report.selection);
  await page.evaluate(() => {
    const d = window.__ra2debug;
    d.actionsApi.orderUnits(
      [d.localPlayer.getOwnedObjects().find((u) => /MCV$/.test(u.name)).id],
      10,
    );
  });
  await page.waitForFunction(() =>
    window.__ra2debug.localPlayer.getOwnedObjects().some((u) => u.name === 'NACNST'),
  );
  for (const name of ['NAPOWR', 'NAHAND']) {
    await page.evaluate(
      (name) => window.__ra2debug.actionsApi.queueForProduction(0, 2, name, 1),
      name,
    );
    await page.waitForFunction(
      () => window.__ra2debug.localPlayer.production.getQueue(0).status === 3,
      undefined,
      { timeout: 120000 },
    );
    await page.evaluate((name) => {
      const d = window.__ra2debug,
        yard = d.localPlayer.getOwnedObjects().find((u) => u.name === 'NACNST'),
        tiles = [];
      for (let x = -12; x <= 12; x++)
        for (let y = -12; y <= 12; y++) tiles.push({ rx: yard.tile.rx + x, ry: yard.tile.ry + y });
      const offsets = { NAPOWR: [-4, -2], NAHAND: [-5, 2], NAREFN: [-5, 7], NAWEAP: [5, 5] }[name];
      tiles.sort(
        (a, b) =>
          Math.hypot(a.rx - yard.tile.rx - offsets[0], a.ry - yard.tile.ry - offsets[1]) -
          Math.hypot(b.rx - yard.tile.rx - offsets[0], b.ry - yard.tile.ry - offsets[1]),
      );
      const tile = tiles.find((t) =>
        d.game.getConstructionWorker(d.localPlayer).canPlaceAt(name, t, { normalizedTile: true }),
      );
      if (!tile) throw Error(`No legal foundation: ${name}`);
      d.actionsApi.placeBuilding(name, tile.rx, tile.ry);
    }, name);
    await page.waitForFunction(
      (name) => window.__ra2debug.localPlayer.getOwnedObjects().some((u) => u.name === name),
      name,
    );
    await page.waitForTimeout(2400);
    await stage('native-building-production', name);
  }
  await page.evaluate(() => window.__ra2debug.actionsApi.queueForProduction(2, 3, 'DOG', 1));
  await page.waitForFunction(
    () => window.__ra2debug.localPlayer.getOwnedObjects().some((u) => u.name === 'DOG'),
    undefined,
    { timeout: 90000 },
  );
  await page.waitForFunction(
    () => {
      const d = window.__ra2debug;
      const u = d.localPlayer.getOwnedObjects().find((u) => u.name === 'DOG');
      return (
        u && d.renderableManager.getRenderableByGameObject(u)?.shpRenderable?.builder?.hdOverride
      );
    },
    undefined,
    { timeout: 30000 },
  );
  report.production = await page.evaluate(() => {
    const d = window.__ra2debug,
      u = d.localPlayer.getOwnedObjects().find((u) => u.name === 'DOG');
    window.__dog = u;
    window.__dogTrace = [];
    d.worldInteraction.minimapHandler.panToTile(u.tile);
    window.__dogSample = () => {
      const r = d.renderableManager.getRenderableByGameObject(u),
        b = r?.shpRenderable?.builder,
        frame = b?.getFrame(),
        hd = b?.hdOverride;
      const page = hd?.pages[hd.frames[frame + b.frameOffset]?.page],
        mesh = r?.shpRenderable?.getShapeMesh();
      const leaps = d.game.world
        .getAllObjects()
        .filter((p) => p.fromObject === u && p.rules.name === 'DOGJUMP')
        .map((p) => {
          const r = d.renderableManager.getRenderableByGameObject(p),
            b = r?.shpRenderable?.builder,
            page = b?.getHdPage(),
            mesh = r?.shpRenderable?.getShapeMesh();
          return {
            id: p.id,
            frame: b?.getFrame(),
            source: b?.shpFile.filename,
            hd: !!b?.hdOverride,
            boundBase: !!page && mesh.material.map === page.base,
            boundRemap: !!page && mesh.material.uniforms.remapMap.value === page.data,
            height: p.position.worldPosition.y,
            visible: r?.get3DObject()?.visible,
          };
        });
      return {
        leaps,
        tick: d.game.currentTick,
        frame,
        hd: !!hd,
        source: b?.shpFile?.filename,
        boundBase: !!page && mesh.material.map === page.base,
        boundRemap: !!page && mesh.material.uniforms.remapMap.value === page.data,
        tile: [u.tile.rx, u.tile.ry],
        moving: u.isMoving,
        firing: u.isFiring,
        spawned: u.isSpawned,
        destroyed: u.isDestroyed,
        renderer: !!r,
        visible: r?.get3DObject()?.visible,
        hostInfested: window.__dogHost?.parasiteableTrait?.isInfested(),
        hostHealth: window.__dogHost?.healthTrait.health,
        hostDestroyed: window.__dogHost?.isDestroyed,
        shadow: !!r?.shpRenderable?.getShadowMesh()?.visible,
        gl: d.renderer.renderer.getContext().getError(),
      };
    };
    window.__dogTimer = setInterval(() => window.__dogTrace.push(window.__dogSample()), 20);
    return {
      id: u.id,
      name: u.name,
      cost: u.rules.cost,
      tick: d.game.currentTick,
      sample: window.__dogSample(),
    };
  });
  assert(
    report.production.sample.hd &&
      report.production.sample.boundBase &&
      report.production.sample.boundRemap,
  );
  await stage('native-dog-production', report.production);
  await page.screenshot({ path: path.join(output, 'dog-produced.png') });
  await page.waitForFunction(
    () =>
      window.__ra2debug.localPlayer.getOwnedObjects().find((u) => u.name === 'NAHAND').factoryTrait
        .status === 0,
    undefined,
    { timeout: 30000 },
  );
  report.recording = await page.evaluate(() => {
    const canvas = window.__ra2debug.renderer.renderer.domElement;
    const stream = canvas.captureStream(15);
    const mimeType = 'video/webm;codecs=vp9';
    if (!MediaRecorder.isTypeSupported(mimeType))
      throw Error('Native canvas video codec unavailable');
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8000000 });
    window.__videoChunks = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size) window.__videoChunks.push(event.data);
    };
    window.__nativeRecorder = recorder;
    window.__nativeVideoStream = stream;
    recorder.start(1000);
    return {
      width: canvas.width,
      height: canvas.height,
      fps: 15,
      mimeType,
      cameraZoom: window.__ra2debug.worldScene.camera.zoom,
    };
  });
  await page.evaluate(() => {
    const d = window.__ra2debug,
      u = window.__dog;
    const rule = d.game.rules.getObject('E2', 3),
      enemy = d.game.getCombatants().find((p) => p !== d.localPlayer);
    const tiles = d.game.map.tiles
      .getAll()
      .filter(
        (t) =>
          !t.rampType &&
          d.game.map.mapBounds.isWithinBounds(t) &&
          d.game.map.terrain.getPassableSpeed(t, rule.speedType, true, false) > 0 &&
          !d.game.map.tileOccupation.getObjectsOnTile(t).some((o) => o.isTechno() || o.isTerrain()),
      );
    tiles.sort(
      (a, b) =>
        Math.abs(Math.hypot(a.rx - u.tile.rx, a.ry - u.tile.ry) - 7) -
        Math.abs(Math.hypot(b.rx - u.tile.rx, b.ry - u.tile.ry) - 7),
    );
    const host = d.game.createUnitForPlayer(rule, enemy);
    d.game.spawnObject(host, tiles[0]);
    window.__dogHost = host;
    d.game.mapShroudTrait.revealMap(d.localPlayer, d.game);
    d.actionsApi.orderUnits([u.id], 2, host.id);
  });
  await page.waitForFunction(
    () => window.__dogHost.isDestroyed && window.__dog.isSpawned,
    undefined,
    { timeout: 60000 },
  );
  await page.waitForTimeout(300);
  await stage(
    'native-infantry-kill-and-dog-return',
    await page.evaluate(() => window.__dogSample()),
  );
  await page.screenshot({ path: path.join(output, 'dog-after-leap.png') });
  report.combinedFixture = await page.evaluate(() => {
    const d = window.__ra2debug,
      g = d.game;
    window.__combinedUnits = [];
    for (const [name, type] of [
      ['SENGINEER', 3],
      ['DRON', 7],
      ['ADOG', 3],
    ]) {
      const rule = g.rules.getObject(name, type);
      const tiles = g.map.tiles
        .getAll()
        .filter(
          (t) =>
            !t.rampType &&
            g.map.mapBounds.isWithinBounds(t) &&
            g.map.terrain.getPassableSpeed(t, rule.speedType, type === 3, false) > 0 &&
            !g.map.tileOccupation.getObjectsOnTile(t).some((o) => o.isTechno() || o.isTerrain()),
        );
      tiles.sort(
        (a, b) =>
          Math.hypot(a.rx - window.__dog.tile.rx, a.ry - window.__dog.tile.ry) -
          Math.hypot(b.rx - window.__dog.tile.rx, b.ry - window.__dog.tile.ry),
      );
      const unit = g.createUnitForPlayer(rule, d.localPlayer);
      g.spawnObject(unit, tiles[0]);
      window.__combinedUnits.push(unit);
    }
    return {
      disclosure:
        'Additional Soviet engineer, Terror Drone, and Allied dog are controlled fixtures for simultaneous allocations and identity isolation.',
    };
  });
  await page.waitForFunction(
    () => {
      const d = window.__ra2debug;
      return window.__combinedUnits
        .filter((u) => u.name !== 'ADOG')
        .every(
          (u) =>
            d.renderableManager.getRenderableByGameObject(u)?.shpRenderable?.builder?.hdOverride,
        );
    },
    undefined,
    { timeout: 30000 },
  );
  report.combinedFixture.selection = await page.evaluate(() => {
    const d = window.__ra2debug;
    return {
      allocation: d.sovietUnitsHd,
      units: [...window.__combinedUnits, window.__dog].map((u) => ({
        name: u.name,
        hd: !!d.renderableManager.getRenderableByGameObject(u)?.shpRenderable?.builder?.hdOverride,
      })),
      gl: d.renderer.renderer.getContext().getError(),
    };
  });
  assert(report.combinedFixture.selection.units.every((u) => u.hd === (u.name !== 'ADOG')));
  assert.equal(report.combinedFixture.selection.gl, 0);
  assert.equal(report.combinedFixture.selection.allocation.gpuBytes, 16384000);
  assert(
    report.combinedFixture.selection.allocation.gpuBytes <=
      report.combinedFixture.selection.allocation.budget,
  );
  await stage('three-live-unit-families-and-allied-dog-isolation', report.combinedFixture);
  await page.evaluate(() => {
    const d = window.__ra2debug,
      u = window.__dog;
    const attacker = d.game.createUnitForPlayer(
      d.game.rules.getObject('E2', 3),
      window.__dogHost.owner,
    );
    const weapon = attacker.primaryWeapon;
    weapon.warhead.inflictDamage(
      10000,
      u,
      { player: attacker.owner, obj: attacker, weapon },
      d.game,
    );
  });
  await page.waitForFunction(
    () =>
      window.__dog.isDestroyed &&
      !window.__ra2debug.renderableManager.getRenderableByGameObject(window.__dog),
  );
  await stage('native-damage-boundary-removal', await page.evaluate(() => window.__dogSample()));
  report.trace = await page.evaluate(() => {
    clearInterval(window.__dogTimer);
    window.__dogTrace.push(window.__dogSample());
    return window.__dogTrace;
  });
  assert(report.trace.some((row) => row.moving && row.hd));
  assert(report.trace.some((row) => !row.spawned && row.leaps.length > 0));
  assert(report.trace.every((row) => row.gl === 0));
  assert(
    report.trace.some((row) =>
      row.leaps.some((p) => p.hd && p.boundBase && p.boundRemap && p.visible),
    ),
  );
  assert(report.trace.some((row) => row.hostDestroyed && row.spawned && row.hd));
  report.status = 'PASS_DOG_NATIVE_PRODUCTION_LEAP_KILL_RETURN_AND_REMOVAL';
  await stage('complete', {
    frames: [...new Set(report.trace.map((row) => row.frame).filter(Number.isInteger))],
    samples: report.trace.length,
  });
} catch (error) {
  report.status = 'FAIL';
  report.failure = error.stack;
  const page = await app.firstWindow();
  report.trace = await page
    .evaluate(() => {
      clearInterval(window.__dogTimer);
      window.__dogTrace.push(window.__dogSample());
      return window.__dogTrace;
    })
    .catch(() => undefined);
  await page.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {});
  process.exitCode = 1;
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
      window.__nativeVideoStream.getTracks().forEach((track) => track.stop());
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
