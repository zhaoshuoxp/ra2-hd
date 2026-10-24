import { afterEach, beforeEach, expect, test } from 'bun:test';
import * as THREE from 'three';
import { Palette } from '../../src/data/Palette';
import { ShpFile } from '../../src/data/ShpFile';
import { UiObjectSprite } from '../../src/gui/UiObjectSprite';
import { UI_RESULT_BANNER_BYTES, UI_TEXTURE_BUDGET, UiArtStore } from '../../src/gui/hd/UiArt';

const originalDocument = globalThis.document;
beforeEach(() => { globalThis.document = { querySelectorAll: () => [] } as any; });
afterEach(() => { globalThis.document = originalDocument; });

test('sidebar allocations cannot spend the protected result background through repeated matches', () => {
    const store = new UiArtStore();
    for (let match = 0; match < 3; match++) {
        const release = store.protectResultBanner(), sidebar = {}, banner = {}, decode = {};
        const available = UI_TEXTURE_BUDGET - UI_RESULT_BANNER_BYTES;
        expect(store.reserveSurface(sidebar, available + 1, 0)).toBe(false);
        expect(store.reserveSurface(sidebar, available, 0)).toBe(true);
        expect(store.reserveSurface({}, 1, 0, 'dom')).toBe(false);
        expect(store.reserveSurface(banner, UI_RESULT_BANNER_BYTES * 4, 0, 'result')).toBe(false);
        expect(store.reserveSurface(banner, UI_RESULT_BANNER_BYTES, UI_RESULT_BANNER_BYTES, 'result')).toBe(true);
        expect(store.reserveSurface(decode, 0, UI_RESULT_BANNER_BYTES, 'result')).toBe(true);
        expect(store.reserveSurface({}, 1, 0)).toBe(false);
        expect(store.canAcquire([])).toBe(true);
        expect(store.metrics().reservedBytes).toBe(UI_TEXTURE_BUDGET);
        expect(store.metrics().domImageGpuBytesUpperBound).toBe(UI_RESULT_BANNER_BYTES);
        expect(store.metrics().domImageDecodedCpuBytesUpperBound).toBe(UI_RESULT_BANNER_BYTES * 2);
        store.releaseSurface(decode); store.releaseSurface(banner);
        expect(store.metrics().resultHeadroomBytes).toBe(UI_RESULT_BANNER_BYTES);
        expect(store.reserveSurface(banner, UI_RESULT_BANNER_BYTES, 0, 'result')).toBe(true);
        store.releaseSurface(banner); store.releaseSurface(sidebar); release(); release();
        expect(store.metrics().reservedBytes).toBe(0);
        expect(store.metrics().resultHeadroomBytes).toBe(0);
    }
});

test('a protected result prevents optional texture decoding before it can consume the final capacity', () => {
    const store = new UiArtStore(), sidebar = {};
    (store as any).readEnabled = () => true;
    (store as any).manifest = { revision: 'pressure', assets: [{ id: 'extra', file: 'extra.png',
        sha256: '0'.repeat(64), width: 1, height: 1, logicalWidth: 1, logicalHeight: 1 }] };
    const release = store.protectResultBanner();
    expect(store.reserveSurface(sidebar, UI_TEXTURE_BUDGET - UI_RESULT_BANNER_BYTES, 0)).toBe(true);
    expect(store.canAcquire(['extra'])).toBe(false);
    let called = false;
    const releaseTexture = store.acquire('extra', asset => { called = true; expect(asset).toBeUndefined(); });
    expect(called).toBe(true);
    releaseTexture(); store.releaseSurface(sidebar); release();
});

test('the native construction clock preserves depth testing without writing over its cameo', () => {
    const clock = new ShpFile(); clock.filename = 'GCLOCK2.SHP';
    const sprite = UiObjectSprite.fromShpFile(clock, new Palette(), new THREE.PerspectiveCamera());
    const native = (sprite as any).builder;
    expect(native.useMeshBatching).toBe(false);
    const material = native.createMaterial({ transparent: true, opacity: 0.5 });
    expect(material.depthTest).toBe(true);
    expect(material.depthWrite).toBe(false);
    expect(material.transparent).toBe(true);
    expect(material.opacity).toBe(0.5);
    material.dispose();
});
