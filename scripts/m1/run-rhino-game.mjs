import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
const origin = process.env.M13F_ORIGIN ?? 'http://127.0.0.1:4070';
const output = process.env.M13F_OUTPUT ?? `.artifacts/m1-3f/check-${Date.now()}`;
await fs.mkdir(output, { recursive: true });
const report = { status: 'FAIL', errors: [], consoleErrors: [], production: [], external: [] };
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: process.env.M13F_PLAY !== '1', args: ['--disable-background-networking', '--no-first-run'] });
try {
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, serviceWorkers: 'block' });
    await context.route('**/*', route => {
        const url = route.request().url();
        if (!url.startsWith(origin + '/') && !/^(blob|data):/.test(url)) { report.external.push(url); return route.abort(); }
        if (process.env.M13F_MISSING && url.endsWith('/turret-315.mask')) return route.fulfill({ status: 404, body: 'Intentional missing member' });
        return route.continue();
    });
    await context.addInitScript(() => {
        const prefs = { _r_lastMap: 'MP01T4.map', _r_lastMode: '1', _r_lastCountry: '5', _r_lastColor: '1',
            _r_lastStartPos: '0', _r_lastTeam: '0', _r_hostOpts: '6;10000;0;1;1;0;1;0;;0;1;0;0',
            _r_lastBots: JSON.stringify([null,null,null,{d:2,c:0,co:2,s:3,t:1},null,null,null,null]) };
        Object.entries(prefs).forEach(([k,v]) => localStorage.setItem(k,v));
    });
    const page = await context.newPage();
    page.on('pageerror', e => report.errors.push(e.stack));
    page.on('console', m => { if (m.type() === 'error') report.consoleErrors.push(m.text()); });
    await page.goto(`${origin}/?conscript-hd=4&power-plant-hd=4`);
    await page.getByText('Offline Skirmish', { exact: true }).click({ timeout: 45000 });
    await page.waitForFunction(() => window.__ra2debug?.skirmishLobby);
    await page.evaluate(() => {
        const d = window.__ra2debug;
        d.generalOptions.graphics.renderResolution.value = '1080p';
        d.generalOptions.graphics.rhinoHd.value = true;
        d.skirmishLobby.startGame(1700000000000);
    });
    await page.waitForFunction(() => window.__ra2debug?.game?.status === 1, undefined, { timeout: 60000 });
    report.initial = await page.evaluate(() => {
        const d = window.__ra2debug;
        return { rhino: d.rhinoHd, owned: d.localPlayer.getOwnedObjects().map(u => u.name), color: d.localPlayer.color,
            country: d.localPlayer.country, colors: [...d.game.rules.colors.values()] };
    });
    await page.evaluate(() => { window.__ra2debug.game.desiredSpeed.value = 4; });
    console.log('MATCH', JSON.stringify(report.initial));
    if (process.env.M13F_MISSING) {
        assert.equal(report.initial.rhino.status, 'ORIGINAL');
        assert.equal(report.initial.rhino.partCount, 0);
        await page.evaluate(() => {
            const d=window.__ra2debug,mcv=d.localPlayer.getOwnedObjects()[0];
            const unit=d.game.createUnitForPlayer(d.game.rules.getObject('HTNK',7),d.localPlayer);
            d.game.spawnObject(unit,d.game.map.tiles.getByMapCoords(mcv.tile.rx+2,mcv.tile.ry));
            window.__fallbackRhino=unit;
        });
        await page.waitForTimeout(600);
        report.fallback=await page.evaluate(()=>{
            const d=window.__ra2debug,r=d.renderableManager.getRenderableByGameObject(window.__fallbackRhino);
            return {installed:!!r.rhinoHd,sections:r.vxlBuilders.flatMap(b=>[...b.sections.values()]).map(m=>m.material.colorWrite),
                fixture:'Explicit placement solely for missing-pack fallback; no rendering adapter injected'};
        });
        assert(!report.fallback.installed);assert.deepEqual(report.fallback.sections,[true,true,true]);
        report.status = 'PASS_COMPLETE_FAMILY_FALLBACK';
    } else {
        assert.equal(report.initial.rhino.status, 'READY');
        await page.evaluate(() => {
            const d = window.__ra2debug, mcv = d.localPlayer.getOwnedObjects().find(u => /MCV$/.test(u.name));
            d.actionsApi.orderUnits([mcv.id], 10);
        });
        await page.waitForFunction(() => window.__ra2debug.localPlayer.getOwnedObjects().some(u => u.name === 'NACNST'), undefined, { timeout: 30000 });
        for (const name of ['NAPOWR', 'NAHAND', 'NAREFN', 'NAWEAP']) {
            await page.evaluate(name => window.__ra2debug.actionsApi.queueForProduction(0, 2, name, 1), name);
            await page.waitForFunction(() => window.__ra2debug.localPlayer.production.getQueue(0).status === 3, undefined, { timeout: 120000 });
            const placement = await page.evaluate(name => {
                const d = window.__ra2debug, yard = d.localPlayer.getOwnedObjects().find(u => u.name === 'NACNST');
                const tiles = [];
                for (let dx=-10;dx<=10;dx++) for(let dy=-10;dy<=10;dy++) tiles.push({rx:yard.tile.rx+dx,ry:yard.tile.ry+dy});
                tiles.sort((a,b) => Math.hypot(a.rx-yard.tile.rx,a.ry-yard.tile.ry)-Math.hypot(b.rx-yard.tile.rx,b.ry-yard.tile.ry));
                const tile = tiles.find(t => d.game.getConstructionWorker(d.localPlayer).canPlaceAt(name,t,{normalizedTile:true}));
                if (!tile) throw Error(`No legal ${name} foundation`);
                d.actionsApi.placeBuilding(name,tile.rx,tile.ry);
                return {name,tile,tick:d.game.currentTick};
            }, name);
            report.production.push(placement); console.log('BUILT', name);
            await page.waitForTimeout(3000);
        }
        await page.evaluate(() => window.__ra2debug.actionsApi.queueForProduction(3, 7, 'HTNK', 1));
        await page.waitForFunction(() => window.__ra2debug.localPlayer.getOwnedObjects().some(u => u.name === 'HTNK'), undefined, { timeout: 120000 });
        await page.waitForTimeout(1500);
        report.vehicle = await page.evaluate(() => {
            const d = window.__ra2debug, u = d.localPlayer.getOwnedObjects().find(u => u.name === 'HTNK');
            window.__rhinoUnit=u; window.__rhinoRenderable=d.renderableManager.getRenderableByGameObject(u);
            const r=window.__rhinoRenderable;
            return {id:u.id, tile:[u.tile.rx,u.tile.ry], active:r.rhinoHd?.active, attempted:r.rhinoAttempted,
                art:{image:r.objectArt.imageName,turrets:r.objectRules.turretCount,voxel:r.objectArt.isVoxel},
                builders:r.vxlBuilders.length, owner:u.owner.color};
        });
        console.log('VEHICLE', JSON.stringify(report.vehicle));
        await page.screenshot({path:`${output}/factory.png`});
        assert.equal(report.vehicle.active,true);
        if (process.env.M13F_PLAY === '1') {
            console.log('Normal match ready; use Options > Rhino HD (local pack). Close browser to stop.');
            await new Promise(resolve => page.once('close', resolve));
        } else {
            const { checkRhinoGame } = await import('./check-rhino-game.mjs');
            report.checks = await checkRhinoGame(page,output);
        }
        assert.deepEqual(report.errors, []);
        report.status='PASS';
    }
} catch (e) { report.failure=e.stack; console.error(e); process.exitCode=1; }
finally { await fs.writeFile(`${output}/result.json`, JSON.stringify(report,null,2)+'\n'); console.log('OUTPUT',output); await browser.close(); }
