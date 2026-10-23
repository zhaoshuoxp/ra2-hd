// Development-only binding/pose probe. Final acceptance uses the packaged app.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'vite';
import { chromium } from '@playwright/test';
import { registerHdResources } from '../../../desktop/hd-profile.mjs';
import { captureMechanisms } from './capture-mechanisms.mjs';

const output = path.resolve(process.argv[2]);
const requestedFamilies = process.argv.find(a => a.startsWith('--families='))?.split('=')[1].split(',')
    ?? ['GTGCAN', 'NASAM', 'GAGAP', 'GAPILL'];
await fs.mkdir(output, { recursive: false });
const events = [], logs = [], errors = [];
const hd = await registerHdResources('.local', event => events.push(event));
const server = await createServer({ logLevel: 'silent', server: { port: 4177 }, plugins: [{ name: 'review-hd-registry', enforce: 'pre',
    configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
            if (!req.url.startsWith('/local-hd/') && !req.url.startsWith('/local-ui/')) return next();
            const selection = hd.selections.get(req.url), file = hd.routes.get(req.url);
            if (!selection && !file) { res.statusCode = 404; return res.end(); }
            try {
                res.setHeader('Content-Type', selection || file?.endsWith('.json') ? 'application/json'
                    : file?.endsWith('.png') ? 'image/png' : 'application/octet-stream');
                res.end(selection ? JSON.stringify(selection) : await fs.readFile(file));
            } catch (error) { res.statusCode = 500; res.end(String(error)); }
        });
    },
}] });
let browser;
const result = { status: 'RUNNING', scope: 'Development source activation; final packaged smoke pending', events, errors, logs };
try {
    await server.listen();
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
    page.on('pageerror', e => errors.push(e.stack));
    page.on('console', m => { if (/HD|Error|missing|Invalid/i.test(m.text())) logs.push(m.text()); });
    await page.goto('http://127.0.0.1:4177/?edition=yr');
    await page.waitForFunction(() => window.__ra2debug?.generalOptions, undefined, { timeout: 90000 });
    await page.evaluate(() => {
        window.__ra2debug.generalOptions.graphics.hdEnabled.value = true;
        Object.entries({ _r_lastMap: 'XMP01T4.map', _r_lastMode: '1', _r_lastCountry: '1', _r_lastColor: '1',
            _r_lastStartPos: '0', _r_lastTeam: '0', _r_hostOpts: '6;10000;0;1;1;0;1;0;;0;1;0;0',
            _r_lastBots: JSON.stringify([null, null, null, { d: 4, c: 5, co: 2, s: 3, t: 1 }, null, null, null, null]),
        }).forEach(([k, v]) => localStorage.setItem('_edition:yr:' + k, v));
    });
    const locale = JSON.parse(await fs.readFile('public/res/locale/zh-CN.json', 'utf8'));
    await page.getByRole('button', { name: new RegExp(`${locale['hd:menuskirmish']}|Skirmish`, 'i') }).click();
    await page.waitForFunction(() => window.__ra2debug?.skirmishLobby);
    await page.evaluate(() => window.__ra2debug.skirmishLobby.startGame(1700000000000));
    await page.waitForFunction(() => window.__ra2debug?.game?.status === 1, undefined, { timeout: 90000 });
    result.availability = await page.evaluate(() => window.__ra2debug.generalOptions.graphics.hdAvailability);
    result.allocations = await page.evaluate(() => {
        const d = window.__ra2debug;
        return { buildings: d.sovietBuildingsHd, conscript: d.conscriptHd, gapowr: d.powerPlantHd,
            napowr: d.napowrHd, rhino: d.rhinoHd, units: d.sovietUnitsHd };
    });
    result.families = await page.evaluate(async requestedFamilies => {
        const d = window.__ra2debug;
        const mcv = d.localPlayer.getOwnedObjects().find(u => u.name === 'AMCV');
        if (requestedFamilies.includes('GAYARD')) d.game.mapShroudTrait.getPlayerShroud(d.localPlayer).revealAll();
        const families = [];
        for (const [i, name] of requestedFamilies.entries()) {
            const unit = d.game.createObject(2, name);
            const tile = name === 'GAYARD'
                ? d.game.map.tiles.getAll().filter(t => d.game.map.isWithinBounds(t)
                    && d.game.getConstructionWorker(d.localPlayer).canPlaceAt(name, t, { ignoreAdjacent: true, normalizedTile: true }))
                    .sort((a,b) => Math.hypot(a.rx-mcv.tile.rx,a.ry-mcv.tile.ry)-Math.hypot(b.rx-mcv.tile.rx,b.ry-mcv.tile.ry))[0]
                : d.game.map.tiles.getByMapCoords(mcv.tile.rx - 6 + i % 2 * 4, mcv.tile.ry - 6 + Math.floor(i / 2) * 4);
            if (!tile) throw Error(`No legal fixture for ${name}`);
            d.game.changeObjectOwner(unit, d.localPlayer);
            d.game.spawnObject(unit, tile);
            families.push({ name, id: unit.id });
        }
        const focus = requestedFamilies.length === 1 && requestedFamilies[0] === 'GAYARD'
            ? d.localPlayer.getOwnedObjects().find(u => u.id === families[0].id).tile : mcv.tile;
        d.game.mapShroudTrait.getPlayerShroud(d.localPlayer).revealAround(focus, 15);
        d.worldInteraction.minimapHandler.panToTile(focus);
        window.__alliedFixtures = families;
        return families;
    }, requestedFamilies);
    await page.waitForFunction(() => window.__alliedFixtures.every(f => {
        const d = window.__ra2debug, unit = d.localPlayer.getOwnedObjects().find(u => u.id === f.id);
        const r = d.renderableManager.getRenderableByGameObject(unit);
        return r?.mainObj?.get3DObject().visible && (!r.turret || r.turret.visible)
            && r.imageFinder.getBuildingHdOverride(f.name, r.aggregatedImageData);
    }), undefined, { timeout: 90000 });
    result.demand = await page.evaluate(() => window.__ra2debug.sovietUnitsHd);
    result.bindings = await page.evaluate(() => window.__alliedFixtures.map(f => {
        const d = window.__ra2debug, unit = d.localPlayer.getOwnedObjects().find(u => u.id === f.id);
        const r = d.renderableManager.getRenderableByGameObject(unit);
        return { name: f.name, keys: Object.keys(r), turretParts: r.turretBuilders?.length,
            hdMaterials: (() => { const names = []; r.get3DObject().traverse(o => { if (o.isMesh) names.push({ name: o.name, type: o.material?.type }); }); return names; })() };
    }));
    await page.screenshot({ path: path.join(output, 'scene.png') });
    if (process.argv.includes('--mechanisms')) result.mechanisms = await captureMechanisms(page, output);
    if (process.argv.includes('--states') || process.argv.includes('--damage')) {
        result.headings = [];
        await page.evaluate(() => window.__ra2debug.gameScreen.gameAnimationLoop.stop());
        for (let heading = 0; process.argv.includes('--states') && heading < 360; heading += 45) {
            const bindings = await page.evaluate(heading => window.__alliedFixtures.filter(f => ['NASAM', 'GTGCAN'].includes(f.name)).map(f => {
                const d = window.__ra2debug, unit = d.localPlayer.getOwnedObjects().find(u => u.id === f.id);
                const r = d.renderableManager.getRenderableByGameObject(unit);
                unit.turretTrait.facing = heading;
                r.update(0);
                d.renderer.render();
                const active = [...r.buildingTurretHd.meshes].filter(([, meshes]) => meshes[1].visible).map(([h]) => h);
                return { name: f.name, active, builders: r.turretBuilders.length,
                    originals: r.buildingTurretHd.originals.length, bytes: r.buildingTurretHd.resources.gpuBytes,
                    bodyOverride: r.imageFinder.getBuildingHdOverride(f.name, r.aggregatedImageData)?.identity };
            }), heading);
            if (bindings.some(b => b.active.length !== 1 || b.active[0] !== heading || !b.bodyOverride)) throw Error('Incomplete assembled heading binding');
            await page.screenshot({ path: path.join(output, `heading-${heading}.png`) });
            result.headings.push({ heading, bindings });
        }
        await page.evaluate(() => {
            const d = window.__ra2debug;
            for (const f of window.__alliedFixtures) {
                const unit = d.localPlayer.getOwnedObjects().find(u => u.id === f.id);
                unit.healthTrait.inflictDamage(Math.floor(unit.healthTrait.getHitPoints() * .65), unit, d.game);
            }
            d.gameScreen.gameAnimationLoop.start();
        });
        await page.waitForFunction(() => window.__alliedFixtures.every(f => {
            const d = window.__ra2debug, unit = d.localPlayer.getOwnedObjects().find(u => u.id === f.id);
            const r = d.renderableManager.getRenderableByGameObject(unit);
            return unit.healthTrait.health < 50 && r.mainObj.builder.getFrame() === 1;
        }));
        await page.screenshot({ path: path.join(output, 'damaged.png') });
        result.damage = await page.evaluate(() => window.__alliedFixtures.map(f => {
            const d = window.__ra2debug, unit = d.localPlayer.getOwnedObjects().find(u => u.id === f.id);
            const r = d.renderableManager.getRenderableByGameObject(unit);
            return { name: f.name, health: unit.healthTrait.health, frame: r.mainObj.builder.getFrame(),
                bodyOverride: r.imageFinder.getBuildingHdOverride(f.name, r.aggregatedImageData)?.identity };
        }));
        if (process.argv.includes('--damaged-mechanisms')) {
            const damagedOutput = path.join(output, 'damaged-mechanisms');
            await fs.mkdir(damagedOutput);
            result.damagedMechanisms = await captureMechanisms(page, damagedOutput);
        }
    }
    for (const name of requestedFamilies.map(n => n.toLowerCase())) {
        if (!result.availability[name === 'gapowr' ? 'powerPlant' : name]?.startsWith('HD active')
            && result.demand?.families[name === 'amradr' ? 'GAAIRC' : name.toUpperCase()]?.status !== 'READY')
            throw Error(`${name} not activated`);
    }
    for (const binding of result.bindings) {
        if (!binding.hdMaterials.some(m => m.type === 'HdSpriteMaterial')) throw Error(`${binding.name} has no actual HD material`);
    }
    if (errors.length) throw Error(errors.join('\n'));
    result.status = 'PASS_DEVELOPMENT_ACTIVATION';
} catch (e) { result.status = 'FAIL'; result.failure = e.stack; process.exitCode = 1; }
finally {
    await fs.writeFile(path.join(output, 'result.json'), JSON.stringify(result, null, 2));
    await browser?.close(); await server.close();
    console.log(JSON.stringify({ status: result.status, failure: result.failure, availability: result.availability }));
}
