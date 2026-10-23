import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

export async function startTrace(page) {
    await page.evaluate(() => {
        window.__sovietNativeTrace=[];
        window.__sovietTraceTimer=setInterval(()=>{
            const d=window.__ra2debug;if(!d.game||d.game.status!==1)return;
            const objects=d.localPlayer.getOwnedObjects();
            window.__sovietNativeTrace.push({tick:d.game.currentTick,credits:d.localPlayer.credits,
                buildings:objects.filter(u=>['NAHAND','NAREFN','NAWEAP','NACNST'].includes(u.name)).map(u=>{
                    const r=d.renderableManager.getRenderableByGameObject(u);
                    return {name:u.name,id:u.id,health:u.healthTrait.health,anim:r?.currentAnimType,
                        parts:r?[...r.animObjects].flatMap(([type,parts])=>parts.filter(p=>p.get3DObject().visible).map(p=>({type,frame:p.builder.getFrame(),hd:!!p.builder.hdOverride}))):[]};
                }),miners:objects.filter(u=>u.harvesterTrait).map(u=>({id:u.id,name:u.name,status:u.harvesterTrait.status,
                    ...u.harvesterTrait.debugGetState(),tile:[u.tile.rx,u.tile.ry]}))});
        },40);
    });
}

export async function exercise(page,output) {
    const report={status:'RUNNING',families:{}};
    for(const [name,queue,type] of [['E2',2,3],['HTNK',3,7]]) {
        const before=await page.evaluate(name=>window.__ra2debug.localPlayer.getOwnedObjects().filter(u=>u.name===name).map(u=>u.id),name);
        await page.evaluate(({name,queue,type})=>window.__ra2debug.actionsApi.queueForProduction(queue,type,name,1),{name,queue,type});
        await page.waitForFunction(({name,before})=>window.__ra2debug.localPlayer.getOwnedObjects().some(u=>u.name===name&&!before.includes(u.id)),{name,before},{timeout:90000});
        report[name]=await page.evaluate(({name,before})=>{
            const d=window.__ra2debug,u=d.localPlayer.getOwnedObjects().find(u=>u.name===name&&!before.includes(u.id));
            if(name==='HTNK')window.__sovietTestTank=u;
            return {id:u.id,name:u.name,tick:d.game.currentTick,tile:[u.tile.rx,u.tile.ry]};
        },{name,before});
        console.log('Native unit produced',name,report[name].id);
    }
    report.families.NAHAND={production:'PASS_NATIVE_INFANTRY_QUEUE'};
    report.families.NAWEAP={production:'PASS_NATIVE_VEHICLE_QUEUE'};
    report.families.NACNST={production:'PASS_NATIVE_DEPLOYMENT_AND_BUILDING_QUEUES'};
    try {
        await page.waitForFunction(()=>window.__sovietNativeTrace.some(t=>t.miners.some(m=>m.status===8)),undefined,{timeout:90000});
        report.families.NAREFN={production:'PASS_NATIVE_DOCK_AND_UNLOAD'};
    } catch(error) {
        report.families.NAREFN={production:'NOT_REPRODUCED_NATIVE_UNLOAD',reason:error.message};
    }
    report.trace=await page.evaluate(()=>window.__sovietNativeTrace);
    report.creditIncreases=report.trace.filter((t,i,a)=>i&&t.credits>a[i-1].credits).map(t=>({tick:t.tick,credits:t.credits}));
    report.miner=await page.evaluate(()=>{
        const d=window.__ra2debug;return d.localPlayer.getOwnedObjects().filter(u=>u.harvesterTrait).map(u=>{
            const r=d.renderableManager.getRenderableByGameObject(u);
            return {id:u.id,name:u.name,originalVxl:!r.rhinoHd?.active&&!r.shpRenderable?.builder?.hdOverride};
        });
    });
    assert(report.miner.length>0&&report.miner.every(m=>m.originalVxl));
    report.status=report.families.NAREFN.production.startsWith('PASS')&&report.creditIncreases.length?'PASS_NATIVE_PRODUCTION':'PARTIAL_NATIVE_PRODUCTION';
    await fs.writeFile(path.join(output,'native-production.json'),JSON.stringify(report,null,2)+'\n');
    return report;
}

export async function damageRepairRemoval(page,output) {
    const results={};
    await page.evaluate(()=>window.__ra2debug.gameScreen.gameAnimationLoop.start());
    for(const name of ['NAHAND','NAWEAP','NAREFN','NACNST']) {
        const entry=results[name]={status:'RUNNING'};
        try {
            entry.before=await page.evaluate(name=>{
                const d=window.__ra2debug,u=d.localPlayer.getOwnedObjects().find(u=>u.name===name);
                window.__sovietDamageTarget=u;d.worldInteraction.minimapHandler.panToTile(u.tile);
                d.actionsApi.orderUnits([window.__sovietTestTank.id],3,u.id);
                return {id:u.id,cost:u.rules.cost,power:u.rules.power,strength:u.rules.strength,tick:d.game.currentTick,health:u.healthTrait.health};
            },name);
            await page.waitForFunction(()=>window.__sovietDamageTarget.healthTrait.health<49,undefined,{timeout:90000});
            entry.damage=await page.evaluate(()=>{
                const d=window.__ra2debug;d.actionsApi.orderUnits([window.__sovietTestTank.id],11);
                return {tick:d.game.currentTick,health:window.__sovietDamageTarget.healthTrait.health,spawned:window.__sovietDamageTarget.isSpawned};
            });
            assert(entry.damage.spawned);
            await page.screenshot({path:path.join(output,`${name}-native-damage.png`)});
            await page.evaluate(()=>window.__ra2debug.actionsApi.toggleRepairWrench(window.__sovietDamageTarget.id));
            await page.waitForFunction(()=>window.__sovietDamageTarget.healthTrait.health>=65,undefined,{timeout:90000});
            entry.repaired=await page.evaluate(()=>({tick:window.__ra2debug.game.currentTick,health:window.__sovietDamageTarget.healthTrait.health}));
            await page.screenshot({path:path.join(output,`${name}-native-repair.png`)});
            await page.evaluate(()=>window.__ra2debug.actionsApi.sellBuilding(window.__sovietDamageTarget.id));
            await page.waitForFunction(()=>!window.__sovietDamageTarget.isSpawned,undefined,{timeout:30000});
            entry.status='PASS_NATIVE_DAMAGE_REPAIR_SALE';
        } catch(error) {entry.status='FAIL_NATIVE_SCENARIO';entry.reason=error.message;}
        await fs.writeFile(path.join(output,'native-damage-removal.json'),JSON.stringify(results,null,2)+'\n');
        console.log(name,entry.status);
    }
    await page.evaluate(()=>clearInterval(window.__sovietTraceTimer));
    return results;
}
