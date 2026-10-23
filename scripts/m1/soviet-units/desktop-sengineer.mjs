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
    'SENGINEER units are normally produced. Capture uses a normally built power plant transferred to the enemy as a fixture. Repair starts from a controlled health reduction. Orders, movement, capture, repair, consumption and death rendering run through native simulation.',
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
  const page = await app.firstWindow({ timeout: 30000 });
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
  assert.equal(report.selection.units.families.SENGINEER.status, 'NOT_REQUESTED');
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
  await page.evaluate(() => window.__ra2debug.actionsApi.queueForProduction(2, 3, 'SENGINEER', 3));
  await page.waitForFunction(
    () =>
      window.__ra2debug.localPlayer.getOwnedObjects().filter((u) => u.name === 'SENGINEER')
        .length === 3,
    undefined,
    { timeout: 120000 },
  );
  await page.waitForFunction(
    () =>
      window.__ra2debug.localPlayer.getOwnedObjects().find((u) => u.name === 'NAHAND').factoryTrait
        .status === 0,
    undefined,
    { timeout: 30000 },
  );
  await page.waitForFunction(() => { const d = window.__ra2debug; return d.localPlayer.getOwnedObjects().filter(u => u.name === 'SENGINEER').every(u => d.renderableManager.getRenderableByGameObject(u)?.shpRenderable?.builder?.hdOverride); }, undefined, { timeout: 30000 });
  report.production = await page.evaluate(() => {
    const d = window.__ra2debug;
    window.__engineers = d.localPlayer.getOwnedObjects().filter((u) => u.name === 'SENGINEER');
    window.__engineerTrace = [];
    window.__engineerSample = () => ({
      tick: d.game.currentTick,
      phase: window.__engineerPhase,
      units: window.__engineers.map((u) => {
        const r = d.renderableManager.getRenderableByGameObject(u),
          b = r?.shpRenderable?.builder,
          p = b?.getHdPage(),
          mesh = r?.shpRenderable?.getShapeMesh();
        return {
          id: u.id,
          frame: b?.getFrame(),
          hd: !!b?.hdOverride,
          source: b?.shpFile.filename,
          boundBase: !!p && mesh.material.map === p.base,
          boundRemap: !!p && mesh.material.uniforms.remapMap.value === p.data,
          spawned: u.isSpawned,
          destroyed: u.isDestroyed,
          renderer: !!r,
          moving: u.isMoving,
          shadow: !!r?.shpRenderable?.getShadowMesh()?.visible,
          tile: [u.tile.rx, u.tile.ry],
        };
      }),
      gl: d.renderer.renderer.getContext().getError(),
    });
    window.__engineerPhase = 'produced';
    window.__engineerTimer = setInterval(
      () => window.__engineerTrace.push(window.__engineerSample()),
      20,
    );
    d.worldInteraction.minimapHandler.panToTile(window.__engineers[0].tile);
    return {
      names: window.__engineers.map((u) => u.name),
      costs: window.__engineers.map((u) => u.rules.cost),
      sample: window.__engineerSample(),
      viewport: [innerWidth, innerHeight],
      buffer: [d.renderer.renderer.domElement.width, d.renderer.renderer.domElement.height],
      video: 'Native WebGL drawing-buffer recording at 15 FPS; no camera or image scaling.',
    };
  });
  assert(report.production.sample.units.every((u) => u.hd && u.boundBase && u.boundRemap));
  await stage('native-engineer-production', report.production);
  await page.screenshot({ path: path.join(output, 'engineers-produced.png') });
  await page.evaluate(() => {
    const d = window.__ra2debug,
      g = d.game,
      source = window.__engineers[0];
    const rule = g.rules.getObject('ENGINEER', 3);
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
        Math.abs(Math.hypot(a.rx - source.tile.rx, a.ry - source.tile.ry) - 4) -
        Math.abs(Math.hypot(b.rx - source.tile.rx, b.ry - source.tile.ry) - 4),
    );
    const allied = g.createUnitForPlayer(rule, d.localPlayer);
    g.spawnObject(allied, tiles[0]);
    window.__alliedEngineerControl = allied;
  });
  await page.waitForTimeout(150);
  report.sharedSourceIsolation = await page.evaluate(() => {
    const d = window.__ra2debug;
    const allied = d.renderableManager.getRenderableByGameObject(window.__alliedEngineerControl)
      .shpRenderable.builder;
    const soviet = d.renderableManager.getRenderableByGameObject(window.__engineers[0])
      .shpRenderable.builder;
    return {
      disclosure:
        'Controlled Allied ENGINEER actor owned by the Soviet player; not Allied production.',
      sameSource: allied.shpFile === soviet.shpFile,
      alliedHd: !!allied.hdOverride,
      sovietHd: !!soviet.hdOverride,
    };
  });
  assert(
    report.sharedSourceIsolation.sameSource &&
      !report.sharedSourceIsolation.alliedHd &&
      report.sharedSourceIsolation.sovietHd,
  );
  await stage('shared-engineer-source-isolation', report.sharedSourceIsolation);
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
      enemy = d.game.getCombatants().find((p) => p !== d.localPlayer);
    const target = d.localPlayer.getOwnedObjects().find((u) => u.name === 'NAPOWR');
    window.__captureTarget = target;
    d.game.changeObjectOwner(target, enemy);
    d.game.mapShroudTrait.revealMap(d.localPlayer, d.game);
    window.__engineerPhase = 'capture';
    d.actionsApi.orderUnits([window.__engineers[0].id], 7, target.id);
  });
  await page.waitForFunction(
    () =>
      window.__captureTarget.owner === window.__ra2debug.localPlayer &&
      !window.__engineers[0].isSpawned,
    undefined,
    { timeout: 60000 },
  );
  await page.waitForTimeout(150);
  await stage(
    'native-building-capture',
    await page.evaluate(() => ({
      captured: window.__captureTarget.owner === window.__ra2debug.localPlayer,
      sample: window.__engineerSample(),
    })),
  );
  await page.screenshot({ path: path.join(output, 'capture-complete.png') });
  await page.evaluate(() => {
    const d = window.__ra2debug,
      target = d.localPlayer.getOwnedObjects().find((u) => u.name === 'NAHAND');
    window.__repairTarget = target;
    target.healthTrait.applyHitPoints(Math.floor(target.rules.strength / 2), d.game);
    window.__engineerPhase = 'repair';
    d.actionsApi.orderUnits([window.__engineers[1].id], 15, target.id);
  });
  await page.waitForFunction(
    () => window.__repairTarget.healthTrait.health === 100 && !window.__engineers[1].isSpawned,
    undefined,
    { timeout: 60000 },
  );
  await page.waitForTimeout(150);
  await stage(
    'native-building-repair',
    await page.evaluate(() => ({
      health: window.__repairTarget.healthTrait.health,
      sample: window.__engineerSample(),
    })),
  );
  await page.screenshot({ path: path.join(output, 'repair-complete.png') });
  await page.evaluate(() => {
    const d = window.__ra2debug,
      u = window.__engineers[2],
      enemy = d.game.getCombatants().find((p) => p !== d.localPlayer);
    const attacker = d.game.createUnitForPlayer(d.game.rules.getObject('E2', 3), enemy);
    window.__engineerPhase = 'death';
    d.worldInteraction.minimapHandler.panToTile(u.tile);
    attacker.primaryWeapon.warhead.inflictDamage(
      10000,
      u,
      { player: enemy, obj: attacker, weapon: attacker.primaryWeapon },
      d.game,
    );
  });
  await page.waitForFunction(
    () =>
      window.__engineers[2].isDestroyed &&
      !window.__ra2debug.renderableManager.getRenderableByGameObject(window.__engineers[2]),
    undefined,
    { timeout: 30000 },
  );
  await stage(
    'native-warhead-death-and-removal',
    await page.evaluate(() => window.__engineerSample()),
  );
  report.trace = await page.evaluate(() => {
    clearInterval(window.__engineerTimer);
    // Capture the verified terminal state even between periodic samples.
    window.__engineerTrace.push(window.__engineerSample());
    return window.__engineerTrace;
  });
  assert(report.trace.every((row) => row.gl === 0));
  for (const index of [0, 1]) {
    assert(report.trace.some((row) => row.units[index].moving && row.units[index].hd));
    assert(report.trace.some((row) => !row.units[index].spawned && !row.units[index].renderer));
  }
  assert(
    report.trace.some((row) => row.units[2].destroyed && row.units[2].renderer && row.units[2].hd),
  );
  assert(report.trace.some((row) => row.units[2].destroyed && !row.units[2].renderer));
  assert.deepEqual(report.errors, []);
  report.status = 'PASS_SENGINEER_NATIVE_PRODUCTION_CAPTURE_REPAIR_DEATH_AND_REMOVAL';
} catch (error) {
  report.status = 'FAIL';
  report.failure = error.stack;
  process.exitCode = 1;
  const page = await app.firstWindow({ timeout: 30000 });
  report.trace = await page
    .evaluate(() => {
      clearInterval(window.__engineerTimer);
      return window.__engineerTrace;
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
