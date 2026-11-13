import { expect, spyOn, test } from 'bun:test';
import { IniFile } from '../../src/data/IniFile';
import { CampaignMapFile } from '../../src/data/campaign/CampaignMapFile';
import { VirtualFile } from '../../src/data/vfs/VirtualFile';
import { ShpFile } from '../../src/data/ShpFile';
import { ImageFinder } from '../../src/engine/ImageFinder';
import { ObjectType } from '../../src/engine/type/ObjectType';
import { BuildingAnimArtProps } from '../../src/engine/renderable/entity/building/BuildingAnimArtProps';
import { BuildingShpHelper } from '../../src/engine/renderable/entity/building/BuildingShpHelper';
import { AnimationType } from '../../src/engine/renderable/entity/building/AnimationType';
import { Rules } from '../../src/game/rules/Rules';
import { Art } from '../../src/game/art/Art';
import { adaptRetailRules } from '../../src/offline/retailCompatibility';
import { requiredBytes, retailIni, retailMember, sha256 } from '../test-support/resources';
import { originalAnimationAbsence, originalAnimationAbsences } from './original-animation-absence';

const record = originalAnimationAbsences.records[0];
const context = { ...record, buildup: record.requestedImage };
const absent = (member: string) => { try { retailMember('yr', member); return true; } catch { return false; } };
const dependency = (declaration: typeof record.declarations[number]) => ({ ...declaration,
    animation: record.requestedImage, source: { member: record.resolvedMember, status: 'ORIGINAL_MEMBER_ABSENT' },
    palette: { sha256: record.paletteSha256 } });

test('original Lunar command-center build declarations follow the existing missing-image skip and retain every available body state', () => {
    const bytes = requiredBytes('campaign/yr/sov06lmd/sov06lmd.map');
    expect(sha256(bytes)).toBe(record.missionSha256);
    const map = new CampaignMapFile(VirtualFile.fromBytes(bytes, record.mission),
        { semanticsVersion: 45, sourceSha256: record.missionSha256 });
    const rules = new Rules(adaptRetailRules(retailIni('yr')).rules.mergeWith(map));
    const art = new Art(rules, retailIni('yr', 'art').mergeWith(map.artOverrides ?? new IniFile()), map, undefined);
    const native = art.getObject('YACOMD', ObjectType.Building), cache = new Map<string, ShpFile>();
    const images = { has: absent, get: (member: string) => {
        if (!absent(member)) return;
        if (!cache.has(member)) cache.set(member, new ShpFile(retailMember('yr', member).file));
        return cache.get(member);
    } };
    const finder = new ImageFinder(images as any, { settings: { extension: '.lun', newTheaterChar: 'L' } });
    expect(native.art.getString('Buildup')).toBe(record.requestedImage);
    expect(finder.getFilename(record.requestedImage, native.useTheaterExtension)).toBe(record.resolvedMember);
    expect(record.originalLookupCandidates.map(absent)).toEqual([false, false, false]);
    const body = finder.findByObjectArt(native);
    expect(body.filename).toBe(record.bodyMember); expect(body.numImages).toBe(8);
    expect(retailMember('yr', body.filename).sha256).toBe(record.bodySha256);
    const animations = new BuildingAnimArtProps(); animations.read(native.art, art);
    expect([...animations.getAll()].filter(([, list]) => list.length).map(([type]) => AnimationType[type]))
        .toEqual(['BUILDUP', 'UNBUILD']);
    const helper = new BuildingShpHelper(finder), warning = spyOn(console, 'warn').mockImplementation(() => {});
    try {
        const files = helper.collectAnimShpFiles(animations as any, native);
        expect(files.size).toBe(0); expect(warning).toHaveBeenCalledTimes(2);
        const info = helper.getShpFrameInfos(native, body as any, undefined, files as any);
        expect(info.size).toBe(1); expect(info.get(body as any).frameCount).toBe(4);
    } finally { warning.mockRestore(); }
    for (const declaration of record.declarations)
        expect(originalAnimationAbsence(context, dependency(declaration), absent)).toBe(record.id);
});

test('absence qualification rejects another source, role, image, palette, art declaration or newly available original file', () => {
    const original = dependency(record.declarations[0]);
    for (const changed of [{ ...context, edition: 'ra2' }, { ...context, theater: 'TEMPERATE' },
        { ...context, missionSha256: '0'.repeat(64) }, { ...context, bodySha256: '0'.repeat(64) },
        { ...context, family: 'another-family' }, { ...context, buildup: 'ANOTHER' }]) {
        expect(originalAnimationAbsence(changed, original, absent)).toBeUndefined();
    }
    for (const changed of [{ ...original, role: 'RULES_DESTROY_ANIMATION' }, { ...original, animation: 'ANOTHER' },
        { ...original, nativeArt: { Shadow: 'no' } }, { ...original, extraOffset: { x: 1, y: 0 } },
        { ...original, palette: { sha256: '0'.repeat(64) } },
        { ...original, source: { ...original.source, sha256: '0'.repeat(64) } }]) {
        expect(originalAnimationAbsence(context, changed, absent)).toBeUndefined();
    }
    expect(originalAnimationAbsence(context, original, member => member === record.originalLookupCandidates[0])).toBeUndefined();
});
