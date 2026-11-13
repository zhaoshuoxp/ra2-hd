import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';

// Companion ordinary inputs for an already running isolated original-source
// fleet test. The simulation journal also records these paid player actions.
const out = path.resolve(process.argv[2]);
const [port, endpoint] = (await fs.readFile(path.join(out, 'profile/DevToolsActivePort'), 'utf8')).trim().split('\n');
const browser = await chromium.connectOverCDP(`ws://127.0.0.1:${port}${endpoint}`);
const page = browser.contexts()[0].pages().find(p => p.url().startsWith('ra2')) ?? browser.contexts()[0].pages()[0];
const report = { status: 'RUNNING', commands: [] };
try {
    const queued = await page.evaluate(() => {
        const d = window.__ra2debug, g = d.game, production = g.localPlayer.production, rule = g.rules.getBuilding('GASPYSAT');
        if (!production.isAvailableForProduction(rule)) throw Error('The source satellite is not ordinarily available');
        const queue = production.getQueueForObject(rule);
        d.actionsApi.queueForProduction(queue.type, 2, 'GASPYSAT', 1);
        return { tick: g.currentTick, credits: g.localPlayer.credits };
    });
    report.commands.push({ kind: 'paid-production', name: 'GASPYSAT', ...queued });
    for (let i = 0; i < 300; i++) {
        const placed = await page.evaluate(() => {
            const d = window.__ra2debug, g = d.game, rule = g.rules.getBuilding('GASPYSAT');
            const queue = g.localPlayer.production.getQueueForObject(rule);
            if (queue.status !== 3 || queue.getFirst()?.rules !== rule) return;
            const worker = g.getConstructionWorker(g.localPlayer);
            const tile = g.map.tiles.getAll().filter(tile => worker.canPlaceAt('GASPYSAT', tile, { normalizedTile: true }))
                .sort((a, b) => Math.hypot(a.rx - 44, a.ry - 105) - Math.hypot(b.rx - 44, b.ry - 105))[0];
            if (!tile) throw Error('No legal satellite placement');
            d.actionsApi.placeBuilding('GASPYSAT', tile.rx, tile.ry);
            return { tick: g.currentTick, tile: [tile.rx, tile.ry] };
        });
        if (placed) { report.commands.push({ kind: 'ordinary-placement', name: 'GASPYSAT', ...placed }); break; }
        await page.waitForTimeout(200);
    }
    assert.equal(report.commands.length, 2);
    report.status = 'PASS_COMPANION_PAID_ORIGINAL_SATELLITE_ORDINARY_INPUTS';
} catch (error) { report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1; }
await fs.writeFile(path.join(out, 'satellite-relief-inputs.json'), JSON.stringify(report, null, 2) + '\n');
await browser.close();
console.log(JSON.stringify(report));
