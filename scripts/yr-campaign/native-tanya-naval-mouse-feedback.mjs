import assert from 'node:assert/strict';
import path from 'node:path';
import { NativeCampaignPilot } from './native-pilot.mjs';

const pilot = new NativeCampaignPilot(process.argv[2], 'all01umd.map');
let failure;
try {
    await pilot.open();
    pilot.report.scope = 'Exact legitimate original Tanya-arrival checkpoint, supported reveal, ordinary UI selection and a native mouse attack click on a real outer Soviet Flak ship. No direct attack API, actor, health, source, rule, trigger or result editing.';
    const pair = await pilot.page.evaluate(() => {
        const d=window.__ra2debug,g=d.game,hero=g.localPlayer.getOwnedObjects().find(u=>u.name==='TANY'&&u.isSpawned&&!u.isDestroyed);
        if(!hero)throw Error('Original Tanya absent');
        d.trainer.setEnabled(true);if(!d.trainer.send({type:'reveal'}))throw Error('Supported reveal rejected');
        const ship=g.world.getAllObjects().filter(u=>u.name==='HYD'&&u.isSpawned&&!u.isDestroyed&&!g.areFriendly(hero,u))
            .sort((a,b)=>Math.hypot(a.tile.rx-63,a.tile.ry-65)-Math.hypot(b.tile.rx-63,b.tile.ry-65))[0];
        if(!ship)throw Error('Original outer Flak ship absent');
        window.__navalMouseEvents=[];
        g.events.subscribe(2,e=>{if(e.gameObject===hero)window.__navalMouseEvents.push({tick:g.currentTick,type:'fire',weapon:e.weapon?.rules.name});});
        g.events.subscribe(12,e=>{if(e.target===ship)window.__navalMouseEvents.push({tick:g.currentTick,type:'damage',hp:ship.healthTrait.getHitPoints()});});
        d.worldInteraction.unitSelectionHandler.selectSingleUnit(hero);d.gameScreen.pointer.unlock(true);
        return {hero:hero.id,ship:ship.id,tile:[ship.tile.rx,ship.tile.ry]};
    });
    await pilot.commands.step(1,{defend:false});
    await pilot.page.evaluate(tile=>{const d=window.__ra2debug,t=d.game.map.tiles.getByMapCoords(...tile),free=d.worldScene.cameraPan.freeCamera,prior=free.value;free.value=true;
        try{d.worldInteraction.minimapHandler.panToTile(t);}finally{free.value=prior;}},pair.tile);
    await pilot.page.waitForTimeout(150);
    const click = await pilot.page.evaluate(pair=>{
        const d=window.__ra2debug,g=d.game,u=g.world.getObjectById(pair.ship),r=d.renderableManager.getRenderableByGameObject(u),w=d.worldScene;
        r.get3DObject().updateWorldMatrix(true,true);
        const p=r.get3DObject().getWorldPosition(w.camera.position.clone()).project(w.camera);
        const box=d.renderer.renderer.domElement.getBoundingClientRect();
        return {x:box.x+w.viewport.x+(p.x+1)*w.viewport.width/2,y:box.y+w.viewport.y+(1-p.y)*w.viewport.height/2-5,
            rightClickMove:d.worldInteraction.isRightClickMove(),selected:g.getUnitSelection().getSelectedUnits().map(u=>u.id)};
    },pair);
    pilot.report.mouse={pair,click};assert(click.selected.includes(pair.hero));
    await pilot.page.mouse.move(click.x,click.y);await pilot.page.waitForTimeout(100);
    pilot.report.hover=await pilot.page.evaluate(()=>{
        const d=window.__ra2debug,h=d.worldInteraction.mapHoverHandler.getHover?.()??d.worldInteraction.mapHoverHandler.hover;
        return {hoverId:h?.gameObject?.id,interaction:d.worldInteraction.isEnabled(),pointerLocked:!!document.pointerLockElement};
    });
    await pilot.page.mouse.click(click.x,click.y,{button:click.rightClickMove?'right':'left'});
    await pilot.page.screenshot({path:path.join(pilot.out,'native-mouse-flak-ship-attack.png')});
    pilot.report.combat=[];
    for(let i=0;i<140;i++){
        await pilot.commands.step(30,{defend:false});
        const s=await pilot.page.evaluate(pair=>{const g=window.__ra2debug.game,hero=g.localPlayer.getOwnedObjectById(pair.hero);
            return {tick:g.currentTick,shipAlive:g.world.hasObjectId(pair.ship),heroAlive:!!hero&&!hero.isDestroyed,
                heroTile:hero&&[hero.tile.rx,hero.tile.ry],events:window.__navalMouseEvents,
                journal:g.campaign.journal.commands.slice(-2)};},pair);
        pilot.report.combat.push(s);if(!s.shipAlive)break;
    }
    const end=pilot.report.combat.at(-1);assert(!end.shipAlive&&end.heroAlive,'The ordinary mouse attack must destroy the ship and preserve Tanya');
    assert(end.events.some(e=>e.type==='fire'&&e.weapon==='Sapper'),'The real original Sapper must fire');
    pilot.report.status='PASS_NATIVE_MOUSE_ORIGINAL_TANYA_SAPPER_AND_OUTER_FLAK_SHIP_DESTRUCTION';
}catch(error){failure=error;}
await pilot.finish(failure);
