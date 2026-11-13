import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { NativeCampaignPilot } from './native-pilot.mjs';

const pilot = new NativeCampaignPilot(process.argv[2], 'all02umd.map');
let failure;
try {
    await pilot.open();
    pilot.report.scope = 'Exact legitimate original Allied02 paid-prism checkpoint, supported reveal and protection, ordinary attacks on a source grinder. Real trigger-generated crates and native Prism lighting are observed without actor, owner, health, rule, trigger or result edits. Modified-play regression.';
    await pilot.page.evaluate(() => {
        const d = window.__ra2debug, g = d.game; d.trainer.setEnabled(true);
        for (const command of [{ type: 'reveal' }, { type: 'protect', targets: g.localPlayer.getOwnedObjects()
            .filter(u => u.isTechno() && u.isSpawned && !u.isDestroyed) }])
            if (!d.trainer.send(command)) throw Error('Supported crate review assistance rejected');
        const generator = g.crateGeneratorTrait, original = generator.spawnCrateAt;
        window.__sourceGeneratedCrates = [];
        generator.spawnCrateAt = function (...args) {
            const crate = original.apply(this, args);
            if (crate) window.__sourceGeneratedCrates.push({ tick: g.currentTick, id: crate.id,
                name: crate.name, tile: [crate.tile.rx, crate.tile.ry] });
            return crate;
        };
    });
    await pilot.commands.step(1, { defend: false });
    pilot.report.lighting = await pilot.page.evaluate(() => {
        const d = window.__ra2debug, g = d.game, hash = g.getHash();
        const samples = g.localPlayer.getOwnedObjects().filter(u => u.name === 'SREF' && u.isSpawned && !u.isDestroyed)
            .map(u => { const r = d.renderableManager.getRenderableByGameObject(u), hd = r?.unitVxlHd;
                return { id: u.id, tile: [u.tile.rx, u.tile.ry], direction: u.direction,
                    reference: hd?.baseLight?.toArray(), current: r?.shpExtraLight?.toArray(),
                    applied: hd?.light?.toArray(), family: hd?.family?.identity, active: hd?.active,
                    referenceScope: 'The authored reference uses map-wide ambient; the current multiplier retains current local lighting.' }; });
        if (g.getHash() !== hash) throw Error('Read-only lighting inspection changed simulation');
        return samples;
    });
    const target = await pilot.page.evaluate(() => {
        const g = window.__ra2debug.game, u = g.world.getAllObjects().filter(u => u.name === 'YAGRND' && u.isSpawned && !u.isDestroyed)
            .sort((a, b) => Math.hypot(a.tile.rx-128, a.tile.ry-78)-Math.hypot(b.tile.rx-128, b.tile.ry-78))[0];
        if (!u) throw Error('Original grinder absent'); return { id: u.id, tile: [u.tile.rx, u.tile.ry], tag: u.tag?.id };
    });
    pilot.report.grinder = target;
    await pilot.page.evaluate(id => { window.__sourceCrateGrinderId = id; }, target.id);
    await pilot.commands.order(['SREF'], 2, target.id);
    for (let i = 0; i < 160; i++) {
        await pilot.commands.step(60, { defend: false });
        const crates = await pilot.page.evaluate(() => window.__sourceGeneratedCrates);
        if (crates.length) break;
    }
    pilot.report.crates = await pilot.page.evaluate(() => {
        const d = window.__ra2debug, g = d.game;
        return window.__sourceGeneratedCrates.map(s => { const o = g.world.getObjectById(s.id);
            return { ...s, exists: !!o, hd: o && d.mapRenderable.overlayLayer.getObjectHdBinding(o),
                sourceActions: g.campaign.trace.filter(t => t.opcode === 108),
                destroyedGrinder: !g.world.hasObjectId(window.__sourceCrateGrinderId) }; });
    });
    assert(pilot.report.crates.length, 'An original destruction trigger must create a real crate');
    assert(pilot.report.crates.some(c => c.exists && c.hd), 'The source-generated crate must bind HD on its first observation');
    for (const crate of pilot.report.crates.filter(c => c.exists)) {
        await pilot.page.evaluate(tile => { const d = window.__ra2debug, t = d.game.map.tiles.getByMapCoords(...tile);
            const free = d.worldScene.cameraPan.freeCamera, before = free.value; free.value = true;
            try { d.worldInteraction.minimapHandler.panToTile(t); } finally { free.value = before; }
        }, crate.tile);
        await pilot.page.waitForTimeout(150);
        await pilot.page.screenshot({ path: path.join(pilot.out, `native-source-generated-crate-${crate.id}.png`) });
    }
    const references = pilot.report.lighting.filter(s => s.reference);
    assert(references.length >= 2, 'Observe at least two real native Prism actors');
    for (const sample of references) assert.deepEqual(sample.reference, references[0].reference);
    pilot.report.status = 'PASS_NATIVE_ORIGINAL_DESTRUCTION_TRIGGER_HD_CRATE_AND_COMMON_PRISM_AUTHORED_LIGHT_REFERENCE';
} catch (error) { failure = error; }
await pilot.finish(failure);
