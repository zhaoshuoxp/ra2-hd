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
    'IVAN, SENGINEER and prerequisites are normally produced. Truck placements are controlled fixtures. Movement, bomb placement, timer detonation, engineer disarm and death use native simulation. All declared slots receive a separate paused rendering sweep; no natural elite claim for this untrainable unit.',
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
  assert.equal(report.selection.units.families.IVAN.status, 'NOT_REQUESTED');
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
  for (const name of ['NAPOWR', 'NAHAND', 'NAREFN', 'NARADR']) {
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
  await page.evaluate(() => window.__ra2debug.actionsApi.queueForProduction(2, 3, 'IVAN', 1));
  await page.waitForFunction(
    () => window.__ra2debug.localPlayer.getOwnedObjects().some((u) => u.name === 'IVAN'),
    undefined,
    { timeout: 90000 },
  );
  await page.waitForFunction(
    () => {
      const d = window.__ra2debug;
      const u = d.localPlayer.getOwnedObjects().find((u) => u.name === 'IVAN');
      return (
        u && d.renderableManager.getRenderableByGameObject(u)?.shpRenderable?.builder?.hdOverride
      );
    },
    undefined,
    { timeout: 30000 },
  );
  report.production = await page.evaluate(() => {
    const d = window.__ra2debug;
    const u = d.localPlayer.getOwnedObjects().find((u) => u.name === 'IVAN');
    window.__ivan = u;
    window.__ivanTrace = [];
    window.__ivanPhase = 'produced';
    window.__ivanSample = () => {
      const r = d.renderableManager.getRenderableByGameObject(u),
        b = r?.shpRenderable?.builder;
      const p = b?.getHdPage(),
        mesh = r?.shpRenderable?.getShapeMesh();
      const target = window.__ivanTarget;
      return {
        tick: d.game.currentTick,
        phase: window.__ivanPhase,
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
        bombDistance: target ? Math.hypot(u.tile.rx - target.tile.rx, u.tile.ry - target.tile.ry) : undefined,
        charge: target?.tntChargeTrait?.hasCharge(),
        ticksLeft: target?.tntChargeTrait?.getTicksLeft(),
        initialTicks: target?.tntChargeTrait?.getInitialTicks(),
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
    window.__ivanTimer = setInterval(() => window.__ivanTrace.push(window.__ivanSample()), 20);
    d.worldInteraction.minimapHandler.panToTile(u.tile);
    return {
      name: u.name,
      cost: u.rules.cost,
      crawls: u.art.crawls,
      sample: window.__ivanSample(),
    };
  });
  assert.equal(report.production.cost, 600);
  assert(
    report.production.sample.hd &&
      report.production.sample.boundBase &&
      report.production.sample.boundRemap,
  );
  await stage('native-ivan-production', report.production);
  await page.waitForFunction(
    () =>
      window.__ra2debug.localPlayer.getOwnedObjects().find((u) => u.name === 'NAHAND').factoryTrait
        .status === 0,
  );
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
  for (const phase of ['timed-bomb', 'disarm-bomb']) {
    if (phase === 'disarm-bomb') {
      await page.evaluate(() => window.__ra2debug.actionsApi.queueForProduction(2, 3, 'SENGINEER', 1));
      await page.waitForFunction(() => window.__ra2debug.localPlayer.getOwnedObjects().some(u => u.name === 'SENGINEER' && !u.isDestroyed), undefined, { timeout: 90000 });
      await page.waitForFunction(() => window.__ra2debug.localPlayer.getOwnedObjects().find(u => u.name === 'NAHAND').factoryTrait.status === 0);
    }
    const setup = await page.evaluate((phase) => {
      const d = window.__ra2debug,
        g = d.game,
        u = window.__ivan;
      const owner =
        phase === 'timed-bomb' ? g.getCombatants().find((p) => p !== d.localPlayer) : d.localPlayer;
      const rule = g.rules.getObject('TRUCKA', 7);
      const engineer = d.localPlayer.getOwnedObjects().find(o => o.name === 'SENGINEER' && !o.isDestroyed);
      const origin = phase === 'disarm-bomb' ? engineer.tile : u.tile;
      const distance = phase === 'disarm-bomb' ? 2 : 7;
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
          Math.abs(Math.hypot(a.rx - origin.rx, a.ry - origin.ry) - distance) -
          Math.abs(Math.hypot(b.rx - origin.rx, b.ry - origin.ry) - distance),
      );
      const target = g.createUnitForPlayer(rule, owner);
      g.spawnObject(target, tiles[0]);
      window.__ivanTarget = target;
      window.__ivanRetreat = { rx: u.tile.rx, ry: u.tile.ry };
      window.__ivanPhase = phase;
      g.mapShroudTrait.revealMap(d.localPlayer, g);
      d.actionsApi.orderUnits([u.id], 18, target.id);
      return {
        health: target.healthTrait.health,
        timer: g.rules.combatDamage.ivanTimedDelay,
        weapon: u.primaryWeapon.rules.name,
        trainable: u.rules.trainable,
        friendly: owner === d.localPlayer,
        engineerDistance: engineer ? Math.hypot(engineer.tile.rx-target.tile.rx, engineer.tile.ry-target.tile.ry) : undefined,
      };
    }, phase);
    await stage(`${phase}-target-fixture`, setup);
    assert.equal(setup.weapon, 'IvanBomber');
    await page.waitForFunction(() => window.__ivanTarget.tntChargeTrait.hasCharge(), undefined, {
      timeout: 60000,
    });
    const charged = await page.evaluate(() => {
      const d = window.__ra2debug,
        u = window.__ivan,
        t = window.__ivanTarget;
      d.actionsApi.orderUnits([u.id], 11);
      const result = window.__ivanSample();
      const retreat = window.__ivanRetreat;
      d.actionsApi.orderUnits([u.id], 0, retreat.rx, retreat.ry);
      return result;
    });
    assert.equal(charged.initialTicks, setup.timer);
    assert.equal(charged.targetHealth, setup.health);
    assert(charged.hd && charged.boundBase && charged.boundRemap);
    await stage(`native-${phase}-placed`, charged);
    await page.screenshot({ path: path.join(output, `${phase}-placed.png`) });
    if (phase === 'timed-bomb') {
      await page.waitForFunction(
        (health) => window.__ivanTarget.healthTrait.health < health,
        setup.health,
        { timeout: 90000 },
      );
      const detonation = await page.evaluate(() => window.__ivanSample());
      assert.equal(detonation.charge, false);
      await stage('native-timer-detonation', detonation);
    } else {
      await page.evaluate(() => {
        const d = window.__ra2debug;
        const e = d.localPlayer.getOwnedObjects().find((o) => o.name === 'SENGINEER');
        window.__ivanEngineer = e;
        d.actionsApi.orderUnits([e.id], 2, window.__ivanTarget.id);
      });
      await page.waitForFunction(() => !window.__ivanTarget.tntChargeTrait.hasCharge(), undefined, {
        timeout: 60000,
      });
      const disarmed = await page.evaluate(() => ({
        ...window.__ivanSample(),
        engineerWeapon: window.__ivanEngineer.primaryWeapon?.rules.name,
        engineerAlive: !window.__ivanEngineer.isDestroyed,
      }));
      assert.equal(disarmed.targetHealth, setup.health);
      assert.equal(disarmed.engineerWeapon, 'DefuseKit');
      assert(disarmed.engineerAlive);
      await stage('native-engineer-disarm', disarmed);
    }
    await page.evaluate(() => {
      const d = window.__ra2debug;
      d.actionsApi.orderUnits([window.__ivan.id], 11);
      if (window.__ivanTarget.isSpawned) d.game.unspawnObject(window.__ivanTarget);
    });
  }
  await page.evaluate(() => {
    const d = window.__ra2debug,
      g = d.game;
    window.__ivanPhase = 'death';
    const enemy = g.getCombatants().find((p) => p !== d.localPlayer);
    const attacker = g.createUnitForPlayer(g.rules.getObject('E2', 3), enemy),
      weapon = attacker.primaryWeapon;
    weapon.warhead.inflictDamage(10000, window.__ivan, { player: enemy, obj: attacker, weapon }, g);
  });
  await page.waitForFunction(
    () =>
      window.__ivan.isDestroyed &&
      !window.__ra2debug.renderableManager.getRenderableByGameObject(window.__ivan),
  );
  report.trace = await page.evaluate(() => {
    clearInterval(window.__ivanTimer);
    window.__ivanTrace.push(window.__ivanSample());
    return window.__ivanTrace;
  });
  assert(report.trace.some((r) => r.moving && r.hd));
  for (const phase of ['timed-bomb', 'disarm-bomb'])
    assert(report.trace.some((r) => r.phase === phase && r.hd && r.firing));
  assert(report.trace.some((r) => r.phase === 'death' && r.hd && r.frame >= 134 && r.frame < 164));
  assert(report.trace.every((r) => r.gl === 0));
  assert.deepEqual(report.errors, []);
  report.status = 'PASS_IVAN_NATIVE_PRODUCTION_BOMB_TIMER_DISARM_AND_REMOVAL';
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
      clearInterval(window.__ivanTimer);
      return window.__ivanTrace;
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
