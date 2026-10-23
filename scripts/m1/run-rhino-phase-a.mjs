// Explicit isolated-game diagnostic. No URL or ordinary-game vehicle override.
import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { validateRhinoCandidate, plainSection } from './rhino-candidate-validation.mjs';

const output = process.env.M13_OUTPUT ?? '.artifacts/m1-3/game-v1';
const origin = process.env.M13_ORIGIN ?? 'http://127.0.0.1:4014';
await fs.mkdir(output, { recursive: false });
const candidate = process.env.M13_CANDIDATE ? JSON.parse(await fs.readFile(process.env.M13_CANDIDATE, 'utf8')) : null;
const sourceRoot = process.env.M13_SOURCE ?? '.artifacts/m1-3/source-v1';
const sources = await Promise.all(['htnk','htnktur','htnkbarl'].map(n => fs.readFile(`${sourceRoot}/${n}.json`,'utf8').then(JSON.parse)));
const hash = b => createHash('sha256').update(b).digest('hex');
const result = { status: 'FAIL', errors: [], consoleErrors: [], external: [], sets: [],
    checkout: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), candidate: candidate?.identity };
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true, args: ['--disable-background-networking', '--disable-component-update', '--no-first-run'] });
let page;
try {
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
    await context.route('**/*', route => {
        const url = route.request().url();
        if (!url.startsWith(origin + '/') && !/^(blob|data):/.test(url)) { result.external.push(url); return route.abort(); }
        return route.continue();
    });
    await context.addInitScript(() => {
        const prefs = { _r_lastMap: 'MP01T4.map', _r_lastMode: '1', _r_lastCountry: '0', _r_lastColor: '1',
            _r_lastStartPos: '0', _r_lastTeam: '0', _r_hostOpts: '3;10000;0;1;1;0;1;0;;0;1;0;0',
            _r_lastBots: JSON.stringify([null, null, null, { d: 4, c: 5, co: 2, s: 3, t: 1 }, null, null, null, null]) };
        Object.entries(prefs).forEach(([k, v]) => localStorage.setItem(k, v));
    });
    page = await context.newPage();
    page.on('pageerror', e => result.errors.push(e.stack));
    page.on('console', m => { if (m.type() === 'error') result.consoleErrors.push(m.text()); });
    await page.goto(origin);
    await page.getByText('Offline Skirmish', { exact: true }).click({ timeout: 45000 });
    await page.waitForFunction(() => window.__ra2debug?.skirmishLobby);
    await page.evaluate(() => {
        const d = window.__ra2debug;
        d.generalOptions.graphics.renderResolution.value = '4k';
        d.skirmishLobby.startGame(1700000000000);
    });
    await page.waitForFunction(() => window.__ra2debug?.game?.status === 1, undefined, { timeout: 60000 });
    result.fixture = await page.evaluate(() => {
        const d = window.__ra2debug, mcv = d.localPlayer.getOwnedObjects().find(o => /MCV$/.test(o.name));
        const rule = d.game.rules.getObject('HTNK', 7);
        const candidates = [];
        for (let dx = -4; dx <= 4; dx++) for (let dy = -4; dy <= 4; dy++) {
            const tile = d.game.map.tiles.getByMapCoords(mcv.tile.rx + dx, mcv.tile.ry + dy);
            if (tile && !d.game.map.tileOccupation.getObjectsOnTile(tile).length
                && d.game.map.terrain.getPassableSpeed(tile, rule.speedType, true, false) > 0) candidates.push(tile);
        }
        candidates.sort((a, b) => ((a.rx-mcv.tile.rx-2)**2+(a.ry-mcv.tile.ry+2)**2)
            - ((b.rx-mcv.tile.rx-2)**2+(b.ry-mcv.tile.ry+2)**2));
        if (!candidates.length) throw Error('No valid Rhino fixture tile');
        const unit = d.game.createUnitForPlayer(rule, d.localPlayer);
        d.game.spawnObject(unit, candidates[0]); window.__m13Unit = unit;
        return { id: unit.id, tile: [unit.tile.rx, unit.tile.ry],
            disclosure: 'One explicit cross-faction HTNK fixture in the original South Pacific skirmish. No production or gameplay rule edits.' };
    });
    await page.waitForTimeout(900);
    if (candidate) {
        result.validation = validateRhinoCandidate(candidate,sources);
        const actual = await page.evaluate(() => {
            const d=window.__ra2debug,r=d.renderableManager.getRenderableByGameObject(window.__m13Unit);
            return r.vxlBuilders.map(b=>({vxl:b.vxlFile.toPlain(),hva:b.hvaFile.sections.map(s=>({name:s.name,matrices:s.matrices.map(m=>m.toArray())}))}));
        });
        result.runtimeSourceHashes = actual.map((p,i)=>{
            const expected={sections:sources[i].sections.map(plainSection),voxelCount:sources[i].sections.reduce((n,s)=>n+s.occupancy,0)};
            assert.equal(hash(JSON.stringify(p.vxl)),hash(JSON.stringify(expected)),'Live decoded VXL identity');
            assert.deepEqual(p.hva,sources[i].sections.map(s=>({name:s.hvaName,matrices:s.hvaMatrices})),'Live HVA identity');
            return hash(JSON.stringify(p));
        });
    }
    result.install = await page.evaluate(candidate => {
        const d = window.__ra2debug, unit = window.__m13Unit;
        const r = d.renderableManager.getRenderableByGameObject(unit);
        if (unit.name !== 'HTNK' || r.vxlBuilders.length !== 3) throw Error('Unexpected Rhino family');
        const meshes = r.vxlBuilders.map(b => [...b.sections.values()][0]);
        const originals = meshes.map(m => m.geometry);
        const makeGeometry = (payload, reference) => {
            const geometry = new reference.constructor();
            for (const [key, a] of Object.entries(payload.attributes)) {
                const attribute = reference.attributes[key];
                geometry.setAttribute(key, new attribute.constructor(new attribute.array.constructor(a.array), a.itemSize));
            }
            const IndexArray = payload.index.type === 'Uint32Array' ? Uint32Array : Uint16Array;
            geometry.setIndex(new reference.index.constructor(new IndexArray(payload.index.array), 1));
            geometry.computeBoundingBox(); geometry.computeBoundingSphere(); return geometry;
        };
        const controls = originals.map(g => g.clone());
        const authored = candidate?.parts.map((p, i) => makeGeometry(p.geometry, originals[i]));
        if (candidate && (candidate.unit !== 'HTNK' || authored.length !== 3)) throw Error('Incomplete diagnostic family');
        const refresh = () => {
            d.worldScene.scene.updateMatrixWorld(true);
            d.worldScene.meshBatchManager.updateMeshes();
            d.renderer.render();
        };
        const switchGeometry = label => {
            const family = label === 'B' ? authored : label === 'control' ? controls : originals;
            if (!family) throw Error('Candidate absent');
            meshes.forEach((m, i) => { m.geometry = family[i]; }); refresh();
        };
        const projected = mesh => {
            const bounds = [Infinity, Infinity, -Infinity, -Infinity], v = d.worldScene.viewport;
            for (let i = 0; i < mesh.geometry.attributes.position.count; i++) {
                const p = r.getPosition().clone().fromBufferAttribute(mesh.geometry.attributes.position, i)
                    .applyMatrix4(mesh.matrixWorld).project(d.worldScene.camera);
                const x = v.x + (p.x+1)*v.width/2, y = v.y+(1-p.y)*v.height/2;
                bounds[0] = Math.min(bounds[0], x); bounds[1] = Math.min(bounds[1], y);
                bounds[2] = Math.max(bounds[2], x); bounds[3] = Math.max(bounds[3], y);
            }
            return bounds;
        };
        window.__m13Probe = {
            capture(body, turret, selected = false) {
                const oldFacing = unit.turretTrait.facing;
                const matrices = [r.dirWrapObj, r.tiltObj, r.turret, r.barrel].map(o => ({ o, rotation: o.rotation.clone() }));
                unit.turretTrait.facing = turret; r.updateVxlRotation(body, true);
                if (selected) { d.unitSelection.deselectAll(); d.unitSelection.addToSelection(unit); }
                refresh();
                const center = r.getPosition().clone().project(d.worldScene.camera), v = d.worldScene.viewport;
                const left = Math.round(v.x+(center.x+1)*v.width/2-180), top = Math.round(v.y+(1-center.y)*v.height/2-140);
                const rows = [];
                try {
                    for (const label of candidate ? ['A', 'control', 'B', 'restored'] : ['A', 'control', 'restored']) {
                        switchGeometry(label);
                        const canvas = d.renderer.renderer.domElement, ratio = canvas.width/1920;
                        const crop = document.createElement('canvas'); crop.width = 360*ratio; crop.height = 260*ratio;
                        crop.getContext('2d').drawImage(canvas, left*ratio, top*ratio, crop.width, crop.height, 0, 0, crop.width, crop.height);
                        const camera = d.worldScene.camera;
                        rows.push({ label, body, turret, tick: d.game.currentTick,
                            png: crop.toDataURL(), full: rows.length === 0 ? canvas.toDataURL() : undefined,
                            crop: [left, top, 360, 260], intendedCss: [360, 260], buffer: [canvas.width, canvas.height],
                            canvasCss: [canvas.getBoundingClientRect().width, canvas.getBoundingClientRect().height],
                            dpr: devicePixelRatio, browserZoom: visualViewport.scale, viewport: { ...v },
                            camera: { bounds: [camera.left,camera.right,camera.top,camera.bottom], zoom: camera.zoom,
                                matrix: camera.matrixWorld.toArray(), projection: camera.projectionMatrix.toArray() },
                            selectionBounds: r.bodyVxlBuilder.getLocalBoundingBox(),
                            parts: meshes.map(m => ({ projectedCss: projected(m), matrix: m.matrixWorld.toArray(),
                                palette: m.paletteIndex ?? m.material.palette.uuid,
                                light: (m.extraLight ?? m.material.extraLight).toArray(),
                                opacity: m.opacity ?? m.material.opacity, shadow: m.castShadow,
                                depthWrite: m.material.depthWrite, clipping: m.clippingPlanesHash ?? m.material.clippingPlanes?.map(p => [...p.normal.toArray(), p.constant]) })),
                            memory: { ...d.renderer.renderer.info.memory }, drawCalls: d.renderer.renderer.info.render.calls,
                            glError: d.renderer.renderer.getContext().getError() });
                    }
                } finally {
                    switchGeometry('A'); unit.turretTrait.facing = oldFacing;
                    matrices.forEach(({ o, rotation }) => { o.rotation.copy(rotation); o.updateMatrix(); });
                    r.lastTurretFacing = undefined; r.lastTilt = undefined;
                    d.unitSelection.deselectAll(); refresh();
                }
                return rows;
            },
            dispose() {
                switchGeometry('A'); const before = { ...d.renderer.renderer.info.memory };
                [...controls, ...(authored ?? [])].forEach(g => g.dispose()); refresh();
                return { before, after: { ...d.renderer.renderer.info.memory }, originalGeometryRestored: meshes.every((m,i) => m.geometry === originals[i]) };
            },
        };
        return { builder: r.vxlBuilders.map(b => b.constructor.name), batched: meshes.map(m => m.isBatchedMesh),
            originalGeometryBytes: originals.map(g => Object.values(g.attributes).reduce((s,a) => s+a.array.byteLength, g.index.array.byteLength)),
            rules: { strength: unit.rules.strength, speed: unit.rules.speed, cost: unit.rules.cost,
                primaryFireFlh: unit.art.primaryFireFlh },
            sourceFiles: r.vxlBuilders.map(b => b.vxlFile.filename), cameraScale: r.mainVxl.scale.toArray() };
    }, candidate);
    for (const preset of ['4k', '1080p']) {
        await page.evaluate(p => { window.__ra2debug.generalOptions.graphics.renderResolution.value = p; }, preset);
        for (const [body,turret] of [[0,0],[90,90],[180,180],[270,270],[45,135]]) {
            const rows = await page.evaluate(([b,t]) => window.__m13Probe.capture(b,t), [body,turret]);
            const a = rows[0];
            assert.equal(rows.find(r => r.label === 'control').png, a.png, 'Unchanged geometry adapter calibration');
            assert.equal(rows.at(-1).png, a.png, 'Original restoration');
            for (const row of rows) {
                assert.deepEqual(row.camera, a.camera); assert.equal(row.tick, a.tick);
                assert.deepEqual(row.selectionBounds, a.selectionBounds); assert.equal(row.glError,0);
                assert.deepEqual(row.parts.map(({ projectedCss, ...p }) => p), a.parts.map(({ projectedCss, ...p }) => p));
                row.file = `${preset}-${body}-${turret}-${row.label}.png`;
                const bytes = Buffer.from(row.png.split(',')[1], 'base64'); row.sha256 = hash(bytes);
                if (['A','B'].includes(row.label)) await fs.writeFile(`${output}/${row.file}`,bytes);
                if (row.full) { await fs.writeFile(`${output}/${preset}-${body}-${turret}-scene.png`, Buffer.from(row.full.split(',')[1],'base64')); delete row.full; }
                delete row.png;
            }
            result.sets.push({ preset, body, turret, rows });
        }
    }
    result.disposal = await page.evaluate(() => window.__m13Probe.dispose());
    assert(result.disposal.originalGeometryRestored);
    result.teardown = await page.evaluate(async () => {
        const d = window.__ra2debug; await d.gameScreen.onLeave(); return { remainingGame: !!d.game };
    });
    assert(!result.teardown.remainingGame);
    assert.deepEqual(result.errors, []); assert.deepEqual(result.consoleErrors, []); assert.deepEqual(result.external, []);
    result.status = 'PASS_PHASE_A_DIAGNOSTIC';
} catch (error) {
    result.failure = error.stack; process.exitCode = 1;
    if (page) await page.screenshot({ path: `${output}/failure.png` }).catch(() => {});
} finally {
    result.sources = {};
    for (const file of ['run-rhino-phase-a.mjs','rhino-candidate-validation.mjs','rhino-geometry.ts']) {
        const bytes=await fs.readFile(`scripts/m1/${file}`);result.sources[file]=hash(bytes);
        await fs.writeFile(`${output}/source-${file}`,bytes);
    }
    await fs.writeFile(`${output}/result.json`, JSON.stringify(result,null,2)+'\n');
    await browser.close();
}
console.log(JSON.stringify({ status: result.status, failure: result.failure, errors: result.errors, consoleErrors: result.consoleErrors }));
