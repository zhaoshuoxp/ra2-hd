import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { NativeCampaignPilot } from './native-pilot.mjs';

const pilot = new NativeCampaignPilot(process.argv[2], 'sov07tmd.map');
const density = Number(process.argv.find(value => value.startsWith('--density='))?.slice(10) ?? 4);
const expectedFamily = process.argv.find(value => value.startsWith('--expected-family='))?.slice(18);
const expectedMemberHash = expectedFamily && createHash('sha256').update(await fs.readFile(
    `.local/campaign/yr/sov07tmd/${expectedFamily}-member.json`)).digest('hex');
let failure;
try {
    await pilot.open();
    pilot.report.scope = 'Exact legitimate post-nuclear original Soviet07 checkpoint, ordinary visible Kirov attack and real-time native rendering through castle destruction and the original victory. No diagnostic reveal, actor, owner, health, clock, source or objective edits.';
    const target = await pilot.page.evaluate(() => {
        const d = window.__ra2debug, g = d.game;
        const castle = g.world.getAllObjects().find(unit => unit.name === 'CATRAN03' && !unit.isDestroyed);
        if (!castle) throw Error('Original surviving castle is required');
        d.gameScreen.pointer.unlock(true); d.worldInteraction.minimapHandler.panToTile(castle.tile);
        window.__combatCastle = castle; window.__combatGame = g;
        return { id: castle.id, tile: [castle.tile.rx, castle.tile.ry], health: castle.healthTrait.health };
    });
    pilot.report.castleBefore = target;
    await pilot.commands.order(['ZEP'], 2, target.id);
    await pilot.page.evaluate(() => {
        const manager = window.__ra2debug.gameScreen.gameTurnMgr;
        manager.setCampaignPaused(false); manager.setPaused(false);
    });
    const start = Date.now(), frames = new Set();
    let seen = false, ended = false;
    pilot.report.realTimeSamples = [];
    while (Date.now() - start < 240000) {
        const sample = await pilot.page.evaluate(() => {
            const d = window.__ra2debug, g = window.__combatGame, castle = window.__combatCastle;
            if (!d.game) return { tick: g.currentTick, result: g.campaign.result, animations: 0, gl: 0,
                disposedAfterEnding: true, castleDestroyed: castle.isDestroyed };
            const animations = d.renderableManager?.getRenderableContainer().getChildren()
                .filter(child => child.name === 'CATR03DM') ?? [];
            const animation = animations[0], model = animation?.mainObj;
            const hd = model?.builder.hdOverride, page = model?.builder.getHdPage?.();
            const frame = model?.builder.getFrame(), sample = hd?.frames[frame]?.sampleRect;
            const logical = model?.builder.getSpriteGeometryOptions(frame).logicalSize;
            return { tick: g.currentTick, hash: g.getHash(), result: g.campaign.result,
                castleDestroyed: castle.isDestroyed, health: castle.healthTrait.health,
                animations: animations.length, frame: model?.builder.getFrame(),
                identity: hd?.identity, density: sample && sample.width / logical.width, gpuPage: !!page,
                material: model?.getShapeMesh().material.type, gl: d.renderer.renderer.getContext().getError(),
                props: animation?.getAnimProps(), gameSpeed: animation?.gameSpeed.value };
        });
        pilot.report.realTimeSamples.push(sample);
        assert(sample.animations <= 1); assert.equal(sample.gl, 0);
        if (sample.animations) {
            seen = true; assert(sample.castleDestroyed);
            assert(sample.identity?.includes('/5ee66ed709ace84da29643d01f4bf279fce9c75253e50f85c01a27532aa62283/TEMPERATE/'));
            if (expectedMemberHash) assert(sample.identity.includes(expectedMemberHash), 'The frozen app must publish the expected coherent animation');
            assert.equal(sample.density, density); assert(sample.gpuPage);
            assert.equal(sample.material, 'HdSpriteMaterial');
            const band = Math.floor(sample.frame / 15);
            if (!frames.has(band)) {
                frames.add(band);
                await pilot.page.screenshot({ path: path.join(pilot.out, `native-combat-collapse-${String(sample.frame).padStart(2, '0')}.png`) });
            }
        } else if (seen) ended = true;
        if (sample.result && ended) break;
        if (pilot.report.realTimeSamples.length % 20 === 0)
            await fs.writeFile(path.join(pilot.out, 'combat-progress.json'), JSON.stringify(pilot.report, null, 2) + '\n');
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    const state = await pilot.page.evaluate(() => {
        const g = window.__combatGame;
        return { tick: g.currentTick, result: g.campaign.result, sourceTrace: g.campaign.trace,
            journal: g.campaign.journal.commands, sourceIdentity: g.campaign.launch };
    });
    pilot.report.completedSource = state;
    pilot.report.expectedAnimationMember = expectedMemberHash && { family:expectedFamily, sha256:expectedMemberHash };
    await pilot.page.screenshot({ path: path.join(pilot.out, 'native-source-victory-ending.png') });
    pilot.commands = undefined;
    assert(seen, 'Actual original castle destruction must create its native collapse');
    assert(ended, 'The native transient must leave the world during normal ending flow');
    const lastAnimated = pilot.report.realTimeSamples.findLastIndex(sample => sample.animations);
    const cleared = pilot.report.realTimeSamples.slice(lastAnimated+1).find(sample => !sample.animations);
    pilot.report.animationBoundary = cleared.disposedAfterEnding
        ? 'Scene disposal clears the remaining native collapse. Complete frame registration is qualified separately.'
        : 'The native collapse reaches its animation-clock removal while the result world is still present; source simulation stays ended. All original frame geometry is qualified separately.';
    assert.equal(state.result, 'victory');
    assert.deepEqual(pilot.report.errors, []); assert.deepEqual(pilot.report.failedResources, []);
    pilot.report.status = 'PASS_NATIVE_REAL_COMBAT_CASTLE_DESTRUCTION_HD_COLLAPSE_AND_ORIGINAL_VICTORY';
} catch (error) { failure = error; }
await pilot.finish(failure);
