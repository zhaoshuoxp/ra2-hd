// Inspect new neutral voxel bindings and ordinary native movement/destruction.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

export async function validateNativeNeutralVehicles(session, names, declarations, density, options = {}) {
    const { page, report, out } = session;
    const fixtureOnly = options.fixtureOnly ?? [];
    assert(fixtureOnly.every(name => name === 'CIVP' && names.includes(name))
        && (!fixtureOnly.length || report.sourcePlacementDiagnostic?.status
            === 'CONFIRMED_EXISTING_NON_NEUTRAL_MAP_OWNER_FILTER'),
    'A fixture-only actor requires an explicit independently diagnosed source placement issue');
    assert(names.length && new Set(names).size === names.length
        && names.every(name => ['WINI', 'TRUCKB', 'JEEP', 'YCAB', 'BCAB', 'AMBU', 'FTRK', 'CIVP'].includes(name)),
    'Neutral vehicle fixtures require an explicit supported original-placement subset');
    const result = report.newNativeNeutralVehicles = { cases: [],
        policy: 'Unchanged original placements and legal native vehicle fixtures. Eight graphics-only posed bearings are review controls; ordinary Move orders, native damage and destruction establish action advancement. No source, rule, geometry, camera-scale or simulation-time edits.' };
    const sample = id => page.evaluate(id => {
        const d = window.__ra2debug;
        const object = d.game.getWorld().getAllObjects().find(o => o.id === id)
            ?? (window.__allied.neutralVehicleProbe?.id === id ? window.__allied.neutralVehicleProbe : undefined);
        const r = d.renderableManager.getRenderableByGameObject(object);
        const hd = r?.unitVxlHd;
        return { ...window.__allied.sample(object), owner: object.owner.name,
            family: hd?.family.identity, active: hd?.active,
            parts: hd?.family.parts.map(p => ({ key: p.key, member: p.member,
                identity: p.override.identity, headings: p.frames.map(f => f.heading) })) };
    }, id);
    for (const name of names) {
        const expected = declarations[name].variants.find(v => v.density === density).hash;
        const originalId = await page.evaluate(({ name, fixtureOnly }) => {
            if (fixtureOnly) {
                const object = window.__allied.spawn(name, 7);
                window.__ra2debug.worldInteraction.minimapHandler.panToTile(object.tile);
                return object.id;
            }
            const object = window.__ra2debug.game.getWorld().getAllObjects()
                .find(o => o.name === name && o.isSpawned && !o.isDestroyed);
            if (!object) throw Error('Missing original neutral placement: ' + name);
            window.__ra2debug.worldInteraction.minimapHandler.panToTile(object.tile);
            return object.id;
        }, { name, fixtureOnly: fixtureOnly.includes(name) });
        await page.waitForFunction(id => {
            const d = window.__ra2debug;
            const object = d.game.getWorld().getAllObjects().find(o => o.id === id);
            return d.renderableManager.getRenderableByGameObject(object)?.unitVxlHd?.active;
        }, originalId, { timeout: 20000 });
        const record = { name, referenceKind: fixtureOnly.includes(name)
            ? 'NATIVE_ACTION_FIXTURE_NOT_ORIGINAL_MAP_PLACEMENT' : 'ORIGINAL_MAP_PLACEMENT',
            original: await sample(originalId), bearings: [] };
        result.cases.push(record);
        assert(record.original.active && record.original.family === name);
        assert(record.original.parts.every(p => p.identity.startsWith(expected + '/')));
        assert.deepEqual(record.original.parts[0].headings, [0, 45, 90, 135, 180, 225, 270, 315]);
        for (const heading of [0, 45, 90, 135, 180, 225, 270, 315]) {
            const png = await page.evaluate(({ id, heading }) => {
                const d = window.__ra2debug;
                const object = d.game.getWorld().getAllObjects().find(o => o.id === id);
                const r = d.renderableManager.getRenderableByGameObject(object);
                r.updateVxlRotation(heading, true);
                r.unitVxlHd.update();
                d.renderer.render();
                return d.renderer.renderer.domElement.toDataURL('image/png').split(',')[1];
            }, { id: originalId, heading });
            const file = `${name}-heading-${heading}-framebuffer.png`;
            await fs.writeFile(path.join(out, file), Buffer.from(png, 'base64'));
            record.bearings.push({ heading, file, rescaled: false });
        }
        const fixtureId = await page.evaluate(name => {
            const f = window.__allied;
            const object = f.neutralVehicleProbe = f.spawn(name, 7);
            window.__ra2debug.worldInteraction.minimapHandler.panToTile(object.tile);
            return object.id;
        }, name);
        await page.waitForFunction(() => window.__ra2debug.renderableManager
            .getRenderableByGameObject(window.__allied.neutralVehicleProbe)?.unitVxlHd?.active,
        undefined, { timeout: 20000 });
        record.fixture = await sample(fixtureId);
        record.moves = [];
        record.clipRecording = await session.startClip();
        for (const offset of [[4, 0], [0, 4]]) {
            const move = await page.evaluate(offset => {
                const d = window.__ra2debug, f = window.__allied, actor = f.neutralVehicleProbe;
                const destination = d.game.map.tiles.getAll().filter(t => d.game.map.isWithinBounds(t)
                    && !t.rampType && d.game.map.terrain.getPassableSpeed(t, actor.rules.speedType, false, false) > 0
                    && !d.game.map.getGroundObjectsOnTile(t).some(o => o.isTechno() || o.isTerrain()))
                    .sort((a, b) => Math.hypot(a.rx - actor.tile.rx - offset[0], a.ry - actor.tile.ry - offset[1])
                        - Math.hypot(b.rx - actor.tile.rx - offset[0], b.ry - actor.tile.ry - offset[1]))[0];
                if (!destination || destination === actor.tile) throw Error('Missing legal native Move destination');
                const before = { tick: d.game.currentTick, tile: [actor.tile.rx, actor.tile.ry] };
                f.neutralVehicleDestination = destination;
                d.actionsApi.orderUnits([actor.id], 0, destination.rx, destination.ry);
                return { before, destination: [destination.rx, destination.ry] };
            }, offset);
            await page.waitForFunction(() => window.__allied.neutralVehicleProbe.tile
                === window.__allied.neutralVehicleDestination && !window.__allied.neutralVehicleProbe.isMoving,
            undefined, { timeout: 20000 });
            move.after = await sample(fixtureId);
            assert(move.after.tick > move.before.tick && move.after.active);
            assert.notDeepEqual(move.after.tile.slice(0, 2), move.before.tile);
            record.moves.push(move);
        }
        await page.evaluate(() => {
            const d = window.__ra2debug, actor = window.__allied.neutralVehicleProbe;
            actor.healthTrait.inflictDamage(Math.floor(actor.healthTrait.maxHitPoints * .6), actor, d.game);
        });
        record.damaged = await sample(fixtureId);
        assert(record.damaged.health > 0 && record.damaged.health < 100 && record.damaged.active);
        await page.evaluate(() => {
            const d = window.__ra2debug;
            d.game.destroyObject(window.__allied.neutralVehicleProbe, { player: window.__allied.player });
        });
        record.destroyed = await sample(fixtureId);
        assert(record.destroyed.destroyed && !record.destroyed.spawned);
        record.clip = await session.stopClip(`${name}-native-move-and-destruction`);
    }
    result.status = fixtureOnly.length ? 'PASS_NATIVE_ACTION_FIXTURE_WITH_EXPLICIT_ORIGINAL_PLACEMENT_GAP'
        : 'PASS_ORIGINAL_PLACEMENTS_ALL_NATIVE_BEARINGS_MOVE_DAMAGE_AND_DESTRUCTION';
}
