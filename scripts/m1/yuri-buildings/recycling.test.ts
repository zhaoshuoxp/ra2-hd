import { expect, test } from 'bun:test';
import { EnterRecyclerTask } from '../../../src/game/gameobject/task/EnterRecyclerTask';
import { UnitRecycleEvent } from '../../../src/game/event/UnitRecycleEvent';
import { GameEventBus } from '../../../src/game/GameEventBus';
import { Animation, AnimationState } from '../../../src/engine/Animation';
import { AnimProps } from '../../../src/engine/AnimProps';
import { IniSection } from '../../../src/data/IniSection';
import { BoxedVar } from '../../../src/util/BoxedVar';
import { AnimationType } from '../../../src/engine/renderable/entity/building/AnimationType';

(globalThis as any).location = { search: '?edition=yr' };
const { Building } = await import('../../../src/engine/renderable/entity/Building');

test('native recycling keeps the refund first and identifies the receiving building', () => {
    const unit = {}, recycler = {}, calls: any[] = [], events = new GameEventBus();
    const unsubscribe = events.subscribe(event => calls.push(event));
    const game = { events, sellTrait: { sell: (target: any) => calls.push(target) } };
    new EnterRecyclerTask(game, recycler).onEnter(unit);
    expect(calls[0]).toBe(unit);
    expect(calls[1]).toBeInstanceOf(UnitRecycleEvent);
    expect(calls[1].target).toBe(unit);
    expect(calls[1].recycler).toBe(recycler);
    unsubscribe();
    events.dispatch(new UnitRecycleEvent(unit, recycler));
    expect(calls.length).toBe(2);
});

test('recycling uses the complete native normal/damaged sequence without the idle overlay', () => {
    for (const start of [0, 49]) {
        const renderable: any = Object.create(Building.prototype);
        const props = new AnimProps(new IniSection('YAGRND_A').fromJson({
            Start: String(start), LoopStart: String(start), LoopEnd: String(start + 48),
            LoopCount: '1', Rate: '450',
        }), 96);
        const animation = new Animation(props, new BoxedVar(1));
        const special = {}, idle = {}, visibility = new Map();
        renderable.objectRules = { grinding: true };
        renderable.gameObject = { healthTrait: { health: 100 }, buildStatus: 1, isDestroyed: false };
        renderable.animObjects = new Map([[AnimationType.SPECIAL, [special]], [AnimationType.IDLE, [idle]]]);
        renderable.animations = new Map([[special, animation], [idle, { start() {} }]]);
        renderable.setAnimationVisibility = (type: number, visible: boolean) => visibility.set(type, visible);
        renderable.setActiveAnimationVisible = () => visibility.set(AnimationType.ACTIVE, true);
        renderable.notifyUnitRecycled();
        expect(renderable.pendingUnitRecycle).toBe(true);
        renderable.setAnimation(AnimationType.SPECIAL_RECYCLING, 0);
        expect(visibility.get(AnimationType.ACTIVE)).toBe(false);
        expect(visibility.get(AnimationType.SPECIAL)).toBe(true);
        const frames = [animation.getCurrentFrame()];
        for (let time = 134; animation.getState() !== AnimationState.STOPPED; time += 134) {
            animation.update(time); frames.push(animation.getCurrentFrame());
        }
        expect([...new Set(frames)]).toEqual(Array.from({ length: 48 }, (_, n) => start + n));
        expect(renderable.hasObjectWithStoppedAnimation(AnimationType.SPECIAL_RECYCLING)).toBe(true);
        renderable.setAnimation(AnimationType.IDLE, 7000);
        expect(visibility.get(AnimationType.SPECIAL)).toBe(false);
        expect(visibility.get(AnimationType.ACTIVE)).toBe(true);
        renderable.pendingUnitRecycle = false;
        renderable.gameObject.isDestroyed = true;
        renderable.notifyUnitRecycled();
        expect(renderable.pendingUnitRecycle).toBe(false);
    }
});
