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
    'YURIPR and prerequisites are normally produced after a native SPY infiltration into an enemy NATECH fixture. Target placements are controlled fixtures. Movement, mind control, deployment, psychic wave and death use native simulation. Declared slots receive a separate paused rendering sweep; no natural elite, transport or campaign claim.',
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
  assert.equal(report.selection.units.families.YURIPR.status, 'NOT_REQUESTED');
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
  for (const name of ['NAPOWR', 'NAHAND', 'NAREFN', 'NARADR', 'NAWEAP', 'NATECH']) {
    await page.evaluate(
      (name) =>
        window.__ra2debug.actionsApi.queueForProduction(name === 'TESLA' ? 1 : 0, 2, name, 1),
      name,
    );
    await page.waitForFunction(
      (name) =>
        window.__ra2debug.localPlayer.production.getQueue(name === 'TESLA' ? 1 : 0).status === 3,
      name,
      { timeout: 120000 },
    );
    await page.evaluate((name) => {
      const d = window.__ra2debug,
        yard = d.localPlayer.getOwnedObjects().find((u) => u.name === 'NACNST'),
        tiles = [];
      for (let x = -12; x <= 12; x++)
        for (let y = -12; y <= 12; y++) tiles.push({ rx: yard.tile.rx + x, ry: yard.tile.ry + y });
      const offsets = {
        NAPOWR: [-4, -2],
        NAHAND: [-5, 2],
        NAREFN: [-5, 7],
        NAWEAP: [5, 5],
        NARADR: [4, -3],
        TESLA: [5, 1],
        NATECH: [7, -2],
      }[name];
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
  report.unlockFixture = await page.evaluate(() => {
    const d = window.__ra2debug,
      g = d.game,
      player = d.localPlayer;
    const rule = g.rules.getObject('YURIPR', 3);
    const before = player.production.isAvailableForProduction(rule);
    const yard = player.getOwnedObjects().find((o) => o.name === 'NACNST');
    const worker = g.getConstructionWorker(player);
    const candidates = g.map.tiles
      .getAll()
      .filter(
        (t) =>
          Math.hypot(t.rx - yard.tile.rx, t.ry - yard.tile.ry) < 18 &&
          worker.canPlaceAt('NATECH', { rx: t.rx, ry: t.ry }, { normalizedTile: true }),
      );
    if (!candidates.length) throw Error('No valid battle lab fixture foundation');
    candidates.sort(
      (a, b) =>
        Math.hypot(a.rx - yard.tile.rx, a.ry - yard.tile.ry) -
        Math.hypot(b.rx - yard.tile.rx, b.ry - yard.tile.ry),
    );
    const lab = g.createObject(2, 'NATECH');
    g.changeObjectOwner(
      lab,
      g.getCombatants().find((p) => p !== player),
    );
    g.spawnObject(lab, candidates[0]);
    const spy = g.createUnitForPlayer(g.rules.getObject('SPY', 3), player);
    const free = g.map.tiles
      .getAll()
      .filter(
        (t) =>
          !t.rampType &&
          g.map.mapBounds.isWithinBounds(t) &&
          g.map.terrain.getPassableSpeed(t, spy.rules.speedType, false, false) > 0 &&
          !g.map.tileOccupation.getObjectsOnTile(t).some((o) => o.isTechno() || o.isTerrain()),
      );
    free.sort(
      (a, b) =>
        Math.hypot(a.rx - lab.tile.rx, a.ry - lab.tile.ry) -
        Math.hypot(b.rx - lab.tile.rx, b.ry - lab.tile.ry),
    );
    g.spawnObject(spy, free[0]);
    g.mapShroudTrait.revealMap(player, g);
    window.__yuriprSpy = spy;
    window.__yuriprLab = lab;
    d.actionsApi.orderUnits([spy.id], 8, lab.id);
    return {
      before,
      requiresStolenSovietTech: rule.requiresStolenSovietTech,
      lab: lab.name,
      spy: spy.name,
      spySpawned: spy.isSpawned,
    };
  });
  assert.equal(report.unlockFixture.before, false);
  assert.equal(report.unlockFixture.requiresStolenSovietTech, true);
  await stage('native-infiltration-fixture', report.unlockFixture);
  await page.waitForFunction(
    () => {
      const d = window.__ra2debug;
      return (
        !window.__yuriprSpy.isSpawned &&
        d.localPlayer.production.isAvailableForProduction(d.game.rules.getObject('YURIPR', 3))
      );
    },
    undefined,
    { timeout: 60000 },
  );
  await stage(
    'native-stolen-soviet-tech-unlocked',
    await page.evaluate(() => {
      const d = window.__ra2debug;
      const result = {
        spyConsumed: !window.__yuriprSpy.isSpawned,
        available: d.localPlayer.production.isAvailableForProduction(
          d.game.rules.getObject('YURIPR', 3),
        ),
      };
      d.game.unspawnObject(window.__yuriprLab);
      return result;
    }),
  );
  await page.evaluate(() => window.__ra2debug.actionsApi.queueForProduction(2, 3, 'YURIPR', 1));
  await page.waitForFunction(
    () => window.__ra2debug.localPlayer.getOwnedObjects().some((u) => u.name === 'YURIPR'),
    undefined,
    { timeout: 90000 },
  );
  await page.waitForFunction(
    () => {
      const d = window.__ra2debug;
      const u = d.localPlayer.getOwnedObjects().find((u) => u.name === 'YURIPR');
      return (
        u && d.renderableManager.getRenderableByGameObject(u)?.shpRenderable?.builder?.hdOverride
      );
    },
    undefined,
    { timeout: 30000 },
  );
  report.production = await page.evaluate(() => {
    const d = window.__ra2debug;
    const u = d.localPlayer.getOwnedObjects().find((u) => u.name === 'YURIPR');
    window.__yuripr = u;
    window.__yuriprTrace = [];
    window.__yuriprPhase = 'produced';
    window.__yuriprSample = () => {
      const r = d.renderableManager.getRenderableByGameObject(u),
        b = r?.shpRenderable?.builder;
      const p = b?.getHdPage(),
        mesh = r?.shpRenderable?.getShapeMesh();
      const target = window.__yuriprTarget;
      return {
        tick: d.game.currentTick,
        phase: window.__yuriprPhase,
        frame: b?.getFrame(),
        hd: !!b?.hdOverride,
        boundBase: !!p && mesh.material.map === p.base,
        boundRemap: !!p && mesh.material.uniforms.remapMap.value === p.data,
        moving: u.isMoving,
        firing: u.isFiring,
        health: u.healthTrait.health,
        primaryWeapon: u.primaryWeapon?.rules.name,
        secondaryWeapon: u.secondaryWeapon?.rules.name,
        activeWeapon: u.unitOrderTrait?.getCurrentTask()?.weapon?.rules?.name,
        spawned: u.isSpawned,
        destroyed: u.isDestroyed,
        renderer: !!r,
        target: target?.name,
        targetHealth: target?.healthTrait.health,
        targetZone: target?.zone,
        targetElevation: target?.tileElevation,
        stance: u.stance,
        controlled: target?.mindControllableTrait?.isActive(),
        controller: target?.mindControllableTrait?.getController()?.id,
        targetFriendly: target?.owner === d.localPlayer,
        pulseTargetHealth: window.__yuriprPulseTarget?.healthTrait.health,
        projectiles: d.game.world
          .getAllObjects()
          .filter((p) => p.fromObject === u)
          .map((p) => ({
            name: p.rules.name,
            weapon: p.fromWeapon?.rules.name,
          })),
        gl: d.renderer.renderer.getContext().getError(),
      };
    };
    window.__yuriprTimer = setInterval(
      () => window.__yuriprTrace.push(window.__yuriprSample()),
      20,
    );
    d.worldInteraction.minimapHandler.panToTile(u.tile);
    return {
      name: u.name,
      cost: u.rules.cost,
      buildLimit: u.rules.buildLimit,
      primaryRange: u.primaryWeapon.rules.range,
      crawls: u.art.crawls,
      sample: window.__yuriprSample(),
    };
  });
  assert.equal(report.production.cost, 2000);
  assert.equal(report.production.buildLimit, 1);
  assert.equal(report.production.primaryRange, 30);
  assert(
    report.production.sample.hd &&
      report.production.sample.boundBase &&
      report.production.sample.boundRemap,
  );
  await stage('native-yuripr-production', report.production);
  await page.waitForFunction(
    () =>
      window.__ra2debug.localPlayer.getOwnedObjects().find((u) => u.name === 'NAHAND').factoryTrait
        .status === 0,
  );
  await page.evaluate(() => window.__ra2debug.actionsApi.queueForProduction(2, 3, 'YURIPR', 1));
  await page.waitForTimeout(500);
  const limit = await page.evaluate(() => {
    const d = window.__ra2debug;
    return {
      owned: d.localPlayer.getOwnedObjects().filter((u) => u.name === 'YURIPR').length,
      queued: d.localPlayer.production
        .getQueue(2)
        .find(d.game.rules.getObject('YURIPR', 3))
        .reduce((n, item) => n + item.quantity, 0),
    };
  });
  assert.equal(limit.owned, 1);
  assert.equal(limit.queued, 0);
  await stage('native-build-limit-rejects-second-unit', limit);
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
  await page.evaluate(() => {
    const d = window.__ra2debug,
      g = d.game,
      u = window.__yuripr;
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
        Math.abs(Math.hypot(a.rx - u.tile.rx, a.ry - u.tile.ry) - 5) -
        Math.abs(Math.hypot(b.rx - u.tile.rx, b.ry - u.tile.ry) - 5),
    );
    window.__yuriprPhase = 'movement';
    d.actionsApi.orderUnits([u.id], 0, tiles[0].rx, tiles[0].ry);
  });
  await page.waitForFunction(() => window.__yuriprTrace.some((r) => r.moving && r.hd));
  await page.waitForFunction(() => !window.__yuripr.isMoving);
  const setup = await page.evaluate(() => {
    const d = window.__ra2debug,
      g = d.game,
      u = window.__yuripr;
    const enemy = g.getCombatants().find((p) => p !== d.localPlayer);
    const rule = g.rules.getObject('TRUCKA', 7);
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
        Math.abs(Math.hypot(a.rx - u.tile.rx, a.ry - u.tile.ry) - 20) -
        Math.abs(Math.hypot(b.rx - u.tile.rx, b.ry - u.tile.ry) - 20),
    );
    const target = g.createUnitForPlayer(rule, enemy);
    g.spawnObject(target, tiles[0]);
    window.__yuriprTarget = target;
    window.__yuriprEnemy = enemy;
    window.__yuriprPhase = 'mind-control';
    g.mapShroudTrait.revealMap(d.localPlayer, g);
    d.actionsApi.orderUnits([u.id], 2, target.id);
    return {
      primary: u.primaryWeapon.rules.name,
      secondary: u.secondaryWeapon.rules.name,
      target: target.name,
      health: target.healthTrait.health,
      distance: Math.hypot(u.tile.rx - target.tile.rx, u.tile.ry - target.tile.ry),
    };
  });
  assert(setup.distance > 15);
  assert.equal(setup.primary, 'SuperMindControl');
  assert.equal(setup.secondary, 'PsiWave');
  await stage('mind-control-target-fixture', setup);
  await page.waitForFunction(
    () => window.__yuriprTarget.mindControllableTrait.isActive(),
    undefined,
    { timeout: 60000 },
  );
  const controlled = await page.evaluate(() => window.__yuriprSample());
  assert(controlled.targetFriendly && controlled.controlled && controlled.hd);
  assert.equal(controlled.targetHealth, setup.health);
  await stage('native-mind-control', controlled);
  await page.screenshot({ path: path.join(output, 'mind-controlled.png') });
  await page.waitForFunction(() => window.__yuripr.primaryWeapon.getCooldownTicks() === 0);
  await stage(
    'native-control-cooldown-finished-before-deploy',
    await page.evaluate(() => ({
      cooldown: window.__yuripr.primaryWeapon.getCooldownTicks(),
      undeployDelay: window.__yuripr.rules.undeployDelay,
    })),
  );
  const pulse = await page.evaluate(() => {
    const d = window.__ra2debug,
      g = d.game,
      u = window.__yuripr;
    d.actionsApi.orderUnits([u.id], 11);
    const rule = g.rules.getObject('ENGINEER', 3);
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
        Math.abs(Math.hypot(a.rx - u.tile.rx, a.ry - u.tile.ry) - 1) -
        Math.abs(Math.hypot(b.rx - u.tile.rx, b.ry - u.tile.ry) - 1),
    );
    const target = g.createUnitForPlayer(rule, window.__yuriprEnemy);
    g.spawnObject(target, tiles[0]);
    window.__yuriprPulseTarget = target;
    window.__yuriprPhase = 'psi-wave';
    d.actionsApi.orderUnits([u.id], 10);
    return {
      health: target.healthTrait.health,
      distance: Math.hypot(u.tile.rx - target.tile.rx, u.tile.ry - target.tile.ry),
    };
  });
  await stage('psi-wave-target-fixture', pulse);
  await page.waitForFunction(() => window.__yuriprPulseTarget.healthTrait.health <= 0, undefined, {
    timeout: 60000,
  });
  await stage('native-psi-wave', await page.evaluate(() => window.__yuriprSample()));
  await page.screenshot({ path: path.join(output, 'psi-wave.png') });
  await page.waitForTimeout(3000);
  await page.evaluate(() => {
    const d = window.__ra2debug,
      g = d.game;
    window.__yuriprPhase = 'death';
    const enemy = g.getCombatants().find((p) => p !== d.localPlayer);
    const attacker = g.createUnitForPlayer(g.rules.getObject('E2', 3), enemy),
      weapon = attacker.primaryWeapon;
    weapon.warhead.inflictDamage(
      10000,
      window.__yuripr,
      { player: enemy, obj: attacker, weapon },
      g,
    );
  });
  await page.waitForFunction(
    () =>
      window.__yuripr.isDestroyed &&
      !window.__ra2debug.renderableManager.getRenderableByGameObject(window.__yuripr),
  );
  report.trace = await page.evaluate(() => {
    clearInterval(window.__yuriprTimer);
    window.__yuriprTrace.push(window.__yuriprSample());
    return window.__yuriprTrace;
  });
  assert(report.trace.some((r) => r.moving && r.hd));
  assert(report.trace.some((r) => r.phase === 'mind-control' && r.hd && r.firing));
  assert(
    report.trace.some((r) => r.phase === 'psi-wave' && r.hd && r.frame >= 292 && r.frame <= 306),
  );
  const restored = await page.evaluate(() => ({
    controlled: window.__yuriprTarget.mindControllableTrait.isActive(),
    originalOwner: window.__yuriprTarget.owner === window.__yuriprEnemy,
    health: window.__yuriprTarget.healthTrait.health,
  }));
  assert(!restored.controlled && restored.originalOwner);
  assert.equal(restored.health, setup.health);
  await stage('native-control-restored-after-yuripr-death', restored);
  assert(report.trace.some((r) => r.phase === 'death' && r.hd && r.frame >= 134 && r.frame < 164));
  assert(report.trace.every((r) => r.gl === 0));
  assert.deepEqual(report.errors, []);
  report.status = 'PASS_YURIPR_NATIVE_PRODUCTION_MIND_CONTROL_PSI_WAVE_AND_REMOVAL';
  await stage('complete', {
    samples: report.trace.length,
    frames: [...new Set(report.trace.map((r) => r.frame).filter(Number.isInteger))],
  });
} catch (error) {
  report.status = 'FAIL';
  report.failure = error.stack;
  process.exitCode = 1;
  const page = app.windows()[0];
  report.trace = await page
    ?.evaluate(() => {
      clearInterval(window.__yuriprTimer);
      return window.__yuriprTrace;
    })
    .catch(() => undefined);
  await page?.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {});
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
