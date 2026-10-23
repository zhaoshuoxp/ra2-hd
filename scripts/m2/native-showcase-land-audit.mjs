// Whole-map native-camera coverage for terrain feedback; no gameplay changes.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { startSession } from '../m1/allied-units/desktop-session.mjs';

const [receipt, output] = process.argv.slice(2);
const original = process.argv.includes('--original');
const density = process.argv.includes('--density=2') ? 2 : 4;
process.argv.push('--map=XMP03T4.map');
const session = await startSession(receipt, output, 'yr', false, async ({ page }) => {
    await page.evaluate(({ density, original }) => {
        const options = window.__ra2debug.generalOptions.graphics;
        options.hdEnabled.value = !original;
        options.hdDensity.value = density;
    }, { density, original });
});
const { page, report, stage, close } = session;
let failure;
try {
    report.disclosure = 'Copied isolated app; full revealed retail map, suspended bot AI, native camera pans. No terrain, map, rules, geometry, ticks or gameplay edits.';
    report.terrain = await page.evaluate(() => window.__ra2debug.terrainHd);
    report.environment = await page.evaluate(() => window.__ra2debug.environmentHd);
    report.tiles = await page.evaluate(() => {
        const d = window.__ra2debug;
        return d.game.map.tiles.getAll().filter(t => d.game.map.isWithinBounds(t))
            .map(t => [t.rx, t.ry, t.z, t.tileNum, t.subTile]);
    });
    const routeFile = process.argv.find(arg => arg.startsWith('--route-file='))?.slice(13);
    if (routeFile) report.route = JSON.parse(await fs.readFile(routeFile, 'utf8')).route;
    else {
        const tiles = report.tiles;
        const u = tiles.map(t => t[0] - t[1]), v = tiles.map(t => t[0] + t[1]);
        const route = [];
        // The unmodified 1080p camera spans more than 42 by 60 projected
        // coordinates. Overlapping pans cover edges and elevated terrain.
        for (let a = Math.min(...u) + 14; a <= Math.max(...u) + 14; a += 28) {
            for (let b = Math.min(...v) + 20; b <= Math.max(...v) + 20; b += 36) {
                const tile = tiles.reduce((best, t) => {
                    const distance = Math.hypot((t[0] - t[1] - a) / 28, (t[0] + t[1] - b) / 36);
                    return distance < best.distance ? { tile: t, distance } : best;
                }, { distance: Infinity }).tile;
                if (!route.some(r => r.tile[0] === tile[0] && r.tile[1] === tile[1])) {
                    route.push({ name: 'land-' + String(route.length + 1).padStart(2, '0'), tile: tile.slice(0, 2) });
                }
            }
        }
        route.push({ name: 'reported-shore', tile: [91, 51] }, { name: 'reported-bridge', tile: [86, 54] });
        report.route = route;
    }
    report.covered = new Set();
    report.projections = [];
    for (const target of report.route) {
        await page.evaluate(tile => {
            const d = window.__ra2debug;
            d.worldInteraction.minimapHandler.panToTile(d.game.map.tiles.getByMapCoords(...tile));
        }, target.tile);
        await page.waitForTimeout(180);
        await stage(target.name);
        const capture = await page.evaluate(() => {
            const d = window.__ra2debug, c = d.renderer.renderer.domElement;
            d.renderer.render();
            const viewport = d.worldScene.viewport, scale = c.width / d.renderer.width;
            const tiles = d.game.map.tiles.getAll().filter(t => d.game.map.isWithinBounds(t));
            return { png: c.toDataURL('image/png').split(',')[1], viewport,
                canvas: [c.width, c.height], camera: d.worldScene.camera.position.toArray(),
                covered: tiles.filter(t => {
                    const p = d.worldScene.camera.position.clone().set((t.rx + .5) * 256,
                        (t.z ?? 0) * 128 * Math.SQRT1_2 / Math.cos(Math.PI / 6), (t.ry + .5) * 256)
                        .project(d.worldScene.camera);
                    const x = (viewport.x + (p.x + 1) * viewport.width / 2) * scale;
                    const y = (viewport.y + (1 - p.y) * viewport.height / 2) * scale;
                    return x >= 0 && x < viewport.width * scale && y >= 0 && y < viewport.height * scale;
                }).map(t => [t.rx, t.ry]) };
        });
        await fs.writeFile(path.join(output, target.name + '-framebuffer.png'), Buffer.from(capture.png, 'base64'));
        capture.covered.forEach(t => report.covered.add(t.join(',')));
        report.projections.push({ name: target.name, ...capture, png: undefined });
    }
    report.coveredTiles = report.covered.size;
    report.covered = [...report.covered];
    report.uncovered = report.tiles.filter(t => !report.covered.includes(t.slice(0, 2).join(',')));
    assert.equal(report.uncovered.length, 0, 'Every playable tile must be inside a captured native viewport');
    if (!original) assert.equal(report.terrain.density, density);
    assert.equal(await page.evaluate(() => window.__ra2debug.renderer.renderer.getContext().getError()), 0);
    assert.equal(report.errors.length, 0);
} catch (error) { failure = error; }
await close(failure);
if (failure) throw failure;
