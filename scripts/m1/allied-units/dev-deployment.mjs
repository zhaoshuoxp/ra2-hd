// Focused source-runtime probe; final delivery still uses the packaged Mac app.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { chromium } from '@playwright/test';
import { registerHdResources } from '../../../desktop/hd-profile.mjs';

const out = path.resolve(process.argv[2]);
const identity = process.argv[3] ?? 'GGI';
assert.ok(['E1', 'GGI'].includes(identity));
const deployedStart = identity === 'GGI' ? 315 : 292;
await fs.mkdir(out, { recursive: false });
const report = { status: 'RUNNING', scope: 'Controlled fixtures with native movement/deployment/attack; development source only',
    identity, errors: [], stages: [], registration: [] };
const hd = await registerHdResources(path.resolve('.local'), event => report.registration.push(event));
const server = await createServer({ logLevel: 'silent', server: { port: 4178 }, plugins: [{
    name: 'allied-review-resources', enforce: 'pre',
    configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
            if (!/^\/local-(hd|ui|vxl)\//.test(req.url)) return next();
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
try {
    await server.listen();
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
    page.on('pageerror', error => report.errors.push(error.stack));
    await page.goto('http://127.0.0.1:4178/?edition=yr');
    await page.waitForFunction(() => window.__ra2debug?.generalOptions, undefined, { timeout: 90000 });
    await page.evaluate(() => {
        const d = window.__ra2debug;
        d.generalOptions.graphics.hdEnabled.value = true;
        d.generalOptions.graphics.renderResolution.value = '1080p';
        Object.entries({ _r_lastMap: 'XMP01T4.map', _r_lastMode: '1', _r_lastCountry: '0', _r_lastColor: '1',
            _r_lastStartPos: '0', _r_lastTeam: '0', _r_hostOpts: '6;10000;0;1;1;0;1;0;;0;1;0;0',
            _r_lastBots: JSON.stringify([null, null, null, { d: 4, c: 5, co: 2, s: 3, t: 1 }, null, null, null, null]),
        }).forEach(([key, value]) => localStorage.setItem('_edition:yr:' + key, value));
    });
    const locale = JSON.parse(await fs.readFile('public/res/locale/zh-CN.json', 'utf8'));
    await page.getByRole('button', { name: new RegExp(`${locale['hd:menuskirmish']}|Skirmish`, 'i') }).click();
    await page.waitForFunction(() => window.__ra2debug?.skirmishLobby);
    await page.evaluate(() => window.__ra2debug.skirmishLobby.startGame(1700000000000));
    await page.waitForFunction(() => window.__ra2debug?.game?.status === 1, undefined, { timeout: 90000 });
    await page.evaluate(identity => {
        const d = window.__ra2debug, g = d.game, player = d.localPlayer;
        const center = player.getOwnedObjects().find(unit => unit.name === 'AMCV').tile;
        for (const bot of g.botManager.bots.values()) bot.onGameTick = () => {};
        g.mapShroudTrait.revealMap(player, g);
        window.__spawn = (name, type, near, owner = player) => {
            const rule = g.rules.getObject(name, type);
            const tile = g.map.tiles.getAll().filter(t => g.map.isWithinBounds(t) && !t.rampType
                && g.map.terrain.getPassableSpeed(t, rule.speedType, type === 3, false) > 0
                && !g.map.getGroundObjectsOnTile(t).some(o => o.isTechno() || o.isTerrain()))
                .sort((a, b) => Math.hypot(a.rx - near.rx, a.ry - near.ry) - Math.hypot(b.rx - near.rx, b.ry - near.ry))[0];
            if (!tile) throw Error('No legal fixture tile');
            const unit = g.createUnitForPlayer(rule, owner); g.spawnObject(unit, tile); return unit;
        };
        window.__actor = window.__spawn(identity, 3, { rx: center.rx - 4, ry: center.ry - 4 });
        window.__peer = window.__spawn('MTNK', 7, { rx: center.rx - 1, ry: center.ry - 5 });
        window.__sample = () => {
            const unit = window.__actor, renderable = d.renderableManager.getRenderableByGameObject(unit);
            const builder = renderable?.shpRenderable?.builder;
            return { tick: g.currentTick, frame: builder?.getFrame(), hd: !!builder?.hdOverride,
                density: builder?.hdOverride?.density, deployed: unit.deployerTrait.isDeployed(), moving: unit.isMoving,
                tile: [unit.tile.rx, unit.tile.ry], firing: unit.isFiring,
                peerHd: !!d.renderableManager.getRenderableByGameObject(window.__peer)?.unitVxlHd?.active };
        };
        d.worldInteraction.minimapHandler.panToTile(window.__actor.tile);
    }, identity);
    await page.waitForFunction(() => window.__sample().hd && window.__sample().peerHd, undefined, { timeout: 60000 });
    const stage = async name => {
        report.stages.push({ name, sample: await page.evaluate(() => window.__sample()) });
        await page.screenshot({ path: path.join(out, name + '.png') });
    };
    await stage('ready');
    await page.evaluate(() => {
        const d = window.__ra2debug, unit = window.__actor;
        d.actionsApi.orderUnits([unit.id], 0, unit.tile.rx + 3, unit.tile.ry);
    });
    await page.waitForFunction(() => window.__sample().moving);
    await stage('moving');
    await page.waitForFunction(() => !window.__sample().moving, undefined, { timeout: 45000 });
    await page.evaluate(() => window.__ra2debug.actionsApi.orderUnits([window.__actor.id], 10));
    await page.waitForFunction(start => { const s = window.__sample(); return s.deployed && s.frame >= start && s.frame <= start + 7; }, deployedStart);
    await stage('deployed');
    await page.evaluate(() => {
        const d = window.__ra2debug, unit = window.__actor;
        const enemy = d.game.getCombatants().find(p => p !== d.localPlayer);
        const target = window.__spawn('HTNK', 7, { rx: unit.tile.rx + 3, ry: unit.tile.ry }, enemy);
        target.attackTrait.setDisabled(true); target.moveTrait.setDisabled(true);
        window.__target = target; window.__initialHealth = target.healthTrait.health;
        d.actionsApi.orderUnits([unit.id], 2, target.id);
    });
    await page.waitForFunction(() => window.__sample().firing, undefined, { timeout: 45000 });
    await stage('deployed-firing');
    await page.waitForFunction(() => window.__target.healthTrait.health < window.__initialHealth, undefined, { timeout: 45000 });
    report.nativeDamage = true;
    await page.evaluate(() => {
        const d = window.__ra2debug, unit = window.__actor;
        d.actionsApi.orderUnits([unit.id], 11); d.actionsApi.orderUnits([unit.id], 10);
    });
    await page.waitForFunction(start => !window.__sample().deployed && window.__sample().frame < start, deployedStart);
    await stage('undeployed');
    report.allocations = await page.evaluate(() => window.__ra2debug.sovietUnitsHd);
    assert.deepEqual(report.errors, []);
    report.status = 'PASS_DEVELOPMENT_NATIVE_DEPLOYMENT';
} catch (error) {
    report.status = 'FAIL'; report.failure = error.stack; throw error;
} finally {
    await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    await browser?.close(); await server.close();
}
