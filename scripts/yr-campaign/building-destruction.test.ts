import { expect, test } from 'bun:test';
import { Rules } from '../../src/game/rules/Rules';
import { Art } from '../../src/game/art/Art';
import { CampaignMapFile } from '../../src/data/campaign/CampaignMapFile';
import { VirtualFile } from '../../src/data/vfs/VirtualFile';
import { Building } from '../../src/engine/renderable/entity/Building';
import { environmentMapDemand } from '../../src/engine/renderable/builder/environmentMapDemand';
import { adaptRetailRules } from '../../src/offline/retailCompatibility';
import { requiredBytes, retailIni, sha256 } from '../test-support/resources';

test('original Transylvania castle destruction resolves its separate source animation once and demands the complete family', () => {
    const bytes = requiredBytes('campaign/yr/sov07tmd/sov07tmd.map');
    const map = new CampaignMapFile(VirtualFile.fromBytes(bytes, 'sov07tmd.map'),
        { semanticsVersion: 45, sourceSha256: sha256(bytes) });
    const rules = new Rules(adaptRetailRules(retailIni('yr')).rules.mergeWith(map));
    const art = new Art(rules, retailIni('yr', 'art'), map, undefined);
    const castle = rules.getBuilding('CATRAN03');
    expect(castle.destroyAnim).toEqual(['CATR03DM']);
    expect(art.getAnimation('CATR03DM').imageName).toBe('CATR03DM');
    expect(art.getAnimation('CATR03DM').art.getBool('NewTheater')).toBe(true);
    const position = { x: 120, y: 0, z: 345 }, color = { id: 'original-owner' };
    const calls: any[] = [], model = Object.create(Building.prototype);
    const foundation = art.getObject('CATRAN03', 2).foundation;
    Object.assign(model, { objectRules: castle, objectArt: { foundation }, gameObject: { owner: { color } },
        withPosition: { getPosition: () => position }, createExplosionAnims: () => calls.push('explosions') });
    const manager = { createTransientAnim: (name: string, configure: (anim: any) => void) => {
        const anim = { objectArt: { remapable: true }, setPosition: (p: any) => calls.push(p),
            setSourceBuildingGeometry: (value: any) => calls.push(value),
            palette: { clone: () => ({ remap: (c: any) => calls.push(c) }) } };
        calls.push(name); configure(anim);
    } };
    model.createDestructionAnims(manager); model.createDestructionAnims(manager);
    expect(calls.filter(value => value === 'CATR03DM')).toHaveLength(1);
    expect(calls).toContain(position); expect(calls).toContain(color);
    expect(calls).toContain(foundation);
    const game = { campaign: { yr: true, definition: { triggers: new Map(), teams: new Map(), taskForces: new Map() } }, rules, gameOpts: {},
        getWorld: () => ({ getAllObjects: () => [{ name: 'CATRAN03' }] }),
        map: { tiles: { getAll: () => [] } } };
    expect(environmentMapDemand(game, {})).toContain('CATR03DM');
    game.campaign.yr = false;
    expect(environmentMapDemand(game, {})).not.toContain('CATR03DM');
});
