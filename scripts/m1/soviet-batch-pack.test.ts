import { resourceRoot } from '../test-support/resources';
import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { PNG } from 'pngjs';
import { retailTree, resolveMember } from '../../src/offline/retail';
import { ShpFile } from '../../src/data/ShpFile';
import { ImageFinder } from '../../src/engine/ImageFinder';
import { sovietBuildingHdFamilies, sovietBuildingHdNames } from '../../src/engine/renderable/builder/sovietBuildingHdFamilies';
import { resolvePowerPlantHd, disposePowerPlantHd } from '../../src/engine/renderable/builder/resolvePowerPlantHd';
import { registerHdResources, sovietBatchIdentities, sovietBatchRevisions } from '../../desktop/hd-profile.mjs';
import { sovietBuildingMinimumBytes } from '../../src/engine/renderable/builder/loadSovietBuildingsHd';

const local = test;
const hash=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
local('all actual Soviet pages bind to retail sources, preserve accepted density and fit the measured combined budget',async()=>{
    const tree=retailTree(new Map(['ra2.mix','language.mix','multi.mix'].map(n=>[n,readFileSync(`${resourceRoot}/assets/ra2/${n}`)])));
    let combinedBytes=35389440+36962304+11752516+16*(320*288*5+4);
    const acceptedNames=sovietBuildingHdNames.filter(n=>sovietBatchIdentities[n.toLowerCase()]);
    const reserved=acceptedNames.map(n=>sovietBuildingMinimumBytes[n]);
    for (const [familyIndex,name] of acceptedNames.entries()) {
        const expected=sovietBuildingHdFamilies[name];
        const familyBytes=readFileSync(`${resourceRoot}/hd-packs/soviet-${name.toLowerCase()}-authored/${sovietBatchRevisions[name.toLowerCase()]}/family.json`);
        expect(hash(familyBytes)).toBe(sovietBatchIdentities[name.toLowerCase()]);
        const family=JSON.parse(familyBytes.toString());
        const images=new Map(expected.members.map(m=>[m.member,new ShpFile(resolveMember(tree,m.member).file)]));
        const finder=new ImageFinder(images,{settings:{extension:'.shp',newTheaterChar:'T'}});
        const entries=family.members.map((member:any,index:number)=>{
            const root=`${resourceRoot}/hd-packs/${member.packId}/${member.revision}`;
            const bytes=readFileSync(`${root}/manifest.json`);expect(hash(bytes)).toBe(member.sha256);
            const manifest=JSON.parse(bytes.toString()),image=finder.find(expected.members[index].artName,false);
            const source={member:image.filename,theater:'TEMPERATE',sha256:hash(Buffer.from(resolveMember(tree,image.filename).file.getBytes())),
                canvas:[image.width,image.height],frames:image.images.slice(0,expected.members[index].frames).map((f:any,nativeFrame:number)=>({nativeFrame,
                    trimOrigin:[f.x,f.y],trimSize:[f.width,f.height],legacyRenderSize:[f.width+f.width%2,f.height+f.height%2],empty:!f.imageData.some(Boolean)}))};
            return {image,source,manifest,manifestHash:member.sha256,read:async(filename:string,sha:string,size:number)=>{
                const bytes=readFileSync(`${root}/${filename}`);expect(hash(bytes)).toBe(sha);expect(bytes.length).toBe(size);
                const p=PNG.sync.read(bytes);return {width:p.width,height:p.height,rgba:new Uint8Array(p.data)};
            }};
        });
        let allocated=0,disposed=0;
        const budget=256*1024*1024-combinedBytes-reserved.slice(familyIndex+1).reduce((a,b)=>a+b,0);
        const turretBytes=['NALASR','NAFLAK'].includes(name)?1152004:0;
        const loaded=await resolvePowerPlantHd(entries,2,2048,textures=>{
            allocated+=textures.length;textures.forEach(t=>t.addEventListener('dispose',()=>disposed++));
        },name,budget-turretBytes,true);
        expect(loaded.report.density).toBe(2);expect(loaded.overrides.size).toBe(expected.members.length);
        // Reservations are conservative minima, not the size of the current accepted repaint.
        expect(loaded.report.gpuBytes+turretBytes).toBeLessThanOrEqual(budget);
        expect(loaded.report.gpuBytes+turretBytes).toBeGreaterThanOrEqual(reserved[familyIndex]);
        expect([...loaded.overrides.values()].flatMap(o=>o.pages).reduce((sum,p)=>sum+p.base.image.data.byteLength+p.data.image.data.byteLength+(p.tiles?.map.image.data.byteLength??0)+(p.tiles?.dataMap?.image.data.byteLength??0),0)).toBe(loaded.report.gpuBytes);
        combinedBytes+=loaded.report.gpuBytes+turretBytes;disposePowerPlantHd(loaded);expect(disposed).toBe(allocated);
    }
    expect(combinedBytes).toBeLessThanOrEqual(256*1024*1024);
    const registered=await registerHdResources(resourceRoot);
    for(const name of ['conscript','powerPlant','napowr','rhino',...acceptedNames.map(n=>n.toLowerCase())]) expect(registered.availability[name]).toStartWith('HD available');
},180000);
