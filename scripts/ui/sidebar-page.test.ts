import { test, expect } from 'bun:test';
import { UiArtPage } from '../../src/gui/hd/UiArtPage';
import type { UiArtStore } from '../../src/gui/hd/UiArt';

function fixture(timeout = 750) {
    const pending = new Map<string, () => void>(), leases = new Map<string, number>(), decoded = new Set<string>();
    const store = { enabled: true, revision: 'r1', has: () => true, overlayId: () => undefined, canAcquire: () => true,
        acquire(id: string, ready: () => void, immediate: boolean) {
            leases.set(id, (leases.get(id) ?? 0) + 1);
            if (immediate && decoded.has(id)) ready();
            else pending.set(id, () => { decoded.add(id); ready(); });
            return () => leases.set(id, leases.get(id)! - 1);
        } };
    const pages = new UiArtPage(store as unknown as UiArtStore, timeout);
    const prepare = (id: string, publish: () => void) => pages.prepare([{ id, width: 60, height: 48 }], publish);
    return { pages, store, pending, leases, prepare };
}

test('cold page publishes after all decoded assets; revisit is synchronous and leases are bounded', () => {
    const f = fixture(); let published = '';
    f.prepare('building', () => { published = 'building'; });
    expect(published).toBe(''); f.pending.get('building')!(); expect(published).toBe('building');
    f.prepare('infantry', () => { published = 'infantry'; });
    expect(published).toBe('building'); f.pending.get('infantry')!();
    f.prepare('building', () => { published = 'building'; }); expect(published).toBe('building');
    for (const id of ['vehicle', 'defense', 'air']) { f.prepare(id, () => {}); f.pending.get(id)!(); }
    expect([...f.leases.values()].reduce((n, value) => n + value, 0)).toBe(3);
    f.pages.dispose(); expect([...f.leases.values()].every(n => n === 0)).toBe(true);
});

test('cancelled old decode cannot publish over newest page; HD Off releases retained pages', () => {
    const f = fixture(); let published = '';
    const cancel = f.prepare('slow', () => { published = 'slow'; });
    cancel(); f.prepare('new', () => { published = 'new'; });
    f.pending.get('slow')!(); expect(published).toBe(''); f.pending.get('new')!(); expect(published).toBe('new');
    f.store.enabled = false; f.prepare('new', () => { published = 'original'; });
    expect(published).toBe('original'); expect([...f.leases.values()].every(n => n === 0)).toBe(true);
    f.pages.dispose();
});

test('pending or hung optional decode has a bounded publication deadline and teardown releases it', async () => {
    const f = fixture(15); let calls = 0;
    f.prepare('hung', () => calls++); await new Promise(resolve => setTimeout(resolve, 30));
    expect(calls).toBe(1); f.pending.get('hung')!(); expect(calls).toBe(1);
    f.pages.dispose(); expect(f.leases.get('hung')).toBe(0);
});

test('old preparation leases are evicted before the next page reserves its texture budget', () => {
    const active = new Set<string>(), callbacks = new Map<string, (asset?: any) => void>();
    const refused: string[] = [];
    const store = { enabled: true, revision: 'budget', has: () => true, overlayId: () => undefined, canAcquire: () => true,
        acquire(id: string, ready: (asset?: any) => void) {
            if (active.size >= 3) { refused.push(id); ready(); return () => {}; }
            active.add(id); callbacks.set(id, ready); return () => active.delete(id);
        } };
    const pages = new UiArtPage(store as unknown as UiArtStore);
    for (const id of ['a', 'b', 'c', 'd']) {
        pages.prepare([{ id, width: 60, height: 48 }], () => {}); callbacks.get(id)?.({});
    }
    expect(refused).toEqual([]); expect([...active]).toEqual(['b', 'c', 'd']);
    pages.dispose(); expect(active.size).toBe(0);
});

test('texture pressure evicts cached pages before the three-page count limit', () => {
    const leases = new Map<string, number>(), refused: string[] = [];
    const active = () => [...leases].filter(([, refs]) => refs > 0).map(([id]) => id);
    const store = { enabled: true, revision: 'pressure', has: () => true, overlayId: () => undefined,
        canAcquire: (ids: string[]) => new Set([...active(), ...ids]).size <= 3,
        acquire(id: string, ready: () => void) {
            if (!store.canAcquire([id])) { refused.push(id); ready(); return () => {}; }
            leases.set(id, (leases.get(id) ?? 0) + 1); ready();
            return () => leases.set(id, leases.get(id)! - 1);
        } };
    const pages = new UiArtPage(store as unknown as UiArtStore);
    const frames = (...ids: string[]) => ids.map(id => ({ id, width: 60, height: 48 }));
    pages.prepare(frames('old-a'), () => {});
    const releaseDisplayed = store.acquire('old-a', () => {});
    pages.prepare(frames('old-b'), () => {});
    let published = false, cleared = false;
    pages.prepare(frames('new-a', 'new-b'), () => { published = true; }, () => { cleared = true; });
    expect(published).toBe(true); expect(cleared).toBe(false); expect(refused).toEqual([]);
    expect(active()).toEqual(['old-a', 'new-a', 'new-b']);
    releaseDisplayed(); pages.dispose(); expect(active()).toEqual([]);
});

test('a displayed old page releases its final leases before a cold replacement allocation', () => {
    const leases = new Map<string, number>(), order: string[] = [];
    const active = () => [...leases].filter(([, refs]) => refs > 0).map(([id]) => id);
    const store = { enabled: true, revision: 'handoff', has: () => true, overlayId: () => undefined,
        canAcquire: (ids: string[]) => new Set([...active(), ...ids]).size <= 1,
        acquire(id: string, ready: () => void) {
            expect(store.canAcquire([id])).toBe(true);
            order.push('acquire-' + id); leases.set(id, (leases.get(id) ?? 0) + 1); ready();
            return () => leases.set(id, leases.get(id)! - 1);
        } };
    const pages = new UiArtPage(store as unknown as UiArtStore);
    const frame = (id: string) => [{ id, width: 60, height: 48 }];
    pages.prepare(frame('old'), () => {});
    const releaseOld = store.acquire('old', () => {});
    pages.prepare(frame('new'), () => order.push('publish-new'), () => { order.push('release-old'); releaseOld(); });
    expect(order.slice(2)).toEqual(['release-old', 'acquire-new', 'publish-new']);
    pages.dispose(); expect(active()).toEqual([]);
});
