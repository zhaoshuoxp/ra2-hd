import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { NativeCampaignPilot } from './native-pilot.mjs';

const mission = process.argv[3] ?? 'sov02smd.map', pilot = new NativeCampaignPilot(process.argv[2], mission);
const names = mission === 'sov02smd.map' ? ['CALAB', 'GACSPH'] : mission === 'all01umd.map' ? ['CALAB', 'CATIME01'] : ['CATRAN03'];
let failure;
try {
    await pilot.open();
    await pilot.page.evaluate(() => {
        const d = window.__ra2debug; d.trainer.setEnabled(true);
        if (!d.trainer.send({ type: 'reveal' })) throw Error('Supported reveal rejected');
    });
    await pilot.commands.step(1, { defend: false });
    const ids = await pilot.page.evaluate(names => window.__ra2debug.game.world.getAllObjects()
        .filter(u => names.includes(u.name) && u.isSpawned && !u.isDestroyed)
        .map(u => ({ id: u.id, name: u.name, owner: u.owner.name, color: u.owner.color.asHexString() })), names);
    assert(ids.length >= names.length);
    pilot.report.inspection = [];
    for (const actor of ids) {
        await pilot.page.evaluate(id => {
            const d = window.__ra2debug, u = d.game.world.getObjectById(id), free = d.worldScene.cameraPan.freeCamera;
            const previous = free.value; free.value = true;
            try { d.worldInteraction.minimapHandler.panToTile(u.tile); } finally { free.value = previous; }
        }, actor.id);
        for (const state of [0, 1, 0]) {
            const sample = await pilot.page.evaluate(({ id, state }) => {
                const d = window.__ra2debug, g = d.game, before = g.getHash(), u = g.world.getObjectById(id);
                const r = d.renderableManager.getRenderableByGameObject(u);
                r.updateImage(state);
                const layers = [r.mainObj, ...r.animations.keys()].filter(Boolean).map(s => {
                    const b = s.builder, mesh = s.getShapeMesh();
                    return { frame: b.frameNo, offset: b.frameOffset, hd: b.hdOverride?.identity,
                        page: b.getHdPage()?.base.uuid, palette: b.palette.hash, paletteIndex: mesh?.paletteIndex,
                        paletteSize: mesh?.material?.palette?.image?.height,
                        geometry: Array.from(mesh?.geometry.getAttribute('position').array ?? []) };
                });
                if (before !== g.getHash()) throw Error('Presentation-only state inspection changed simulation');
                return { state, health: u.healthTrait.health, hash: before, layers };
            }, { id: actor.id, state });
            await pilot.page.waitForTimeout(120);
            const name = `native-${actor.name}-${actor.id}-state-${state}-${pilot.report.inspection.length}.png`;
            await pilot.page.screenshot({ path: path.join(pilot.out, name) });
            pilot.report.inspection.push({ actor, file: name, ...sample });
        }
    }
    pilot.report.status = 'PASS_NATIVE_RENDERER_HEALTH_STATE_INSPECTION_WITH_UNCHANGED_SIMULATION_DIAGNOSTIC_ONLY';
} catch (error) { failure = error; }
await pilot.finish(failure);
