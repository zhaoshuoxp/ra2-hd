import { expect, test } from 'bun:test';
import { prepareLoadingUnit } from '../../src/gui/screen/game/loadingScreen/prepareLoadingUnit';

function storeFixture() {
    let callback: (asset?: any) => void = () => {}, released = 0, id: string | undefined;
    const store = { enabled: true, acquire: (key: string, ready: typeof callback) => {
        id = key; callback = ready; return () => { released++; };
    } };
    return { store: store as any, complete: (asset?: any) => callback(asset), get released() { return released; }, get id() { return id; } };
}

test('selected loading artwork remains leased through readiness and releases at teardown', async () => {
    const f = storeFixture(), p = prepareLoadingUnit('Africans', f.store);
    expect(f.id).toBe('loading-unit-libya');
    f.complete({ bitmap: {} }); expect(await p.ready).toBe(true); expect(f.released).toBe(0);
    p.dispose(); expect(f.released).toBe(1);
});

test('cancel and timeout resolve to Original and ignore late completion', async () => {
    for (const cancel of [true, false]) {
        const f = storeFixture(), p = prepareLoadingUnit('Americans', f.store, 5);
        if (cancel) p.dispose();
        expect(await p.ready).toBe(false); expect(f.released).toBe(1);
        f.complete({ bitmap: {} }); expect(await p.ready).toBe(false);
    }
});

test('HD Off, missing art and observer do not wait for unsupported overlays', async () => {
    for (const country of ['Observer', 'missing']) {
        const f = storeFixture(); expect(await prepareLoadingUnit(country, f.store).ready).toBe(false);
        expect(f.id).toBeUndefined();
    }
    const off = storeFixture(); off.store.enabled = false;
    expect(await prepareLoadingUnit('Africans', off.store).ready).toBe(false); expect(off.id).toBeUndefined();
    const missing = storeFixture(), p = prepareLoadingUnit('French', missing.store);
    missing.complete(); expect(await p.ready).toBe(false);
});

test('Yuri leases its full background before loading and falls back when it is unavailable', async () => {
    for (const available of [true, false]) {
        const f = storeFixture(), p = prepareLoadingUnit('YuriCountry', f.store);
        expect(f.id).toBe('loading-background-yuri');
        f.complete(available ? { bitmap: {} } : undefined);
        expect(await p.ready).toBe(available);
        expect(f.released).toBe(available ? 0 : 1);
        if (available) { p.dispose(); expect(f.released).toBe(1); }
    }
});
