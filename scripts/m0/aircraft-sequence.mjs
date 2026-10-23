// Finite normal player commands; no spawning, free production or simulation edits.
import fs from 'node:fs';
export async function runAircraftScenario(page, output) {
    await page.evaluate(() => {
        const d=window.__ra2debug;
        window.__airTest={actions:[], started:d.game.currentTick};
        d.helpers.selectOwnedUnitByName('AMCV');
        d.helpers.deploySelectedUnits();
    });
    const deadline=Date.now()+240000;
    let state;
    let lastStage;
    while (Date.now()<deadline) {
        state=await page.evaluate(() => {
            const d=window.__ra2debug, s=window.__airTest, p=d.localPlayer, owned=p.getOwnedObjects();
            const plane=owned.find(o=>o.name==='ORCA');
            if (plane) return {ready:true,id:plane.id,tick:d.game.currentTick,actions:s.actions};
            if (d.game.status!==1) throw new Error('Game ended before aircraft production');
            const yard=owned.find(o=>o.name==='GACNST');
            if (!yard) {
                if(s.actions.length)throw new Error('Construction yard lost before aircraft production');
                return {waiting:'deployment',tick:d.game.currentTick};
            }
            // Americans use AMRADR; the archived GAAIRC explicitly forbids this house.
            const name=['GAPOWR','GAREFN','AMRADR'].find(name=>!owned.some(o=>o.name===name));
            const queue=p.production.getQueue(name?0:4);
            const target=name??'ORCA';
            if (queue.status===0 && p.production.getAvailableObjects().some(o=>o.name===target)) {
                d.actionsApi.queueForProduction(name?0:4,name?2:1,target,1);
                s.actions.push({tick:d.game.currentTick,action:'QueueForProduction',name:target,credits:p.credits});
            } else if(name && queue.status===3) {
                const tiles=[];
                for(let dx=-8;dx<=8;dx++)for(let dy=-8;dy<=8;dy++)tiles.push({rx:yard.tile.rx+dx,ry:yard.tile.ry+dy});
                tiles.sort((a,b)=>(a.rx-yard.tile.rx+3)**2+(a.ry-yard.tile.ry+3)**2-
                    (b.rx-yard.tile.rx+3)**2-(b.ry-yard.tile.ry+3)**2);
                const tile=tiles.find(t=>d.game.getConstructionWorker(p).canPlaceAt(name,t,{normalizedTile:true}));
                if(tile){d.actionsApi.placeBuilding(name,tile.rx,tile.ry);s.actions.push({tick:d.game.currentTick,action:'PlaceBuilding',name,tile});}
            }
            return {waiting:target,status:queue.status,tick:d.game.currentTick,actions:s.actions,
                available:p.production.getAvailableObjects().map(o=>o.name)};
        });
        fs.writeFileSync(`${output}/production-progress.json`,JSON.stringify(state,null,2));
        const stage=`${state.waiting}:${state.status}`;
        if(stage!==lastStage){console.log(JSON.stringify(state));lastStage=stage;}
        if(state.ready)break;
        await page.waitForTimeout(500);
    }
    if(!state.ready)throw new Error(`Aircraft production timed out: ${JSON.stringify(state)}`);
    await page.waitForTimeout(1500);
    await page.evaluate(id=>{
        const d=window.__ra2debug, plane=d.game.getObjectById(id);
        d.unitSelection.deselectAll();d.unitSelection.addToSelection(plane);
        d.actionsApi.orderUnits([id],0,plane.tile.rx+7,plane.tile.ry+3);
    },state.id);
    const frames=[];
    for(let i=0;i<30;i++){
        await page.waitForTimeout(250);
        frames.push(await page.evaluate(id=>{
            const d=window.__ra2debug, p=d.game.getObjectById(id), r=d.renderableManager.getRenderableByGameObject(p), parts=[];
            r.get3DObject().traverse(o=>{if(o.geometry)parts.push({type:o.type,visible:o.visible,vertices:o.geometry.attributes.position.count,
                castShadow:o.castShadow,material:o.material?.type});});
            return {tick:d.game.currentTick,position:p.position.worldPosition.toArray(),tile:[p.tile.rx,p.tile.ry],
                elevation:p.tileElevation,selected:d.unitSelection.getSelectedUnits().includes(p), placeholder:!!r.placeholder,
                helper:!!r.pipOverlay.flyHelper,selectionVisible:r.pipOverlay.selectionBox.visible,
                renderPosition:r.getPosition().toArray(),rotation:r.get3DObject().rotation.toArray(),parts,
                failure:window.__m01Failure};
        },state.id));
        if(i===8)await page.screenshot({path:`${output}/aircraft-selected-flight.png`});
    }
    if(!frames.some(f=>f.elevation>0&&f.selected&&f.selectionVisible&&!f.placeholder))throw new Error('Selected aircraft did not fly with its original model');
    if(JSON.stringify(frames[0].position)===JSON.stringify(frames.at(-1).position))throw new Error('Aircraft did not follow the move order');
    return {production:state,frames};
}
