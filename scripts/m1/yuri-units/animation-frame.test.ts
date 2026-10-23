import { expect, test } from 'bun:test';
import { Anim } from '../../../src/engine/renderable/entity/Anim';
import { AnimationState } from '../../../src/engine/Animation';

test('retail gas endpoint cannot sample beyond its resolved SHP or alter animation timing', () => {
    const samples: number[] = [], object = { visible: true };
    let nativeFrame = 0;
    const anim = Object.assign(Object.create(Anim.prototype), {
        objectArt: {}, animation: { getState: () => AnimationState.RUNNING },
        animationRunner: { tick() {}, getCurrentFrame: () => nativeFrame },
        mainObj: { frameCount: 20, get3DObject: () => object, setFrame(frame: number) {
            if (frame < 0 || frame >= 20) throw Error('Native txgasg.shp bounds');
            samples.push(frame);
        } },
    });
    for (const frame of [0, 18, 19, 20, 28]) {
        nativeFrame = frame; anim.update(frame * 1000);
        expect(nativeFrame).toBe(frame);
    }
    expect(samples).toEqual([0, 18, 19, 19, 19]);
    expect(object.visible).toBe(true);
});
