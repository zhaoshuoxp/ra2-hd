// Controlled native rendering only; spawned fixtures do not prove buildability or actions.
import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
const out = process.argv[2] ?? '.artifacts/m1-7/runtime-references-v1';
await fs.mkdir(out, { recursive: false });
const inv = JSON.parse(await fs.readFile('.artifacts/m1-7/source-v3/inventory.json'));
const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--disable-background-networking', '--no-first-run'],
});
const report = {
  status: 'FAIL',
  disclosure:
    'Controlled actor creation and paused native rendering. Not natural production, movement, flight or water behavior.',
  errors: [],
  units: [],
};
let page;
try {
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
    serviceWorkers: 'block',
  });
  await context.route('**/*', (r) =>
    r.request().url().startsWith('http://127.0.0.1:4297/') ||
    /^(data|blob):/.test(r.request().url())
      ? r.continue()
      : r.abort(),
  );
  await context.addInitScript(() =>
    Object.entries({
      _r_lastMap: 'MP01T4.map',
      _r_lastMode: '1',
      _r_lastCountry: '5',
      _r_lastColor: '1',
      _r_lastStartPos: '0',
      _r_lastTeam: '0',
      _r_hostOpts: '3;10000;0;1;1;0;1;0;;0;1;0;0',
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
    }).forEach(([k, v]) => localStorage.setItem(k, v)),
  );
  page = await context.newPage();
  page.on('pageerror', (e) => report.errors.push(e.stack));
  await page.goto('http://127.0.0.1:4297/');
  await page.getByText('Offline Skirmish', { exact: true }).click({ timeout: 60000 });
  await page.waitForFunction(() => window.__ra2debug?.skirmishLobby);
  await page.evaluate(() => {
    const d = window.__ra2debug;
    d.generalOptions.graphics.renderResolution.value = '1080p';
    d.skirmishLobby.startGame(1700000000000);
  });
  await page.waitForFunction(() => window.__ra2debug?.game?.status === 1, undefined, {
    timeout: 90000,
  });
  const targets = process.argv.includes('--children')
    ? inv.families.flatMap((f) => f.children).filter((f) => f.id === 'V3ROCKET' || f.id === 'DMISL')
    : inv.families.filter((f) => f.representation === 'VXL/HVA');
  for (const family of targets) {
    const setup = await page.evaluate(
      ({ id, type }) => {
        const d = window.__ra2debug;
        d.gameScreen.gameAnimationLoop.start();
        const m = d.localPlayer.getOwnedObjects().find((o) => /MCV$/.test(o.name));
        const rule = d.game.rules.getObject(id, type);
        const u = d.game.createUnitForPlayer(rule, d.localPlayer);
        const tile = d.game.map.tiles.getByMapCoords(m.tile.rx + 2, m.tile.ry - 2);
        d.game.spawnObject(u, tile);
        window.__unitRef = u;
        return {
          id: u.id,
          name: u.name,
          tile: [tile.rx, tile.ry],
          ruleName: rule.name,
          imageName: rule.imageName,
        };
      },
      { id: family.id, type: family.id === 'V3ROCKET' || family.id === 'DMISL' ? 1 : 7 },
    );
    await page.waitForTimeout(150);
    await page.evaluate(() => {
      const d = window.__ra2debug;
      d.gameScreen.gameAnimationLoop.stop();
      d.gameScreen.pointer.unlock();
    });
    const entry = { ...setup, views: [] };
    for (const heading of [0, 90]) {
      const capture = await page.evaluate((heading) => {
        const d = window.__ra2debug,
          u = window.__unitRef,
          r = d.renderableManager.getRenderableByGameObject(u),
          w = d.worldScene,
          gl = d.renderer.renderer;
        if (u.turretTrait) u.turretTrait.facing = heading;
        r.updateVxlRotation(heading, true);
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
        } finally {
          saved.forEach(([m, b]) => (m.visible = b));
          w.scene.background = bg;
          gl.setClearColor(clear, alpha);
          d.renderer.render();
        }
        return {
          heading,
          crop,
          bounds,
          layers,
          tick: d.game.currentTick,
          source: r.vxlBuilders.map((b) => ({ vxl: b.vxlFile.filename, hva: b.hvaFile?.filename })),
          buffer: [gl.domElement.width, gl.domElement.height],
          css: [1920, 1080],
          dpr: devicePixelRatio,
          projection: w.camera.projectionMatrix.toArray(),
          zoom: w.camera.zoom,
          logical: [d.renderer.width, d.renderer.height],
          ratio,
          glError: gl.getContext().getError(),
        };
      }, heading);
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
  report.status = 'PASS_CONTROLLED_ORIGINAL_REFERENCES';
} catch (e) {
  report.failure = e.stack;
  process.exitCode = 1;
  await page?.screenshot({ path: `${out}/failure.png` }).catch(() => {});
} finally {
  await fs.writeFile(`${out}/result.json`, JSON.stringify(report, null, 2) + '\n');
  await browser.close();
}
console.log(report.status, report.failure ?? '');
