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
    'TERROR and prerequisites are normally produced as Cuba. Controlled open-ground target fixtures exercise native movement, eight attack bearings, suicide explosions and death/removal. A separate paused sweep validates every source slot. Declared out-of-range fire slots are audited as unreachable through the native suicide branch; no fabricated frames or rules changes.',
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
      _r_lastCountry: '7',
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
  assert.equal(report.selection.units.families.TERROR.status, 'NOT_REQUESTED');
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
  await page.evaluate(() => window.__ra2debug.actionsApi.queueForProduction(2, 3, 'TERROR', 1));
  await page.waitForFunction(
    () => window.__ra2debug.localPlayer.getOwnedObjects().some((u) => u.name === 'TERROR'),
    undefined,
    { timeout: 90000 },
  );
  await page.waitForFunction(
    () => {
      const d = window.__ra2debug;
      const u = d.localPlayer.getOwnedObjects().find((u) => u.name === 'TERROR');
      return (
        u && d.renderableManager.getRenderableByGameObject(u)?.shpRenderable?.builder?.hdOverride
      );
    },
    undefined,
    { timeout: 30000 },
  );
  report.production = await page.evaluate(() => {
    const d = window.__ra2debug;
    const u = d.localPlayer.getOwnedObjects().find((u) => u.name === 'TERROR');
    window.__terror = u;
    window.__terrorTrace = [];
    window.__terrorPhase = 'produced';
    window.__terrorSample = () => {
      const u = window.__terror;
      const r = d.renderableManager.getRenderableByGameObject(u),
        b = r?.shpRenderable?.builder;
      const p = b?.getHdPage(),
        mesh = r?.shpRenderable?.getShapeMesh();
      const target = window.__terrorTarget;
      return {
        tick: d.game.currentTick,
        phase: window.__terrorPhase,
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
        direction: u.direction,
        targetDestroyed: target?.isDestroyed,
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
    window.__terrorTimer = setInterval(
      () => window.__terrorTrace.push(window.__terrorSample()),
      20,
    );
    d.worldInteraction.minimapHandler.panToTile(u.tile);
    return {
      name: u.name,
      cost: u.rules.cost,
      crawls: u.art.crawls,
      sample: window.__terrorSample(),
    };
  });
  assert.equal(report.production.cost, 200);
  assert(
    report.production.sample.hd &&
      report.production.sample.boundBase &&
      report.production.sample.boundRemap,
  );
  await stage('native-terror-production', report.production);
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
  report.bearings = [];
  for (let index = 0; index < 9; index++) {
    if (index) {
      await page.evaluate(() => window.__ra2debug.actionsApi.queueForProduction(2, 3, 'TERROR', 1));
      await page.waitForFunction(
        () =>
          window.__ra2debug.localPlayer
            .getOwnedObjects()
            .some((u) => u.name === 'TERROR' && !u.isDestroyed),
        undefined,
        { timeout: 90000 },
      );
      await page.evaluate(() => {
        window.__terror = window.__ra2debug.localPlayer
          .getOwnedObjects()
          .find((u) => u.name === 'TERROR' && !u.isDestroyed);
      });
      await page.waitForFunction(
        () =>
          window.__ra2debug.localPlayer.getOwnedObjects().find((u) => u.name === 'NAHAND')
            .factoryTrait.status === 0,
      );
    }
    const start = await page.evaluate((index) => {
      const d = window.__ra2debug,
        g = d.game,
        u = window.__terror;
      const rule = g.rules.getObject('TRUCKA', 7);
      const offsets = [
        [4, 0],
        [4, 4],
        [0, 4],
        [-4, 4],
        [-4, 0],
        [-4, -4],
        [0, -4],
        [4, -4],
        [1, 0],
      ];
      const free = (t) =>
        t &&
        !t.rampType &&
        g.map.mapBounds.isWithinBounds(t) &&
        g.map.terrain.getPassableSpeed(t, rule.speedType, false, false) > 0 &&
        !g.map.tileOccupation.getObjectsOnTile(t).some((o) => o.isTechno() || o.isTerrain());
      const tiles = g.map.tiles.getAll();
      const byPosition = new Map(tiles.map((t) => [`${t.rx},${t.ry}`, t]));
      const find = (rx, ry) => byPosition.get(`${rx},${ry}`);
      const candidates = tiles.filter(
        (t) => free(t) && offsets.every(([dx, dy]) => free(find(t.rx + dx, t.ry + dy))),
      );
      candidates.sort(
        (a, b) =>
          Math.hypot(a.rx - u.tile.rx, a.ry - u.tile.ry) -
          Math.hypot(b.rx - u.tile.rx, b.ry - u.tile.ry),
      );
      if (!candidates.length) throw Error('No clear eight-bearing native test ground');
      const tile = candidates[0];
      window.__terrorOrigin = tile;
      window.__terrorOffset = offsets[index];
      window.__terrorPhase = 'approach-' + index;
      d.actionsApi.orderUnits([u.id], 0, tile.rx, tile.ry);
      g.mapShroudTrait.revealMap(d.localPlayer, g);
      return {
        origin: [tile.rx, tile.ry],
        offset: offsets[index],
        cost: u.rules.cost,
        country: d.localPlayer.country?.name,
      };
    }, index);
    await page.waitForFunction(
      () => {
        const u = window.__terror,
          t = window.__terrorOrigin;
        return !u.isMoving && u.tile.rx === t.rx && u.tile.ry === t.ry;
      },
      undefined,
      { timeout: 60000 },
    );
    const setup = await page.evaluate((index) => {
      const d = window.__ra2debug,
        g = d.game,
        u = window.__terror,
        origin = window.__terrorOrigin;
      const [dx, dy] = window.__terrorOffset;
      const tile = g.map.tiles
        .getAll()
        .find((t) => t.rx === origin.rx + dx && t.ry === origin.ry + dy);
      const enemy = g.getCombatants().find((p) => p !== d.localPlayer);
      const target = g.createUnitForPlayer(g.rules.getObject('TRUCKA', 7), enemy);
      g.spawnObject(target, tile);
      window.__terrorTarget = target;
      window.__terrorPhase = index < 8 ? 'attack-' + index : 'killed-explosion';
      const result = {
        health: target.healthTrait.health,
        weapon: u.primaryWeapon.rules.name,
        suicide: u.primaryWeapon.rules.suicide,
        offset: [dx, dy],
        hd: window.__terrorSample().hd,
      };
      d.worldInteraction.minimapHandler.panToTile(u.tile);
      if (index < 8) d.actionsApi.orderUnits([u.id], 2, target.id);
      else {
        const attacker = g.createUnitForPlayer(g.rules.getObject('E2', 3), enemy),
          weapon = attacker.primaryWeapon;
        weapon.warhead.inflictDamage(10000, u, { player: enemy, obj: attacker, weapon }, g);
      }
      return result;
    }, index);
    assert.equal(setup.weapon, 'TerrorBomb');
    assert(setup.suicide && setup.hd);
    await stage('native-attack-start-' + index, { ...start, ...setup });
    await page.waitForFunction(
      () =>
        window.__terror.isDestroyed &&
        !window.__ra2debug.renderableManager.getRenderableByGameObject(window.__terror),
      undefined,
      { timeout: 60000 },
    );
    const result = await page.evaluate(() => window.__terrorSample());
    assert(result.targetHealth < setup.health && result.gl === 0);
    report.bearings.push({ index, start, setup, result });
    await stage(index < 8 ? 'native-suicide-' + index : 'native-killed-deathweapon', result);
    await page.screenshot({ path: path.join(output, 'attack-' + index + '.png') });
    await page.evaluate(() => {
      const d = window.__ra2debug,
        t = window.__terrorTarget;
      if (t.isSpawned) d.game.unspawnObject(t);
    });
  }
  report.trace = await page.evaluate(() => {
    clearInterval(window.__terrorTimer);
    window.__terrorTrace.push(window.__terrorSample());
    return window.__terrorTrace;
  });
  assert(report.trace.some((r) => r.moving && r.hd));
  assert.equal(report.bearings.length, 9);
  assert(report.trace.filter((r) => r.hd).every((r) => r.frame >= 0 && r.frame < 188));
  assert(report.trace.filter((r) => r.phase.startsWith('attack-')).every((r) => !r.firing));
  assert(report.trace.every((r) => r.gl === 0));
  assert.deepEqual(report.errors, []);
  report.status = 'PASS_TERROR_CUBA_PRODUCTION_EIGHT_BEARING_SUICIDE_DEATHWEAPON_AND_REMOVAL';
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
      clearInterval(window.__terrorTimer);
      return window.__terrorTrace;
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
