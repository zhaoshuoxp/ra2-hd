import { expect, test } from 'bun:test';
import { registerHdResourcesWhenReady } from '../../desktop/hd-startup.mjs';

const missing = { type: 'hd-unavailable', family: 'conscript', code: 'ENOENT', reason: 'Missing manifest' };
const original = { type: 'hd-unavailable', family: 'unit-sqd', reason: 'USER_REQUESTED_ORIGINAL' };
function fixture(passes: any[][]) {
    const events: any[] = [], delays: number[] = [], results: any[] = [];
    let calls = 0;
    const options = {
        register: async (_root: string, record: (event: any) => void) => {
            passes[Math.min(calls++, passes.length - 1)].forEach(record);
            const result = { routes: new Map([[`pass-${calls}`, 'validated-file']]), selections: new Map(), availability: {} };
            results.push(result);
            return result;
        },
        wait: async (ms: number) => { delays.push(ms); },
    };
    return { options, events, delays, results, record: (event: any) => events.push(event) };
}
test('late files recover before publishing routes, retaining the accepted Original exception', async () => {
    const f = fixture([[missing, original], [missing, original], [original]]);
    const result = await registerHdResourcesWhenReady('/resources', f.record, { ...f.options, requireComplete: true });
    expect(result).toBe(f.results[2]);
    expect(f.delays).toEqual([250, 750]);
    expect(f.events.filter(e => e.type === 'hd-unavailable')).toEqual([original]);
    expect(f.events.at(-1)).toMatchObject({ type: 'hd-startup-ready', attempts: 3, missingFamilies: [] });
});
test('a permanently missing packaged family stops startup after a bounded retry', async () => {
    const f = fixture([[missing]]);
    await expect(registerHdResourcesWhenReady('/resources', f.record, { ...f.options, requireComplete: true }))
        .rejects.toThrow('Missing families: conscript');
    expect(f.delays).toEqual([250, 750, 1500]);
    expect(f.results).toHaveLength(4);
    expect(f.events.some(e => e.type === 'hd-startup-ready')).toBe(false);
});
test('optional profiles retain missing-family fallback after retry exhaustion', async () => {
    const f = fixture([[missing]]);
    const result = await registerHdResourcesWhenReady('/resources', f.record, f.options);
    expect(result).toBe(f.results[3]);
    expect(f.events.at(-1).missingFamilies).toEqual(['conscript']);
});
test('validation failures and deliberate Original exceptions are never retried', async () => {
    const invalid = { ...missing, code: undefined, reason: 'Optional resource identity mismatch' };
    const f = fixture([[invalid, original]]);
    await registerHdResourcesWhenReady('/resources', f.record, f.options);
    expect(f.delays).toEqual([]);
    expect(f.results).toHaveLength(1);
    expect(f.events.filter(e => e.type === 'hd-unavailable')).toEqual([invalid, original]);
});
