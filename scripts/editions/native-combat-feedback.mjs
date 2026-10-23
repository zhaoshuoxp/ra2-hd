import assert from 'node:assert/strict';
import path from 'node:path';

export async function validateCombatFeedback(page, report, out) {
    const reproduce = process.argv.includes('--reproduce');
    await page.evaluate(() => {
        const d = window.__ra2debug, g = d.game, owner = d.localPlayer;
        const enemy = g.getCombatants().find(p => p !== owner);
        for (const bot of g.botManager.bots.values()) bot.onGameTick = () => {};
        for (const u of g.getWorld().getAllObjects()) {
            u.attackTrait?.setDisabled(true);
            u.unitOrderTrait?.clearOrders(); u.unitOrderTrait?.cancelAllTasks();
        }
        g.mapShroudTrait.revealMap(owner, g);
        const base = owner.getOwnedObjects().find(u => u.rules.constructionYard);
        const place = name => {
            const worker = g.getConstructionWorker(owner);
            const tiles = g.map.tiles.getAll().filter(t => Math.hypot(t.rx - base.tile.rx, t.ry - base.tile.ry) < 15);
            tiles.sort((a,b) => Math.hypot(a.rx-base.tile.rx,a.ry-base.tile.ry)-Math.hypot(b.rx-base.tile.rx,b.ry-base.tile.ry));
            const tile = tiles.find(t => worker.canPlaceAt(name,t,{ignoreAdjacent:true}));
            if (!tile) throw Error(`No fixture position for ${name}`);
            return worker.placeAt(name,tile)[0];
        };
        const trace = window.combatFeedback = { place, enemy, base, shots: [], detonations: [], animations: [], loops: [] };
        g.events.subscribe(e => {
            if (e.type === 2 && (!trace.shooter || e.gameObject === trace.shooter)) trace.shots.push({ tick:g.currentTick, id:e.gameObject.id, weapon:e.weapon.name });
            if (e.type === 30) trace.detonations.push({ tick:g.currentTick, lightning:e.isLightningStrike, anim:e.explodeAnim });
        });
        const manager = d.renderableManager, animate = manager.createTransientAnim;
        manager.createTransientAnim = function(name,...args) { trace.animations.push({tick:g.currentTick,name});return animate.call(this,name,...args); };
        const sound = d.gameScreen.playerUi.soundHandler.worldSound, play = sound.playEffect;
        sound.playEffect = function(key,...args) {
            const handle = play.call(this,key,...args), spec = this.sound.getSoundSpec(key);
            if (handle && spec?.control.has(1)) trace.loops.push({key,tick:g.currentTick,handle});
            return handle;
        };
        trace.building = place('NAPOWR');
    });
    await page.waitForFunction(() => window.combatFeedback.building.buildStatus === 1);
    await page.evaluate(() => {
        const g = window.__ra2debug.game, f = window.combatFeedback;
        g.changeObjectOwner(f.building,f.enemy);
        f.destroyTick = g.currentTick;
        g.destroyObject(f.building,{player:window.__ra2debug.localPlayer});
    });
    await page.waitForFunction(() => window.combatFeedback.detonations.length > 0, undefined, {timeout:15000});
    await page.waitForTimeout(1000);
    report.debrisFeedback = await page.evaluate(() => {
        const f=window.combatFeedback,g=window.__ra2debug.game;
        return {detonations:f.detonations,animations:f.animations,stormBolts:g.rules.audioVisual.weatherConBolts,
            lightningEvents:f.detonations.filter(e=>e.lightning).length};
    });
    await page.screenshot({path:path.join(out,'building-destruction.png')});
    if (report.edition === 'yr') {
        await page.evaluate(() => { const f=window.combatFeedback; f.power=f.place('YAPOWR');f.cannon=f.place('YAGGUN'); });
        await page.waitForFunction(() => window.combatFeedback.cannon.buildStatus===1 && window.combatFeedback.power.buildStatus===1);
        report.gattling = [];
        for (const type of ['YAGGUN','YTNK']) {
            await page.evaluate(type => {
                const d=window.__ra2debug,g=d.game,f=window.combatFeedback;
                const spawn=(name,player,near)=>{
                    const rules=g.rules.getObject(name,7);
                    const tiles=g.map.tiles.getAll().filter(t=>g.map.isWithinBounds(t) && !t.rampType && g.map.terrain.getPassableSpeed(t,rules.speedType,false,false)>0
                        && !g.map.getGroundObjectsOnTile(t).some(o=>o.isTechno()||o.isTerrain()));
                    tiles.sort((a,b)=>Math.hypot(a.rx-near.rx,a.ry-near.ry)-Math.hypot(b.rx-near.rx,b.ry-near.ry));
                    const u=g.createUnitForPlayer(rules,player);g.spawnObject(u,tiles[0]);return u;
                };
                f.shooter=type==='YAGGUN'?f.cannon:spawn(type,d.localPlayer,f.cannon.tile);
                f.shooter.attackTrait.setDisabled(false);
                f.target=spawn('HTNK',f.enemy,{rx:f.shooter.tile.rx+3,ry:f.shooter.tile.ry});
                f.target.attackTrait.setDisabled(true);f.target.moveTrait.setDisabled(true);
                f.target.healthTrait.maxHitPoints=100000;f.target.healthTrait.setHitPoints(100000);
                for (const u of f.enemy.getOwnedObjects()) {
                    if (u !== f.target && u.isSpawned && Math.hypot(u.tile.rx-f.shooter.tile.rx,u.tile.ry-f.shooter.tile.ry)<25) g.unspawnObject(u);
                }
                f.shots=[];f.loops=[];
                d.actionsApi.orderUnits([f.shooter.id],2,f.target.id);
            },type);
            await page.waitForFunction(() => window.combatFeedback.shots.length>=12 && window.combatFeedback.shooter.armedTrait.getGattlingStage()===2,undefined,{timeout:20000});
            await page.screenshot({path:path.join(out,`${type}-firing.png`)});
            const firing=await page.evaluate(()=>{
                const f=window.combatFeedback,g=window.__ra2debug.game;
                const result={shots:f.shots.length,stage:f.shooter.armedTrait.getGattlingStage(),loops:f.loops.map(l=>({key:l.key,playing:l.handle.isPlaying()}))};
                g.destroyObject(f.target,{player:window.__ra2debug.localPlayer});
                // Remove surviving crew too, so further shots cannot be valid reacquisition.
                for (const u of f.enemy.getOwnedObjects()) {
                    if (u.isSpawned && Math.hypot(u.tile.rx-f.shooter.tile.rx,u.tile.ry-f.shooter.tile.ry)<25) g.unspawnObject(u);
                }
                f.stopTick=g.currentTick;f.stopShots=f.shots.length;
                return result;
            });
            await page.waitForFunction(()=>window.__ra2debug.game.currentTick-window.combatFeedback.stopTick>150);
            const stopped=await page.evaluate(()=>{
                const f=window.combatFeedback;
                return {nearbyEnemies:f.enemy.getOwnedObjects().filter(u=>u.isSpawned&&Math.hypot(u.tile.rx-f.shooter.tile.rx,u.tile.ry-f.shooter.tile.ry)<25).length,
                    newShots:f.shots.length-f.stopShots,idle:f.shooter.attackTrait.isIdle(),stage:f.shooter.armedTrait.getGattlingStage(),
                    loops:f.loops.map(l=>({key:l.key,playing:l.handle.isPlaying()}))};
            });
            report.gattling.push({type,firing,stopped});
            await page.screenshot({path:path.join(out,`${type}-idle.png`)});
            await page.evaluate(()=>window.combatFeedback.shooter.attackTrait.setDisabled(true));
        }
    }
    if (reproduce) {
        assert(report.debrisFeedback.lightningEvents>0,'Old build must reproduce debris lightning');
        if (report.gattling) assert(report.gattling.every(c=>c.stopped.loops.some(l=>l.playing)),'Old build must reproduce orphaned firing loops');
        report.combatFeedbackStatus='REPRODUCED';
    } else {
        assert.equal(report.debrisFeedback.lightningEvents,0);
        assert(!report.debrisFeedback.animations.some(a=>report.debrisFeedback.stormBolts.includes(a.name)));
        for(const row of report.gattling??[]) {
            assert.equal(row.stopped.nearbyEnemies,0);
            assert(row.firing.loops.length>0); assert.equal(row.stopped.newShots,0); assert(row.stopped.idle);
            assert(row.stopped.loops.every(l=>!l.playing)); assert.equal(row.stopped.stage,0);
        }
        report.combatFeedbackStatus='PASS';
    }
}
