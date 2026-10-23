import { _electron as electron } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const output = path.resolve('.artifacts/soviet-remaining', process.env.SOVIET_RUN ?? `garrison-${Date.now()}`);
await fs.mkdir(output, { recursive: false });
const profile = path.join(output, 'profile');
await fs.mkdir(profile);
await fs.writeFile(path.join(profile, 'resource-registration.json'), JSON.stringify({ schemaVersion: 1, directory: path.resolve('.local') }));
const artifact = JSON.parse(await fs.readFile(process.argv[2], 'utf8'));
const report = { status: 'RUNNING', app: artifact.artifact, errors: [], consoleErrors: [], cycles: [] };
const app = await electron.launch({ executablePath: artifact.executable, cwd: '/private/tmp', env: { ...process.env, RA2_DESKTOP_USER_DATA: profile }, timeout: 60000 });
let page;
try {
    page = await app.firstWindow();
    page.on('pageerror', e => report.errors.push(e.stack));
    page.on('console', m => { if (m.type() === 'error') report.consoleErrors.push(m.text()); });
    await page.getByText('Offline Skirmish', { exact: true }).waitFor({ timeout: 90000 });
    await page.evaluate(() => {
        localStorage.setItem('_r_lastCountry', '5');
        localStorage.setItem('_r_lastStartPos', '0');
        localStorage.setItem('_r_lastBots', JSON.stringify([null,{d:4,c:5,co:2,s:1,t:1},null,null,null,null,null,null]));
        localStorage.setItem('_r_hostOpts', '6;10000;0;1;1;0;1;0;;0;1;0;0');
    });
    await page.getByText('Offline Skirmish', { exact: true }).click();
    await page.waitForFunction(() => window.__ra2debug?.skirmishLobby);
    report.lobby = await page.evaluate(() => window.__ra2debug.skirmishLobby.gameOpts);
    console.log('Default map', report.lobby.mapName, report.lobby.mapTitle);
    const started = Date.now();
    await page.evaluate(() => window.__ra2debug.skirmishLobby.startGame(1700000000000));
    await page.waitForFunction(() => window.__ra2debug?.game?.status === 1, undefined, { timeout: 180000 });
    report.loadMs = Date.now() - started;
    report.activation = await page.evaluate(() => {
        const d = window.__ra2debug;
        return { families:d.sovietBuildingsHd, conscript:d.conscriptHd, napowr:d.napowrHd,
            buffer:[d.renderer.renderer.domElement.width,d.renderer.renderer.domElement.height] };
    });
    assert.equal(Object.keys(report.activation.families).length,17);
    assert(Object.values(report.activation.families).every(f=>f.density===2));
    report.fixture = await page.evaluate(() => {
        const d = window.__ra2debug;
        window.__garrisonErrors = [];
        const original = d.gameScreen.handleError;
        d.gameScreen.handleError = function(error, ...args) {
            window.__garrisonErrors.push(error?.stack ?? String(error));
            return original.call(this, error, ...args);
        };
        const houses = [...d.game.world.getAllObjects()].filter(u => u.garrisonTrait?.canBeOccupied());
        const home = d.localPlayer.getOwnedObjects()[0].tile;
        houses.sort((a, b) => Math.hypot(a.tile.rx-home.rx, a.tile.ry-home.ry)-Math.hypot(b.tile.rx-home.rx,b.tile.ry-home.ry));
        const house = houses[0];
        if (!house) throw Error('No occupiable civilian building on default map');
        const units = [];
        const offsets = [];
        for (let x=-5;x<=5;x++) for(let y=-5;y<=5;y++) offsets.push([x,y]);
        offsets.sort((a,b)=>Math.hypot(...a)-Math.hypot(...b));
        for (const [x,y] of offsets) {
            if (units.length===3) break;
            const tile = d.game.map.tiles.getByMapCoords(house.tile.rx+x,house.tile.ry+y);
            if (!tile) continue;
            const u = d.game.createObject(3, 'E2');
            d.game.changeObjectOwner(u,d.localPlayer);
            if (d.game.map.terrain.getPassableSpeed(tile,u.rules.speedType,true,false) <= 0 || d.game.map.terrain.findObstacles({ tile,onBridge:undefined },u).length) continue;
            d.game.spawnObject(u,tile); units.push(u);
        }
        window.__garrisonFixture = { house, units };
        return { description: 'Three spawned Conscripts near an existing map house; unchanged native occupy and evacuate orders', house: { id:house.id,name:house.name,tile:[house.tile.rx,house.tile.ry] }, units:units.map(u=>u.id) };
    });
    await page.waitForTimeout(1500);
    for (let cycle = 0; cycle < 5; cycle++) {
        await page.evaluate(() => { const q=window.__garrisonFixture; window.__ra2debug.actionsApi.orderUnits(q.units.map(u=>u.id),8,q.house.id); });
        await page.waitForFunction(() => window.__garrisonFixture.house.garrisonTrait.units.length===3 || window.__garrisonErrors.length, undefined, {timeout:45000});
        await page.evaluate(() => window.__ra2debug.actionsApi.orderUnits([window.__garrisonFixture.house.id],10));
        await page.waitForTimeout(1500);
        const row = await page.evaluate(() => { const d=window.__ra2debug,q=window.__garrisonFixture; return { tick:d.game.currentTick, occupants:q.house.garrisonTrait.units.length, civilianOwner:q.house.owner===d.game.getCivilianPlayer(), errors:window.__garrisonErrors, units:q.units.map(u=>({id:u.id,limbo:!!u.limboData,renderable:!!d.renderableManager.getRenderableByGameObject(u)})) }; });
        report.cycles.push(row);
        assert.deepEqual(row.errors, []);
        assert.equal(row.occupants,0);
        assert.equal(row.civilianOwner,true);
        assert(row.units.every(u=>!u.limbo && u.renderable));
    }
    assert.deepEqual(report.errors, []);
    report.status = 'PASS_NATIVE_GARRISON_EVACUATION_FIVE_CYCLES';
} catch (error) {
    report.status='FAIL'; report.failure=error.stack; process.exitCode=1;
    report.state = await page?.evaluate(() => {
        const d=window.__ra2debug,q=window.__garrisonFixture;
        return { errors:window.__garrisonErrors, tick:d?.game?.currentTick, house:q?.house.debugGetState(), units:q?.units.map(u=>u.debugGetState()) };
    }).catch(e=>({error:String(e)}));
}
finally { await fs.writeFile(path.join(output,'result.json'),JSON.stringify(report,null,2)); await app.close(); }
console.log(output,report.status);
