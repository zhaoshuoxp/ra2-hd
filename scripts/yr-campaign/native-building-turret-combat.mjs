import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { NativeCampaignPilot } from './native-pilot.mjs';

const pilot = new NativeCampaignPilot(process.argv[2], 'sov05umd.map');
const density = Number(process.argv.find(value => value.startsWith('--density='))?.slice(10) ?? 4);
assert([2, 4].includes(density));
let failure;
try {
    await pilot.open();
    pilot.report.scope = 'Exact legitimate original Soviet05 checkpoint and an ordinary visible Kirov attack on an original Yuri bust. Real-time native rendering observes original health loss, destruction and retained rubble. No source, rules, actor, owner, health, facing, tick, RNG, objectives or result edits. The stored source interpreter policy is retained.';
    const before = await pilot.page.evaluate(() => {
        const d = window.__ra2debug, g = d.game, shroud = g.mapShroudTrait.getPlayerShroud(g.localPlayer);
        const attackers = g.localPlayer.getOwnedObjects().filter(unit => unit.name === 'ZEP' && unit.isSpawned && !unit.isDestroyed);
        if (!attackers.length) throw Error('The legitimate source checkpoint needs an original paid Kirov');
        const visible = g.world.getAllObjects().filter(unit => unit.name === 'CAEAST02' && unit.isSpawned && !unit.isDestroyed
            && !g.areFriendly(unit, { owner: g.localPlayer }) && g.map.tileOccupation.calculateTilesForGameObject(unit.tile, unit)
                .some(tile => !shroud.isShrouded(tile, unit.tileElevation)));
        visible.sort((a, b) => Math.hypot(a.tile.rx - attackers[0].tile.rx, a.tile.ry - attackers[0].tile.ry)
            - Math.hypot(b.tile.rx - attackers[0].tile.rx, b.tile.ry - attackers[0].tile.ry));
        const target = visible[0]; if (!target) throw Error('No original bust is visible to the source army');
        const r = d.renderableManager.getRenderableByGameObject(target);
        window.__turretCombatActor = target; window.__turretCombatGame = g;
        d.gameScreen.pointer.unlock(true); d.worldInteraction.minimapHandler.panToTile(target.tile);
        return { target: target.id, attacker: attackers[0].id, health: target.healthTrait.health,
            tile: [target.tile.rx, target.tile.ry], turretDensity: r.buildingTurretHd?.resources.density,
            bodyHd: !!r.mainObj.builder.getHdPage(), source: g.campaign.launch };
    });
    assert(before.bodyHd); assert.equal(before.turretDensity, density); pilot.report.before = before;
    await pilot.page.screenshot({ path: path.join(pilot.out, 'native-combat-before.png') });
    await pilot.commands.order([before.attacker], 2, before.target);
    await pilot.page.evaluate(() => {
        const s = window.__ra2debug.gameScreen; s.gameTurnMgr.setCampaignPaused(false);
        s.gameTurnMgr.setPaused(false); s.gameAnimationLoop.start();
    });
    pilot.report.combatSamples = []; const start = Date.now(); let previousHealth = before.health;
    while (Date.now() - start < 240000) {
        const sample = await pilot.page.evaluate(() => {
            const d = window.__ra2debug, g = window.__turretCombatGame, actor = window.__turretCombatActor;
            const r = d.renderableManager?.getRenderableByGameObject(actor), rubble = r?.rubbleObj;
            const frame = rubble?.builder?.getFrame(), page = rubble?.builder?.getHdPage?.();
            const sample = rubble?.builder?.hdOverride?.frames[frame + rubble.builder.frameOffset]?.sampleRect;
            const logical = rubble?.builder?.getSpriteGeometryOptions(frame).logicalSize;
            return { tick: g.currentTick, health: actor.healthTrait.health, destroyed: actor.isDestroyed,
                result: g.campaign.result, turretVisible: r?.turret?.visible,
                activeHdTurret: !!r?.buildingTurretHd, bodyVisible: r?.mainObj?.get3DObject().visible,
                rubbleVisible: rubble?.get3DObject().visible, rubbleFrame: frame, rubbleGpu: !!page,
                rubbleDensity: sample && sample.width / logical.width,
                glError: d.renderer?.renderer.getContext().getError() };
        });
        pilot.report.combatSamples.push(sample); assert.equal(sample.glError, 0);
        if (sample.health !== previousHealth) {
            await pilot.page.screenshot({ path: path.join(pilot.out, `native-combat-health-${sample.health}.png`) });
            previousHealth = sample.health;
        }
        if (sample.destroyed && sample.rubbleVisible) {
            assert.equal(sample.health, 0); assert.equal(sample.turretVisible, false); assert.equal(sample.bodyVisible, false);
            assert(sample.rubbleGpu); assert.equal(sample.rubbleDensity, density); pilot.report.destroyed = sample; break;
        }
        assert(!sample.result, 'The independent art combat must precede the source ending');
        if (pilot.report.combatSamples.length % 20 === 0)
            await fs.writeFile(path.join(pilot.out, 'combat-progress.json'), JSON.stringify(pilot.report, null, 2) + '\n');
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    await pilot.page.evaluate(() => {
        const manager = window.__ra2debug.gameScreen.gameTurnMgr; manager.setCampaignPaused(true); manager.setPaused(true);
    });
    assert(pilot.report.destroyed, 'The ordinary original source attack must create retained native rubble');
    await pilot.checkpoint('original-bust-destruction-checkpoint.json');
    pilot.report.programCompilation = await pilot.page.evaluate(() => window.__programLifetime);
    assert(pilot.report.programCompilation.every(span => span.finished && span.materials.every(material => !material.disposals.length)));
    pilot.report.status = 'PASS_NATIVE_ORDINARY_SOURCE_ATTACK_COMPLETE_HD_BUST_DESTRUCTION_AND_RUBBLE';
} catch (error) { failure = error; }
await pilot.finish(failure);
