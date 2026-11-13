import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { campaignSession, stepWorld } from '../m3-2/native-session.mjs';
import { reexecuteSourcePrefix } from './replay-source.mjs';

const out = path.resolve(process.argv[2]); await fs.mkdir(out, { recursive: false });
const source = JSON.parse(await fs.readFile(path.join(import.meta.dirname, 'fixtures/soviet05-charge-approach-v7.json')));
const mouse = process.argv.includes('--mouse');
const report = { status: 'RUNNING', errors: [], failedResources: [], samples: [],
    scope: 'Fresh original Soviet05, original seeds and retained ordinary player approach commands. New charging uses serialized ordinary Attack orders, without Ctrl/Shift/force attack. Actual tower health, charger state, ranged victims and original win triggers are observed. No source/rule/health/ownership/goal edits or assigned victory. This is scripted input assistance, not a physical-mouse usability claim.' };
let app, page;
if (mouse) report.scope = 'Fresh original Soviet05 from source seeds and retained ordinary approach commands. The observer selects the actual troopers, then sends a real left mouse click on the Eiffel tower without Ctrl/Shift. Actual handoff, charging, distant weapon fire and original victory remain required; no source, rule, actor-health or goal edits.';
const save = () => fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
async function sample(label) {
    const value = await page.evaluate(label => {
        const g = window.__ra2debug.game, c = g.campaign;
        const tower = g.world.getAllObjects().find(o => o.name === 'CAPARS01');
        return { label, tick: g.currentTick, result: c.result, failure: c.failure, hash: g.getHash(),
            tower: { id: tower.id, tile: [tower.tile.rx, tower.tile.ry], hp: tower.healthTrait.getHitPoints(),
                owner: tower.owner.name, range: tower.campaignMapWeaponRange, weaponRange: tower.primaryWeapon.range,
                chargers: [...tower.overpoweredTrait.chargers].map(o => o.id), powered: tower.poweredTrait.isPoweredOn(),
                target: tower.attackTrait.currentTarget?.obj?.id, task: tower.unitOrderTrait.getCurrentTask()?.constructor.name },
            acquisition: { guard: tower.guardMode, sleep: tower.campaignSleeping, disabled: tower.attackTrait.isDisabled(),
                allowed: tower.attackTrait.shouldPassiveAcquire(tower, g), passive: tower.rules.canPassiveAquire,
                neutral: tower.owner.isNeutral, controller: tower.owner.campaignController?.name,
                opportunity: tower.attackTrait.opportunityFireTask?.target?.obj?.id },
            french: c.houses.get('BadGuy1 House').getOwnedObjects(true).filter(o => o.isUnit() && !o.isDestroyed)
                .map(o => ({ id: o.id, name: o.name, hp: o.healthTrait.getHitPoints(),
                    distance: Math.hypot(o.tile.rx - tower.tile.rx, o.tile.ry - tower.tile.ry) })),
            chargers: (g.localPlayer.campaignControlledPlayers ?? [g.localPlayer]).flatMap(p => p.getOwnedObjects())
                .filter(o => o.name === 'SHK' && o.isSpawned && !o.isDestroyed).map(o => ({ id: o.id,
                    tile: [o.tile.rx, o.tile.ry], target: o.attackTrait.currentTarget?.obj?.id,
                    tasks: o.unitOrderTrait.getTasks().map(t => t.constructor.name) })),
            trace: c.trace.slice(-30) };
    }, label); report.samples.push(value); await save(); return value;
}
try {
    ({ app, page } = await campaignSession(out, report, { density: 2 }));
    report.approach = await reexecuteSourcePrefix(page, source, 'original-tower-perimeter-combat');
    const before = await sample('before-normal-charge-orders');
    report.orders = await page.evaluate(mouse => {
        const d = window.__ra2debug, g = d.game, tower = g.world.getAllObjects().find(o => o.name === 'CAPARS01');
        window.__observedEiffelShots = [];
        const fire = tower.primaryWeapon.fire.bind(tower.primaryWeapon);
        tower.primaryWeapon.fire = function(target, ...args) {
            window.__observedEiffelShots.push({ tick: g.currentTick, target: target.obj?.id,
                distance: target.obj && Math.hypot(target.obj.tile.rx - tower.tile.rx, target.obj.tile.ry - tower.tile.ry),
                damage: this.rules.damage, rof: this.rules.rof });
            return fire(target, ...args);
        };
        const troops = (g.localPlayer.campaignControlledPlayers ?? [g.localPlayer]).flatMap(p => p.getOwnedObjects())
            .filter(o => o.name === 'SHK' && o.isSpawned && !o.isDestroyed)
            .sort((a, b) => Math.hypot(a.tile.rx-tower.tile.rx,a.tile.ry-tower.tile.ry)-Math.hypot(b.tile.rx-tower.tile.rx,b.tile.ry-tower.tile.ry)).slice(0, 4);
        const orders = troops.map(unit => ({ id: unit.id, owner: unit.owner.name,
            weapon: unit.attackTrait.selectWeaponVersus(unit, tower, g, false, false)?.rules.name }));
        if (mouse) {
            const selection = g.getUnitSelection(); selection.deselectAll(); troops.forEach(o => selection.addToSelection(o));
        } else d.actionsApi.orderUnits(troops.map(o => o.id), 2, tower.id);
        d.worldInteraction.minimapHandler.panToTile(tower.centerTile); d.gameScreen.pointer.unlock(true);
        return orders;
    }, mouse);
    assert(report.orders.length >= 2); assert(report.orders.every(o => o.weapon === 'AssaultBolt'), JSON.stringify(report.orders));
    if (mouse) {
        await page.waitForTimeout(250);
        const point = await page.evaluate(() => {
            const d = window.__ra2debug, tower = d.game.world.getAllObjects().find(o => o.name === 'CAPARS01'), tile = tower.centerTile;
            const vector = new window.THREE.Vector3((tile.rx + .5) * 256,
                tile.z * 128 * Math.cos(Math.PI / 4) / Math.cos(Math.PI / 6), (tile.ry + .5) * 256).project(d.worldScene.camera);
            const v = d.worldScene.viewport, canvas = d.renderer.getCanvas(), rect = canvas.getBoundingClientRect();
            return { x: rect.left + (v.x + (vector.x + 1) * v.width / 2) * rect.width / Number(canvas.dataset.logicalWidth),
                y: rect.top + (v.y + (1 - vector.y) * v.height / 2) * rect.height / Number(canvas.dataset.logicalHeight) - 8 };
        });
        await page.mouse.move(point.x, point.y); await page.waitForTimeout(400);
        await page.screenshot({ path: path.join(out, 'native-eiffel-ordinary-pointer-before-click.png') });
        await page.mouse.click(point.x, point.y, { button: 'left', delay: 35 });
        report.actualPointerInput = { button: 'left', modifiers: [], selected: report.orders.map(o => o.id), point };
    }
    let charged;
    for (let i = 0; i < 12; i++) { await stepWorld(page, 60); charged = await sample('normal-charge-' + i);
        assert(!charged.failure); assert.equal(charged.tower.hp, before.tower.hp, 'Charging must not inflict tower damage');
        if (charged.tower.powered && charged.tower.chargers.length >= 2) break;
    }
    assert(charged.tower.powered && charged.tower.chargers.length >= 2);
    assert(charged.tower.range > charged.tower.weaponRange);
    report.chargedProbe = await page.evaluate(() => {
        const g = window.__ra2debug.game, tower = g.world.getAllObjects().find(o => o.name === 'CAPARS01');
        const attack = tower.attackTrait, weapon = tower.overpoweredTrait.getWeapon();
        const enemy = g.campaign.houses.get('BadGuy1 House').getOwnedObjects(true).find(o => o.isUnit() && !o.isDestroyed && o.isSpawned);
        const acquired = attack.scanForTarget(tower, weapon, g);
        return { ownerAi: tower.owner.isAi, chargingVersion: tower.owner.campaignChargingVersion, weapon: weapon?.rules.name,
            range: attack.rangeHelper.computeWeaponRangeVsTarget(tower, enemy, weapon, g.rules),
            acquired: acquired.target?.id, available: attack.getAvailableWeapons(tower, true, false).map(w => w.rules.name),
            enemy: { id: enemy.id, name: enemy.name, neutral: enemy.owner.isNeutral, friendly: g.areFriendly(tower, enemy),
                fromController: g.areFriendly({ owner: tower.owner.campaignController }, enemy),
                weaponTarget: !!attack.selectWeaponFromList(tower, enemy, enemy.tile, [weapon], g, false, true, true),
                range: attack.rangeHelper.isInWeaponRange(tower, enemy, weapon, g.rules) },
            disabled: attack.isDisabled(), cooldown: attack.passiveScanCooldownTicks, attackState: attack.attackState,
            taskCount: tower.unitOrderTrait.getTasks().length, scan: attack.scanTechnosAround(tower, 200, g).length };
    }); await save();
    await page.screenshot({ path: path.join(out, 'native-normal-charged-eiffel.png') });
    for (let i = 0; i < 100 && !charged.result; i++) { await stepWorld(page, 150); charged = await sample('whole-map-combat-' + i); }
    assert.equal(charged.result, 'victory', 'The original French-unit goal must actually fire');
    report.distantVictims = before.french.filter(o => o.distance > before.tower.weaponRange + 2
        && !charged.french.some(alive => alive.id === o.id));
    assert(report.distantVictims.length > 0, 'Observe original enemies beyond retail weapon range');
    report.originalWinTrigger = await page.evaluate(() => {
        const c = window.__ra2debug.game.campaign; return ['0897D490', '0AD6A15C', '08AB8750', '0CB2164C', '0A67AC6C']
            .map(id => ({ id, fired: c.machine.states.get(id).fired }));
    });
    assert(report.originalWinTrigger.every(s => s.fired > 0));
    report.realWeaponShots = await page.evaluate(() => window.__observedEiffelShots);
    assert(report.realWeaponShots.some(shot => shot.distance > 22));
    await page.evaluate(() => { const d = window.__ra2debug;
        window.__eiffelClock = d.game.campaign.playTime; window.__eiffelSimulationMs = d.game.currentTime;
        const m = d.gameScreen.gameTurnMgr;
        m.setPaused(false); m.setCampaignPaused(false); m.doGameTurn(performance.now()); });
    await page.waitForSelector('[data-campaign-result=victory][data-score-phase=complete]', { timeout: 120000 });
    const clock = await page.evaluate(() => ({ physicalMs: window.__eiffelClock.elapsedMs, simulationMs: window.__eiffelSimulationMs }));
    const actualTime = await page.locator('[data-score-time="GUI:YourTime"]').innerText();
    const seconds = Math.floor(clock.physicalMs / 1000);
    assert.equal(actualTime, [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60].map(n => String(n).padStart(2, '0')).join(':'));
    report.scoreClock = { ...clock, actualTime }; await page.screenshot({ path: path.join(out, 'native-eiffel-source-victory-and-physical-time.png') });
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []);
    report.status = 'PASS_NATIVE_NORMAL_CHARGING_NO_DAMAGE_MAP_WIDE_COMBAT_AND_ORIGINAL_VICTORY';
} catch (error) { report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1;
    if (page) { report.body = await page.locator('body').innerText().catch(() => ''); await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {}); }
} finally { await save(); await app?.close(); }
console.log(JSON.stringify({ status: report.status, error: report.error, out }));
