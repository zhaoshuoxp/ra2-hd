import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';

const out = path.resolve(process.argv[2]);
const [port] = (await fs.readFile(path.join(out, 'profile/DevToolsActivePort'), 'utf8')).split('\n');
assert(/^\d+$/.test(port));
const browser = await chromium.connectOverCDP('http://127.0.0.1:' + port);
const page = browser.contexts().flatMap(context => context.pages()).find(page => page.url().includes('ra2'))
    ?? browser.contexts().flatMap(context => context.pages())[0];
assert(page);
const report = { status: 'RUNNING', assistance: 'Supplemental ordinary player actions enter the same live serialized queue. The primary pilot alone advances simulation. No world, source rule, health, task, RNG or result is assigned.', actions: [] };
try {
    report.actions.push(await page.evaluate(() => {
        const d = window.__ra2debug, g = d.game;
        if (g.campaign.launch.mission !== 'all07smd.map' || g.campaign.inspectionModified || g.campaign.result) throw Error('Unexpected live test mission');
        const own = g.localPlayer.getOwnedObjects().filter(unit => unit.isSpawned && !unit.isDestroyed);
        const worker = g.getConstructionWorker(g.localPlayer);
        const candidates = [];
        for (let y = 190; y <= 201; y++) for (let x = 94; x <= 106; x++) {
            const tile = g.map.tiles.getByMapCoords(x, y);
            if (tile && worker.canPlaceAt('GAPILL', tile, { normalizedTile: true })) candidates.push(tile);
        }
        const tile = candidates.sort((a, b) => Math.hypot(a.rx - 98, a.ry - 197) - Math.hypot(b.rx - 98, b.ry - 197))[0];
        if (!tile) throw Error('No normal legal land cell for the paid army to assemble');
        const factory = own.find(unit => unit.name === 'GAWEAP');
        if (!factory) throw Error('The paid Allied factory was lost');
        d.actionsApi.orderUnits([factory.id], 0, tile.rx, tile.ry);
        const army = own.filter(unit => unit.name === 'SREF');
        if (army.length) d.actionsApi.orderUnits(army.map(unit => unit.id), 0, tile.rx, tile.ry);
        const production = g.localPlayer.production, queued = [];
        for (const [name, desired] of [['FV', 7], ['SREF', 14]]) {
            const rule = g.rules.getObject(name, 7), queue = production.getQueueForObject(rule);
            const existing = own.filter(unit => unit.name === name).length;
            const pending = queue.getAll().filter(item => item.rules === rule).reduce((sum, item) => sum + item.quantity, 0);
            const count = Math.max(0, desired - existing - pending);
            if (count) {
                if (!production.isAvailableForProduction(rule)) throw Error('Original prerequisites do not permit ' + name);
                d.actionsApi.queueForProduction(queue.type, 7, name, count); queued.push({ name, count });
            }
        }
        const satellite = own.some(unit => unit.name === 'GASPYSAT');
        if (!satellite) {
            const rule = g.rules.getBuilding('GASPYSAT'), queue = production.getQueueForObject(rule);
            if (!production.isAvailableForProduction(rule) || queue.getAll().length) throw Error('The satellite requires normal technology and a free construction queue');
            d.actionsApi.queueForProduction(queue.type, 2, 'GASPYSAT', 1); queued.push({ name: 'GASPYSAT', count: 1 });
        }
        return { tick: g.currentTick, kind: 'ordinary-factory-rally-and-replacement-production',
            rally: [tile.rx, tile.ry], queued, satelliteAlreadyPresent: satellite };
    }));
    await fs.writeFile(path.join(out, 'supplemental-ordinary-inputs.json'), JSON.stringify(report, null, 2) + '\n');
    if (!report.actions[0].satelliteAlreadyPresent) {
        await page.waitForFunction(() => {
            const g = window.__ra2debug.game, rule = g.rules.getBuilding('GASPYSAT'), queue = g.localPlayer.production.getQueueForObject(rule);
            return queue.status === 3 && queue.getFirst()?.rules === rule;
        }, undefined, { timeout: 120000 });
        report.actions.push(await page.evaluate(() => {
            const d = window.__ra2debug, g = d.game, worker = g.getConstructionWorker(g.localPlayer), candidates = [];
            for (let y = 186; y <= 209; y++) for (let x = 94; x <= 114; x++) {
                const tile = g.map.tiles.getByMapCoords(x, y);
                if (tile && worker.canPlaceAt('GASPYSAT', tile, { normalizedTile: true })) candidates.push(tile);
            }
            const tile = candidates.sort((a, b) => Math.hypot(a.rx - 98, a.ry - 202) - Math.hypot(b.rx - 98, b.ry - 202))[0];
            if (!tile) throw Error('No normal legal satellite placement');
            d.actionsApi.placeBuilding('GASPYSAT', tile.rx, tile.ry);
            return { tick: g.currentTick, kind: 'ordinary-paid-satellite-placement', tile: [tile.rx, tile.ry] };
        }));
    }
    report.status = 'PASS_SUPPLEMENTAL_ORDINARY_REPLACEMENT_PRODUCTION_SAFE_RALLY_AND_PAID_SATELLITE_INPUTS';
} catch (error) { report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1; }
await fs.writeFile(path.join(out, 'supplemental-ordinary-inputs.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report));
process.exit(process.exitCode ?? 0);
