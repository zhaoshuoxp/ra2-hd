import { expect, test } from 'bun:test';
import * as THREE from 'three';
import { PreparedHdCache } from '../../src/engine/renderable/builder/PreparedHdCache';
import { withPreparedHdPages, createPreparedHdPage, readPreparedHdPage, preparedHdCache,
    validatePreparedBinding, type PreparedPageBinding } from '../../src/engine/renderable/builder/preparedHdPage';
import { productionHdPrewarm } from '../../src/engine/renderable/builder/productionHdPrewarm';
import { EventDispatcher } from '../../src/util/event';
import { UnitHdDemand } from '../../src/engine/renderable/builder/UnitHdDemand';

const payload = () => Uint8Array.from([100, 50, 25, 255, 200, 3]);
const descriptor = (): PreparedPageBinding => ({ route: '/prepared-test', sha256: 'a'.repeat(64),
    bytes: 6, gpuBytes: 6, compactData: true, losslessTiles: true, textures: [
        { role: 'base', width: 1, height: 1, channels: 4, offset: 0, length: 4, flipY: true, srgb: true },
        { role: 'data', width: 1, height: 1, channels: 2, offset: 4, length: 2, flipY: true, srgb: false },
    ] });

test('cache deduplicates pending reads, retains a bounded LRU, and retries failures', async () => {
    const cache = new PreparedHdCache(12);
    let calls = 0;
    const read = () => { calls++; return Promise.resolve(payload()); };
    await Promise.all([cache.read('a', 6, read), cache.read('a', 6, read)]);
    expect(calls).toBe(1); expect(cache.report.shared).toBe(1);
    await cache.read('b', 6, read);
    await cache.read('a', 6, read);
    await cache.read('c', 6, read);
    expect(cache.report.hits).toBe(1);
    await cache.read('b', 6, read);
    expect(calls).toBe(4); expect(cache.report.bytes).toBe(12);
    expect(cache.report.peakBytes).toBe(12); expect(cache.report.evictions).toBe(2);
    await expect(cache.read('bad', 6, async () => { throw Error('corrupt'); })).rejects.toThrow('corrupt');
    await cache.read('bad', 6, read);
    expect(cache.report.pendingBytes).toBe(0);
    await expect(cache.read('wrong', 6, async () => new Uint8Array(5))).rejects.toThrow('prepared-payload-size');
});

test('clearing an in-flight cache prevents repopulation; oversized payloads remain unretained', async () => {
    const cache = new PreparedHdCache(6);
    let finish!: (bytes: Uint8Array) => void;
    const request = cache.read('a', 6, () => new Promise(resolve => { finish = resolve; }));
    await Promise.resolve(); cache.clear(); finish(payload()); await request;
    expect(cache.report.bytes).toBe(0); expect(cache.report.pendingBytes).toBe(0);
    await cache.read('large', 7, async () => new Uint8Array(7));
    expect(cache.report.bytes).toBe(0); expect(cache.report.uncached).toBe(1);
});

test('cache reservation and completion share one memory cap', async () => {
    const cache = new PreparedHdCache(12);
    await cache.read('cached', 6, async () => payload());
    let finish!: (bytes: Uint8Array) => void;
    const first = cache.read('pending', 6, () => new Promise(resolve => { finish = resolve; }));
    await Promise.resolve();
    expect(cache.report.bytes + cache.report.pendingBytes).toBe(12);
    await cache.read('next', 6, async () => payload());
    expect(cache.report.evictions).toBe(1);
    expect(cache.report.bytes + cache.report.pendingBytes).toBe(12);
    finish(payload()); await first;
    expect(cache.report.bytes).toBe(12); expect(cache.report.pendingBytes).toBe(0);
});

test('large prepared pages do not flush reusable smaller pages', async () => {
    const cache = new PreparedHdCache(12, 4);
    await cache.read('small', 4, async () => new Uint8Array(4));
    await cache.read('large', 10, async () => new Uint8Array(10));
    await cache.read('small', 4, async () => { throw Error('Reusable page should remain cached'); });
    expect(cache.report.bytes).toBe(4); expect(cache.report.hits).toBe(1);
    expect(cache.report.evictions).toBe(0); expect(cache.report.uncached).toBe(1);
});

test('prepared textures preserve colors, owner masks, filtering and independent match ownership', () => {
    const bytes = payload(), binding = descriptor();
    const first = createPreparedHdPage(binding, bytes, 2048);
    const second = createPreparedHdPage(binding, bytes, 2048);
    expect(first.gpuBytes).toBe(6);
    const base = first.page.base.image as any, data = first.page.data.image as any;
    expect([...base.data]).toEqual([100, 50, 25, 255]);
    expect([...data.data]).toEqual([200, 3]);
    expect(first.page.data.format).toBe(THREE.RGFormat);
    expect(first.page.base.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(first.page.data.colorSpace).toBe(THREE.NoColorSpace);
    expect(first.page.base.minFilter).toBe(THREE.NearestFilter);
    expect(first.page.base.flipY).toBe(true);
    base.data[0] = 0; data.data[0] = 0;
    expect([...bytes]).toEqual([...payload()]);
    expect((second.page.base.image as any).data[0]).toBe(100);
    first.page.base.dispose(); first.page.data.dispose();
    expect((second.page.data.image as any).data[0]).toBe(200);
    second.page.base.dispose(); second.page.data.dispose();
    const invalid = descriptor(); invalid.textures[1].offset = 3;
    expect(() => validatePreparedBinding(invalid, 2048)).toThrow('prepared-texture-layout');
    expect(() => createPreparedHdPage(binding, new Uint8Array(5), 2048)).toThrow('prepared-payload-size');
});

test('corrupt prepared payloads fail hash validation and never enter the reuse cache', async () => {
    const originalFetch = globalThis.fetch;
    preparedHdCache.clear();
    globalThis.fetch = (async () => new Response(payload())) as any;
    try {
        await expect(readPreparedHdPage(descriptor(), 2048)).rejects.toThrow('prepared-payload-hash');
        expect(preparedHdCache.report.bytes).toBe(0);
    } finally { globalThis.fetch = originalFetch; preparedHdCache.clear(); }
});

test('serialized Yuri pages retain independent color/remap pools and both lookup textures', () => {
    const binding = descriptor();
    binding.textures[0].width = binding.textures[0].height = 8;
    binding.textures[0].length = 256;
    binding.textures[1].width = binding.textures[1].height = 4;
    binding.textures[1].offset = 256; binding.textures[1].length = 32;
    binding.textures.push(
        { role: 'map', width: 16, height: 16, channels: 4, offset: 288, length: 1024, flipY: false, srgb: false },
        { role: 'dataMap', width: 2, height: 2, channels: 4, offset: 1312, length: 16, flipY: false, srgb: false });
    binding.virtualSize = [64, 64]; binding.bytes = binding.gpuBytes = 1328;
    const bytes = new Uint8Array(binding.bytes); bytes[1312] = 3;
    const result = createPreparedHdPage(binding, bytes, 2048);
    expect(result.page.tiles!.virtualSize).toEqual([64, 64]);
    expect((result.page.data.image as any).width).toBe(4);
    expect((result.page.tiles!.dataMap!.image as any).data[0]).toBe(3);
    [result.page.base, result.page.data, result.page.tiles!.map, result.page.tiles!.dataMap!].forEach(texture => texture.dispose());
});

test('production preparation includes queued units, free units and MCV yards, with alias sharing and disposal', () => {
    const event = new EventDispatcher();
    let structures: any[] = [], infantry: any[] = [], vehicles: any[] = [];
    const production = { onQueueUpdate: event, getAllQueues: () => [
        { type: 0, getAll: () => structures }, { type: 2, getAll: () => infantry }, { type: 3, getAll: () => vehicles },
    ] };
    const warmed: string[] = [], released: string[] = [];
    const dispose = productionHdPrewarm([production as any], name => {
        warmed.push(name); return () => released.push(name);
    });
    structures = [{ rules: { name: 'AMRADR' } }, { rules: { name: 'NAYARD', freeUnit: 'HARV' } }];
    infantry = [{ rules: { name: 'E1' } }]; event.dispatch(production);
    event.dispatch(production);
    expect(warmed).toEqual(['GAAIRC', 'NAYARD', 'HARV', 'E1']);
    vehicles = [{ rules: { name: 'SMCV' } }]; event.dispatch(production);
    expect(warmed).toEqual(['GAAIRC', 'NAYARD', 'HARV', 'E1', 'SMCV', 'NACNST']);
    structures = [{ rules: { name: 'AMRADR' } }]; event.dispatch(production);
    expect(released).toEqual(['NAYARD', 'HARV']);
    dispose(); structures = [{ rules: { name: 'NAWEAP' } }]; event.dispatch(production);
    expect(released).toEqual(['NAYARD', 'HARV', 'GAAIRC', 'E1', 'SMCV', 'NACNST']);
    expect(warmed).toEqual(['GAAIRC', 'NAYARD', 'HARV', 'E1', 'SMCV', 'NACNST']);
});

test('queue completion retains the warmed allocation until the actual renderer binds under eviction pressure', async () => {
    const originalRequest = globalThis.requestAnimationFrame, originalCancel = globalThis.cancelAnimationFrame;
    const callbacks = new Map<number, FrameRequestCallback>(); let sequence = 0;
    globalThis.requestAnimationFrame = fn => { callbacks.set(++sequence, fn); return sequence; };
    globalThis.cancelAnimationFrame = id => { callbacks.delete(id); };
    const frame = () => { const batch = [...callbacks]; callbacks.clear(); batch.forEach(([, fn]) => fn(0)); };
    const event = new EventDispatcher(); let items = [{ rules: { name: 'YAPOWR' } }];
    const released: string[] = [];
    const demand = new UnitHdDemand(new Set(['YAPOWR', 'YABRCK']), 20, async identity => ({ density: 4, gpuBytes: 10,
        members: new Map([[identity, { image: { filename: identity }, override: {} as any }]]), attempts: [] }),
        family => released.push([...family.members.keys()][0]));
    const dispose = productionHdPrewarm([{ onQueueUpdate: event, getAllQueues: () => [{ getAll: () => items }] } as any],
        identity => demand.prewarm(identity));
    try {
        await demand.idle(); items = []; event.dispatch();
        demand.prewarm('YABRCK'); await demand.idle(); frame();
        expect(released).toEqual([]); expect(demand.families.has('YAPOWR')).toBe(true);
        let bound = false;
        const release = demand.bindFamily('YAPOWR', family => { bound = !!family; });
        frame(); expect(bound).toBe(true); expect(released).toEqual([]);
        release();
    } finally { dispose(); demand.dispose(); globalThis.requestAnimationFrame = originalRequest;
        globalThis.cancelAnimationFrame = originalCancel; }
});


test('prepared lookahead shares checked payloads without allocating textures and rejects corruption', async () => {
    const previous = globalThis.fetch;
    preparedHdCache.clear();
    const binding = descriptor();
    binding.sha256 = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', payload())))
        .map(b => b.toString(16).padStart(2, '0')).join('');
    let reads = 0;
    globalThis.fetch = (async () => { reads++; return new Response(payload()); }) as any;
    try {
        const read = withPreparedHdPages(async () => { throw Error('PNG fallback not expected'); }, { '4': { p0: binding } });
        await read.prefetch!(4, 'p0', 2048, true, true);
        const prepared = await read.prepared!(4, 'p0', 2048, true, true);
        expect(reads).toBe(1); expect(prepared!.gpuBytes).toBe(6);
        prepared!.page.base.dispose(); prepared!.page.data.dispose();
        preparedHdCache.clear(); binding.sha256 = 'b'.repeat(64);
        await expect(read.prefetch!(4, 'p0', 2048, true, true)).rejects.toThrow('prepared-payload-hash');
        expect(preparedHdCache.report.bytes).toBe(0);
    } finally { globalThis.fetch = previous; preparedHdCache.clear(); }
});
