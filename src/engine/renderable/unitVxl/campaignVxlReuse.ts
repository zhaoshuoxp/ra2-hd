import reuse from '../../../../desktop/campaign-vxl-reuse.json';
import type { EnvironmentSourceContext } from '../builder/environmentHdContract';
import type { VxlUnitContract } from './identities';

export const hasCampaignVxlReuseForTheater = (theater: string | undefined) =>
    reuse.entries.some(entry => entry.theater === theater);

export function campaignVxlReuseAllowed(identity: string, contract: VxlUnitContract,
    theater: string | undefined, context: EnvironmentSourceContext, unitPaletteSha256?: string): boolean {
    const launch = context.campaign?.launch;
    if (!launch) return false;
    return reuse.entries.some(entry => entry.identity === identity && entry.edition === launch.edition
        && entry.theater === theater && entry.familyHash === contract.hash
        && entry.unitPalette.sha256 === unitPaletteSha256
        && JSON.stringify(entry.members) === JSON.stringify(contract.members)
        && entry.variants.length === contract.variants?.length
        && entry.variants.every(variant => contract.variants?.some(source => source.density === variant.density
            && source.hash === variant.sha256))
        && entry.campaignSources.some(source => source.mission === launch.mission && source.sha256 === launch.sourceSha256));
}
