import catalog from '../../../../desktop/yr-campaign-npc-contracts.json';
import type { UnitHdFamilyContract } from './unitHdFamilies';
import type { EnvironmentSourceContext } from './environmentHdContract';
import type { HdSource } from './resolveHdSprite';

export const taskNpcContracts = catalog.shp as Record<string, UnitHdFamilyContract>;
type SourceScope = {
    identity: string; edition: string; theater: string; familyHash: string;
    unitPalette: { member: string; sha256: string };
    campaignSources: { mission: string; sha256: string }[];
};
const scopes = catalog.sourceScopes as SourceScope[];
export const hasTaskNpcForTheater = (theater: string | undefined) =>
    scopes.some(scope => scope.theater === theater);

export function campaignTaskNpcAllowed(family: UnitHdFamilyContract, theater: string | undefined,
    context: EnvironmentSourceContext, paletteSha256?: string): boolean {
    const launch = context.campaign?.launch;
    if (!launch || launch.edition !== 'yr' || family.edition !== 'yr') return false;
    return scopes.some(scope => scope.identity === family.identity && scope.edition === launch.edition
        && scope.familyHash === family.familyHash && scope.theater === theater
        && scope.unitPalette.sha256 === paletteSha256
        && scope.campaignSources.some(source => source.mission === launch.mission
            && source.sha256 === launch.sourceSha256));
}

export function isTaskNpcHdSource(source: HdSource): boolean {
    return Object.values(taskNpcContracts).some(family => family.authoringTheater === source.theater
        && family.members.some(member => member.member === source.member && member.sourceHash === source.sha256
            && member.frames === source.frames.length && member.canvas.length === source.canvas.length
            && member.canvas.every((value, index) => value === source.canvas[index])));
}

export function isTaskNpcTiledHdSource(source: HdSource): boolean {
    const family = taskNpcContracts.DNOB;
    return !!family && source.member === 'dnob.shp' && family.authoringTheater === source.theater
        && family.members.some(member => member.member === source.member && member.sourceHash === source.sha256
            && member.frames === source.frames.length && member.canvas.length === source.canvas.length
            && member.canvas.every((value, index) => value === source.canvas[index]));
}
