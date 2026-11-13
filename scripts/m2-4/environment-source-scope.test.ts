import { expect, test } from 'bun:test';
import { environmentFamilyScopeIssue, type EnvironmentFamily } from '../../src/engine/renderable/builder/environmentHdContract';

const source = 'a4f07f9b927148f871136237e48253cadff9ff631602cb79de46e86e1100c574';
const status = 'APPLIED_SOURCE_PINNED_ORIGINAL_LIBRARY_PALETTE';
const family: EnvironmentFamily = { members: ['cacity01.shp'], identities: ['CACITY01'], editions: ['ra2', 'yr'],
    kinds: ['building'], familyHash: 'a'.repeat(64),
    sourceScope: { officialMapSha256s: [source], visualAdaptationStatus: status } };

test('approved palette artwork requires verified map source and complete original adaptation', () => {
    expect(environmentFamilyScopeIssue(family, { officialSkirmishSourceSha256: source,
        officialVisualAdaptations: { status } })).toBeUndefined();
    expect(environmentFamilyScopeIssue(family, { officialSkirmishSourceSha256: source,
        officialVisualAdaptations: { status: 'IMAGE_SOURCE_MISMATCH' } })).toBe('official-visual-adaptation-not-applied');
    expect(environmentFamilyScopeIssue(family, { officialSkirmishSourceSha256: source })).toBe('official-visual-adaptation-not-applied');
});

test('other maps and overlapping games cannot inherit source-specific artwork', () => {
    const approved = { officialSkirmishSourceSha256: source, officialVisualAdaptations: { status } };
    const unrelated = { officialSkirmishSourceSha256: null, officialVisualAdaptations: { status: 'NOT_APPLICABLE' } };
    expect(environmentFamilyScopeIssue(family, approved)).toBeUndefined();
    expect(environmentFamilyScopeIssue(family, unrelated)).toBe('official-map-source-scope-mismatch');
    expect(environmentFamilyScopeIssue(family, approved)).toBeUndefined();
    expect(environmentFamilyScopeIssue(family, { officialSkirmishSourceSha256: 'b'.repeat(64),
        officialVisualAdaptations: { status } })).toBe('official-map-source-scope-mismatch');
});

test('unrestricted accepted families retain their existing availability', () => {
    const unrestricted = { ...family, sourceScope: undefined };
    expect(environmentFamilyScopeIssue(unrestricted, {})).toBeUndefined();
    expect(environmentFamilyScopeIssue(unrestricted, { officialSkirmishSourceSha256: source })).toBeUndefined();
});

test('YR campaign artwork needs an explicit edition and exact source while legacy scope remains RA2', () => {
    const launch = { edition: 'yr', mission: 'sov01umd.map', sourceSha256: source };
    const scoped: EnvironmentFamily = { ...family,
        sourceScope: { campaignSources: [{ edition: 'yr', mission: launch.mission, sha256: source }] } };
    expect(environmentFamilyScopeIssue(scoped, { campaign: { launch } })).toBeUndefined();
    expect(environmentFamilyScopeIssue(scoped, { campaign: { launch: { ...launch, edition: 'ra2' } } }))
        .toBe('campaign-map-source-scope-mismatch');
    expect(environmentFamilyScopeIssue(scoped, { campaign: { launch: { ...launch, sourceSha256: 'b'.repeat(64) } } }))
        .toBe('campaign-map-source-scope-mismatch');
    const legacy: EnvironmentFamily = { ...family, sourceScope: { campaignSources: [{ mission: launch.mission, sha256: source }] } };
    expect(environmentFamilyScopeIssue(legacy, { campaign: { launch } })).toBe('campaign-map-source-scope-mismatch');
    expect(environmentFamilyScopeIssue(legacy, { campaign: { launch: { ...launch, edition: 'ra2' } } })).toBeUndefined();
});
