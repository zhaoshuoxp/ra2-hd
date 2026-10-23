import { expect, test } from 'bun:test';
import { prepareVxlPixels } from '../../src/engine/renderable/unitVxl/prepareVxlPixels';
import { VxlPagePreparer } from '../../src/engine/renderable/unitVxl/VxlPagePreparer';
import { poolHdPixels } from '../../src/engine/renderable/builder/poolHdPixels';
import { downsampleHdPage } from '../../src/engine/renderable/builder/downsampleHdPage';
import { uploadHdTextures } from '../../src/engine/renderable/builder/uploadHdTextures';

function pixels() {
    const width = 67, height = 53, base = new Uint8Array(width * height * 4), data = new Uint8Array(base.length);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const at = (y * width + x) * 4;
        base.set([x % 8 * 31, y % 8 * 31, (x + y) % 4 * 60, (x + y) % 3 * 127], at);
        data.set([base[at + 3] ? x % 4 * 85 : 0, y % 16, 0, 255], at);
    }
    return [{ width, height, rgba: base }, { width, height, rgba: data }] as const;
}
test('worker pixel preparation retains exact 4X and 2X color, coverage, remap and allocation', () => {
    const [base, data] = pixels(), original = base.rgba.slice();
    expect(prepareVxlPixels(base, data, 1, 2048)).toEqual(poolHdPixels(base, data, 2048));
    const reduced = downsampleHdPage(base, data);
    expect(prepareVxlPixels(base, data, 0.5, 2048)).toEqual(poolHdPixels(reduced[0], reduced[1], 2048));
    expect(base.rgba).toEqual(original);
    for (const [index, value] of [[1, 16], [2, 1], [3, 0], [0, 255]]) {
        const corrupt = { ...data, rgba: data.rgba.slice() }; corrupt.rgba[index] = value;
        expect(() => prepareVxlPixels(base, corrupt, 1, 2048)).toThrow('vxl-owner-data');
    }
});
test('worker requests transfer buffers, correlate out-of-order replies, and reject cancellation', async () => {
    const messages: any[] = []; let terminated = 0;
    const worker: any = { postMessage: (...args: any[]) => messages.push(args), terminate: () => terminated++ };
    const preparer = new VxlPagePreparer(() => worker), images = [new ArrayBuffer(1), new ArrayBuffer(2)];
    const a = preparer.prepare(images, [1, 1], 1, 2048), b = preparer.prepare(images, [1, 1], 1, 2048);
    expect(messages[0][1]).toBe(images);
    worker.onmessage({ data: { id: 2, error: 'vxl-owner-data' } }); await expect(b).rejects.toThrow('vxl-owner-data');
    const pooled = prepareVxlPixels(...pixels(), 1, 2048);
    worker.onmessage({ data: { id: 1, pixels: pooled } }); expect(await a).toEqual(pooled);
    expect(preparer.report.pages).toBe(1);
    const pending = preparer.prepare(images, [1, 1], 1, 2048);
    preparer.dispose(); await expect(pending).rejects.toThrow('cancelled'); expect(terminated).toBe(1);
    await expect(preparer.prepare(images, [1, 1], 1, 2048)).rejects.toThrow('cancelled');
});
test('texture uploads yield between slices and reject disposal before publication', async () => {
    let time = 0, yields = 0, cancelled = false; const uploaded: number[] = [];
    const renderer = { initTexture: (texture: any) => { uploaded.push(texture); time += 4; } };
    await uploadHdTextures(renderer, [1, 2, 3, 4, 5] as any, () => false, () => time, async () => { yields++; });
    expect(uploaded).toEqual([1, 2, 3, 4, 5]); expect(yields).toBe(2);
    uploaded.length = 0; time = 0;
    await expect(uploadHdTextures(renderer, [1, 2, 3] as any, () => cancelled, () => time,
        async () => { cancelled = true; })).rejects.toThrow('cancelled');
    expect(uploaded).toEqual([1, 2]);
});
