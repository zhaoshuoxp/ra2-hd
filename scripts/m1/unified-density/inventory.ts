import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import { poolHdPage } from '../../../src/engine/renderable/builder/poolHdPage';
const registered = JSON.parse(readFileSync(process.argv[2] ?? '.artifacts/unified-density/registered-v1.json', 'utf8'));
const rows: any[] = [];
for (const [route, file] of Object.entries(registered.routes) as [string,string][]) {
    if (!route.startsWith('/local-hd/') || !route.endsWith('/manifest.json')) continue;
    const m = JSON.parse(readFileSync(file, 'utf8'));
    if (!m.variants) continue;
    const row: any = { file, hash:route.split('/')[2], member:m.source?.member,
        identities:m.rulesIdentities, variants:[], missing4:!m.variants.some((v:any)=>v.density===4) };
    for (const variant of m.variants) {
        let pooledBytes=0, rawBytes=0;
        const pages=[];
        for (const page of variant.pages) {
            const decode=(name:string)=>{
                const png=PNG.sync.read(readFileSync(path.join(path.dirname(file),name)));
                return {width:png.width,height:png.height,rgba:new Uint8Array(png.data)};
            };
            const base=decode(page.base), data=decode(page.data);
            const pool=poolHdPage(base,data,2048);
            const raw=base.width*base.height*6, bytes=pool?.gpuBytes??raw;
            rawBytes+=raw;pooledBytes+=bytes;
            pages.push({size:page.size,rawBytes:raw,pooledBytes:bytes});
            if(pool){pool.base.dispose();pool.data.dispose();pool.tiles.map.dispose();}
        }
        row.variants.push({density:variant.density,rawBytes,pooledBytes,pages,
            exceedsPrepoolMemberLimit:rawBytes>64*1024*1024});
    }
    rows.push(row);
    if(rows.length%25===0) console.log('Measured',rows.length);
}
const families=Object.entries(registered.selections).map(([route,selection]:[string,any])=>{
    const members=(selection.members??[]).map((m:any)=>rows.find(r=>r.hash===m.sha256)).filter(Boolean);
    return {route,theater:selection.theater,memberCount:members.length,
        complete4:members.length>0&&members.every((m:any)=>!m.missing4),
        measured2:members.reduce((n:number,m:any)=>n+(m.variants.find((v:any)=>v.density===2)?.pooledBytes??0),0),
        measured4:members.reduce((n:number,m:any)=>n+(m.variants.find((v:any)=>v.density===4)?.pooledBytes??0),0),
        projected4:members.reduce((n:number,m:any)=>n+(m.variants.find((v:any)=>v.density===4)?.pooledBytes??4*(m.variants.find((v:any)=>v.density===2)?.pooledBytes??0)),0)};
}).filter(f=>f.memberCount);
writeFileSync(process.argv[3] ?? '.artifacts/unified-density/storage-inventory-v1.json',JSON.stringify({
    disclosure:'Measured physical lossless pool allocations for existing variants. Missing 4x uses a fourfold 2x estimate, not a verified allocation. Theater variants are not simultaneous residents.',rows,families},null,2));
console.log('DONE',rows.length,'manifests',families.length,'families');
