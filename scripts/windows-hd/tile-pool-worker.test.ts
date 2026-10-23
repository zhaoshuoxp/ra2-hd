import { expect, test } from 'bun:test';
import { HdTilePoolPreparer } from '../../src/engine/renderable/builder/HdTilePoolPreparer';
import { poolHdPixels } from '../../src/engine/renderable/builder/poolHdPixels';
import { resolveHdSprite, disposeHdSprite, type HdPageReader } from '../../src/engine/renderable/builder/resolveHdSprite';
import { napowrHdFamily } from '../../src/engine/renderable/builder/napowrHdFamily';
import { createPooledHdPage } from '../../src/engine/renderable/builder/poolHdPage';

function pixels(width = 67, height = 53) {
    const rgba = new Uint8Array(width * height * 4), ownership = new Uint8Array(rgba.length);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const at = (y * width + x) * 4;
        rgba.set([x % 8 * 31, y % 8 * 31, (x + y) % 4 * 60, (x + y) % 3 * 127], at);
        ownership.set([x % 4 * 85, y % 16, 0, 255], at);
    }
    return [{ width, height, rgba }, { width, height, rgba: ownership }] as const;
}

test('real worker preserves every pooled byte, hidden RGB, partial tiles, hash collisions and declined pages', async () => {
    const preparer = new HdTilePoolPreparer();
    try {
        const collision = pixels(64, 64);
        collision[0].rgba.fill(0); collision[1].rgba.fill(0);
        const words = new Uint32Array(collision[0].rgba.buffer), prime = 16777619, inverse = 899433627;
        let zeroHash = 2166136261;
        for (let i = 0; i < 32; i++) zeroHash = Math.imul(zeroHash, prime);
        let modified = Math.imul(Math.imul(2166136261 ^ 123, prime), prime);
        for (let i = 2; i < 30; i++) modified = Math.imul(modified, prime);
        words[4] = 123; words[3 * 64 + 7] = modified ^ Math.imul(Math.imul(zeroHash, inverse), inverse);
        for (const [input, limit] of [[pixels(), 2048], [collision, 2048], [pixels(3, 3), 2048], [pixels(), 4]] as const) {
            const before = input.map(page => page.rgba.slice());
            expect(await preparer.prepare(input[0], input[1], limit)).toEqual(poolHdPixels(input[0], input[1], limit));
            input.forEach((page, index) => expect(page.rgba).toEqual(before[index]));
        }
    } finally { preparer.dispose(); }
});

test('borrowed subviews send only bounded page bytes and remain attached after worker output transfer', async () => {
    const input = pixels(), worker: any = { terminate() {}, postMessage(request: any, transfer: any) {
        expect(transfer).toBeUndefined();
        expect(request.base.rgba.buffer.byteLength).toBe(input[0].rgba.byteLength);
        expect(request.data.rgba.buffer.byteLength).toBe(input[1].rgba.byteLength);
        const copy = structuredClone(request);
        queueMicrotask(() => worker.onmessage({ data: { kind: copy.kind, id: copy.id,
            pixels: poolHdPixels(copy.base, copy.data, copy.limit) } }));
    } };
    const borrowed = input.map(page => {
        const buffer = new Uint8Array(page.rgba.length + 16);
        buffer.set(page.rgba, 4);
        return { ...page, rgba: buffer.subarray(4, 4 + page.rgba.length) };
    });
    const preparer = new HdTilePoolPreparer(() => worker);
    try {
        expect(await preparer.prepare(borrowed[0], borrowed[1], 2048)).toEqual(poolHdPixels(...input, 2048));
        borrowed.forEach((page, index) => expect(page.rgba).toEqual(input[index].rgba));
    } finally { preparer.dispose(); }
});

test('unavailable, rejected, failed and timed-out workers reuse identical CPU data without retrying the broken worker', async () => {
    for (const failure of ['constructor', 'post', 'error', 'messageerror', 'response', 'timeout']) {
        const input = pixels(), expected = poolHdPixels(...input, 2048);
        let created = 0, terminated = 0;
        const worker: any = { terminate: () => terminated++, postMessage(request: any) {
            if (failure === 'post') throw Error('rejected');
            queueMicrotask(() => {
                if (failure === 'error') worker.onerror();
                if (failure === 'messageerror') worker.onmessageerror();
                if (failure === 'response') worker.onmessage({ data: { kind: request.kind, id: request.id, error: 'calculation failed' } });
            });
        } };
        const preparer = new HdTilePoolPreparer(() => {
            created++;
            if (failure === 'constructor') throw Error('unavailable');
            return worker;
        }, 5);
        try {
            expect(await preparer.prepare(...input, 2048)).toEqual(expected);
            expect(await preparer.prepare(...input, 2048)).toEqual(expected);
            expect(created).toBe(1); expect(terminated).toBe(failure === 'constructor' ? 0 : 1);
            expect(input[0].rgba.byteLength).toBe(67 * 53 * 4);
        } finally { preparer.dispose(); }
    }
});

test('owner disposal cancels outstanding pooling without fallback or a late result and rejects use after disposal', async () => {
    const input = pixels(); let terminated = 0;
    const worker: any = { terminate: () => terminated++, postMessage(request: any) { worker.request = request; } };
    const preparer = new HdTilePoolPreparer(() => worker);
    const pending = preparer.prepare(...input, 2048);
    const rejection = pending.catch(error => error);
    await expect(preparer.prepare(...input, 2048)).rejects.toThrow('already-pending');
    worker.onmessage({ data: { kind: 'hd-tile-pool', id: 999, pixels: undefined } });
    preparer.dispose(); preparer.dispose();
    worker.onmessage({ data: { kind: 'hd-tile-pool', id: worker.request.id, pixels: {} } });
    expect((await rejection).message).toBe('cancelled');
    await expect(preparer.prepare(...input, 2048)).rejects.toThrow('cancelled');
    expect(terminated).toBe(1);
});

function spriteFixture() {
    const sha = 'a'.repeat(64), member = napowrHdFamily.members[0];
    const frames = [0, 1].map(nativeFrame => ({ nativeFrame, trimOrigin: [0, 0], trimSize: [16, 16],
        legacyRenderSize: [16, 16], empty: false }));
    const source = { member: member.member, sha256: member.sha256, theater: 'TEMPERATE', canvas: [210, 140], frames };
    const pages = ['p0', 'p1'].map(id => ({ id, size: [68, 68], base: `${id}-base.png`, data: `${id}-data.png`,
        baseBytes: 1, dataBytes: 1, baseSha256: sha, dataSha256: sha }));
    const manifest = { schemaVersion: 2, packId: 'worker-fixture', packRevision: '1',
        source: { ...source, kind: 'resolved-shp-member' }, logical: { canvas: source.canvas, frames },
        color: { representation: 'authored-sRGB-RGBA8-plus-RGBA8-data' }, variants: [{ density: 4, pages,
            frames: frames.map(({ nativeFrame }) => ({ nativeFrame, page: `p${nativeFrame}`,
                sampleRect: [2, 2, 64, 64], contentRect: [2, 2, 64, 64] })) }] };
    const read: HdPageReader = async filename => {
        const width = 68, height = 68, rgba = new Uint8Array(width * height * 4);
        for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
            const at = (y * width + x) * 4;
            if (filename.includes('data')) rgba[at + 3] = 255;
            else if (x >= 2 && y >= 2 && x < 66 && y < 66) rgba.set([x % 8 * 31, y % 8 * 31, 120, 255], at);
        }
        return { width, height, rgba };
    };
    return { sha, source, manifest, read };
}

test('sprite resolution uses one owned worker across pages and preserves CPU textures, allocation and density', async () => {
    const f = spriteFixture(), NativeWorker = globalThis.Worker;
    let created = 0, terminated = 0;
    globalThis.Worker = class extends NativeWorker {
        constructor(url: any, options: any) { super(url, options); created++; }
        terminate() { terminated++; return super.terminate(); }
    } as typeof Worker;
    let result: Awaited<ReturnType<typeof resolveHdSprite>> | undefined;
    try {
        result = await resolveHdSprite(f.manifest, f.sha, f.source, 4, 2048, f.read, () => {}, false, true);
        expect(result.density).toBe(4); expect(result.attempts).toEqual([]);
        expect(created).toBe(1); expect(terminated).toBe(1);
        let expectedBytes = 0;
        for (const [index, actual] of result.override!.pages.entries()) {
            const pooled = poolHdPixels(await f.read(`p${index}-base.png`, f.sha, 1), await f.read(`p${index}-data.png`, f.sha, 1), 2048)!;
            expect(actual.base.image.data).toEqual(pooled.color); expect(actual.data.image.data).toEqual(pooled.remap);
            expect(actual.tiles!.map.image.data).toEqual(pooled.lookup); expectedBytes += pooled.gpuBytes;
        }
        expect(result.gpuBytes).toBe(expectedBytes);
    } finally { globalThis.Worker = NativeWorker; disposeHdSprite(result?.override); }
});

test('Original, unpooled and valid prepared pages create no pooling workers; cancellation after pooling publishes no textures', async () => {
    const f = spriteFixture(), NativeWorker = globalThis.Worker;
    let created = 0, uploads = 0, stopped = false;
    globalThis.Worker = class { constructor() { created++; throw Error('Must not create'); } } as any;
    try {
        const original = await resolveHdSprite(f.manifest, f.sha, f.source, 1, 2048, f.read, () => uploads++, false, true);
        expect(original.density).toBe(1);
        const plain = await resolveHdSprite(f.manifest, f.sha, f.source, 4, 2048, f.read, () => uploads++, false, false);
        expect(plain.density).toBe(4); disposeHdSprite(plain.override);
        const prepared = Object.assign(async () => { throw Error('Must not decode prepared page'); }, { prepared: async () => {
            const pooled = poolHdPixels(await f.read('p0-base.png', f.sha, 1), await f.read('p0-data.png', f.sha, 1), 2048)!;
            return { page: createPooledHdPage(pooled), gpuBytes: pooled.gpuBytes };
        } });
        const cached = await resolveHdSprite(f.manifest, f.sha, f.source, 4, 2048, prepared, () => uploads++, false, true);
        expect(cached.density).toBe(4); disposeHdSprite(cached.override); expect(created).toBe(0);
        let terminated = 0;
        globalThis.Worker = class {
            onmessage: any;
            postMessage(request: any) {
                stopped = true;
                queueMicrotask(() => this.onmessage({ data: { kind: request.kind, id: request.id,
                    pixels: poolHdPixels(request.base, request.data, request.limit) } }));
            }
            terminate() { terminated++; }
        } as any;
        uploads = 0;
        const cancelled = await resolveHdSprite(f.manifest, f.sha, f.source, 4, 2048, f.read, () => uploads++, false, true, () => stopped);
        expect(cancelled.density).toBe(1); expect(cancelled.attempts[0].reason).toBe('cancelled');
        expect(uploads).toBe(0); expect(terminated).toBe(1);
    } finally { globalThis.Worker = NativeWorker; }
});
