import { expect, test } from 'bun:test';
import { IniSection } from '../../../src/data/IniSection';
import { AnimProps } from '../../../src/engine/AnimProps';
import { Animation } from '../../../src/engine/Animation';
import { BoxedVar } from '../../../src/util/BoxedVar';
import { AnimationType } from '../../../src/engine/renderable/entity/building/AnimationType';
import { configureWarFactoryLayerPose } from '../../../src/engine/renderable/entity/building/WarFactoryLayerPose';

function props(loopEnd = 9) {
    const art = new IniSection('GAWEAP_3');
    art.set('LoopEnd', String(loopEnd));
    art.set('LoopCount', '-1');
    art.set('Rate', '400');
    return new AnimProps(art, 4);
}

test('retail roof range escapes its member; both production layers hold the correct native health pose', () => {
    const broken = new Animation(props(), new BoxedVar(1));
    broken.start(0);
    broken.update(800);
    expect(broken.getCurrentFrame()).toBeGreaterThanOrEqual(4);
    for (const family of ['GAWEAP', 'YAWEAP']) for (const type of [AnimationType.FACTORY_DEPLOYING, AnimationType.FACTORY_ROOF_DEPLOYING]) {
        const p = props(type === AnimationType.FACTORY_DEPLOYING ? 1 : 9);
        const rate = p.rate;
        const animation = new Animation(p, new BoxedVar(1));
        for (const damaged of [false, true, false]) {
            expect(configureWarFactoryLayerPose(p, family, type, damaged)).toBe(true);
            animation.start(0);
            for (const time of [0, 500, 1300, 9000]) {
                animation.update(time);
                expect(animation.getCurrentFrame()).toBe(damaged ? 1 : 0);
            }
        }
        expect(p.rate).toBe(rate);
        expect(p.loopCount).toBe(-1);
    }
});

test('other families, construction and different source shapes keep their animation contract', () => {
    for (const [family, type, count] of [
        ['NAWEAP', AnimationType.FACTORY_ROOF_DEPLOYING, 4],
        ['GAWEAP', AnimationType.BUILDUP, 4],
        ['GAWEAP', AnimationType.FACTORY_ROOF_DEPLOYING, 18],
    ] as const) {
        const p = props();
        p.frameCount = count;
        const before = JSON.stringify(p);
        expect(configureWarFactoryLayerPose(p, family, type, true)).toBe(false);
        expect(JSON.stringify(p)).toBe(before);
    }
});
