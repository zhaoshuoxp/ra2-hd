import { expect, test } from 'bun:test';
import { ImageFinder } from '../../src/engine/ImageFinder';
import { environmentHdContractForTheater } from '../../src/engine/renderable/builder/environmentHdContract';

const contract = environmentHdContractForTheater('DESERT')!;
const identity = contract.identities.yr.CAEGYP01;
const declared = contract.families[identity];
const images = new Map(declared.members.map(filename => [filename, { filename }]));
const family = new Map([...images.values()].map(image => [image, {
    identity: image.filename, pages: [{ base: image.filename }],
    frames: Array.from({ length: 4 }, (_, nativeFrame) => ({ page: 0, nativeFrame })),
}]));
const finder = () => new ImageFinder(images, { type: 'DESERT', environmentHd: {
    families: new Map([[identity, family]]),
} }, undefined, undefined, undefined, undefined, {}, undefined, 'yr');

test('each original building borrows only its own complete body from the atomic pyramid family', () => {
    const selected = finder();
    for (const [index, name] of declared.identities.entries()) {
        const image = images.get(declared.members[index])!;
        const view = selected.getBuildingHdOverride(name, { imageIndexes: new Map([[image, 0]]) });
        expect(view?.identity).toContain(image.filename);
        expect(view?.pages).toEqual(family.get(image)!.pages);
        expect(view?.frames.map(frame => frame.nativeFrame)).toEqual([0, 1, 2, 3]);
    }
});

test('a building aggregate with an uncovered activity image falls back completely', () => {
    const unknown = { filename: 'uncovered-activity.shp' };
    const aggregate = { imageIndexes: new Map([...images.values()].map((image, index) => [image, index * 4])) };
    aggregate.imageIndexes.set(unknown, 12);
    expect(finder().getBuildingHdOverride('CAEGYP01', aggregate)).toBeUndefined();
});

test('covered activity members retain their original aggregate offsets', () => {
    const source = [...images.values()];
    const view = finder().getBuildingHdOverride('CAEGYP01', {
        imageIndexes: new Map([[source[0], 0], [source[1], 7]]),
    });
    expect(view?.frames.length).toBe(11);
    expect(view?.frames[4]).toBeUndefined();
    expect(view?.frames[7].nativeFrame).toBe(0);
    expect(view?.frames[7].page).toBe(1);
});
