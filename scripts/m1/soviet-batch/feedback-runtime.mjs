import { _electron as electron } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const artifact = JSON.parse(await fs.readFile(process.argv[2], 'utf8'));
const output = path.resolve(process.env.M16B_OUTPUT ?? '.artifacts/m1-6b/feedback-r2/runtime-ui-v1');
await fs.mkdir(output, { recursive: false });
const profile = path.join(output, 'profile');
await fs.mkdir(profile);
await fs.writeFile(path.join(profile, 'resource-registration.json'), JSON.stringify({ schemaVersion: 1, directory: path.resolve('.local') }));
const report = { status: 'RUNNING', errors: [], cursor: [], placement: [] };
let app, page;
async function launch() {
    app = await electron.launch({ executablePath: artifact.executable, cwd: '/private/tmp',
        env: { ...process.env, RA2_DESKTOP_USER_DATA: profile }, timeout: 60000 });
    page = await app.firstWindow();
    page.on('pageerror', e => report.errors.push(e.stack));
    await page.getByText('Offline Skirmish', { exact: true }).waitFor({ timeout: 90000 });
    await app.evaluate(({ app, BrowserWindow }) => { app.focus({ steal: true }); const w = BrowserWindow.getAllWindows()[0]; w.show(); w.focus(); });
}
async function hd(value) {
    await page.getByText('Options', { exact: true }).click();
    await page.locator('[data-hd-family="all"]').waitFor();
    assert.equal(await page.locator('[data-hd-family]').count(), 1);
    const control = page.locator('[data-hd-family="all"]');
    await control.locator('.select-value').click();
    await control.getByText(value ? 'On' : 'Off', { exact: true }).click();
    await page.screenshot({ path: path.join(output, `hd-${value}.png`) });
    const back = await page.evaluate(() => window.__ra2debug.mainMenuController.getCurrentScreen().strings.get('GUI:Back'));
    await page.getByText(back, { exact: true }).click();
}
try {
    await launch();
    report.defaultEnabled = await page.evaluate(() => window.__ra2debug.generalOptions.graphics.hdEnabled.value);
    assert(report.defaultEnabled);
    await hd(false);
    await app.close();
    await launch();
    assert.equal(await page.evaluate(() => window.__ra2debug.generalOptions.graphics.hdEnabled.value), false);
    await hd(true);
    const closed = app.waitForEvent('close');
    await page.getByText('Exit Game', { exact: true }).click();
    await closed;
    report.quitButton = 'PASS_PROCESS_EXIT';
    await launch();
    assert.equal(await page.evaluate(() => window.__ra2debug.generalOptions.graphics.hdEnabled.value), true);
    await page.evaluate(() => Object.entries({ _r_lastMap:'MP01T4.map',_r_lastMode:'1',_r_lastCountry:'5',_r_lastColor:'1',
        _r_lastStartPos:'0',_r_lastTeam:'0',_r_hostOpts:'6;10000;0;1;1;0;1;0;;0;1;0;0',
        _r_lastBots:JSON.stringify([null,null,null,{d:4,c:5,co:2,s:3,t:1},null,null,null,null]) })
        .forEach(([k,v])=>localStorage.setItem(k,v)));
    await page.getByText('Offline Skirmish',{exact:true}).click();
    await page.waitForFunction(()=>window.__ra2debug?.skirmishLobby);
    await page.evaluate(()=>window.__ra2debug.skirmishLobby.startGame(1700000000000));
    await page.waitForFunction(()=>window.__ra2debug?.game?.status===1,undefined,{timeout:90000});
    await page.evaluate(()=>{const d=window.__ra2debug;d.actionsApi.orderUnits([d.localPlayer.getOwnedObjects().find(u=>u.name==='SMCV').id],10);});
    await page.waitForFunction(()=>window.__ra2debug.localPlayer.getOwnedObjects().some(u=>u.name==='NACNST'));
    await page.evaluate(()=>window.__ra2debug.actionsApi.queueForProduction(0,2,'NAPOWR',1));
    await page.waitForFunction(()=>window.__ra2debug.localPlayer.production.getQueue(0).status===3,undefined,{timeout:90000});
    const spots = await page.evaluate(()=>{
        const d=window.__ra2debug,y=d.localPlayer.getOwnedObjects().find(u=>u.name==='NACNST'),worker=d.game.getConstructionWorker(d.localPlayer);
        const candidates=[];
        for(let x=-8;x<=8;x++)for(let z=-8;z<=8;z++) {
            const t=d.game.map.tiles.getByMapCoords(y.tile.rx+x,y.tile.ry+z);
            if(t&&worker.canPlaceAt('NAPOWR',t))candidates.push({rx:t.rx,ry:t.ry});
        }
        const mode=d.gameScreen.playerUi.placementMode;
        mode.setBuilding(d.game.rules.getObject('NAPOWR',2));d.worldInteraction.setMode(mode);
        window.__feedbackPlacement=mode;
        return {valid:candidates.slice(0,2),invalid:{rx:y.tile.rx,ry:y.tile.ry}};
    });
    assert.equal(spots.valid.length,2);
    for(const [name,tile] of [['valid-a',spots.valid[0]],['valid-b',spots.valid[1]],['invalid',spots.invalid]]) {
        await page.evaluate(tile=>{
            const d=window.__ra2debug,t=d.game.map.tiles.getByMapCoords(tile.rx,tile.ry);
            d.worldInteraction.minimapHandler.panToTile(t);
            window.__feedbackPlacement.hover({tile:t},false);
        },tile);
        await page.waitForTimeout(200);
        report.placement.push(await page.evaluate(name=>({name,tiles:window.__feedbackPlacement.placementGridModel.tiles,
            meshes:window.__feedbackPlacement.placementGrid.tilesObject.children.map(m=>({color:m.material.color.getHex(),map:!!m.material.map,
                vertices:m.geometry.getAttribute('position').count,position:m.position.toArray()}))}),name));
        await page.screenshot({path:path.join(output,`placement-${name}.png`)});
    }
    assert(report.placement[0].meshes.every(m=>m.color===0x00ff00&&!m.map&&m.vertices===4));
    assert(report.placement[2].meshes.some(m=>m.color===0xff0000));
    await page.evaluate(()=>{const d=window.__ra2debug;d.worldInteraction.setMode(undefined);d.gameScreen.pointer.unlock();});
    report.nativeWindowFocused = await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isFocused());
    if (!report.nativeWindowFocused) report.pointerLockLimit = {
        status:'NOT_RUN_NATIVE_WINDOW_FOCUS_UNAVAILABLE',
        note:'macOS automation has no native focused game window despite DOM focus. Unit handoff and coordinate checks pass; hands-on confirmation remains required.'
    };
    for(const mode of (report.nativeWindowFocused ? ['window','fullscreen'] : [])) {
        if(mode==='fullscreen')await page.evaluate(()=>window.desktopDisplay.set('fullscreen'));
        await page.waitForTimeout(250);
        const viewport=await page.evaluate(()=>({width:innerWidth,height:innerHeight}));
        await page.mouse.move(viewport.width*.25,viewport.height*.65);
        await page.evaluate(()=>window.__ra2debug.gameScreen.pointer.lock());
        await page.mouse.click(viewport.width*.25,viewport.height*.65);
        report.inputSurface = await page.evaluate(() => {
            const p=window.__ra2debug.gameScreen.pointer,r=p.canvas.getBoundingClientRect();
            return {focus:document.hasFocus(),tag:p.canvas.tagName,rect:{x:r.x,y:r.y,width:r.width,height:r.height},
                permission:p.userPermissionGranted,locked:!!document.pointerLockElement};
        });
        if (!report.inputSurface.locked) {
            try {
                await page.evaluate(async()=>{
                    const p=window.__ra2debug.gameScreen.pointer;
                    await p.getPointerLock().request();p.userPermissionGranted=true;
                });
            } catch (error) {
                if (!String(error).includes('WrongDocumentError')) throw error;
                report.pointerLockLimit = { status: 'UNVERIFIED_AUTOMATION_ROOT_DOCUMENT', error: String(error),
                    note: 'Direct native cursor bridge is measured below; real lock/unlock still requires hands-on confirmation.' };
            }
        }
        await page.mouse.move(viewport.width*.4,viewport.height*.45);
        const before=await page.evaluate(()=>{
            const d=window.__ra2debug,p=d.gameScreen.pointer,pos={...p.getPosition()},rect=p.canvas.getBoundingClientRect();
            return {pos,normalized:{x:(rect.left+pos.x*rect.width/p.canvasMetrics.width)/innerWidth,
                y:(rect.top+pos.y*rect.height/p.canvasMetrics.height)/innerHeight}};
        });
        const bounds=await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].getContentBounds());
        await page.evaluate(()=>window.__ra2debug.gameScreen.menu.open());
        await page.waitForFunction(()=>!document.pointerLockElement&&!window.__ra2debug.gameScreen.pointer.restoringPosition);
        if (report.pointerLockLimit) {
            const bridge = await page.evaluate(position=>window.desktopApp.restorePointer(position),before.normalized);
            assert(bridge.restored, 'Native cursor bridge did not run in the focused window');
        }
        const cursor=await app.evaluate(({screen})=>screen.getCursorScreenPoint());
        const expected={x:bounds.x+Math.round(before.normalized.x*bounds.width),y:bounds.y+Math.round(before.normalized.y*bounds.height)};
        const row={mode,before,expected,actual:cursor,error:Math.hypot(cursor.x-expected.x,cursor.y-expected.y)};
        report.cursor.push(row);
        assert(row.error<=2,JSON.stringify(row));
        await page.screenshot({path:path.join(output,`paused-${mode}.png`)});
        await page.evaluate(()=>window.__ra2debug.gameScreen.menu.close());
    }
    assert.deepEqual(report.errors,[]);
    report.status=report.pointerLockLimit ? 'PASS_UI_PLACEMENT_CURSOR_HANDOFF_UNVERIFIED' : 'PASS_FEEDBACK_UI_POINTER_AND_PLACEMENT';
} catch(error) {
    report.status='FAIL';report.error=error.stack;process.exitCode=1;console.error(error);
    await page?.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});
} finally {
    await fs.writeFile(path.join(output,'result.json'),JSON.stringify(report,null,2)+'\n');
    await app?.close().catch(()=>{});
    console.log(report.status,output);
}
