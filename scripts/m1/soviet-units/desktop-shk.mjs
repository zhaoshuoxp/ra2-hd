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
    'SHK, prerequisites and a powered Tesla Coil are normally produced. Enemy truck placements and elite promotion are controlled fixtures. Movement, normal and elite attacks, coil charging and release, damage and death use native simulation; all declared slots also receive a separate paused rendering sweep.',
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
  assert.equal(report.selection.units.families.SHK.status, 'NOT_REQUESTED');
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
  for (const name of ['NAPOWR', 'NAHAND', 'NAREFN', 'NARADR', 'NAPOWR', 'TESLA']) {
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
  await page.evaluate(() => window.__ra2debug.actionsApi.queueForProduction(2, 3, 'SHK', 1));
  await page.waitForFunction(
    () => window.__ra2debug.localPlayer.getOwnedObjects().some((u) => u.name === 'SHK'),
    undefined,
    { timeout: 90000 },
  );
  await page.waitForFunction(
    () => {
      const d = window.__ra2debug;
      const u = d.localPlayer.getOwnedObjects().find((u) => u.name === 'SHK');
      return (
        u && d.renderableManager.getRenderableByGameObject(u)?.shpRenderable?.builder?.hdOverride
      );
    },
    undefined,
    { timeout: 30000 },
  );
  report.production = await page.evaluate(() => {
    const d = window.__ra2debug;
    const u = d.localPlayer.getOwnedObjects().find((u) => u.name === 'SHK');
    window.__shk = u;
    window.__shkTrace = [];
    window.__shkPhase = 'produced';
    window.__shkSample = () => {
      const r = d.renderableManager.getRenderableByGameObject(u),
        b = r?.shpRenderable?.builder;
      const p = b?.getHdPage(),
        mesh = r?.shpRenderable?.getShapeMesh();
      const target = window.__shkTarget;
      return {
        tick: d.game.currentTick,
        phase: window.__shkPhase,
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
    window.__shkTimer = setInterval(() => window.__shkTrace.push(window.__shkSample()), 20);
    d.worldInteraction.minimapHandler.panToTile(u.tile);
    return {
      name: u.name,
      cost: u.rules.cost,
      crawls: u.art.crawls,
      sample: window.__shkSample(),
    };
  });
  assert.equal(report.production.cost, 500);
  assert(
    report.production.sample.hd &&
      report.production.sample.boundBase &&
      report.production.sample.boundRemap,
  );
  await stage('native-shk-production', report.production);
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
  for (const [phase, name, zone, distance] of [
    ['ground', 'TRUCKA', 0, 7],
    ['elite', 'TRUCKA', 0, 7],
  ]) {
    const setup = await page.evaluate(
      ({ phase, name, zone, distance }) => {
        const d = window.__ra2debug,
          g = d.game,
          u = window.__shk;
        if (phase === 'elite') u.veteranTrait.promote(2, g);
        const enemy = g.getCombatants().find((p) => p !== d.localPlayer);
        const rule = g.rules.getObject(name, 7);
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
            Math.abs(Math.hypot(a.rx - u.tile.rx, a.ry - u.tile.ry) - distance) -
            Math.abs(Math.hypot(b.rx - u.tile.rx, b.ry - u.tile.ry) - distance),
        );
        const target = g.createUnitForPlayer(rule, enemy);
        g.spawnObject(target, tiles[0]);
        if (zone === 1) {
          target.position.tileElevation = 5;
          target.zone = 1;
        }
        window.__shkTarget = target;
        window.__shkPhase = phase;
        g.mapShroudTrait.revealMap(d.localPlayer, g);
        d.actionsApi.orderUnits([u.id], 2, target.id);
        return {
          name,
          health: target.healthTrait.health,
          zone: target.zone,
          elevation: target.tileElevation,
          weapons: [u.primaryWeapon.rules.name, u.secondaryWeapon.rules.name],
        };
      },
      { phase, name, zone, distance },
    );
    await stage(`${phase}-target-fixture`, setup);
    await page.waitForFunction(
      (health) => window.__shkTarget.healthTrait.health < health,
      setup.health,
      { timeout: 60000 },
    );
    await page.waitForTimeout(1500);
    const sample = await page.evaluate(() => window.__shkSample());
    assert(sample.hd && sample.boundBase && sample.boundRemap && !sample.destroyed);
    assert.equal(sample.targetZone, zone);
    await stage(`native-${phase}-weapon-damage`, sample);
    await page.screenshot({ path: path.join(output, `${phase}-attack.png`) });
    await page.evaluate(() => {
      const d = window.__ra2debug;
      d.actionsApi.orderUnits([window.__shk.id], 11);
      if (window.__shkTarget.isSpawned) d.game.unspawnObject(window.__shkTarget);
    });
  }
  const charging = await page.evaluate(() => {
    const d = window.__ra2debug,
      u = window.__shk;
    const coil = d.localPlayer.getOwnedObjects().find((o) => o.name === 'TESLA');
    window.__shkTarget = coil;
    window.__shkPhase = 'charge';
    window.__shkReturnTile = { rx: u.tile.rx, ry: u.tile.ry };
    // Native electric-assault targeting requires force fire or passive support scanning.
    d.actionsApi.orderUnits([u.id], 3, coil.id);
    return { health: coil.healthTrait.health, powered: coil.poweredTrait.isPoweredOn(true) };
  });
  assert(charging.powered);
  await page.waitForFunction(() => window.__shkTarget.overpoweredTrait.isOverpowered(), undefined, {
    timeout: 60000,
  });
  await page.waitForTimeout(1800);
  report.charging = await page.evaluate(() => ({
    ...window.__shkSample(),
    chargers: window.__shkTarget.overpoweredTrait.chargers.size,
    overpowered: window.__shkTarget.overpoweredTrait.isOverpowered(),
    powered: window.__shkTarget.poweredTrait.isPoweredOn(true),
  }));
  assert.equal(report.charging.chargers, 1);
  assert.equal(report.charging.activeWeapon, 'AssaultBolt');
  assert.equal(report.charging.targetHealth, charging.health);
  assert(report.charging.hd && report.charging.overpowered && report.charging.powered);
  await stage('native-coil-charge', report.charging);
  await page.screenshot({ path: path.join(output, 'coil-charge.png') });
  await page.evaluate(() => {
    const t = window.__shkReturnTile;
    window.__shkPhase = 'charge-release';
    window.__ra2debug.actionsApi.orderUnits([window.__shk.id], 0, t.rx, t.ry);
  });
  await page.waitForFunction(
    () => {
      const u = window.__shk,
        c = window.__shkTarget;
      return (
        c.overpoweredTrait.chargers.size === 0 &&
        Math.hypot(u.tile.rx - c.tile.rx, u.tile.ry - c.tile.ry) > 5
      );
    },
    undefined,
    { timeout: 60000 },
  );
  await stage(
    'native-coil-charge-release',
    await page.evaluate(() => ({
      overpowered: window.__shkTarget.overpoweredTrait.isOverpowered(),
    })),
  );
  await page.evaluate(() => {
    const d = window.__ra2debug,
      g = d.game;
    window.__shkPhase = 'death';
    const enemy = g.getCombatants().find((p) => p !== d.localPlayer);
    const attacker = g.createUnitForPlayer(g.rules.getObject('E2', 3), enemy),
      weapon = attacker.primaryWeapon;
    weapon.warhead.inflictDamage(10000, window.__shk, { player: enemy, obj: attacker, weapon }, g);
  });
  await page.waitForFunction(
    () =>
      window.__shk.isDestroyed &&
      !window.__ra2debug.renderableManager.getRenderableByGameObject(window.__shk),
  );
  report.trace = await page.evaluate(() => {
    clearInterval(window.__shkTimer);
    window.__shkTrace.push(window.__shkSample());
    return window.__shkTrace;
  });
  assert(report.trace.some((r) => r.moving && r.hd));
  for (const phase of ['ground', 'elite', 'charge'])
    assert(report.trace.some((r) => r.phase === phase && r.hd && r.firing));
  assert(report.trace.some((r) => r.phase === 'death' && r.hd && r.frame >= 134 && r.frame < 164));
  assert(report.trace.every((r) => r.gl === 0));
  assert.deepEqual(report.errors, []);
  report.status = 'PASS_SHK_NATIVE_PRODUCTION_NORMAL_ELITE_FIRE_COIL_CHARGE_AND_REMOVAL';
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
      clearInterval(window.__shkTimer);
      return window.__shkTrace;
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
