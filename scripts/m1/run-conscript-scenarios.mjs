import fs from 'node:fs/promises';
import assert from 'node:assert/strict';

export async function runConscriptScenarios(page, output, { step, capture }) {
    const checks = { ramps: [], bridges: [], deaths: [] };
    const untilDisposed = async label => {
        const rows=[];
        for(let i=0;i<12;i++) {
            rows.push(...await step(60,`${label}-${i}`));
            if(!rows.at(-1).rendererPresent) return rows;
        }
        throw Error(`${label}: native removal did not finish in 720 ticks`);
    };
    if (!['deaths','tail'].includes(process.env.M11_STATE_SECTION)) {
    for (let i = 0; i < (process.env.M11_SKIP_TERRAIN ? 0 : 4); i++) {
        const route = await page.evaluate(i => {
            const s = window.__conscriptStates, ramp = s.ramps[i];
            if (!ramp) throw Error(`Missing ramp ${i + 1}`);
            const height = t => t.z + s.u.position.interpolateRampHeight(0.5, 0.5, t.rampType);
            const near = s.tiles.filter(t => s.legal(t) && Math.hypot(t.rx-ramp.rx, t.ry-ramp.ry) <= 2.3);
            near.sort((a,b) => height(a)-height(b));
            s.rampStart = near[0]; s.rampEnd = near.at(-1); s.rampWaypoint = ramp;
            s.relocate(s.rampStart); s.move(ramp); s.move(s.rampEnd);
            return { start: [s.rampStart.rx,s.rampStart.ry], end: [s.rampEnd.rx,s.rampEnd.ry] };
        }, i);
        const up = await step(180, `ramp-${i+1}-out`);
        await capture(`ramp-${i+1}-end`);
        await page.evaluate(() => { const s=window.__conscriptStates; s.move(s.rampWaypoint); s.move(s.rampStart); });
        const down = await step(180, `ramp-${i+1}-back`);
        assert(up.some(r=>r.moving&&r.ramp===i+1), `ramp ${i+1}: outward actual traversal`);
        assert(down.some(r=>r.moving&&r.ramp===i+1), `ramp ${i+1}: return actual traversal`);
        assert(new Set([...up,...down].map(r=>r.position[1])).size > 2, 'Slope height must change');
        checks.ramps.push({ type:i+1,route,outward:up.filter(r=>r.moving&&r.ramp===i+1).length,
            returning:down.filter(r=>r.moving&&r.ramp===i+1).length });
    }
    for (const kind of (process.env.M11_SKIP_TERRAIN === 'all' ? [] : ['high','low'])) {
        const route = await page.evaluate(kind => {
            const s=window.__conscriptStates, seed=s[kind], bridge=t=>s.g.map.tileOccupation.getBridgeOnTile(t);
            const component=[seed], seen=new Set([seed]);
            for(let i=0;i<component.length;i++) for(const t of s.tiles) {
                if(!seen.has(t)&&Math.max(Math.abs(t.rx-component[i].rx),Math.abs(t.ry-component[i].ry))===1
                    && bridge(t) && bridge(t).isHighBridge()===(kind==='high')) { seen.add(t);component.push(t); }
            }
            const spanX=Math.max(...component.map(t=>t.rx))-Math.min(...component.map(t=>t.rx));
            const spanY=Math.max(...component.map(t=>t.ry))-Math.min(...component.map(t=>t.ry));
            const axis=spanX>spanY?'rx':'ry', other=axis==='rx'?'ry':'rx';
            const line=component.filter(t=>s.legal(t,true)).sort((a,b)=>a[axis]-b[axis]||a[other]-b[other]);
            s.bridgeStart=line[0]; s.bridgeEnd=line.at(-1);
            const shore = endpoint => s.tiles.filter(t=>!bridge(t)&&s.legal(t)
                &&Math.abs(t.z-endpoint.z-bridge(endpoint).tileElevation)<1
                &&Math.hypot(t.rx-endpoint.rx,t.ry-endpoint.ry)<=3)
                .sort((a,b)=>Math.hypot(a.rx-endpoint.rx,a.ry-endpoint.ry)-Math.hypot(b.rx-endpoint.rx,b.ry-endpoint.ry))[0];
            s.shoreStart=shore(s.bridgeStart); s.shoreEnd=shore(s.bridgeEnd);
            if(!s.shoreStart||!s.shoreEnd)throw Error('Missing legal bridge shore');
            s.relocate(s.shoreStart); s.move(s.bridgeEnd,true); s.move(s.shoreEnd);
            return {kind,start:[s.shoreStart.rx,s.shoreStart.ry],end:[s.shoreEnd.rx,s.shoreEnd.ry],tiles:line.length};
        }, kind);
        await fs.writeFile(`${output}/${kind}-bridge-route.json`,JSON.stringify(route,null,2));
        console.log('BRIDGE ROUTE',route);
        const travel = async (name,target) => {
            const rows=[];
            for(let i=0;i<10;i++) {
                rows.push(...await step(120,`${name}-${i}`));
                const last=rows.at(-1);
                if(last.tile.rx===target[0]&&last.tile.ry===target[1]&&!last.moving) return rows;
            }
            throw Error(`${name}: did not reach the opposite bridge endpoint`);
        };
        const outward=await travel(`${kind}-bridge-out`,route.end);
        await capture(`${kind}-bridge-end`);
        await page.evaluate(()=>{const s=window.__conscriptStates;s.move(s.bridgeStart,true);s.move(s.shoreStart);});
        const returning=await travel(`${kind}-bridge-back`,route.start);
        assert(outward.some(r=>r.moving&&r.onBridge),`${kind}: outward bridge movement`);
        assert(returning.some(r=>r.moving&&r.onBridge),`${kind}: return bridge movement`);
        assert(!outward.at(-1).onBridge&&!returning.at(-1).onBridge,`${kind}: exit to shore`);
        checks.bridges.push({route,outward:outward.filter(r=>r.moving&&r.onBridge).length,
            returning:returning.filter(r=>r.moving&&r.onBridge).length});
    }
    // Native crate effect grants the ability; native trait ticks perform cloaking.
    await page.evaluate(()=>{const s=window.__conscriptStates;s.relocate(s.flat);s.grantCloak();});
    const cloak=await step(180,'friendly-cloak');
    assert(cloak.some(r=>r.cloaked&&r.opacity===0.5&&r.visible));
    await capture('friendly-cloak');
    await page.evaluate(()=>{const s=window.__conscriptStates;s.g.changeObjectOwner(s.u,s.enemy);});
    const hostile=await step(2,'enemy-cloak');
    assert(hostile.every(r=>r.cloaked&&!r.visible));
    await capture('enemy-cloak');
    await page.evaluate(()=>{const s=window.__conscriptStates;s.u.healthTrait.inflictDamage(1,undefined,s.g);});
    const revealed=await step(2,'cloak-damage-reveal');
    assert(revealed.every(r=>!r.cloaked&&r.visible&&r.opacity===1));
    await capture('cloak-damage-reveal');
    checks.cloak={nativeCrate:true,enemyHidden:true,damageReveals:true};
    // Ground and bridge descents use the native parachute movement/landing task.
    for(const landing of ['flat','high']) {
        await page.evaluate(landing=>{const s=window.__conscriptStates;s.clear();s.spawn(s[landing],s.d.localPlayer,'E2',3,landing==='high',9);},landing);
        await capture(`paradrop-${landing}-start`);
        const rows=await step(420,`paradrop-${landing}`);
        assert(rows.some(r=>r.stance===4&&r.elevation>4));
        const last=rows.at(-1);
        assert.notEqual(last.stance,4); assert(!last.destroyed); assert(last.rendererPresent&&last.hd);
        const falling=rows.filter(r=>r.stance===4);
        assert(falling.every(r=>r.blobShadow&&!r.bodyShadow),'Descent must use the ground-anchored shadow');
        assert(Math.max(...falling.map(r=>r.blobWorldY))-Math.min(...falling.map(r=>r.blobWorldY))<0.01,
            'Parachute shadow must stay on the landing surface');
        assert.equal(last.onBridge,landing==='high');
        await capture(`paradrop-${landing}-landed`);
        checks[`paradrop-${landing}`]={start:rows[0].elevation,end:last.elevation,landed:true,
            parachuteObserved:rows.some(r=>r.parachute)};
    }
    // Real CLEG AttackTask/weapon: first release before erasure, then allow completion.
    await page.evaluate(()=>{
        const s=window.__conscriptStates;
        s.clear();
        s.victim=s.spawn(s.flat,s.enemy);
        const t=s.tiles.find(t=>t.rx===s.flat.rx+2&&t.ry===s.flat.ry&&s.legal(t));
        s.attacker=s.spawn(t,s.d.localPlayer,'CLEG');
        s.temporal(s.victim);s.focus(s.victim);
    });
    let frozen=[];
    for(let i=0;i<15&&!frozen.some(r=>r.warped);i++) frozen.push(...await step(2,`temporal-acquire-${i}`));
    assert(frozen.some(r=>r.warped&&!r.destroyed),'Native chrono weapon must acquire target');
    await capture('temporal-freeze');
    await page.evaluate(()=>{const s=window.__conscriptStates;s.attacker.unitOrderTrait.cancelAllTasks();
        s.attacker.temporalTrait.releaseCurrentTarget(s.g);});
    const released=await step(4,'temporal-release');
    assert(released.some(r=>!r.warped&&!r.destroyed&&r.opacity===1));
    await capture('temporal-released');
    await page.evaluate(()=>{const s=window.__conscriptStates;s.focus(s.attacker);s.temporal(s.victim);s.focus(s.victim);});
    const erased=await step(420,'temporal-erasure');
    assert(erased.some(r=>r.destroyed&&r.deathType===4));assert(!erased.at(-1).rendererPresent);
    checks.temporal={freeze:true,release:true,erasure:true};
    }
    // All original infantry death classifications use actual native warhead damage.
    if (process.env.M11_STATE_SECTION !== 'tail') {
    for(let type=0;type<=7;type++) {
        await page.evaluate(()=>{const s=window.__conscriptStates;s.clear();s.spawn(s.flat);});
        await capture(`death-${type}-before`);
        const warhead=await page.evaluate(type=>window.__conscriptStates.damage(type),type);
        const rows=await untilDisposed(`death-${type}`);
        assert(rows.some(r=>r.destroyed&&r.infDeathType===type));
        assert(!rows.at(-1).rendererPresent,`Death ${type} must release renderable`);
        checks.deaths.push({type,warhead,frames:[...new Set(rows.map(r=>r.frame))],
            effect:rows.some(r=>r.deathEffect),corpse:rows.some(r=>r.corpse),disposed:true});
    }
    await page.evaluate(()=>{const s=window.__conscriptStates;s.spawn(s.flat);s.chronosphere();});
    const chrono=await untilDisposed('chronosphere-organic');
    assert(chrono.every(r=>r.destroyed));assert(!chrono.at(-1).rendererPresent);
    checks.chronosphere={organicDestroyed:true,disposed:true};
    }
    await page.evaluate(()=>window.__conscriptStates.crush());
    const crushed=await untilDisposed('native-crush');
    assert(crushed.some(r=>r.destroyed&&r.deathType===3));
    checks.crush={nativeVehicleMovement:true,disposed:true};
    await page.evaluate(()=>{const s=window.__conscriptStates;s.clear();s.spawn(s.flat,s.d.localPlayer,'E2',3,false,9);});
    await step(30,'airborne-before-hit');
    await capture('airborne-before-hit');
    await page.evaluate(()=>window.__conscriptStates.damage(1));
    const airborneDeath=await untilDisposed('airborne-hit');
    assert(airborneDeath.some(r=>r.destroyed));
    checks.airborneDeath={disposed:true};
    // Destroy the actual bridge piece through damage; native domino/occupant logic owns the outcome.
    await page.evaluate(()=>{const s=window.__conscriptStates;s.spawn(s.high,s.d.localPlayer,'E2',3,true);
        const bridge=s.g.map.tileOccupation.getBridgeOnTile(s.high);s.collapseBridge=bridge;
        bridge.healthTrait.inflictDamage(bridge.healthTrait.getHitPoints(),undefined,s.g);
        s.g.destroyObject(bridge);});
    const collapse=await step(240,'bridge-collapse');
    assert(collapse.every(r=>r.destroyed));assert(!collapse.at(-1).rendererPresent);
    checks.collapse={occupantDestroyed:true,disposed:true};
    await fs.writeFile(`${output}/scenario-checks.json`,JSON.stringify(checks,null,2));
    return checks;
}
