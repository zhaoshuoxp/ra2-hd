import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { registerEnvironmentResources } from '../../desktop/environment-profile.mjs';
import { environmentHdContractForTheater, isEnvironmentHdSource }
    from '../../src/engine/renderable/builder/environmentHdContract';

test('NewUrban and Desert register independently and preserve all existing selections', async () => {
    const events: any[] = [];
    const registered = await registerEnvironmentResources('.local', event => events.push(event));
    for (const theater of ['TEMPERATE', 'SNOW', 'URBAN', 'NEWURBAN', 'DESERT']) {
        const contract = environmentHdContractForTheater(theater)!;
        const route = theater === 'TEMPERATE' ? '/local-environment/selection.json'
            : `/local-environment/${theater.toLowerCase()}/selection.json`;
        const selection = registered.selections.get(route);
        const pack = JSON.parse(readFileSync(
            `.local/environment-packs/${contract.selectedPack.revision}/manifest.json`, 'utf8'));
        expect(selection.theater).toBe(theater);
        expect(Object.keys(selection.families).sort()).toEqual(Object.keys(pack.families).sort());
        expect(events.find(event => event.theater === theater).sha256).toBe(contract.selectedPack.sha256);
    }
    expect(events.filter(event => event.type === 'environment-original')).toEqual([]);
    expect(environmentHdContractForTheater('LUNAR')).toBeUndefined();
});

test('remaining-theater source admission rejects changed source bytes and logical frames', () => {
    for (const theater of ['NEWURBAN', 'DESERT']) {
        const contract = environmentHdContractForTheater(theater)!;
        const [member, native] = Object.entries(contract.sources)[0];
        const source: any = { member, theater, sha256: native.sha256,
            canvas: native.canvas, frames: Array(native.bodyFrames).fill({}) };
        expect(isEnvironmentHdSource(source)).toBe(true);
        expect(isEnvironmentHdSource({ ...source, sha256: '0'.repeat(64) })).toBe(false);
        expect(isEnvironmentHdSource({ ...source, frames: [] })).toBe(false);
        expect(isEnvironmentHdSource({ ...source, theater: 'LUNAR' })).toBe(false);
    }
});
