import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { checkRhinoStates } from './check-rhino-states.mjs';

export async function checkRhinoShadow(page, output) {
    process.env.M13G_BASELINE = '1';
    await checkRhinoStates(page, output);
    delete process.env.M13G_BASELINE;
    await page.evaluate(() => {
        const s = window.__states, hd = s.r.rhinoHd;
        s.shadowUpdate = hd.shadow.update.bind(hd.shadow);
        hd.shadow.update = (active, opacity) => s.shadowUpdate(active && !s.legacyShadow, opacity);
        s.captureShadow = (mode, enabled = true) => {
            s.legacyShadow = mode === 'before';
            const row = s.capture(enabled);
            return { ...row, shadowOpacity: hd.shadow.opacity.value,
                attenuated: hd.originalMeshes.every(m => m.customDepthMaterial === hd.shadow.material) };
        };
    });
    const captures = [];
    async function capture(label) {
        const rows = await page.evaluate(() => {
            const s = window.__states;
            return [s.captureShadow('before'), s.captureShadow('after'), s.captureShadow('before'),
                s.captureShadow('before', false), s.captureShadow('after', false)];
        });
        assert.equal(rows[0].png, rows[2].png, `${label}: baseline restoration`);
        assert.equal(rows[3].png, rows[4].png, `${label}: Original unchanged`);
        for (const row of rows) {
            assert.equal(row.glError, 0);
            assert.deepEqual(row.camera, rows[0].camera);
            assert.deepEqual(row.originalTransforms, rows[0].originalTransforms);
        }
        if (rows[1].opacity === 1) assert.equal(rows[0].png, rows[1].png, `${label}: opaque HD unchanged`);
        else {
            assert.equal(rows[1].shadowOpacity, rows[1].opacity);
            assert(rows[1].attenuated);
            assert.notEqual(rows[0].png, rows[1].png);
        }
        for (const [i, row] of rows.slice(0, 2).entries()) {
            row.file = `${label}-${i ? 'after' : 'before'}.png`;
            await fs.writeFile(`${output}/${row.file}`, Buffer.from(row.png.split(',')[1], 'base64'));
            delete row.png;
            captures.push({ ...row, label, mode: i ? 'after' : 'before' });
        }
        console.log('SHADOW', label);
    }
    await capture('normal');
    await page.evaluate(() => { const d = window.__ra2debug, s = window.__states; s.unit.warpedOutTrait.setActive(true, true, d.game); });
    await capture('warped');
    // Elevation separates the ground shadow from the translucent artwork for measurement.
    await page.evaluate(() => { const s = window.__states; s.unit.position.tileElevation = 3; s.r.setPosition(s.unit.position.worldPosition); });
    await capture('elevated-warped');
    const noShadow = await page.evaluate(() => {
        const s = window.__states, meshes = s.r.rhinoHd.originalMeshes;
        const cast = meshes.map(m => m.castShadow);
        meshes.forEach(m => m.castShadow = false);
        const row = s.captureShadow('after');
        meshes.forEach((m, i) => m.castShadow = cast[i]);
        return row;
    });
    await fs.writeFile(`${output}/elevated-no-shadow.png`, Buffer.from(noShadow.png.split(',')[1], 'base64'));
    await page.evaluate(() => {
        const d = window.__ra2debug, s = window.__states;
        s.move(s.flat); s.unit.position.tileElevation = 0; s.r.setPosition(s.unit.position.worldPosition);
        s.unit.warpedOutTrait.expire(d.game);
        const rule = [...d.game.rules.vehicleRules.values()].find(r => r.cloakable);
        const carrier = d.game.createUnitForPlayer(rule, d.localPlayer), Ctor = carrier.cloakableTrait.constructor;
        carrier.dispose();
        s.unit.cloakableTrait = new Ctor(s.unit, d.game.rules.general.cloakDelay);
        d.game.addObjectTrait(s.unit, s.unit.cloakableTrait);
        s.unit.cloakableTrait.cooldownTicks = 0;
        for (const key of Object.getOwnPropertySymbols(Ctor.prototype)) {
            if (String(Ctor.prototype[key]).includes('cooldownTicks')) Ctor.prototype[key].call(s.unit.cloakableTrait, s.unit, d.game);
        }
        if (!s.unit.cloakableTrait.isCloaked()) throw Error('Native cloak did not activate');
    });
    await capture('cloaked-own');
    await page.evaluate(() => { const s = window.__states, d = window.__ra2debug; s.unit.cloakableTrait.uncloak(d.game); });
    await capture('restored');
    await fs.writeFile(`${output}/shadow-captures.json`, JSON.stringify(captures, null, 2) + '\n');
    const lifetime = await page.evaluate(() => {
        const s = window.__states, hd = s.r.rhinoHd;
        let disposed = 0;
        hd.shadow.material.addEventListener('dispose', () => disposed++);
        hd.dispose();
        return { disposed, restored: hd.originalMeshes.every((m, i) => m.customDepthMaterial === hd.shadow.originals[i]),
            refs: [...hd.resources.parts.values()].map(p => p.references ?? p.refs) };
    });
    assert.equal(lifetime.disposed, 1); assert(lifetime.restored);
    return { status: 'PASS', captures: captures.length, originalUnchanged: true, opaqueHdUnchanged: true, lifetime };
}
