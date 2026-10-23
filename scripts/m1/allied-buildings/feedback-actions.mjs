import path from 'node:path';
import assert from 'node:assert/strict';

export async function feedbackActions(page, output, fire) {
    const report = { construction: [], powers: [], boundary: 'Legal placement fixture; controlled construction samples. Remaining charge is preset once, then native countdown, actions and effects run without trainer modifiers.' };
    await page.evaluate(() => window.__ra2debug.gameScreen.gameAnimationLoop.stop());
    for (const fraction of [0, .2, .5, 1]) {
        const sample = await page.evaluate(fraction => {
            const d = window.__ra2debug;
            return window.__alliedFixtures.filter(f => ['GTGCAN', 'GAPILL', 'GAAIRC', 'GAWEAT'].includes(f.name)).map(f => {
                const u = d.localPlayer.getOwnedObjects().find(u => u.id === f.id);
                const r = d.renderableManager.getRenderableByGameObject(u);
                r.setAnimation(5, 0);
                const object = r.animObjects.get(5)[0], a = r.animations.get(object), p = a.props;
                const frame = p.start + Math.round((p.loopEnd - p.start) * fraction);
                a.start(0); a.update((frame - p.start) / (p.rate * a.speed.value) * 1000 + 1);
                object.setFrame(a.getCurrentFrame());
                return { name: f.name, frame, actual: object.builder.getFrame(), hd: object.builder.hdOverride?.identity };
            });
        }, fraction);
        assert(sample.every(s => s.hd && s.frame === s.actual));
        await page.evaluate(() => {
            const d = window.__ra2debug;
            for (const s of d.renderer.getScenes()) { s.scene.updateMatrixWorld(false); s.meshBatchManager?.updateMeshes(); }
            d.renderer.render();
        });
        const screenshot = `construction-${Math.round(fraction * 100)}.png`;
        await page.screenshot({ path: path.join(output, screenshot) });
        report.construction.push({ fraction, sample, screenshot });
    }
    await page.evaluate(() => {
        const d = window.__ra2debug;
        for (const f of window.__alliedFixtures) {
            const u = d.localPlayer.getOwnedObjects().find(u => u.id === f.id);
            d.renderableManager.getRenderableByGameObject(u).setAnimation(0, 0);
        }
        d.gameScreen.gameAnimationLoop.start();
    });
    if (!fire) return report;
    report.setup = await page.evaluate(() => {
        const d = window.__ra2debug, g = d.game, p = d.localPlayer;
        if (p.powerTrait.isLowPower()) throw Error('Natural power supply is insufficient');
        window.__powerTrace = { transitions: [], events: [] };
        const dispatch = g.events.dispatch.bind(g.events);
        g.events.dispatch = event => {
            if ([52, 53, 54, 55].includes(event.type)) window.__powerTrace.events.push({ type: event.type, tick: g.currentTick });
            return dispatch(event);
        };
        const powers = [];
        for (const name of ['GACSPH', 'GAWEAT']) {
            const u = p.getOwnedObjects().find(u => u.name === name), r = d.renderableManager.getRenderableByGameObject(u);
            const set = r.setAnimation.bind(r);
            r.setAnimation = (type, clock) => {
                window.__powerTrace.transitions.push({ name, type, tick: g.currentTick });
                return set(type, clock);
            };
            const sw = u.superWeaponTrait.getSuperWeapon(u);
            sw.chargeTicks = 120; sw.resumeTimer();
            powers.push({ name, type: sw.rules.type, remainingTicks: sw.chargeTicks, originalRechargeTicks: sw.rechargeTicks });
        }
        return { powers, lowPower: p.powerTrait.isLowPower(), trainerUsed: false };
    });
    await page.waitForFunction(() => ['GACSPH', 'GAWEAT'].every(name => {
        const d = window.__ra2debug, u = d.localPlayer.getOwnedObjects().find(u => u.name === name);
        return u.superWeaponTrait.getSuperWeapon(u).status === 2 && d.renderableManager.getRenderableByGameObject(u).currentAnimType === 11;
    }), undefined, { timeout: 20000 });
    report.ready = await page.evaluate(() => ['GACSPH', 'GAWEAT'].map(name => {
        const d = window.__ra2debug, u = d.localPlayer.getOwnedObjects().find(u => u.name === name);
        const r = d.renderableManager.getRenderableByGameObject(u), object = r.animObjects.get(4)[2];
        return { name, type: r.currentAnimType, frame: object.builder.getFrame(), visible: object.get3DObject().visible,
            hd: object.builder.hdOverride?.identity, ready: u.superWeaponTrait.getSuperWeapon(u).status === 2 };
    }));
    assert(report.ready.every(r => r.hd && r.visible && r.ready));
    await page.screenshot({ path: path.join(output, 'native-ready-effects.png') });
    report.chrono = await page.evaluate(() => {
        const d = window.__ra2debug, g = d.game, p = d.localPlayer;
        const unit = p.getOwnedObjects().find(u => u.name === 'TTNK'), rules = unit.rules;
        const target = g.map.tiles.getAll().find(t => g.map.isWithinBounds(t) && Math.hypot(t.rx-unit.tile.rx,t.ry-unit.tile.ry) > 12
            && Math.hypot(t.rx-unit.tile.rx,t.ry-unit.tile.ry) < 16 && !g.map.getGroundObjectsOnTile(t).length
            && g.map.terrain.getPassableSpeed(t,rules.speedType,false,false)>0);
        if (!target) throw Error('Missing legal Chronosphere destination');
        window.__chronoFixture = { id: unit.id, before: [unit.tile.rx,unit.tile.ry], target: [target.rx,target.ry] };
        d.actionsApi.activateSuperWeapon(3, unit.tile, target);
        return window.__chronoFixture;
    });
    await page.waitForFunction(() => {
        const d=window.__ra2debug,f=window.__chronoFixture,u=d.localPlayer.getOwnedObjects().find(u=>u.id===f.id);
        return u && !u.warpedOutTrait.isActive() && u.tile.rx===f.target[0] && u.tile.ry===f.target[1];
    }, undefined, { timeout: 20000 });
    report.chrono.teleported = true;
    await page.screenshot({ path: path.join(output, 'native-chrono-complete.png') });
    report.weather = await page.evaluate(() => {
        const d=window.__ra2debug,g=d.game,p=d.localPlayer;
        const base=p.getOwnedObjects().find(u=>u.name==='GAWEAT');
        const target=g.map.tiles.getAll().find(t=>g.map.isWithinBounds(t)
            && Math.hypot(t.rx-base.tile.rx,t.ry-base.tile.ry)>18 && Math.hypot(t.rx-base.tile.rx,t.ry-base.tile.ry)<22
            && !p.getOwnedObjects().some(u=>u.isTechno() && Math.hypot(u.tile.rx-t.rx,u.tile.ry-t.ry)<15));
        if(!target)throw Error('Missing isolated weather target');
        d.worldInteraction.minimapHandler.panToTile(target);
        d.actionsApi.activateSuperWeapon(2,target);
        return {target:[target.rx,target.ry]};
    });
    await page.waitForFunction(() => window.__powerTrace.events.some(e=>e.type===55), undefined, { timeout: 25000 });
    await page.screenshot({ path: path.join(output, 'native-weather-clouds.png') });
    report.weather.cloudsTriggered = true;
    await page.waitForFunction(() => {
        const d=window.__ra2debug,trait=d.game.traits.getAll().find(t=>typeof t.hasActiveEffect==='function');
        return !trait.hasActiveEffect(2,d.localPlayer) && ['GACSPH','GAWEAT'].every(name=>{
            const u=d.localPlayer.getOwnedObjects().find(u=>u.name===name);
            return d.renderableManager.getRenderableByGameObject(u).currentAnimType===0;
        });
    }, undefined, { timeout: 50000 });
    report.trace = await page.evaluate(() => window.__powerTrace);
    for(const name of ['GACSPH','GAWEAT']) {
        const types=report.trace.transitions.filter(t=>t.name===name).map(t=>t.type);
        assert([10,11,12,0].every(t=>types.includes(t)), `${name} missing native transition: ${types}`);
    }
    report.status='PASS_NATIVE_CHARGE_FIRE_CLOSE';
    return report;
}
