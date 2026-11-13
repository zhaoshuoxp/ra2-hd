import { expect, test } from 'bun:test';
import { AnimProps } from '../../src/engine/AnimProps';
import { Animation, AnimationState } from '../../src/engine/Animation';
import { IniSection } from '../../src/data/IniSection';
import { ShpFile } from '../../src/data/ShpFile';
import { BoxedVar } from '../../src/util/BoxedVar';
import { ShpAggregator } from '../../src/engine/renderable/builder/ShpAggregator';
import { buildingAnimationDisplayFrame } from '../../src/engine/renderable/entity/building/BuildingAnimationFrame';
import { retailIni, retailMember } from '../test-support/resources';

test('original damaged superweapon endpoints retain their clocks and their own SHP member', () => {
    const art = retailIni('yr', 'art');
    for (const identity of ['YAPPET', 'YAGNTC']) for (const property of ['SuperAnimTwo', 'SuperAnimFour']) {
        const building = art.getSection(identity), name = building.getString(property);
        const damaged = art.getSection(building.getString(property + 'Damaged'));
        const member = name.toLowerCase().replace(/^ya/, 'yg') + '.shp';
        const native = new ShpFile(retailMember('yr', member).file), count = native.numImages / 2;
        const next = new ShpFile(retailMember('yr', identity === 'YAPPET' ? 'ygppet_a.shp' : 'yggntc_e.shp').file);
        const aggregate = new ShpAggregator().aggregate([
            { file: native, hasShadow: true, frameCount: count },
            { file: next, hasShadow: true, frameCount: next.numImages / 2 },
        ], 'source-bound-endpoint');
        const props = new AnimProps(damaged, native), control = new AnimProps(damaged, native);
        expect(props.end).toBe(count); expect(props.loopEnd).toBe(count);
        const before = JSON.stringify(props);
        const animation = new Animation(props, new BoxedVar(1)), original = new Animation(control, new BoxedVar(1));
        animation.start(0); original.start(0);
        let observedBoundary = false;
        for (let step = 0; step <= count + 2; step++) {
            const time = step * 1000 / props.rate + .01;
            animation.update(time); original.update(time);
            const clock = animation.getCurrentFrame(), display = buildingAnimationDisplayFrame('yr', identity, props, clock);
            expect(clock).toBe(original.getCurrentFrame()); expect(animation.getState()).toBe(original.getState());
            expect(display).toBeGreaterThanOrEqual(0); expect(display).toBeLessThan(count);
            expect(aggregate.file.getImage(display)).toBe(native.getImage(display));
            if (clock === count) {
                observedBoundary = true;
                expect(aggregate.file.getImage(clock)).toBe(next.getImage(0));
                expect(aggregate.file.getImage(display)).toBe(native.getImage(count - 1));
            }
        }
        expect(observedBoundary).toBe(true); expect(animation.getState()).toBe(AnimationState.STOPPED);
        expect(JSON.stringify(props)).toBe(before);
        const normal = new AnimProps(art.getSection(name), native);
        for (let frame = normal.start; frame <= normal.loopEnd; frame++)
            expect(buildingAnimationDisplayFrame('yr', identity, normal, frame)).toBe(frame);
    }
}, 60000);

test('the display bound preserves other editions, identities, source shapes and reverse/looped playback', () => {
    const make = () => new AnimProps(new IniSection('YAPPET_FD').fromJson({
        Image: 'YAPPET_F', Start: '20', End: '38', Shadow: 'yes', Rate: '200',
    }), 38);
    expect(buildingAnimationDisplayFrame('yr', 'YAPPET', make(), 38)).toBe(37);
    expect(buildingAnimationDisplayFrame('ra2', 'YAPPET', make(), 38)).toBe(38);
    expect(buildingAnimationDisplayFrame('yr', 'GACNST', make(), 38)).toBe(38);
    for (const change of [
        (props: AnimProps) => { props.frameCount = 40; },
        (props: AnimProps) => { props.start = 19; },
        (props: AnimProps) => { props.reverse = true; },
        (props: AnimProps) => { props.loopCount = -1; },
        (props: AnimProps) => { props.shadow = false; },
        (props: AnimProps) => { props.art.set('Image', 'OTHER_F'); },
    ]) {
        const props = make(); change(props);
        expect(buildingAnimationDisplayFrame('yr', 'YAPPET', props, 38)).toBe(38);
    }
});
