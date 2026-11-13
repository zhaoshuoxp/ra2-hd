import { expect, test } from 'bun:test';
import { distribution, measurementContract, summarizeFrames } from './statistics.mjs';

test('nearest-rank quantiles and slow-tail reciprocal retain a full battle stall', () => {
    expect(distribution([1, 2, 3, 4, 100]).p95).toBe(100);
    const intervals = Array(599).fill(1000 / 60).concat(100);
    let time = 0;
    const raw = { intervals, timestamps: intervals.map(dt => time += dt), ticks: intervals.map((_, i) => i),
        durationMs: intervals.reduce((a, b) => a + b, 0), startTick: 0, nominalTickMs: 1000 / 60,
        updateMs: [], renderMs: [], simulationMs: [], workMs: [] };
    const result = summarizeFrames(raw);
    expect(result.frameMs.n).toBe(600);
    expect(result.frameMs.max).toBe(100);
    expect(result.onePercentLow).toBeCloseTo(1000 / ((100 + 5 * 1000 / 60) / 6), 8);
    expect(result.longStalls).toEqual([{ atMs: time, ms: 100, tick: 599 }]);
    expect(result.belowCadenceTimeFraction).toBeCloseTo(100 / time, 8);
});

test('refresh tolerance remains explicit and prolonged low bins fail', () => {
    const make = (hz: number) => {
        const intervals = Array(Math.ceil(hz * 10)).fill(1000 / hz);
        return { intervals, timestamps: intervals.map((_, i) => (i + 1) * 1000 / hz),
            ticks: intervals.map((_, i) => i + 1), startTick: 0, durationMs: intervals.length * 1000 / hz,
            nominalTickMs: 1000 / hz, updateMs: [], renderMs: [], simulationMs: [], workMs: [] };
    };
    const nominal = summarizeFrames(make(59.94));
    expect(nominal.callbackFps).toBeCloseTo(59.94, 8);
    expect(nominal.below60TimeFraction).toBe(1);
    expect(nominal.belowCadenceTimeFraction).toBe(0);
    expect(nominal.callbackGate).toBe(true);
    const slow = summarizeFrames(make(40));
    expect(slow.callbackGate).toBe(false);
    expect(slow.continuousLowBins[0].seconds).toBeGreaterThanOrEqual(9);
    expect(measurementContract.seconds).toBe(120);
});
