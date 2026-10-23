import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { registerEnvironmentResources } from '../../desktop/environment-profile.mjs';
import { environmentHdContractForTheater, isEnvironmentHdSource }
    from '../../src/engine/renderable/builder/environmentHdContract';
import { resolveEnvironmentFamily } from '../../src/engine/renderable/builder/EnvironmentHd';

const contract = environmentHdContractForTheater('URBAN')!;
const pointer = contract.selectedPack;
const root = `.local/environment-packs/${pointer.revision}`;
const pack = JSON.parse(readFileSync(`${root}/manifest.json`, 'utf8'));

test('Urban registers a distinct hash-pinned selection while preserving Snow and Temperate routes', async () => {
    const events: any[] = [];
    const registered = await registerEnvironmentResources('.local', event => events.push(event));
    const selection = registered.selections.get('/local-environment/urban/selection.json');
    expect(selection.theater).toBe('URBAN');
    expect(selection.editions).toEqual(['ra2', 'yr']);
    expect(Object.keys(selection.families).sort()).toEqual(Object.keys(pack.families).sort());
    expect(registered.selections.get('/local-environment/snow/selection.json').theater).toBe('SNOW');
    expect(registered.selections.get('/local-environment/selection.json').theater).toBe('TEMPERATE');
    expect(events.filter(event => event.type === 'environment-original')).toEqual([]);
    expect(events.find(event => event.theater === 'URBAN').sha256).toBe(pointer.sha256);
});

test('Urban source admission checks the theater, hash and complete logical frame count', () => {
    const native = contract.sources['cuts01.shp'];
    const source: any = { member: 'cuts01.shp', theater: 'URBAN', sha256: native.sha256,
        canvas: native.canvas, frames: Array(native.bodyFrames).fill({}) };
    expect(isEnvironmentHdSource(source)).toBe(true);
    expect(isEnvironmentHdSource({ ...source, theater: 'SNOW' })).toBe(false);
    expect(isEnvironmentHdSource({ ...source, sha256: '0'.repeat(64) })).toBe(false);
    expect(isEnvironmentHdSource({ ...source, frames: source.frames.slice(1) })).toBe(false);
});

test('an incomplete Urban repair-outpost family stays Original before allocation', async () => {
    const family = contract.identities.yr.CAOUTP;
    const entry = pack.families[family].members[0];
    const metadata = JSON.parse(readFileSync(`${root}/${entry.path}`, 'utf8'));
    const result = await resolveEnvironmentFamily(family, [{ image: {}, manifest: metadata,
        manifestHash: entry.sha256, source: { ...metadata.source, frames: metadata.logical.frames },
        read: async () => { throw Error('Incomplete family must not request pixels'); } } as any],
    4, 1280 * 1024 * 1024, 2048, () => { throw Error('Incomplete family must not upload'); });
    expect(result.overrides.size).toBe(0);
    expect(result.worldChargeBytes).toBe(0);
});
