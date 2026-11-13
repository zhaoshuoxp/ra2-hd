import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { _electron as electron } from '@playwright/test';

const root = path.resolve(import.meta.dirname, '../..'), out = path.resolve(process.argv[2] ?? '.artifacts/m3-2/native-opening');
const density = Number(process.argv.find(value => value.startsWith('--density='))?.split('=')[1] ?? 0);
const inspectMovies = process.argv.includes('--inspect-original-movies');
assert([0, 2, 4].includes(density));
await fs.mkdir(out, { recursive: true });
const profile = path.join(out, 'profile'); await fs.mkdir(profile, { recursive: true });
await fs.writeFile(path.join(profile, 'resource-registration.json'), JSON.stringify({ schemaVersion: 1, directory: path.join(root, '.local') }));
const report = { status: 'RUNNING', scope: 'Original Soviet 02 fresh source-state launch through the shared launcher. Assisted ordinary production, placement, engineer capture, crate collection and combat commands include automated base defense and immediate submarine movement. Native simulation is accelerated; source map, rules, triggers and objectives are intact. Pre-mission playback is covered separately.', errors: [], resources: [], samples: [], commands: [] };
let app, page;
try {
    app = await electron.launch({ executablePath: await fs.realpath(path.join(root, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron')),
        args: [path.join(root, 'desktop/main.mjs')], cwd: '/private/tmp',
        env: { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('RA2_'))),
            RA2_DESKTOP_USER_DATA: profile, RA2_DESKTOP_NO_DISCOVERY: '1' } });
    app.process().stderr.on('data', bytes => { void fs.appendFile(path.join(out, 'electron.log'), bytes); });
    page = await app.firstWindow(); page.on('pageerror', error => report.errors.push(error.stack));
    page.on('console', message => { if (message.type() === 'error') (report.consoleErrors ??= []).push(message.text()); });
    page.on('response', response => { if (response.status() >= 400) report.resources.push([response.url(), response.status()]); });
    await page.locator('[data-edition=ra2]').click({ timeout: 90000 });
    await page.waitForFunction(() => window.__ra2debug?.mainMenuController, undefined, { timeout: 90000 });
    const language = await page.evaluate(() => document.documentElement.lang);
    const labels = { ...JSON.parse(await fs.readFile(path.join(root, `public/res/locale/retail-ra2-${language}.json`))).labels,
        ...JSON.parse(await fs.readFile(path.join(root, 'public/res/locale', language + '.json'))) };
    await page.getByRole('button', { name: labels['hd:menucampaign'], exact: true }).click();
    await page.waitForSelector('[data-campaign-ready=true]', { timeout: 90000 });
    await page.screenshot({ path: path.join(out, 'selection.png') });
    await page.evaluate(async density => {
        const d = window.__ra2debug;
        d.generalOptions.graphics.hdEnabled.value = density > 0;
        if (density) d.generalOptions.graphics.hdDensity.value = density;
        await d.mainMenuController.screens.get(22).launchPrepared('sov02t.map');
    }, density);
    await page.waitForFunction(() => window.__ra2debug.game?.campaign?.launch.mission === 'sov02t.map'
        && window.__ra2debug.gameScreen?.playerUi || document.body.innerText.includes('Error:'), undefined, { timeout: 90000 });
    assert(await page.evaluate(() => !!window.__ra2debug.gameScreen?.playerUi), await page.locator('body').innerText());
    await page.evaluate(() => { const d = window.__ra2debug; d.gameScreen.gameTurnMgr.setCampaignPaused(true); d.gameScreen.pointer.unlock(true); });
    report.identity = await page.evaluate(() => { const g = window.__ra2debug.game;
        return { gameId: g.id, timestamp: g.startTimestamp, launch: g.campaign.launch, options: g.gameOpts }; });
    report.density = density; report.originalMovies = [];
    const observedMovies = new Set();
    const step = async ticks => {
        for (let done = 0; done < ticks; done += 100) {
            await page.evaluate(() => {
                const d=window.__ra2debug,g=d.game,c=g.campaign;
                if(c.inputLocked||c.result) return;
                const directed=window.__missionDirectedSubs??=new Set();
                const fresh=g.localPlayer.getOwnedObjects().filter(o=>o.name==='SUB'&&o.isSpawned&&!directed.has(o.id));
                if(fresh.length){d.actionsApi.orderUnits(fresh.map(o=>o.id),1,90,51);for(const o of fresh)directed.add(o.id);}
                if(window.__missionAssault) return;
                const bases=[...g.localPlayer.buildings].filter(o=>o.rules.constructionYard||o.rules.refinery);
                const threat=g.world.getAllObjects().filter(o=>o.isUnit()&&o.isSpawned&&!o.isDestroyed&&['E1','MTNK','ENGINEER'].includes(o.name)
                    &&o.owner!==g.localPlayer&&!g.alliances.areAllied(g.localPlayer,o.owner)
                    &&bases.some(b=>Math.hypot(b.tile.rx-o.tile.rx,b.tile.ry-o.tile.ry)<9)
                    &&!g.mapShroudTrait.getPlayerShroud(g.localPlayer).isShrouded(o.tile,o.tileElevation)).sort((a,b)=>a.id-b.id)[0];
                if(threat){const ids=g.localPlayer.getOwnedObjects().filter(o=>o.isSpawned&&['HTNK','E2'].includes(o.name)).map(o=>o.id);
                    if(ids.length)d.actionsApi.orderUnits(ids,2,threat.id);}
            });
            const result = await page.evaluate(count => {
                const d = window.__ra2debug, g = d.game, mgr = d.gameScreen.gameTurnMgr;
                mgr.setCampaignPaused(false);
                try { for (let i = 0; i < count && !g.campaign.failure && !g.campaign.result; i++) mgr.doGameTurn(performance.now()); }
                finally { mgr.setCampaignPaused(true); }
                return { failure: g.campaign.failure, result: g.campaign.result };
            }, Math.min(ticks - done, 100));
            assert(!result.failure, result.failure); if (result.result) break;
            if (inspectMovies) {
                const pending = await page.evaluate(() => window.__ra2debug.gameScreen.campaignMediaPlayer.pending);
                for (const id of pending) if (!observedMovies.has(id)) {
                    observedMovies.add(id);
                    await page.waitForFunction(id => { const v = document.querySelector(`[data-campaign-media="${id}"] video`);
                        return v?.currentTime > .25 && v?.videoWidth > 0; }, id, { timeout: 30000 });
                    const proof = await page.evaluate(id => { const d = window.__ra2debug, v = document.querySelector(`[data-campaign-media="${id}"] video`);
                        return { id, tick: d.game.currentTick, size: [v.videoWidth, v.videoHeight], time: v.currentTime, duration: v.duration,
                            audioBytes: v.webkitAudioDecodedByteCount, placement: v.closest('[data-sidebar-radar]') ? 'radar' : 'fullscreen',
                            sourceActions: d.game.campaign.trace.filter(action => action.opcode === 100) }; }, id);
                    assert(proof.audioBytes > 0 && proof.placement === 'radar'); report.originalMovies.push(proof);
                    await page.screenshot({ path: path.join(out, id + '-original-trigger.png') });
                    await page.waitForSelector(`[data-campaign-media="${id}"]`, { state: 'detached', timeout: 20000 });
                }
            }
        }
    };
    const inspect = async label => {
        const state = await page.evaluate(label => {
            const d = window.__ra2debug, g = d.game, c = g.campaign;
            const brief = o => ({ id: o.id, name: o.name, owner: o.owner?.name, tile: o.tile && [o.tile.rx, o.tile.ry], health: o.healthTrait?.health, spawned: o.isSpawned });
            return { tick: g.currentTick, hash: g.getHash(), ...(label === 'final' ? { rng: g.prng.snapshot() } : {}), failure: c.failure, result: c.result, locked: c.inputLocked,
                variables: [...c.machine.variables], teams: c.teams.snapshot(), trace: c.trace, credits: g.localPlayer.credits,
                player: g.localPlayer.getOwnedObjects(true).map(brief),
                enemies: [...c.houses].filter(([n]) => ['Americans','Germans'].includes(n)).flatMap(([,p]) => p.getOwnedObjects(true)).map(brief),
                queues: g.localPlayer.production.getAllQueues().map(q => ({ type: q.type, status: q.status,
                    items: q.getAll().map(i => ({ name: i.rules.name, progress: i.progress, quantity: i.quantity })) })) };
        }, label);
        report.samples.push({label,...state}); await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));
        console.log(JSON.stringify({label,tick:state.tick,player:state.player.length,enemies:state.enemies.length,credits:state.credits,result:state.result}));
        return state;
    };
    const order = async (names, type, target, position) => {
        const issued = await page.evaluate(({names,type,target,position}) => {
            const d=window.__ra2debug,g=d.game;
            const ids=g.localPlayer.getOwnedObjects().filter(o=>o.isSpawned && (names.includes(o.name)||names.includes(o.id))).map(o=>o.id);
            if (!ids.length) return;
            let actualType=type, actualPosition=position;
            if (target !== undefined) {
                const object=g.getObjectById(target);
                if (type===2&&g.mapShroudTrait.getPlayerShroud(g.localPlayer).isShrouded(object.tile,object.tileElevation)) {
                    actualType=4;actualPosition=[object.tile.rx,object.tile.ry];
                    d.actionsApi.orderUnits(ids,actualType,...actualPosition);
                } else d.actionsApi.orderUnits(ids,type,target);
            }
            else if (position) d.actionsApi.orderUnits(ids,type,...position);
            else d.actionsApi.orderUnits(ids,type,ids[0]);
            return {tick:g.currentTick,ids,type:actualType,target,position:actualPosition};
        },{names,type,target,position});
        if (issued) report.commands.push(issued);
    };
    const build = async name => {
        await page.evaluate(name=>{const d=window.__ra2debug,g=d.game,r=g.rules.getBuilding(name),q=g.localPlayer.production.getQueueForObject(r);
            if (!g.localPlayer.production.isAvailableForProduction(r)) throw new Error('Building is not available: '+name);
            d.actionsApi.queueForProduction(q.type,r.type,name,1);},name);
        report.commands.push({action:'queue-building',name});
        for(let i=0;i<160;i++) {
            await step(60);
            if (i % 30 === 0) await inspect('building-' + name + '-' + i);
            const placed=await page.evaluate(name=>{
                const d=window.__ra2debug,g=d.game,p=g.localPlayer,r=g.rules.getBuilding(name),q=p.production.getQueueForObject(r);
                if(q.status!==3) return;
                const base=[...p.buildings].find(b=>b.rules.constructionYard),c=base.tile,w=g.getConstructionWorker(p);
                if(name==='NAREFN') {
                    const candidates=[];
                    for(let y=c.ry-12;y<=c.ry+12;y++)for(let x=c.rx-12;x<=c.rx+12;x++) {
                        const t=g.map.tiles.getByMapCoords(x,y);
                        if(t&&w.canPlaceAt(name,t,{normalizedTile:true})) candidates.push([x,y]);
                    }
                    candidates.sort((a,b)=>Math.hypot(a[0]-67,a[1]-65)-Math.hypot(b[0]-67,b[1]-65));
                    if(candidates[0]){d.actionsApi.placeBuilding(name,...candidates[0]);return candidates[0];}
                }
                for(let radius=2;radius<28;radius++)for(let y=c.ry-radius;y<=c.ry+radius;y++)for(let x=c.rx-radius;x<=c.rx+radius;x++) {
                    const t=g.map.tiles.getByMapCoords(x,y);
                    if(t&&w.canPlaceAt(name,t,{normalizedTile:true})) {d.actionsApi.placeBuilding(name,x,y);return [x,y];}
                }
                throw new Error('No valid placement: '+name);
            },name);
            if(placed) {report.commands.push({action:'place-building',name,placed});await step(90);return;}
        }
        throw new Error('Production did not finish: '+name);
    };
    for (let i=0;i<40;i++) {
        await step(150);
        const state=await inspect('landing-'+i);
        if(state.player.some(o=>o.name==='SMCV'&&o.spawned)) break;
        if(!state.locked) {
            const target=state.enemies.filter(o=>o.name==='GAPILL'&&o.tile[0]<90&&o.tile[1]<75).sort((a,b)=>a.id-b.id)[0];
            if(target) await order(['HTNK','E2'],2,target.id);
        }
    }
    assert((await inspect('mcv-arrived')).player.some(o=>o.name==='SMCV'&&o.spawned));
    for (let i=0;i<80;i++) {
        const state=await inspect('beach-economy-clear-'+i);
        const target=state.enemies.filter(o=>o.owner==='Germans'&&o.spawned&&o.name==='CMIN').sort((a,b)=>a.id-b.id)[0];
        if (!target) break;
        await order(['HTNK'],2,target.id);await step(150);
    }
    const baseSite = await page.evaluate(() => {
        const d=window.__ra2debug,g=d.game,m=g.localPlayer.getOwnedObjects().find(o=>o.name==='SMCV');
        const worker=g.getConstructionWorker(g.localPlayer);
        for(let radius=0;radius<16;radius++)for(let y=m.tile.ry-radius;y<=m.tile.ry+radius;y++)for(let x=m.tile.rx-radius;x<=m.tile.rx+radius;x++) {
            const tile=g.map.tiles.getByMapCoords(x,y);
            if(tile&&worker.canPlaceAt(m.rules.deploysInto,tile,{ignoreObjects:[m],ignoreAdjacent:true})) return [x,y];
        }
        throw new Error('No legal MCV deployment site');
    });
    await order(['SMCV'],1,undefined,baseSite);await step(450);
    for (let attempt=0;attempt<12;attempt++) {
        await order(['SMCV'],11); await step(3); await order(['SMCV'],9); await step(150);
        if (await page.evaluate(()=>window.__ra2debug.game.localPlayer.getOwnedObjects().some(o=>o.name==='NACNST'))) break;
        // Nearby moving units can obstruct a previously legal foundation while
        // the MCV turns. Use ordinary scatter/move orders and re-evaluate it.
        await order(['HTNK','E2'],16);
        const site=await page.evaluate(()=>{const d=window.__ra2debug,g=d.game,m=g.localPlayer.getOwnedObjects().find(o=>o.name==='SMCV');
            if(!m)throw Error('The source MCV was lost before deployment');const w=g.getConstructionWorker(g.localPlayer);
            for(let r=0;r<16;r++)for(let y=m.tile.ry-r;y<=m.tile.ry+r;y++)for(let x=m.tile.rx-r;x<=m.tile.rx+r;x++){
                const t=g.map.tiles.getByMapCoords(x,y);if(t&&w.canPlaceAt(m.rules.deploysInto,t,{ignoreObjects:[m],ignoreAdjacent:true}))return[x,y];}
            throw Error('No currently legal MCV foundation');});
        await order(['SMCV'],1,undefined,site);await step(180);
    }
    assert((await inspect('base-deployed')).player.some(o=>o.name==='NACNST'));
    await build('NAPOWR');
    await order(['HTNK','E2'],4,undefined,[74,60]);
    const escort = await inspect('refinery-defense');
    const miner = escort.player.find(o=>o.name==='HARV'&&o.spawned);
    if (miner) await order(escort.player.filter(o=>o.name==='HTNK').slice(0,2).map(o=>o.id),5,miner.id);
    await build('NAHAND');
    await page.evaluate(()=>{const d=window.__ra2debug,g=d.game,r=g.rules.getObject('SENGINEER',3),q=g.localPlayer.production.getQueueForObject(r);
        d.actionsApi.queueForProduction(q.type,r.type,r.name,2);});
    await step(600);
    for(let capture=0;capture<2;capture++) {
        let state=await inspect('original-refinery-capture-'+capture);
        const target=state.enemies.find(o=>o.owner==='Germans'&&o.name==='GAREFN');
        const engineer=state.player.find(o=>o.name==='SENGINEER'&&o.spawned);
        assert(target&&engineer,'Original engineer capture needs the source refinery and a produced engineer');
        await order([engineer.id],1,undefined,[target.tile[0]-1,target.tile[1]-1]);await step(450);
        await order([engineer.id],7,target.id);await step(300);
        state=await inspect('refinery-captured-'+capture);
        assert(state.player.some(o=>o.id===target.id),'Engineer must actually capture the original refinery');
        const crates=await page.evaluate(()=>window.__ra2debug.game.crateGeneratorTrait.crates.filter(c=>c.powerup.type===3)
            .map(c=>({id:c.obj.id,tile:[c.obj.tile.rx,c.obj.tile.ry]})));
        for(const crate of crates) {
            const tank=state.player.filter(o=>o.name==='HTNK'&&o.spawned).sort((a,b)=>Math.hypot(a.tile[0]-crate.tile[0],a.tile[1]-crate.tile[1])-Math.hypot(b.tile[0]-crate.tile[0],b.tile[1]-crate.tile[1]))[0];
            assert(tank);await order([tank.id],1,undefined,crate.tile);await step(300);
            report.commands.push({action:'collect-original-capture-reward',crate});
        }
        await inspect('capture-reward-collected-'+capture);
    }
    await build('NAWEAP');
    await build('NAREFN');
    await page.evaluate(()=>{const d=window.__ra2debug,g=d.game,r=g.rules.getObject('HTNK',7),q=g.localPlayer.production.getQueueForObject(r);
        d.actionsApi.queueForProduction(q.type,r.type,r.name,3);});
    report.commands.push({action:'queue-tanks',quantity:3});
    await build('NAYARD');
    await inspect('naval-yard-built');await page.screenshot({path:path.join(out,'naval-yard.png')});
    await page.evaluate(()=>{const d=window.__ra2debug,g=d.game;for(const [n,t,k] of [['SUB',7,8],['E2',3,12]]) {
        const r=g.rules.getObject(n,t),q=g.localPlayer.production.getQueueForObject(r);d.actionsApi.queueForProduction(q.type,r.type,n,k);
    }});
    report.commands.push({action:'queue-army',submarines:8,conscripts:12});
    for(let i=0;i<16;i++) {
        await order(['HTNK','E2'],4,undefined,[74,60]);await step(300);
        const state=await inspect('fleet-production-'+i);
        if(state.player.filter(o=>o.name==='HTNK').length>=6&&state.player.filter(o=>o.name==='SUB').length>=6)break;
    }
    await inspect('fleet-produced');
    await page.evaluate(()=>window.__missionAssault=true);
    for(let i=0;i<140;i++) {
        const state=await inspect('combat-'+i);if(state.result)break;
        const land=state.enemies.filter(o=>o.spawned&&!['DEST','GAYARD','AEGIS'].includes(o.name)).sort((a,b)=>
            Math.hypot(a.tile[0]-73,a.tile[1]-65)-Math.hypot(b.tile[0]-73,b.tile[1]-65)||a.id-b.id)[0];
        const naval=state.enemies.filter(o=>['DEST','GAYARD','AEGIS'].includes(o.name)).sort((a,b)=>
            Math.hypot(a.tile[0]-90,a.tile[1]-75)-Math.hypot(b.tile[0]-90,b.tile[1]-75)||a.id-b.id)[0];
        if(land) await order(['HTNK','E2'],2,land.id);
        if(naval) await order(['SUB'],2,naval.id);
        await step(300);
        if(i%10===0) await page.screenshot({path:path.join(out,'combat-'+i+'.png')});
    }
    const final=await inspect('final');assert.equal(final.result,'victory');
    assert(final.trace.some(a=>a.key==='0CBCDB0C'&&a.opcode===1));
    const commands = await page.evaluate(() => window.__ra2debug.game.campaign.journal.commands);
    await fs.writeFile(path.join(out, 'applied-command-journal.json'), JSON.stringify(commands) + '\n');
    report.appliedCommands = commands.length;
    await page.evaluate(() => { const d = window.__ra2debug, m = d.gameScreen.gameTurnMgr;
        window.__previousCampaignWorld = d.game; window.__previousEnvironment = d.environmentHd;
        m.setCampaignPaused(false); m.doGameTurn(performance.now()); });
    await page.waitForSelector('[data-campaign-result=victory]', { timeout: 45000 });
    await page.screenshot({ path: path.join(out, 'original-victory-score.png') });
    const continueButton = page.getByRole('button', { name: labels['hd:campaigncontinuemission'], exact: true });
    if (await continueButton.isEnabled()) {
        await continueButton.click();
        await page.waitForSelector('[data-campaign-media=s03_f00e] video', { timeout: 30000 });
        await page.locator('[data-campaign-media=s03_f00e] button').click();
        await page.waitForFunction(() => window.__ra2debug.game?.campaign?.launch.mission === 'sov03u.map'
            && window.__ra2debug.gameScreen?.playerUi, undefined, { timeout: 180000 });
        report.resultLifecycle = await page.evaluate(() => { const d = window.__ra2debug, g = d.game;
            d.gameScreen.gameTurnMgr.setCampaignPaused(true); d.gameScreen.pointer.unlock(true);
            return { continuedToOriginalThirdMission: true, oldWorldReplaced: g !== window.__previousCampaignWorld,
                source: g.campaign.launch, tick: g.currentTick, journalCommands: g.campaign.journal.commands.length,
                oldEnvironmentReleased: window.__previousEnvironment.disposed || window.__previousEnvironment.gpuBytes === 0,
                oldMovieAbsent: !document.querySelector('[data-campaign-media^=s02_]') }; });
        assert.equal(report.resultLifecycle.source.difficulty, 'normal'); assert.equal(report.resultLifecycle.journalCommands, 0);
        assert(report.resultLifecycle.oldWorldReplaced && report.resultLifecycle.oldEnvironmentReleased && report.resultLifecycle.oldMovieAbsent);
        await page.screenshot({ path: path.join(out, 'actual-second-to-third-mission.png') });
    } else {
        await page.getByRole('button', { name: labels['hd:campaignreturnselection'], exact: true }).click();
        await page.waitForSelector('[data-campaign-missions][data-campaign-ready=true]');
        assert.equal(await page.locator('[data-campaign-difficulty-choice=normal][aria-pressed=true]').count(), 1);
        assert((await page.locator('[data-campaign-difficulty-choice=normal]').innerText()).includes('✓'));
        await page.screenshot({ path: path.join(out, 'completed-second-mission-selection.png') });
        report.resultLifecycle = { nextMissionUnavailable: true, returnedToSelection: true, normalCompletionRecorded: true };
    }
    report.status='PASS_ORIGINAL_SOVIET02_OBJECTIVE_CHAIN_VICTORY';
    assert.deepEqual(report.errors, []); assert.deepEqual(report.resources, []);
} catch (error) {
    report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1;
    if (page) { await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {}); report.body = await page.locator('body').innerText().catch(() => ''); }
} finally { await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n'); await app?.close(); }
console.log(JSON.stringify({ status: report.status, error: report.error, out }));
