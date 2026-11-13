import { expect, test } from 'bun:test';
import { Rules } from '../../src/game/rules/Rules';
import { CampaignMapFile } from '../../src/data/campaign/CampaignMapFile';
import { VirtualFile } from '../../src/data/vfs/VirtualFile';
import { Building } from '../../src/engine/renderable/entity/Building';
import { adaptRetailRules } from '../../src/offline/retailCompatibility';
import { requiredBytes, retailIni, sha256 } from '../test-support/resources';

const bytes = requiredBytes('campaign/yr/all02umd/all02umd.map');
const sourceHash = '168ed42024991b6c2af4de0e5a667e9c2bf15767741efe99dac975721460b303';
const map = new CampaignMapFile(VirtualFile.fromBytes(bytes, 'all02umd.map'),
    { semanticsVersion: 45, sourceSha256: sha256(bytes) });
const rules = new Rules(adaptRetailRules(retailIni('yr')).rules.mergeWith(map));

for (const name of ['CALA04', 'CALA11', 'CALA12']) test(`${name} preserves the original Hollywood garrison and damage state reachability`, () => {
    expect(sha256(bytes)).toBe(sourceHash);
    const objectRules = rules.getBuilding(name), frames: number[] = [], image = {};
    expect(objectRules.canBeOccupied).toBe(name === 'CALA04');
    const model = Object.create(Building.prototype);
    Object.assign(model, { objectRules, rules, gameObject: {}, mainShpFile: image,
        shpFrameInfos: new Map([[image, { frameCount: 4 }]]), mainObj: { setFrame: (frame: number) => frames.push(frame) } });
    for (let health = 1; health <= 100; health++) model.updateMainObjFrame(false, model.computeDamageType(health));
    expect([...new Set(frames)].sort()).toEqual([0, 1]);
    expect(model.computeDamageType(0)).toBe(3);
    if (objectRules.canBeOccupied) {
        model.updateMainObjFrame(true, model.computeDamageType(100));
        expect(frames.at(-1)).toBe(2);
    }
});
