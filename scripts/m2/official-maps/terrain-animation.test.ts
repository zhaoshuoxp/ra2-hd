import { expect, test } from 'bun:test';
import { IniSection } from '../../../src/data/IniSection';
import { AnimProps } from '../../../src/engine/AnimProps';
import { Animation, AnimationState } from '../../../src/engine/Animation';
import { SimpleRunner } from '../../../src/engine/animation/SimpleRunner';
import { Terrain } from '../../../src/engine/renderable/entity/Terrain';
import { SpawnStatus } from '../../../src/game/gameobject/trait/TiberiumTreeTrait';
import { BoxedVar } from '../../../src/util/BoxedVar';

test('resource terrain animates each production cycle and returns to its idle frame', () => {
    const section = new IniSection('native-resource-spawner');
    section.set('Rate', '180');
    const animation = new Animation(new AnimProps(section, 11), new BoxedVar(1));
    const runner = new SimpleRunner();
    runner.animation = animation;
    animation.stop();
    let frame = -1;
    const terrain = Object.assign(Object.create(Terrain.prototype), {
        tiberiumTreeTrait: { status: SpawnStatus.Idle }, animationRunner: runner,
        mainObj: { setFrame(value: number) { frame = value; } },
    });
    terrain.update(0);
    expect(frame).toBe(0);
    for (const start of [1000, 7000, 13000]) {
        terrain.tiberiumTreeTrait.status = SpawnStatus.Spawning;
        terrain.update(start);
        terrain.update(start + 400);
        expect(frame).toBe(1);
        terrain.tiberiumTreeTrait.status = SpawnStatus.Idle;
        terrain.update(start + 800);
        expect(frame).toBe(2);
        terrain.update(start + 5000);
        expect(animation.getState()).toBe(AnimationState.STOPPED);
        expect(frame).toBe(0);
    }
});
