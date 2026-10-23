import { resourceRoot } from '../../test-support/resources';
import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { IniFile } from '../../../src/data/IniFile';
import { IniSection } from '../../../src/data/IniSection';
import { ObjectArt } from '../../../src/game/art/ObjectArt';
import { ObjectType } from '../../../src/engine/type/ObjectType';
import { editionRetailTree } from '../../../src/offline/editionRetail';
import { resolveMember } from '../../../src/offline/retail';

const names = ['ra2.mix', 'language.mix', 'multi.mix', 'expandmd01.mix', 'langmd.mix', 'ra2md.mix', 'multimd.mix'];
const top = new Map(names.map(name => [name, readFileSync(`${resourceRoot}/assets/${name.includes('md') ? 'yr' : 'ra2'}/${name}`)]));
const tree = editionRetailTree(top, 'yr');
const retail = new IniFile(resolveMember(tree, 'artmd.ini').file);

test('both native Hell Hills buildings expose their retail footprint to game rendering', () => {
    for (const name of ['CALA14', 'CALA15']) {
        const section = retail.getSection(name)!;
        expect(section.getString('Foundation')).toBe('3X3');
        const art = new ObjectArt(ObjectType.Building, { imageName: name }, section);
        expect(art.foundation).toEqual({ width: 3, height: 3 });
        expect(art.foundationCenter).toEqual({ x: 1, y: 1 });
    }
});

test('ordinary and zero-sized native foundations retain their declared dimensions', () => {
    for (const [value, width, height] of [['2x3', 2, 3], ['0x0', 0, 0]] as const) {
        const section = new IniSection('CONTROL');
        section.set('Foundation', value);
        expect(new ObjectArt(ObjectType.Building, { imageName: 'CONTROL' }, section).foundation)
            .toEqual({ width, height });
    }
    expect(new ObjectArt(ObjectType.Building, { imageName: 'CONTROL' }, new IniSection('CONTROL')).foundation)
        .toEqual({ width: 1, height: 1 });
});
