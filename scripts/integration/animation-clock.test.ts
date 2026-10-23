import { expect, test } from 'bun:test';
import { Animation, AnimationState } from '../../src/engine/Animation';

// 25 frames over 0.8 s (buildup at normal speed), played once.
const props = (extra: any = {}) => ({ start: 0, end: 24, loopStart: 0, loopEnd: 24, loopCount: 1, rate: 31.25,
    reverse: false, randomLoopDelay: undefined, ...extra }) as any;
const speed = { value: 1 } as any;

const play = (intervals: number[]) => {
    const animation = new Animation(props(), speed);
    let time = 1000; animation.start(time);
    const changes: number[] = []; let last = animation.getCurrentFrame();
    for (const step of intervals) {
        time += step; animation.update(time);
        if (animation.getCurrentFrame() !== last) { changes.push(time - 1000); last = animation.getCurrentFrame(); }
        if (animation.getState() === AnimationState.STOPPED) break;
    }
    return { animation, changes, elapsed: time - 1000 };
};

test('frame advance follows elapsed time regardless of render cadence', () => {
    for (const cadence of [[6.06], [16.7], [8, 25, 11, 40, 6], [33.3, 33.3, 50]]) {
        const intervals = Array.from({ length: 400 }, (_, i) => cadence[i % cadence.length]);
        const { animation, changes, elapsed } = play(intervals);
        expect(animation.getState()).toBe(AnimationState.STOPPED);
        // The stop step after the last frame is due at 25 / 31.25 s = 800 ms.
        expect(elapsed).toBeGreaterThanOrEqual(800);
        expect(elapsed).toBeLessThan(800 + Math.max(...cadence) + 1e-6);
        // Each frame becomes due at k / rate; it is shown on the first render at or after that.
        changes.forEach((t, k) => expect(t).toBeGreaterThanOrEqual((k + 1) / 31.25 * 1000 - 1e-6));
    }
});

test('a pause neither advances frames nor bursts on resume', () => {
    const animation = new Animation(props({ loopCount: -1 }), speed);
    animation.start(0); animation.update(100);
    const frame = animation.getCurrentFrame();
    animation.pause(); animation.update(5000); animation.unpause();
    expect(animation.getCurrentFrame()).toBe(frame);
    animation.update(5000 + 40);
    expect(animation.getCurrentFrame()).toBe(frame + 1);
});
