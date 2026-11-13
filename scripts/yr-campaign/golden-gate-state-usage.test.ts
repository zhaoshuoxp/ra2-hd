import { expect, test } from 'bun:test';
import { Rules } from '../../src/game/rules/Rules';
import { CampaignMapFile } from '../../src/data/campaign/CampaignMapFile';
import { VirtualFile } from '../../src/data/vfs/VirtualFile';
import { Building } from '../../src/engine/renderable/entity/Building';
import { adaptRetailRules } from '../../src/offline/retailCompatibility';
import { requiredBytes, retailIni, sha256 } from '../test-support/resources';

const missions = [
    ['all01umd', 'dee38769f2247a85908705486c175ef14a4cf90437899defe7c8b4c0d1c51fb0', 72],
    ['sov01umd', '498b989a4b6f579dee0904a77f1fabf982c14786db21a46c41900fc8344ec72b', 65],
] as const;

for (const [mission, hash, missingX] of missions) test(`${mission} keeps the original missing bridge and source display reachability`, () => {
    const bytes = requiredBytes(`campaign/yr/${mission}/${mission}.map`);
    expect(sha256(bytes)).toBe(hash);
    const map = new CampaignMapFile(VirtualFile.fromBytes(bytes, mission + '.map'),
        { semanticsVersion: 45, sourceSha256: hash });
    const rules = new Rules(adaptRetailRules(retailIni('yr')).rules.mergeWith(map));
    const placements = [...map.getSection('Structures')!.entries.values()]
        .map(value => String(value).split(',')).filter(fields => fields[1] === 'CASANF10');
    expect(placements).toHaveLength(1);
    expect(placements[0].slice(2, 5)).toEqual(['0', String(missingX), '99']);
    expect(bytes.toString()).not.toContain(',125,10,CASANF10,');
    for (const identity of ['CASANF04', 'CASANF09', 'CASANF10', 'CASANF11', 'CASANF12', 'CASANF13', 'CASANF14']) {
        const objectRules = rules.getBuilding(identity), image = {}, frames: number[] = [];
        expect(objectRules.canBeOccupied).toBe(false);
        expect(objectRules.leaveRubble).toBe(false);
        const model = Object.create(Building.prototype);
        Object.assign(model, { objectRules, rules, gameObject: {}, mainShpFile: image,
            shpFrameInfos: new Map([[image, { frameCount: 3 }]]),
            mainObj: { setFrame: (frame: number) => frames.push(frame) } });
        for (let health = 1; health <= 100; health++) {
            model.updateMainObjFrame(false, model.computeDamageType(health));
        }
        expect([...new Set(frames)].sort()).toEqual([0, 1]);
        expect(model.computeDamageType(0)).toBe(3);
    }
});
