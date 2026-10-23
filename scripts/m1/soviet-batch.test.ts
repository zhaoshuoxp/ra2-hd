import { expect, test } from 'bun:test';
import { GraphicsOptions } from '../../src/gui/screen/options/GraphicsOptions';
import { ImageFinder } from '../../src/engine/ImageFinder';
import { resolvePowerPlantHd, disposePowerPlantHd, aggregatePowerPlantHd, type PowerPlantHdEntry } from '../../src/engine/renderable/builder/resolvePowerPlantHd';
import { sovietBuildingHdFamilies, sovietBuildingHdNames, matchesSovietBuildingHdSources, type SovietBuildingHdFamily } from '../../src/engine/renderable/builder/sovietBuildingHdFamilies';

const hash = 'a'.repeat(64);
function fixture(name: SovietBuildingHdFamily): PowerPlantHdEntry[] {
    const family = sovietBuildingHdFamilies[name];
    return family.members.map(member => {
        const frames = Array.from({ length: member.frames }, (_, nativeFrame) => ({ nativeFrame,
            trimOrigin: [7, 9], trimSize: [2, 2], legacyRenderSize: [2, 2], empty: false }));
        const source = { member: member.member, sha256: member.sha256, theater: family.theater, canvas: [...family.canvas], frames };
        const manifest = { schemaVersion: 2, packId: 'soviet-batch-test', packRevision: '1',
            source: { ...source, kind: 'resolved-shp-member' }, logical: { canvas: source.canvas, frames },
            color: { representation: 'authored-sRGB-RGBA8-plus-RGBA8-data' },
            variants: [2, 4].map(density => ({ density, pages: [{ id: 'p0', size: [2*density+4, member.frames*(2*density+4)],
                base: `${density}-base.png`, data: `${density}-data.png`, baseBytes: 1, dataBytes: 1,
                baseSha256: hash, dataSha256: hash }], frames: frames.map(({ nativeFrame }) => ({ nativeFrame, page: 'p0',
                    sampleRect: [2, 2+nativeFrame*(2*density+4), 2*density, 2*density],
                    contentRect: [2, 2+nativeFrame*(2*density+4), 2*density, 2*density] })) })) };
        return { source, manifest, image: {}, manifestHash: hash, read: async filename => {
            const density = Number(filename[0]), width = 2*density+4, height = member.frames*(2*density+4);
            const rgba = new Uint8Array(width*height*4);
            if (filename.includes('data')) for (let i=3; i<rgba.length; i+=4) rgba[i]=255;
            return { width, height, rgba };
        } };
    });
}
test('lossless family upload waits for complete validation and measured budget; rejected families allocate no GPU textures', async () => {
    const entries = fixture('NACNST');
    let uploads = 0;
    const good = await resolvePowerPlantHd(entries, 2, 2048, () => uploads++, 'NACNST', 64 * 1024 * 1024, true);
    expect(good.report.density).toBe(2); expect(uploads).toBe(1);
    const bytes = good.report.gpuBytes; disposePowerPlantHd(good);
    uploads = 0;
    const limited = await resolvePowerPlantHd(entries, 2, 2048, () => uploads++, 'NACNST', bytes - 1, true);
    expect(limited.report.density).toBe(1); expect(uploads).toBe(0);
    expect(limited.report.attempts.some(a => a.reason === 'combined-hd-memory-limit')).toBe(true);
    entries.at(-1)!.read = async () => { throw Error('corrupt-last-member'); };
    const corrupt = await resolvePowerPlantHd(entries, 2, 2048, () => uploads++, 'NACNST', 64 * 1024 * 1024, true);
    expect(corrupt.overrides.size).toBe(0); expect(uploads).toBe(0);
});
for (const name of sovietBuildingHdNames) {
    test(`${name}: exact identities, independent complete-density fallback and native layer offsets`, async () => {
        const entries = fixture(name), source = entries.map(e => e.source);
        expect(matchesSovietBuildingHdSources(name, source)).toBe(true);
        for (const theater of ['SNOW', 'URBAN']) expect(matchesSovietBuildingHdSources(name, source.map(s => ({ ...s, theater })))).toBe(false);
        expect(matchesSovietBuildingHdSources(name, source.slice(1))).toBe(false);
        expect(matchesSovietBuildingHdSources(name, source.map(s => ({ ...s, sha256: hash })))).toBe(false);
        let disposed=0, allocated=0;
        entries.at(-1)!.manifest.variants.pop();
        const loaded = await resolvePowerPlantHd(entries,4,2048,textures => {
            allocated+=textures.length; textures.forEach(t => t.addEventListener('dispose',()=>disposed++));
        },name);
        expect(loaded.report.density).toBe(2);expect(disposed).toBe((entries.length-1)*2);
        expect(loaded.overrides.size).toBe(entries.length);
        const aggregate={ imageIndexes:new Map(entries.map((e,i)=>[e.image,sovietBuildingHdFamilies[name].members[i].aggregateOffset])) };
        const hd=aggregatePowerPlantHd(aggregate,loaded,name)!;
        expect(hd.frames.filter(Boolean).length).toBe(source.reduce((n,s)=>n+s.frames.length,0));
        for (const [i, e] of entries.entries()) {
            const offset=sovietBuildingHdFamilies[name].members[i].aggregateOffset;
            expect(hd.frames[offset].page).toBe(i);
            expect(loaded.overrides.get(e.image)!.identity.endsWith('/2')).toBe(true);
        }
        const finder=new ImageFinder(new Map(),{},undefined,undefined,undefined,undefined,{[name]:loaded});
        expect(finder.getBuildingHdOverride(name,aggregate)?.identity).toBe(hd.identity);
        for (const other of sovietBuildingHdNames.filter(n=>n!==name)) expect(finder.getBuildingHdOverride(other,aggregate)).toBeUndefined();
        disposePowerPlantHd(loaded);expect(disposed).toBe(allocated);
    });
    test(`${name}: budget preflight allocates no rejected density; corrupt pages release the whole family`,async()=>{
        const entries=fixture(name);
        const bytes2=entries.reduce((n,e)=>n+e.manifest.variants[0].pages[0].size.reduce((a:number,b:number)=>a*b)*6,0);
        const reads:string[]=[];
        for (const e of entries) {const read=e.read;e.read=async(...args)=>{reads.push(args[0]);return read(...args);};}
        const loaded=await resolvePowerPlantHd(entries,4,2048,()=>{},name,bytes2);
        expect(loaded.report.density).toBe(2);expect(reads.every(n=>n.startsWith('2'))).toBe(true);
        expect(loaded.report.attempts[0].reason).toBe('combined-hd-memory-limit');disposePowerPlantHd(loaded);
        reads.length=0;
        const none=await resolvePowerPlantHd(entries,4,2048,()=>{},name,0);
        expect(none.report.density).toBe(1);expect(reads).toEqual([]);
        entries.at(-1)!.read=async()=>{throw Error('corrupt-resource');};
        let allocated=0,disposed=0;
        const failed=await resolvePowerPlantHd(entries,4,2048,textures=>{
            allocated+=textures.length;textures.forEach(t=>t.addEventListener('dispose',()=>disposed++));
        },name);
        expect(failed.overrides.size).toBe(0);expect(disposed).toBe(allocated);
    });
}
test('only declared identical complete rectangles can share atlas storage',async()=>{
    for (const failure of ['none','overlap','missing','partial','forward','cross-page']) {
        const e=fixture('NAHAND');
        for (const v of e[0].manifest.variants) {
            v.frames[1]={...v.frames[0],nativeFrame:1,sharedWith:0};
            if(failure==='overlap')delete v.frames[1].sharedWith;
            if(failure==='missing')v.frames[1].sharedWith=99;
            if(failure==='partial')v.frames[1].sampleRect=[3,2,...v.frames[0].sampleRect.slice(2)];
            if(failure==='forward')v.frames[1].sharedWith=2;
            if(failure==='cross-page')v.frames[1].page='missing';
        }
        const loaded=await resolvePowerPlantHd(e,4,2048,()=>{},'NAHAND');
        expect(loaded.report.density).toBe(failure==='none'?4:1);disposePowerPlantHd(loaded);
    }
});
test('one default-on HD preference migrates legacy choices and persists explicit off',()=>{
    const graphics=new GraphicsOptions().unserialize('1,3,1920x1080,4k,0,1,0,1');
    expect(graphics.hdEnabled.value).toBe(true);
    expect(graphics.serialize().split(',').slice(0,4)).toEqual(['1','3','1920x1080','4k']);
    graphics.hdEnabled.value=false;
    const restored=new GraphicsOptions().unserialize(graphics.serialize());
    expect(restored.hdEnabled.value).toBe(false);
    expect([restored.rhinoHd.value,restored.conscriptHd.value,restored.powerPlantHd.value,
        restored.napowrHd.value,restored.nahandHd.value,restored.narefnHd.value,
        restored.naweapHd.value,restored.nacnstHd.value]).toEqual(Array(8).fill(false));
    restored.hdEnabled.value=true;
    expect(restored.narefnHd.value).toBe(true);
});
