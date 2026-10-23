import assert from 'node:assert/strict';
import path from 'node:path';

export async function validateVisualFeedback(page, report, out) {
    const reproduce = process.argv.includes('--reproduce');
    const result = report.visualFeedback = {};
    await page.evaluate(() => {
        const d = window.__ra2debug, g = d.game, owner = d.localPlayer;
        for (const bot of g.botManager.bots.values()) bot.onGameTick = () => {};
        for (const u of g.getWorld().getAllObjects()) u.attackTrait?.setDisabled(true);
        g.mapShroudTrait.revealMap(owner, g);
        const base = owner.getOwnedObjects().find(u => u.rules.constructionYard);
        const center = {rx: base.tile.rx + 9, ry: base.tile.ry + 9};
        const enemy = g.getCombatants().find(p => p !== owner);
        const tiles = g.map.tiles.getAll().filter(t => g.map.isWithinBounds(t));
        tiles.sort((a,b) => Math.hypot(a.rx-base.tile.rx,a.ry-base.tile.ry)-Math.hypot(b.rx-base.tile.rx,b.ry-base.tile.ry));
        const place = (id, player, near) => {
            tiles.sort((a,b) => Math.hypot(a.rx-near.rx,a.ry-near.ry)-Math.hypot(b.rx-near.rx,b.ry-near.ry));
            const worker = g.getConstructionWorker(player), tile = tiles.find(t => worker.canPlaceAt(id,t,{ignoreAdjacent:true}));
            return worker.placeAt(id,tile)[0];
        };
        const spawn = (id,type,near) => {
            const rules = g.rules.getObject(id,type);
            const candidates = tiles.filter(t => !t.rampType && !g.map.getGroundObjectsOnTile(t).some(o=>o.isTechno()||o.isTerrain())
                && g.map.terrain.getPassableSpeed(t,rules.speedType,type===3,false)>0);
            candidates.sort((a,b)=>Math.hypot(a.rx-near.rx,a.ry-near.ry)-Math.hypot(b.rx-near.rx,b.ry-near.ry));
            const u=g.createUnitForPlayer(rules,owner);g.spawnObject(u,candidates[0]);u.attackTrait?.setDisabled(true);return u;
        };
        window.visualFixture={repair:place('NAPOWR',owner,{rx:center.rx-5,ry:center.ry-4}),
            target:place('NAPOWR',enemy,{rx:center.rx+5,ry:center.ry-4}),
            tanks:['HTNK','APOC'].map((id,i)=>spawn(id,7,{rx:center.rx+i*4,ry:center.ry+3}))};
        if(g.rules.getMultiplayerCountries().length===10) window.visualFixture.boris=spawn('BORIS',3,{rx:center.rx-1,ry:center.ry-2});
        d.worldScene.cameraPan.setPan(d.gameScreen.playerUi.worldInteraction.minimapHandler.mapPanningHelper.computeCameraPanFromTile(center.rx,center.ry));
        const v=window.visualFixture;
        // Keep the designation target alive through async texture loading and capture latency.
        // This changes only the fixture's health instance, never shared rules or weapon behavior.
        v.target.healthTrait.maxHitPoints = 100000;
        v.target.healthTrait.healToFull(v.target, g);
        owner.credits=100000;
        v.repair.healthTrait.setHitPoints(10); v.repair.autoRepairTrait.setDisabled(false);
        for(const u of v.tanks) u.invulnerableTrait.setActiveFor(600,g.currentTick);
        if(v.boris){v.boris.attackTrait.setDisabled(false);d.actionsApi.orderUnits([v.boris.id],2,v.target.id);}
    });
    await page.waitForFunction(() => !window.visualFixture.boris || !!window.visualFixture.boris.airstrikeTrait.getTarget(), undefined, {timeout:20000});
    await page.evaluate(() => {
        const v=window.visualFixture,g=window.__ra2debug.game;
        v.repair.healthTrait.setHitPoints(10);v.repair.autoRepairTrait.setDisabled(false);
        for(const u of v.tanks) u.invulnerableTrait.setActiveFor(600,g.currentTick);
    });
    await page.waitForTimeout(250);
    await page.waitForFunction(() => {
        const d = window.__ra2debug;
        return window.visualFixture.tanks.every(u => {
            const r = d.renderableManager.getRenderableByGameObject(u);
            return !!(r.rhinoHd ?? r.unitVxlHd)?.light;
        });
    }, undefined, { timeout: 20000 });
    result.samples=[];
    for(let i=0;i<12;i++) {
        result.samples.push(await page.evaluate(()=>{
            const d=window.__ra2debug,v=window.visualFixture,get=u=>d.renderableManager.getRenderableByGameObject(u);
            const wrench=get(v.repair).pipOverlay.repairWrench, plugin=v.boris&&get(v.boris).plugins.find(p=>p.unit===v.boris&&'clear' in p);
            const line=plugin?.line;
            return {wrench:wrench?.animationRunner?.getCurrentFrame(),wrenchState:wrench?.animation?.getState(),
                wrenchLoop:wrench?.animation?.props.loopCount,
                tanks:v.tanks.map(u=>{const r=get(u);return {id:u.name,light:(r.rhinoHd??r.unitVxlHd)?.light?.toArray(),
                    native:r.vxlExtraLight.toArray(),base:r.baseVxlExtraLight.toArray()};}),
                boris:v.boris&&{target:v.boris.airstrikeTrait.getTarget()?.id,line:!!line,transparent:line?.material.transparent,
                    marked:!!get(v.target).airstrikeDesignators?.size,tint:get(v.target).shpExtraLight.toArray(),
                    positions:line&&Array.from(line.geometry.attributes.position.array)}};
        }));
        await page.waitForTimeout(160);
    }
    await page.screenshot({path:path.join(out,'visual-feedback-active.png')});
    if(result.samples.some(s=>s.boris?.line)) {
        await page.evaluate(()=>{
            const d=window.__ra2debug,v=window.visualFixture;
            d.worldScene.cameraPan.setPan(d.gameScreen.playerUi.worldInteraction.minimapHandler.mapPanningHelper
                .computeCameraPanFromTile((v.boris.tile.rx+v.target.tile.rx)/2,(v.boris.tile.ry+v.target.tile.ry)/2));
        });
        await page.waitForTimeout(150);
        await page.screenshot({path:path.join(out,'boris-designation.png')});
    }
    if(!reproduce){
        assert(new Set(result.samples.slice(5).map(s=>s.wrench)).size>1,'Repair animation must continue looping');
        for(const sample of result.samples) for(const t of sample.tanks)
            assert(t.light?.every(x=>Number.isFinite(x)&&x>-.95&&x<0),JSON.stringify(t));
        if(result.samples.some(s=>s.boris)) assert(result.samples.some(s=>s.boris?.line&&s.boris.transparent&&s.boris.marked),'Visible designator and target tint');
    }
    await page.evaluate(()=>{
        const d=window.__ra2debug,v=window.visualFixture;
        v.repair.autoRepairTrait.setDisabled(true);
        for(const u of v.tanks) u.invulnerableTrait.setActiveFor(0,d.game.currentTick);
        if(v.boris){v.boris.unitOrderTrait.clearOrders();v.boris.unitOrderTrait.cancelAllTasks();v.boris.attackTrait.currentTarget=undefined;}
    });
    await page.waitForTimeout(350);
    result.cleared=await page.evaluate(()=>{
        const d=window.__ra2debug,v=window.visualFixture,get=u=>d.renderableManager.getRenderableByGameObject(u);
        return {wrench:!!get(v.repair).pipOverlay.repairWrench,marked:!!get(v.target).airstrikeDesignators?.size,
            targetTint:get(v.target).shpExtraLight.toArray(),
            line:v.boris&&get(v.boris).plugins.some(p=>!!p.line),
            tanks:v.tanks.map(u=>(get(u).rhinoHd??get(u).unitVxlHd)?.light?.toArray())};
    });
    if(!reproduce){
        assert.equal(result.cleared.wrench,false);assert.equal(result.cleared.marked,false);assert(!result.cleared.line);
        for(const light of result.cleared.tanks) assert(light.every(x=>Math.abs(x)<1e-6),'Iron Curtain brightness must restore');
    }
    await page.screenshot({path:path.join(out,'visual-feedback-cleared.png')});
    result.status=reproduce?'REPRODUCTION_RECORDED':'PASS_THREE_VISUAL_FIXES';
}
