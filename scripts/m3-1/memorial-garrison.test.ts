import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { IniFile } from '../../src/data/IniFile';
import { AnimProps } from '../../src/engine/AnimProps';
import { Animation } from '../../src/engine/Animation';
import { AnimationType } from '../../src/engine/renderable/entity/building/AnimationType';
import { BuildingAnimArtProps, buildingAnimationArtForState } from '../../src/engine/renderable/entity/building/BuildingAnimArtProps';
import { BoxedVar } from '../../src/util/BoxedVar';
import { retailMember } from '../test-support/resources';

const originalArt = new IniFile(retailMember('ra2', 'art.ini').file);
function memorial() {
    const props = new BuildingAnimArtProps();
    props.read(originalArt.getSection('CAWASH19')!, {
        hasObject: (name: string) => !!originalArt.getSection(name),
        getObject: (name: string) => ({ art: originalArt.getSection(name) }),
    });
    return props.getByType(AnimationType.ACTIVE)[0];
}

test('original mission orders a Soviet paradrop team to occupy the memorial', () => {
    const map = new IniFile(readFileSync('.local/campaign/ra2/sov01t/sov01t.map', 'utf8'));
    const team = map.getSection('0A0C1A7C')!, script = map.getSection(team.getString('Script'))!;
    expect([team.getString('House'), team.getBool('Droppod')]).toEqual(['Other3', true]);
    expect([script.getString('0'), script.getString('1')]).toEqual(['3,46', '46,131281']);
    expect(131281 & 0xffff).toBe(209);
    expect(map.getSection('CAWASH19')!.getBool('CanBeOccupied')).toBe(true);
    const types = new IniFile(retailMember('ra2', 'rules.ini').file).getSection('BuildingTypes')!;
    expect([...types.entries.values()][209]).toBe('CAWASH19');
});

test('occupation selects the original red-flag range and evacuation restores the original range', () => {
    const data = memorial();
    const animation = new Animation(new AnimProps(data.art, 48), new BoxedVar(1));
    for (const occupied of [false, true, false, true]) {
        animation.props.setArt(buildingAnimationArtForState(data, false, occupied)!);
        animation.start(0);
        const [low, high] = occupied ? [33, 47] : [0, 15];
        for (const time of [0, 100, 500, 1500, 9000]) {
            animation.update(time);
            expect(animation.getCurrentFrame()).toBeGreaterThanOrEqual(low);
            expect(animation.getCurrentFrame()).toBeLessThanOrEqual(high);
        }
        expect(animation.props.rate).toBe(220 / 60);
        expect(animation.props.loopCount).toBe(-1);
    }
    expect(buildingAnimationArtForState(data, true, false)).toBe(data.damagedArt);
    expect(buildingAnimationArtForState(data, true, true)).toBe(data.garrisonedArt);
});

test('animations without a native garrison variant retain their normal and damaged art', () => {
    const data = memorial(); delete data.garrisonedArt;
    for (const occupied of [false, true]) {
        expect(buildingAnimationArtForState(data, false, occupied)).toBe(data.art);
        expect(buildingAnimationArtForState(data, true, occupied)).toBe(data.damagedArt);
    }
});
