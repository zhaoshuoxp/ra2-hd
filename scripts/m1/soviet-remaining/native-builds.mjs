import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

export async function exercise(page, output) {
    const report = { status: 'RUNNING', fixture: '100000 starting credits added once; unchanged costs, prerequisites, native production queues and legal placement checks', families: {}, units: {}, repairs: {}, superweapons: {} };
    const save = () => fs.writeFile(path.join(output, 'native.json'), JSON.stringify(report, null, 2));
    await page.evaluate(() => {
        const d = window.__ra2debug;
        d.localPlayer.credits += 100000;
        window.__nativeTrace = [];
        window.__nativeTimer = setInterval(() => {
            for (const u of d.localPlayer.getOwnedObjects().filter(u => u.isBuilding())) {
                const r = d.renderableManager.getRenderableByGameObject(u);
                const sample = { id: u.id, name: u.name, tick: d.game.currentTick, health: u.healthTrait.health,
                    anim: r?.currentAnimType, wall: u.wallTrait?.wallType,
                    frames: r ? [...r.animObjects].flatMap(([t, ms]) => ms.filter(m => m.get3DObject().visible).map(m => [t, m.builder.getFrame()])) : [] };
                const last = window.__nativeTrace.findLast(x => x.id === u.id);
                if (!last || last.anim !== sample.anim || JSON.stringify(last.frames) !== JSON.stringify(sample.frames)) window.__nativeTrace.push(sample);
            }
        }, 100);
        d.actionsApi.orderUnits([d.localPlayer.getOwnedObjects().find(u => u.name === 'SMCV').id], 10);
    });
    await page.waitForFunction(() => window.__ra2debug.localPlayer.getOwnedObjects().some(u => u.name === 'NACNST'));
    const names = ['NAPOWR', 'NAHAND', 'NAREFN', 'NAWEAP', 'NARADR', 'NATECH', 'NANRCT', 'NACLON', 'NAPSIS',
        'NADEPT', 'NAYARD', 'NALASR', 'NAFLAK', 'TESLA', 'NAIRON', 'NAMISL', 'NAWALL'];
    for (const name of names) {
        const row = report.families[name] = { status: 'RUNNING' };
        try {
            row.before = await page.evaluate(name => {
                const d = window.__ra2debug, rules = d.game.rules.getBuilding(name), p = d.localPlayer.production;
                const available = p.isAvailableForProduction(rules), queue = p.getQueueTypeForObject(rules);
                if (available) d.actionsApi.queueForProduction(queue, 2, name, 1);
                return { available, queue, cost: rules.cost, power: rules.power, strength: rules.strength,
                    tick: d.game.currentTick, ids: d.localPlayer.getOwnedObjects().map(u => u.id) };
            }, name);
            assert(row.before.available, `${name} not available under native prerequisites`);
            await page.waitForFunction(q => window.__ra2debug.localPlayer.production.getQueue(q).status === 3, row.before.queue, { timeout: 90000 });
            row.placement = await page.evaluate(name => {
                const d = window.__ra2debug, yard = d.localPlayer.getOwnedObjects().find(u => u.name === 'NACNST');
                const tiles = [];
                for (let x = -26; x <= 26; x++) for (let y = -26; y <= 26; y++) tiles.push({ rx: yard.tile.rx + x, ry: yard.tile.ry + y });
                tiles.sort((a, b) => Math.hypot(a.rx - yard.tile.rx, a.ry - yard.tile.ry) - Math.hypot(b.rx - yard.tile.rx, b.ry - yard.tile.ry));
                const tile = tiles.find(t => d.game.getConstructionWorker(d.localPlayer).canPlaceAt(name, t, { normalizedTile: true }));
                if (!tile) throw Error(`No legal foundation for ${name}`);
                d.actionsApi.placeBuilding(name, tile.rx, tile.ry);
                return { tile, tick: d.game.currentTick };
            }, name);
            await page.waitForFunction(({ name, ids }) => window.__ra2debug.localPlayer.getOwnedObjects().some(u => u.name === name && !ids.includes(u.id)), { name, ids: row.before.ids }, { timeout: 15000 });
            await page.waitForTimeout(1200);
            row.after = await page.evaluate(({ name, ids }) => {
                const d = window.__ra2debug, u = d.localPlayer.getOwnedObjects().find(u => u.name === name && !ids.includes(u.id));
                const r = d.renderableManager.getRenderableByGameObject(u);
                return { id: u.id, health: u.healthTrait.health, tick: d.game.currentTick, hd: !!r.mainObj?.builder.hdOverride,
                    currentAnimType: r.currentAnimType, turret: !!r.buildingTurretHd };
            }, { name, ids: row.before.ids });
            assert(row.after.hd); row.status = 'PASS_NATIVE_QUEUE_LEGAL_PLACEMENT_HD';
        } catch (error) {
            row.status = 'FAIL_NATIVE_SCENARIO'; row.reason = error.message;
            await page.evaluate(name => { const d = window.__ra2debug, r = d.game.rules.getBuilding(name); d.actionsApi.unqueueFromProduction(d.localPlayer.production.getQueueTypeForObject(r), 2, name, 1); }, name);
        }
        console.log(name, row.status); await save();
    }
    for (const [name, type, parent] of [['E2', 3, 'NACLON'], ['HTNK', 7, 'NAWEAP'], ['SUB', 7, 'NAYARD']]) {
        const row = report.units[name] = { status: 'RUNNING', parent };
        try {
            const before = await page.evaluate(({ name, type }) => {
                const d = window.__ra2debug, p = d.localPlayer.production, r = d.game.rules.getObject(name, type);
                const ids = d.localPlayer.getOwnedObjects().filter(u => u.name === name).map(u => u.id);
                d.actionsApi.queueForProduction(p.getQueueTypeForObject(r), type, name, 1); return ids;
            }, { name, type });
            await page.waitForFunction(({ name, before }) => window.__ra2debug.localPlayer.getOwnedObjects().filter(u => u.name === name && !before.includes(u.id)).length >= (name === 'E2' ? 2 : 1), { name, before }, { timeout: 90000 });
            row.produced = await page.evaluate(({ name, before }) => window.__ra2debug.localPlayer.getOwnedObjects().filter(u => u.name === name && !before.includes(u.id)).map(u => ({ id: u.id, name: u.name })), { name, before });
            row.status = name === 'E2' ? 'PASS_NATIVE_CLONING_TWO_INFANTRY' : 'PASS_NATIVE_UNIT_PRODUCTION';
        } catch (error) { row.status = 'FAIL_NATIVE_SCENARIO'; row.reason = error.message; }
        console.log(name, row.status); await save();
    }
    // Bounded event injection exercises the health transition and native repair/sale action paths.
    for (const name of ['NARADR', 'NADEPT', 'NANRCT', 'NACLON', 'NAPSIS', 'NALASR', 'NAFLAK', 'TESLA', 'NATECH', 'NAYARD']) {
        const row = report.repairs[name] = { status: 'RUNNING', damage: 'Fixture inflictDamage event; no combat claim' };
        try {
            row.damaged = await page.evaluate(name => {
                const d = window.__ra2debug, u = d.localPlayer.getOwnedObjects().find(u => u.name === name);
                window.__repairTarget = u;
                u.healthTrait.inflictDamage(Math.floor(u.healthTrait.getHitPoints() * .65), u, d.game);
                d.actionsApi.toggleRepairWrench(u.id); return u.healthTrait.health;
            }, name);
            await page.waitForFunction(() => window.__repairTarget.healthTrait.health >= 60, undefined, { timeout: 30000 });
            row.repaired = await page.evaluate(() => window.__repairTarget.healthTrait.health);
            await page.evaluate(() => window.__ra2debug.actionsApi.sellBuilding(window.__repairTarget.id));
            await page.waitForFunction(() => !window.__repairTarget.isSpawned, undefined, { timeout: 20000 });
            row.status = 'PASS_DAMAGE_EVENT_NATIVE_REPAIR_AND_SALE';
        } catch (error) { row.status = 'FAIL_NATIVE_SCENARIO'; row.reason = error.message; }
        await save();
    }
    report.trace = await page.evaluate(() => { clearInterval(window.__nativeTimer); return window.__nativeTrace; });
    const rows = [...Object.values(report.families), ...Object.values(report.units), ...Object.values(report.repairs)];
    report.status = rows.every(r => r.status.startsWith('PASS')) ? 'PASS_BOUNDED_NATIVE_PRODUCTION_REPAIR_SALE' : 'PARTIAL_NATIVE_SCENARIOS';
    report.limits = ['Starting-credit fixture', 'Defense combat and complete superweapon gameplay require human acceptance', 'Physical paused-menu cursor remains unverified'];
    await save(); return report;
}
