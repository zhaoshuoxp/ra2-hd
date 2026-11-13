import { expect, test } from 'bun:test';
import { Art } from '../../src/game/art/Art';
import { Rules } from '../../src/game/rules/Rules';
import { CampaignMapFile } from '../../src/data/campaign/CampaignMapFile';
import { VirtualFile } from '../../src/data/vfs/VirtualFile';
import { ObjectType } from '../../src/engine/type/ObjectType';
import { BuildingAnimArtProps } from '../../src/engine/renderable/entity/building/BuildingAnimArtProps';
import { AnimationType } from '../../src/engine/renderable/entity/building/AnimationType';
import { adaptRetailRules } from '../../src/offline/retailCompatibility';
import { requiredBytes, retailIni, sha256 } from '../test-support/resources';
import { validateCampaignResources, registerCampaignEnvironmentResources } from '../../desktop/campaign-profile.mjs';
import { environmentHdContractForTheater } from '../../src/engine/renderable/builder/environmentHdContract';

test('YR time-machine damage resolves its original unlisted alias without changing the scenario animation registry', () => {
    const bytes = requiredBytes('campaign/yr/sov01umd/sov01umd.map');
    const map = new CampaignMapFile(VirtualFile.fromBytes(bytes, 'sov01umd.map'),
        { semanticsVersion: 28, sourceSha256: sha256(bytes) });
    const rules = new Rules(adaptRetailRules(retailIni('yr')).rules.mergeWith(map));
    const before = [...rules.animationNames];
    const art = new Art(rules, retailIni('yr', 'art'), map, undefined);
    const animations = new BuildingAnimArtProps(); animations.read(art.getObject('CATIME01', ObjectType.Building).art as any, art);
    const active = animations.getByType(AnimationType.ACTIVE)[0];
    expect(before).not.toContain('CATIME_AD'); expect([...rules.animationNames]).toEqual(before);
    expect(active.damagedArt!.getString('Image')).toBe('CATIME_A');
    expect(active.damagedArt!.getNumber('Start')).toBe(1); expect(active.damagedArt!.getNumber('LoopEnd')).toBe(2);
    const legacyMap = Object.create(map);
    Object.defineProperty(legacyMap, 'campaignSemanticsVersion', { value: 27 });
    const legacy = new Art(rules, retailIni('yr', 'art'), legacyMap, undefined);
    expect(legacy.hasObject('CATIME_AD', ObjectType.Animation)).toBe(false);
});

test('YR time-machine registration publishes both original members atomically and preserves prior families', async () => {
    const registration = await validateCampaignResources('.local/campaign');
    const route = '/local-environment/newurban/selection.json', retained = { retained: true };
    const identity = environmentHdContractForTheater('NEWURBAN')!.identities.yr.CATIME01;
    const profile = () => ({ root: registration.root, routes: new Map(registration.routes),
        selections: new Map([[route, { families: { previous: retained } }]]) });
    const complete = profile(); await registerCampaignEnvironmentResources(complete);
    const selected: any = complete.selections.get(route);
    expect(selected.families.previous).toBe(retained);
    expect(selected.families[identity].members.map((member: any) => member.member))
        .toEqual(['cgtime01.shp', 'cgtime_a.shp']);
    const broken = profile();
    broken.routes.delete(selected.families[identity].members[1].manifest);
    await registerCampaignEnvironmentResources(broken);
    expect((broken.selections.get(route) as any).families[identity]).toBeUndefined();
    expect((broken.selections.get(route) as any).families.previous).toBe(retained);
});
