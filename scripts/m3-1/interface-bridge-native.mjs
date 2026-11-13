import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { PNG } from 'pngjs';
import { _electron as electron } from '@playwright/test';

const root = path.resolve(import.meta.dirname, '../..'), out = path.resolve(process.argv[2]);
const read = async file => JSON.parse(await fs.readFile(path.join(root, file), 'utf8'));
const baseline = await read('.artifacts/m3-1/input-final/report.json');
const checkpoint = await read('scripts/m3-1/fixtures/mid-mission-checkpoint.json');
await fs.mkdir(out, { recursive: false });
const profile = path.join(out, 'profile'); await fs.mkdir(profile);
await fs.writeFile(path.join(profile, 'resource-registration.json'), JSON.stringify({ schemaVersion: 1, directory: path.resolve(root, '../ra2-hd/.local') }));
const report = { status: 'RUNNING', runtime: await read('.artifacts/m3-1/review-runtime/package.json'),
    harnessSha256: createHash('sha256').update(await fs.readFile(import.meta.filename)).digest('hex'),
    scope: 'Real native interface/animation capture, fresh opening bridge audit, and bounded ordinary-command replay from the proven checkpoint through actual engineer repair. No forced bridge mutation or source-map edit.',
    screenshots: [], menuFrames: [], bridgeCases: [], errors: [], consoleErrors: [], failedResources: [] };
let app, page, labels;
const save = () => fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
async function shot(name) { await page.screenshot({ path: path.join(out, name + '.png') }); report.screenshots.push(name + '.png'); await save(); }
async function ready() { await page.waitForSelector('[data-campaign-ready=true]'); }
async function pause() { await page.evaluate(() => { const d = window.__ra2debug; d.gameScreen.gameTurnMgr.setCampaignPaused(true); d.gameScreen.pointer.unlock(true); }); }
async function returnMenu() {
    await page.evaluate(() => window.__ra2debug.gameScreen.pointer.unlock(true));
    await page.keyboard.press('Escape'); await page.waitForFunction(() => window.__ra2debug.gameScreen.menu.getCurrentScreen());
    await page.getByRole('button', { name: labels['gui:abortmission'], exact: true }).click();
    await page.getByRole('button', { name: labels['gui:quit'], exact: true }).click(); await ready();
}
async function launch(saved, capture) {
    await page.evaluate(() => { window.__previousBridgeGame = window.__ra2debug.game; });
    const launching = page.evaluate(saved => window.__ra2debug.mainMenuController.screens.get(22).launchMission(saved), saved);
    if (capture) {
        await page.waitForFunction(() => document.querySelector('[data-campaign-loading] canvas[data-campaign-sprite="ls800s01.shp"]')?.dataset.frame === '0');
        report.loading = await page.evaluate(() => {
            const node = document.querySelector('[data-campaign-loading]'), canvas = node.querySelector('canvas[data-campaign-sprite="ls800s01.shp"]');
            return { density: node.dataset.campaignArtDensity, percent: Number(node.dataset.percent), size: [canvas.width, canvas.height],
                controls: [...node.querySelectorAll('svg[data-campaign-sprite]')].map(svg => svg.dataset.campaignSprite),
                ui: window.__ra2debug.uiArt.metrics() };
        });
        assert.equal(report.loading.density, '2'); assert.deepEqual(report.loading.size, [1600, 1040]);
        assert.equal(report.loading.controls.length, 3); assert(report.loading.ui.reservedBytes <= report.loading.ui.budget);
        await shot('03-hd-soviet01-loading');
    }
    await launching;
    await page.waitForFunction(() => { const d = window.__ra2debug;
        return d.game !== window.__previousBridgeGame && d.game?.campaign && d.game.status === 1;
    }, undefined, { timeout: 180000 });
    if (saved) await page.waitForFunction(tick => window.__ra2debug.game?.currentTick === tick
        && window.__ra2debug.gameScreen?.menu?.getCurrentScreen(), saved.tick, { timeout: 180000 });
    await pause();
    if (saved) {
        assert.equal(await page.evaluate(() => window.__ra2debug.game.getHash()), saved.expected.worldHash);
        await page.evaluate(() => window.__ra2debug.gameScreen.menu.close());
    }
}
async function bridges() {
    return page.evaluate(() => {
        const d = window.__ra2debug, g = d.game;
        const huts = g.world.getAllObjects().filter(o => o.cabHutTrait).map(hut => {
            const trait = hut.cabHutTrait, bounds = trait.findClosestBridgeBounds(), missing = trait.bridges.findDestroyedPieceTiles(bounds);
            return { id: hut.id, tile: [hut.tile.rx, hut.tile.ry], repairable: trait.canRepairBridge(),
                missing: missing.map(tile => [tile.rx, tile.ry]), pieces: trait.getBridgePieces().length,
                bounds: { start: [bounds.start.rx, bounds.start.ry], end: [bounds.end.rx, bounds.end.ry], high: bounds.isHigh } };
        });
        const center = g.map.getTileAtWaypoint(75), shroud = g.mapShroudTrait.getPlayerShroud(d.localPlayer);
        const engineer = g.world.getAllObjects().find(object => object.id === 1942);
        return { tick: g.currentTick, hash: g.getHash(), huts, journalCommands: g.campaign.journal.commands.length,
            engineer: { exists: !!engineer && !engineer.isDestroyed, spawned: engineer?.isSpawned },
            center: { tile: [center.rx, center.ry], visible: !shroud.isShrouded(center, 4),
                bridgeOverlay: !!g.map.tileOccupation.getBridgeOnTile(center) },
            repairEvents: window.__bridgeRepairEvents ?? [], ui: d.uiArt.metrics() };
    });
}
async function replayUntil(tick) {
    while (await page.evaluate(() => window.__ra2debug.game.currentTick) < tick) {
        await page.evaluate(target => {
            const d = window.__ra2debug, g = d.game, manager = d.gameScreen.gameTurnMgr;
            manager.setCampaignPaused(false);
            try {
                for(let i=0; i<180 && g.currentTick<target; i++) {
                    for(const command of window.__bridgeCommands.filter(command => command.tick===g.currentTick)) {
                        const action=d.actionFactory.create(command.type); action.unserialize(new Uint8Array(command.data));
                        action.player=g.getPlayer(command.player); g.campaign.journal.record(g,action.player,[action]); action.process();
                    }
                    manager.doGameTurn(performance.now());
                }
            } finally { manager.setCampaignPaused(true); }
        }, tick);
    }
}
async function bridgeCamera() {
    await page.evaluate(() => { const d=window.__ra2debug;d.worldInteraction.minimapHandler.panToTile(d.game.map.getTileAtWaypoint(75)); });
    await page.waitForTimeout(500);
}
try {
    app = await electron.launch({ executablePath: await fs.realpath(path.join(root, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron')),
        args: [path.join(root, '.artifacts/m3-1/review-runtime')], cwd: '/private/tmp', timeout: 60000,
        env: { ...process.env, RA2_DESKTOP_USER_DATA: profile, RA2_DESKTOP_NO_DISCOVERY: '1',
            RA2_CAMPAIGN_RESOURCE_ROOT: path.join(root, '.local/campaign'), RA2_CAMPAIGN_FROZEN_TERRAIN: '1' } });
    app.process().stdout?.on('data', bytes => { void fs.appendFile(path.join(out,'electron.log'),bytes); });
    app.process().stderr?.on('data', bytes => { void fs.appendFile(path.join(out,'electron.log'),bytes); });
    page = await app.firstWindow({ timeout: 30000 });
    page.on('pageerror', error => report.errors.push(error.stack));
    page.on('console', message => { if(message.type()==='error')report.consoleErrors.push(message.text()); });
    page.on('response', response => { if(response.status()>=400)report.failedResources.push({url:response.url(),status:response.status()}); });
    await page.locator('[data-edition=ra2]').click({ timeout: 60000 });
    await page.waitForFunction(() => window.__ra2debug?.mainMenuController && document.querySelector('.hd-menu-scene'), undefined, { timeout: 90000 });
    const window = await app.browserWindow(page);
    await window.evaluate(window => { window.setFullScreen(false);window.unmaximize();window.setContentSize(1280,960); });
    const language=await page.evaluate(()=>document.documentElement.lang);
    labels={...(await read(`public/res/locale/retail-ra2-${language}.json`)).labels,...await read(`public/res/locale/${language}.json`)};
    await page.evaluate(()=>window.__ra2debug.generalOptions.graphics.hdEnabled.value=false);
    await page.getByRole('button',{name:labels['hd:menucampaign'],exact:true}).click();await ready();
    await page.waitForFunction(()=>document.querySelector('[data-campaign-selection] canvas')?.dataset.frame==='0');
    report.originalMenu=await page.evaluate(()=>({density:document.querySelector('[data-campaign-selection]').dataset.campaignArtDensity,
        canvases:document.querySelectorAll('[data-campaign-selection] canvas').length,ui:window.__ra2debug.uiArt.metrics()}));
    assert.equal(report.originalMenu.density,'1');assert.equal(report.originalMenu.canvases,4);
    await shot('01-original-faction-menu');
    await page.getByRole('button',{name:labels['gui:back'],exact:true}).click();
    await page.evaluate(()=>window.__ra2debug.generalOptions.graphics.hdEnabled.value=true);
    await page.getByRole('button',{name:labels['hd:menucampaign'],exact:true}).click();await ready();
    await page.waitForFunction(()=>document.querySelector('[data-campaign-selection] canvas')?.dataset.frame==='0');
    report.hdMenu=await page.evaluate(async()=>{
        const node=document.querySelector('[data-campaign-selection]'),canvas=node.querySelector('canvas'),pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
        return {density:node.dataset.campaignArtDensity,size:[canvas.width,canvas.height],ui:window.__ra2debug.uiArt.metrics(),
            sha256:[...new Uint8Array(await crypto.subtle.digest('SHA-256',pixels))].map(v=>v.toString(16).padStart(2,'0')).join('')};
    });
    assert.equal(report.hdMenu.density,'2');assert.deepEqual(report.hdMenu.size,[1264,1136]);
    const menu=PNG.sync.read(await fs.readFile(path.join(root,'.local/campaign/ra2/sov01t/interface-selection-2x.png')));
    assert.equal(report.hdMenu.sha256,createHash('sha256').update(menu.data).digest('hex'));
    assert(report.hdMenu.ui.reservedBytes<=report.hdMenu.ui.budget);
    await page.waitForTimeout(500);await shot('02-hd-faction-menu');
    await page.locator('[data-campaign-faction=soviet]').hover();
    await page.waitForFunction(()=>Number(document.querySelector('[data-campaign-faction=soviet] svg').dataset.frame)>0);
    const first=await page.locator('[data-campaign-faction=soviet] svg').getAttribute('data-frame');
    await page.waitForFunction(frame=>document.querySelector('[data-campaign-faction=soviet] svg').dataset.frame!==frame,first);
    report.arrowAnimation={first,second:await page.locator('[data-campaign-faction=soviet] svg').getAttribute('data-frame')};
    await shot('02b-hd-source-arrow-animation');
    await fs.mkdir(path.join(out,'frames'));
    const started=performance.now();
    while(performance.now()-started<3000){
        const filename=`frame-${String(report.menuFrames.length).padStart(3,'0')}.png`,timestamp=performance.now()-started;
        await page.screenshot({path:path.join(out,'frames',filename)});
        report.menuFrames.push({filename,timestamp,frame:await page.locator('[data-campaign-faction=soviet] svg').getAttribute('data-frame')});
        await page.waitForTimeout(80);
    }
    assert(new Set(report.menuFrames.map(frame=>frame.frame)).size>=3);
    await launch(undefined,true);
    await page.evaluate(()=>{const d=window.__ra2debug;if(d.game.currentTick===0){d.gameScreen.gameTurnMgr.setCampaignPaused(false);d.gameScreen.gameTurnMgr.doGameTurn(performance.now());d.gameScreen.gameTurnMgr.setCampaignPaused(true);}});
    report.freshOpening=await bridges();
    report.breakTrigger=await page.evaluate(()=>window.__ra2debug.game.campaign.trace.filter(action=>action.key==='0823BDEC'));
    assert.equal(report.breakTrigger.length,8);assert(report.breakTrigger.every(action=>action.tick===0&&action.opcode===63));
    assert.equal(report.freshOpening.huts.filter(hut=>hut.repairable).length,2);
    assert.equal(report.freshOpening.journalCommands,0);
    report.openingUnlock=await page.evaluate(()=>{
        const d=window.__ra2debug,g=d.game,m=d.gameScreen.gameTurnMgr;
        m.setCampaignPaused(false);
        try { for(let i=0;i<3000&&g.campaign.inputLocked;i++)m.doGameTurn(performance.now()); }
        finally { m.setCampaignPaused(true); }
        return {tick:g.currentTick,inputLocked:g.campaign.inputLocked};
    });
    assert(!report.openingUnlock.inputLocked);await returnMenu();
    for(const density of [4,1]) {
        await page.evaluate(density=>{const o=window.__ra2debug.generalOptions.graphics;o.hdEnabled.value=density!==1;o.hdDensity.value=4;},density);
        await launch(checkpoint,false);
        await page.evaluate(commands=>{const g=window.__ra2debug.game;window.__bridgeCommands=commands;window.__bridgeRepairEvents=[];
            g.events.subscribe(event=>{if(event.type===14)window.__bridgeRepairEvents.push({tick:g.currentTick,type:event.type,target:event.target?.id,name:event.target?.name});});
        },baseline.final.commands.filter(command=>command.tick>=checkpoint.tick));
        await replayUntil(9440);await bridgeCamera();
        const before=await bridges();report.activeBridge={density,before};await save();
        assert.equal(before.hash,baseline.stages.find(stage=>stage.name==='first-base').hash);
        assert(before.huts.find(hut=>hut.id===1607).repairable);assert(before.huts.find(hut=>hut.id===1607).missing.length>0);
        assert(before.center.visible);await shot(`bridge-${density}x-before-engineer`);
        await replayUntil(10548);await bridgeCamera();const after=await bridges();
        report.activeBridge.after=after;await save();
        assert(!after.huts.find(hut=>hut.id===1607).repairable);assert.equal(after.huts.find(hut=>hut.id===1607).missing.length,0);
        assert(after.huts.find(hut=>hut.id===1724).repairable);assert(after.repairEvents.some(event=>event.type===14));
        assert(after.center.bridgeOverlay);await shot(`bridge-${density}x-after-engineer`);
        report.bridgeCases.push({density,before,after});delete report.activeBridge;await returnMenu();
    }
    assert.deepEqual(report.errors,[]);assert.deepEqual(report.consoleErrors,[]);assert.deepEqual(report.failedResources,[]);
    report.status='PASS_HD_INTERFACE_AND_ORIGINAL_BRIDGE_INITIALIZATION_REPAIR';
} catch(error) { report.status='FAIL';report.failure=error.stack;await shot('failure').catch(()=>{});throw error; }
finally { await save();await app?.close(); }
