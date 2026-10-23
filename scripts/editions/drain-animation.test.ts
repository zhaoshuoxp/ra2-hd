import { expect, test } from 'bun:test';
import { DrainAnimationPlugin } from '../../src/engine/renderable/entity/plugin/DrainAnimationPlugin';
import { Animation, AnimationState } from '../../src/engine/Animation';
import { AnimProps } from '../../src/engine/AnimProps';
import { IniSection } from '../../src/data/IniSection';

test('native drain frames keep cycling for refinery and power channels and release on cancellation', () => {
    for (const target of ['NAREFN', 'NAPOWR']) {
        let draining: string | undefined = target, created = 0, removed = 0, disposed = 0;
        const art = new IniSection('DISKRAY');
        art.set('LoopCount', '-1');
        const props = new AnimProps(art, 4);
        const animation = new Animation(props, { value: 1 });
        const unit = { isDestroyed: false, warpedOutTrait: { isActive: () => false },
            drainTrait: { getTarget: () => draining }, position: { worldPosition: { x: 1, y: 2, z: 3 } } };
        const plugin = new DrainAnimationPlugin(unit, 'DISKRAY');
        plugin.onCreate({ createTransientAnim: (name: string, initialize: any) => {
            expect(name).toBe('DISKRAY'); created++;
            const anim = { setPosition: () => {}, create3DObject: () => {}, getAnimProps: () => props,
                remove: () => removed++, dispose: () => disposed++ };
            initialize(anim); return anim;
        }, getRenderableContainer: () => ({ updateChild: () => {} }) });
        plugin.update(); animation.start(0);
        const frames = new Set<number>();
        for (let time = 100; time <= 10000; time += 100) {
            animation.update(time); plugin.update(); frames.add(animation.getCurrentFrame());
            expect(animation.getState()).toBe(AnimationState.RUNNING);
        }
        expect(frames.size).toBeGreaterThan(3);
        expect(created).toBe(1); expect(removed).toBe(0);
        draining = undefined; plugin.update(); plugin.onRemove();
        expect(removed).toBe(1); expect(disposed).toBe(1);
    }
});
