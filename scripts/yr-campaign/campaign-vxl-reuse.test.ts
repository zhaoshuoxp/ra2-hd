import { expect, test } from 'bun:test';
import reuse from '../../desktop/campaign-vxl-reuse.json';
import { campaignVxlReuseAllowed } from '../../src/engine/renderable/unitVxl/campaignVxlReuse';
import { vxlUnitAvailableInTheater, vxlUnitFamilies } from '../../src/engine/renderable/unitVxl/identities';
import { requiredBytes, sha256 } from '../test-support/resources';

for (const entry of reuse.entries) test(`${entry.identity} admits only its exact original YR campaign sources and accepted densities`, () => {
    const contract = vxlUnitFamilies[entry.identity];
    expect(vxlUnitAvailableInTheater(contract, entry.theater)).toBe(false);
    for (const source of entry.campaignSources) {
        expect(sha256(requiredBytes(`campaign/yr/${source.mission.slice(0, -4)}/${source.mission}`))).toBe(source.sha256);
        const launch = { edition: 'yr', mission: source.mission, sourceSha256: source.sha256 };
        const allowed = (candidate = contract, context: any = { campaign: { launch } }, palette = entry.unitPalette.sha256) =>
            campaignVxlReuseAllowed(entry.identity, candidate, entry.theater, context, palette);
        expect(allowed()).toBe(true);
        expect(allowed(contract, {})).toBe(false);
        expect(allowed(contract, { campaign: { launch: { ...launch, edition: 'ra2' } } })).toBe(false);
        expect(allowed(contract, { campaign: { launch: { ...launch, sourceSha256: '0'.repeat(64) } } })).toBe(false);
        expect(allowed(contract, { campaign: { launch: { ...launch, mission: 'unqualified.map' } } })).toBe(false);
        expect(allowed(contract, undefined, '0'.repeat(64))).toBe(false);
        expect(allowed({ ...contract, hash: '0'.repeat(64) })).toBe(false);
        expect(allowed({ ...contract, members: [...contract.members, 'unknown.vxl'] })).toBe(false);
        expect(allowed({ ...contract, variants: contract.variants?.slice(1) })).toBe(false);
        expect(campaignVxlReuseAllowed(entry.identity, contract, 'LUNAR', { campaign: { launch } }, entry.unitPalette.sha256))
            .toBe(false);
    }
});
