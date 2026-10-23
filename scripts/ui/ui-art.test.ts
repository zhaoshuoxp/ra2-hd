import { test, expect } from 'bun:test';
import { createHash } from 'node:crypto';
import { UiArtStore, UI_TEXTURE_BUDGET, validateUiManifest } from '../../src/gui/hd/UiArt';
const bytes = new Uint8Array([1,2,3]), sha256 = createHash('sha256').update(bytes).digest('hex');
async function fixture(run: (store: UiArtStore, stats: any) => Promise<void>, corrupt = false) {
    const saved = { fetch:globalThis.fetch, bitmap:globalThis.createImageBitmap, document:globalThis.document };
    const stats = {fetches:0,closed:0};
    globalThis.document = {getElementById:()=>undefined,querySelectorAll:()=>[]} as any;
    globalThis.fetch = (async()=>{stats.fetches++;return new Response(bytes);}) as any;
    globalThis.createImageBitmap = (async()=>({width:256,height:192,close:()=>stats.closed++})) as any;
    const store = new UiArtStore();
    (store as any).manifest = {schemaVersion:1,revision:'r1',assets:[{id:'test.shp',file:'test.png',sha256:corrupt?'0'.repeat(64):sha256,width:256,height:192,logicalWidth:64,logicalHeight:48}]};
    (store as any).readEnabled=()=>true;
    try {await run(store,stats);} finally {store.dispose();Object.assign(globalThis,{fetch:saved.fetch,createImageBitmap:saved.bitmap,document:saved.document});}
}
test('page capacity counts shared images once and includes existing UI surface reservations', async () => fixture(async store => {
    const entry = (store as any).manifest.assets[0];
    (store as any).manifest.assets.push({ ...entry, id: 'alias.shp' }, { ...entry, id: 'other.shp', file: 'other.png' });
    const owner = {}, imageBytes = entry.width * entry.height * 4;
    expect(store.reserveSurface(owner, UI_TEXTURE_BUDGET - imageBytes, 0)).toBe(true);
    expect(store.canAcquire(['test.shp', 'alias.shp'])).toBe(true);
    expect(store.canAcquire(['test.shp', 'other.shp'])).toBe(false);
    let release = () => {};
    await new Promise(resolve => { release = store.acquire('test.shp', resolve); });
    expect(store.canAcquire(['alias.shp'])).toBe(true);
    expect(store.canAcquire(['other.shp'])).toBe(false);
    release(); store.releaseSurface(owner);
    expect(store.canAcquire(['test.shp', 'other.shp'])).toBe(true);
}));
test('visible slots share one decode and release texture plus bitmap after the last lease', async()=>fixture(async(store,stats)=>{
    expect(store.has('test.shp',64,48)).toBe(true);expect(store.has('test.shp',60,44)).toBe(false);
    let a:any,b:any;
    const p1=new Promise<void>(resolve=>{a=store.acquire('test.shp',asset=>{a.asset=asset;resolve();});});
    const p2=new Promise<void>(resolve=>{b=store.acquire('test.shp',asset=>{b.asset=asset;resolve();});});
    await Promise.all([p1,p2]);expect(stats.fetches).toBe(1);expect(a.asset.texture).toBe(b.asset.texture);
    expect(store.metrics().decodedCpuBytes).toBe(256*192*4);
    a();expect(stats.closed).toBe(0);b();expect(stats.closed).toBe(1);expect(store.metrics().reservedBytes).toBe(0);
}));
test('corrupt bytes retain Original without constructing a texture',async()=>fixture(async(store,stats)=>{
    let release:()=>void=()=>{};
    const asset=await new Promise(resolve=>{release=store.acquire('test.shp',resolve);});
    expect(asset).toBeUndefined();expect(store.metrics().textures).toBe(0);release();expect(store.metrics().reservedBytes).toBe(0);expect(stats.closed).toBe(0);
},true));
test('cancelled screen decode cannot revive disposed art',async()=>fixture(async(store,stats)=>{
    let ready=0;
    const release=store.acquire('test.shp',()=>ready++);release();
    await new Promise(resolve=>setTimeout(resolve,20));
    expect(ready).toBe(0);expect(stats.closed).toBe(1);expect(store.metrics().reservedBytes).toBe(0);
}));

test('normal and ranked IDs share a base decode until both leases end', async () => fixture(async (store, stats) => {
    const manifest = (store as any).manifest;
    manifest.assets.push({ ...manifest.assets[0], id: 'ranked.shp' });
    let releaseNormal = () => {}, releaseRanked = () => {};
    const normal = new Promise<any>(resolve => { releaseNormal = store.acquire('test.shp', resolve); });
    const ranked = new Promise<any>(resolve => { releaseRanked = store.acquire('ranked.shp', resolve); });
    const [a, b] = await Promise.all([normal, ranked]);
    expect(a.texture).toBe(b.texture);
    expect(stats.fetches).toBe(1);
    expect(store.metrics().reservedBytes).toBe(256 * 192 * 4);
    releaseNormal(); expect(stats.closed).toBe(0);
    releaseRanked(); expect(stats.closed).toBe(1);
    expect(store.metrics().reservedBytes).toBe(0);
}));

test('rank overlays require matching full cameo canvases and cannot chain', () => {
    const base = { id: 'base.shp', file: 'base.png', sha256, width: 240, height: 192, logicalWidth: 60, logicalHeight: 48 };
    const overlay = { ...base, id: 'rank', file: 'rank.png' };
    const ranked = { ...base, id: 'ranked.shp', overlay: 'rank' };
    const manifest = { schemaVersion: 1, revision: 'rank-test', assets: [base, overlay, ranked] };
    expect(validateUiManifest(manifest).assets).toHaveLength(3);
    expect(() => validateUiManifest({ ...manifest, assets: [base, ranked] })).toThrow();
    expect(() => validateUiManifest({ ...manifest, assets: [base, { ...overlay, width: 244 }, ranked] })).toThrow();
    expect(() => validateUiManifest({ ...manifest, assets: [base, { ...overlay, overlay: base.id }, ranked] })).toThrow();
});

test('DOM copies participate in the shared budget and release independently of a texture lease', async () => fixture(async (store, stats) => {
    let release = () => {};
    const asset = await new Promise<any>(resolve => { release = store.acquire('test.shp', resolve); });
    expect(asset.url.startsWith('blob:')).toBe(true);
    const owner = {}, extra = {};
    expect(store.reserveSurface(owner, asset.bytes, asset.bytes, 'dom')).toBe(true);
    expect(store.metrics().domImageGpuBytesUpperBound).toBe(asset.bytes);
    expect(store.metrics().transitionGpuBytes).toBe(0);
    expect(store.reserveSurface(extra, UI_TEXTURE_BUDGET, 0, 'dom')).toBe(false);
    store.releaseSurface(owner);
    expect(store.metrics().reservedBytes).toBe(asset.bytes);
    expect(store.metrics().domImageDecodedCpuBytesUpperBound).toBe(0);
    release();
    expect(store.metrics().reservedBytes).toBe(0);
    expect(stats.closed).toBe(1);
}));

test('a prepared canvas can acquire decoded pixels synchronously before its first paint', async () => fixture(async (store, stats) => {
    let releasePrepared = () => {};
    await new Promise(resolve => { releasePrepared = store.acquire('test.shp', resolve); });
    let immediate = false, legacy = false;
    const releaseCanvas = store.acquire('test.shp', () => { immediate = true; }, true);
    const releaseLegacy = store.acquire('test.shp', () => { legacy = true; });
    expect(immediate).toBe(true); expect(legacy).toBe(false); expect(stats.fetches).toBe(1);
    await Promise.resolve(); expect(legacy).toBe(true);
    releasePrepared(); expect(stats.closed).toBe(0);
    releaseCanvas(); releaseLegacy(); expect(stats.closed).toBe(1); expect(store.metrics().reservedBytes).toBe(0);
}));
