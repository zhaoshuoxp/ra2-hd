import { chromium } from '@playwright/test';
import fs from 'node:fs';
import { issueDefenseSequence } from './defense-sequence.mjs';
const output = process.env.M01_OUTPUT ?? '.artifacts/compat';
fs.mkdirSync(output, { recursive: true });
const browser = await chromium.launch({
    executablePath: process.env.M01_BROWSER_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true, args: ['--disable-background-networking', '--disable-component-update', '--no-first-run'],
});
const context = await browser.newContext({
    viewport: { width: 1280, height: 960 }, deviceScaleFactor: 1, serviceWorkers: 'block',
});
const result = {
    requests: [], externalAttempts: [], errors: [], console: [], snapshots: [], samples: [],
    websocketAttempts: [], workers: [],
};
const duration = Number(process.env.M01_DURATION_MS ?? 0);
const events = fs.createWriteStream(`${output}/console.jsonl`);
await context.route('**/*',route=>{
    const url=route.request().url(); result.requests.push(url);
    if (!url.startsWith('http://127.0.0.1:4000/') && !/^(blob|data):/.test(url)) {
        result.externalAttempts.push(url); return route.abort();
    }
    return route.continue();
});
const page=await context.newPage();
page.on('worker', worker => result.workers.push(worker.url()));
const cdp = await context.newCDPSession(page);
await cdp.send('Network.enable');
cdp.on('Network.webSocketCreated', info => result.websocketAttempts.push(info.url));
page.on('console', message => {
    const entry = { type: message.type(), text: message.text() };
    result.console.push(entry);
    events.write(JSON.stringify(entry) + '\n');
});
page.on('pageerror',error=>result.errors.push(error.message));
async function snapshot(name) {
    const state = await page.evaluate(() => ({
        body: document.body.innerText, m01: window.__m01, failure: window.__m01Failure,
        attempts: window.__offlineAttempts, debugKeys: Object.keys(window.__ra2debug ?? {}),
    }));
    result.snapshots.push({name,...state});
    await page.screenshot({path:`${output}/${name}.png`});
}
try {
    await context.addInitScript(({speed,units}) => {
        const prefs = {
            _r_lastMap:'MP01T4.map', _r_lastMode:'1', _r_lastCountry:'0', _r_lastColor:'0', _r_lastStartPos:'0', _r_lastTeam:'0',
            _r_hostOpts:`${speed};10000;${units};1;1;0;1;0;;0;1;0;0`,
            _r_lastBots:JSON.stringify([null,...[1,2,3].map(i=>({d:4,c:5,co:i,s:i,t:1})),null,null,null,null]),
        };
        for (const [key,value] of Object.entries(prefs)) localStorage.setItem(key,value);
    }, {speed:Number(process.env.M01_SPEED ?? 3),units:Number(process.env.M01_UNITS ?? 10)});
    await page.goto('http://127.0.0.1:4000/');
    await page.getByText('Offline Skirmish', { exact: true }).waitFor({ state: 'visible', timeout: 45000 });
    await snapshot('startup');
    if (await page.getByText('Offline Skirmish',{exact:true}).count()) {
        await page.getByText('Offline Skirmish',{exact:true}).click();
        await page.waitForTimeout(6000);
        await snapshot('skirmish');
        result.scenario = await page.evaluate(() => window.__ra2debug.skirmishLobby);
        await page.evaluate(() => window.__ra2debug.skirmishLobby.startGame(1700000000000));
        await page.waitForTimeout(15000);
        await snapshot('game-attempt');
        if (duration) {
            await page.waitForFunction(() => window.__ra2debug?.game?.status === 1, undefined, {timeout:45000});
            result.deployment = await page.evaluate(() => {
                const debug = window.__ra2debug;
                window.__m01RunGame = debug.game;
                window.__m01End = null;
                debug.game.onEnd.subscribe(() => { window.__m01End = { tick:debug.game.currentTick, time:debug.game.currentTime }; });
                const mcv = debug.localPlayer.getOwnedObjects().find(o => debug.game.rules.general.baseUnit.includes(o.name) && o.isSpawned);
                if (!mcv) throw new Error('No owned base unit available for the deployment scenario');
                debug.helpers.selectOwnedUnitByName(mcv.name);
                debug.helpers.deploySelectedUnits();
                return {issuedAtTick:debug.game.currentTick,unitId:mcv.id,unitName:mcv.name,order:'DeploySelected'};
            });
            await page.waitForTimeout(5000);
            result.geometry = await page.evaluate(() => {
                const d=window.__ra2debug;
                const building=d.localPlayer.getOwnedObjects().find(o=>o.isBuilding());
                if (!building) throw new Error('Deployment did not create a building');
                d.unitSelection.deselectAll();
                d.unitSelection.addToSelection(building);
                return {name:building.name,id:building.id,foundation:building.getFoundation(),
                    viewport:d.worldScene.viewport,clickTargets:d.helpers.getOwnedBuildingClickTargetsById(building.id)};
            });
            await page.waitForTimeout(1000);
            result.geometry.selection = await page.evaluate(() => {
                const d=window.__ra2debug, object=d.unitSelection.getSelectedUnits()[0];
                const mesh=d.renderableManager.getRenderableByGameObject(object).pipOverlay.selectionBox;
                const parts=[];
                mesh.traverse(part => {
                    if (!part.geometry) return;
                    part.geometry.computeBoundingBox();
                    parts.push({type:part.type,scale:part.scale.toArray(),position:part.position.toArray(),
                        vertices:Array.from(part.geometry.attributes.position.array),bounds:part.geometry.boundingBox});
                });
                return {type:mesh.type,visible:mesh.visible,scale:mesh.scale.toArray(),position:mesh.position.toArray(),parts};
            });
            await snapshot('selected-building');
            const started = Date.now();
            while (true) {
                if (process.env.M01_DEFENSE === '1') await page.evaluate(issueDefenseSequence);
                const sample = await page.evaluate(() => {
                    const game = window.__m01RunGame;
                    const debug = window.__ra2debug;
                    const camera = debug.worldScene?.camera;
                    return { tick: game.currentTick, gameTime: game.currentTime, status: game.status,
                        end: window.__m01End, humanSequence: window.__m01HumanSequence,
                        attempts:window.__offlineAttempts, failure:window.__m01Failure,
                        seed:[game.id,game.startTimestamp],speed:game.speed.value,
                        camera: camera ? { type: camera.type, rotation: camera.rotation.toArray(), zoom: camera.zoom,
                            left: camera.left, right: camera.right, top: camera.top, bottom: camera.bottom } : undefined,
                        players:game.getNonNeutralPlayers().map(p=>({name:p.name,country:p.country?.name,isAi:p.isAi,defeated:p.defeated,
                            credits:p.credits,built:p.getUnitsBuilt(),kills:p.getUnitsKilled(),lost:p.getUnitsLost(),
                            objects:p.getOwnedObjects().map(o=>({name:o.name,id:o.id,health:o.healthTrait?.health,
                                foundation:o.art?.foundation,selection:o.art?.selectionBrackets,tile:{rx:o.tile?.rx,ry:o.tile?.ry}}))})) };
                });
                sample.elapsedMs = Date.now() - started;
                result.samples.push(sample);
                fs.writeFileSync(`${output}/samples.json`,JSON.stringify(result.samples,null,2));
                console.log(JSON.stringify({
                    elapsedMs: sample.elapsedMs, tick: sample.tick, status: sample.status,
                    players: sample.players.map(p => ({ ...p, objects: p.objects.length })),
                }));
                if (sample.elapsedMs >= duration || sample.end || sample.failure || result.errors.length) break;
                if (result.samples.length > 2 && sample.tick === result.samples.at(-3).tick) { result.stall = true; break; }
                const interval = process.env.M01_DEFENSE === '1' ? 5000 : 15000;
                await page.waitForTimeout(Math.min(interval, Math.max(0, duration - (Date.now() - started))));
            }
            await snapshot('run-final');
            if (result.samples.at(-1)?.end) {
                await page.waitForTimeout(7000);
                await snapshot('natural-result');
            }
            result.acceptance = {
                stableRequestedDuration:result.samples.at(-1)?.elapsedMs >= duration && !result.stall && !result.errors.length,
                naturalEnd:!!result.samples.at(-1)?.end,
                externalAttempts:result.externalAttempts.length, websocketAttempts:result.websocketAttempts.length,
                errors:result.errors.length, workers:result.workers.length,
            };
        }
    }
    console.log(JSON.stringify({
        errors: result.errors, externalAttempts: result.externalAttempts,
        snapshots: result.snapshots.map(s => ({ ...s, m01: undefined })),
        lastErrors: result.console.filter(x => x.type === 'error').slice(-8),
    }, null, 2));
} catch (error) {
    result.harnessError = error.stack;
    throw error;
} finally {
    fs.writeFileSync(`${output}/browser.json`,JSON.stringify(result,null,2));
    events.end();
    await browser.close();
}
