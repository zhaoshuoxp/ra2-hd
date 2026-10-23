import { resourceRoot, retailMember } from '../test-support/resources';
import { test, expect } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import { registerHdResources } from '../../desktop/hd-profile.mjs';
import { createHash } from 'node:crypto';
import { GraphicsOptions } from '../../src/gui/screen/options/GraphicsOptions';
import { heading, supported, partKeys } from '../../src/engine/renderable/rhino/contract';
import { RhinoMaterial, colorDelta } from '../../src/engine/renderable/rhino/RhinoMaterial';
import { manifestHash } from '../../src/engine/renderable/rhino/identity';

test('Rhino follows default-on global HD preference and persists explicit off', () => {
    const options = new GraphicsOptions();
    expect(options.rhinoHd.value).toBe(true);
    options.unserialize('1,2,,4k'); expect(options.rhinoHd.value).toBe(true);
    options.hdEnabled.value = false;
    expect(new GraphicsOptions().unserialize(options.serialize()).rhinoHd.value).toBe(false);
    options.unserialize('1,2,,4k,garbage'); expect(options.rhinoHd.value).toBe(true);
});
test('native Rhino render states are supported without mutating gameplay', () => {
    const unit = { name: 'HTNK', direction: 23, turretTrait: { facing: 270 }, isFiring: true, spinVelocity: 6 };
    const before = JSON.stringify(unit);
    expect(supported(unit)).toBe(true); expect(heading(unit.direction)).toBe(45);
    expect(JSON.stringify(unit)).toBe(before);
    for (const patch of [{ isDestroyed: true }, { onBridge: true }, { tileElevation: 1 },
        { tile: { rampType: 1 } }, { cloakableTrait: { isCloaked: () => true } },
        { warpedOutTrait: { isActive: () => true } }, { invulnerableTrait: { isActive: () => true } }])
        expect(supported({ ...unit, ...patch })).toBe(true);
    for (const patch of [{ name: 'MTNK' }, { turretTrait: { facing: NaN } },
        { submergibleTrait: { isSubmerged: () => true } }]) expect(supported({ ...unit, ...patch })).toBe(false);
});
test('team shading preserves reference red and shares only per-vehicle dynamic uniforms', () => {
    expect(colorDelta({r:255,g:24,b:24}).toArray()).toEqual([0,0,0]);
    const a = new RhinoMaterial(), b = a.clone(), independent = new RhinoMaterial();
    expect(b.uniforms.rhinoColorDelta).toBe(a.uniforms.rhinoColorDelta);
    expect(independent.uniforms.rhinoColorDelta).not.toBe(a.uniforms.rhinoColorDelta);
    a.map = { image: { width:320,height:288 } } as any;
    a.enableFiltering('opaque');
    expect(a.fragmentShader).toContain('rhinoRemap(base.rgb, data.r)');
    expect(a.customProgramCacheKey()).toBe('rhino-chroma-v1-m15-sprite-coverage-v2');
    a.dispose(); b.dispose(); independent.dispose();
});
test('complete local family matches accepted eight-heading base bytes and pinned identity', async () => {
    const registered = await registerHdResources(resourceRoot);
    expect(registered.availability.rhino).toBe('HD available');
    const manifestFile = registered.routes.get('/local-rhino/manifest.json');
    expect(manifestFile).toBeDefined();
    const root = path.dirname(manifestFile!);
    const hash=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
    const bytes=fs.readFileSync(`${root}/manifest.json`), manifest=JSON.parse(bytes.toString());
    expect(hash(bytes)).toBe(manifestHash);
    expect(Object.keys(manifest.parts)).toEqual(partKeys);
    expect(Object.keys(manifest.sources).sort()).toEqual(['htnk.hva', 'htnk.vxl', 'htnkbarl.hva', 'htnkbarl.vxl', 'htnktur.hva', 'htnktur.vxl']);
    for (const [name, sourceHash] of Object.entries(manifest.sources))
        expect(retailMember('ra2', name, sourceHash as string).sha256).toBe(sourceHash);
    for(const key of partKeys) {
        const base=fs.readFileSync(`${root}/${key}.png`), mask=fs.readFileSync(`${root}/${key}.mask`);
        expect(hash(base)).toBe(manifest.parts[key].sha256);
        expect(hash(mask)).toBe(manifest.parts[key].maskSha256);
        expect(mask.length).toBe(320*288);
    }
});
